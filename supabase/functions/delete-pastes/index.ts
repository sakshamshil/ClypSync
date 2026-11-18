// Delete pastes (and their files) in one room.
// The browser cannot delete directly any more, so this function holds the
// service key. It acts only on the room the caller names, so a caller must
// know the room code, the same as for reading.
//
// Body: { room: string, ids?: string[] }  — no ids means "clear the room".

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROOM_RE = /^(\d{6}|p_[0-9a-f]{64})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKETS = ['images', 'documents'] as const;
const FILE_RE = /\/storage\/v1\/object\/public\/(images|documents)\/(.+)$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { room?: unknown; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const room = body.room;
  if (typeof room !== 'string' || !ROOM_RE.test(room)) return json({ error: 'Invalid room' }, 400);

  let ids: string[] | null = null;
  if (body.ids !== undefined) {
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 500) {
      return json({ error: 'Invalid ids' }, 400);
    }
    if (!body.ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      return json({ error: 'Invalid ids' }, 400);
    }
    ids = body.ids as string[];
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  let query = admin.from('pastes').delete().eq('room_code', room);
  if (ids) query = query.in('id', ids);
  const { data: deleted, error } = await query.select('type, content');
  if (error) return json({ error: 'Delete failed' }, 500);

  // Remove files. For a full clear, sweep the whole room folder so files
  // left behind by older clients go too. Otherwise remove only the files the
  // deleted pastes point at, and only inside this room's folder.
  const toRemove: Record<string, string[]> = { images: [], documents: [] };
  if (!ids) {
    for (const bucket of BUCKETS) {
      const { data: files } = await admin.storage.from(bucket).list(room, { limit: 1000 });
      toRemove[bucket] = (files ?? []).map((f) => `${room}/${f.name}`);
    }
  } else {
    for (const row of deleted ?? []) {
      if (row.type !== 'image' && row.type !== 'document') continue;
      const m = String(row.content).match(FILE_RE);
      if (m && m[2].startsWith(`${room}/`) && !m[2].includes('..')) {
        toRemove[m[1]].push(decodeURIComponent(m[2]));
      }
    }
  }

  let fileErrors = 0;
  for (const bucket of BUCKETS) {
    if (toRemove[bucket].length === 0) continue;
    const { error: rmError } = await admin.storage.from(bucket).remove(toRemove[bucket]);
    if (rmError) fileErrors++;
  }

  return json({ deleted: deleted?.length ?? 0, fileErrors });
});
