import { createClient } from '@supabase/supabase-js';
import type { Paste } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const BUCKET_NAME = 'images';

export const MAX_DOCUMENT_SIZE = 30 * 1024 * 1024; // 30MB
const DOCUMENT_BUCKET_NAME = 'documents';
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** 128 random bits, so nobody can guess a file URL. */
function randomName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: `Image must be smaller than ${formatMB(MAX_IMAGE_SIZE)}` };
  }
  return { valid: true };
}

export function validateDocumentFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return { valid: false, error: 'File must be a PDF, DOC, DOCX, or TXT file' };
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return { valid: false, error: `Document must be smaller than ${formatMB(MAX_DOCUMENT_SIZE)}` };
  }
  return { valid: true };
}

export async function uploadImage(
  file: File,
  roomCode: string
): Promise<{ url: string; error?: string }> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { url: '', error: validation.error };
  }

  const timestamp = Date.now();
  const random = randomName();
  const extension = file.name.split('.').pop() || 'png';
  const path = `${roomCode}/${timestamp}-${random}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file);

  if (uploadError) {
    return { url: '', error: 'Failed to upload image' };
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function uploadDocument(
  file: File,
  roomCode: string
): Promise<{ url: string; fileName?: string; fileSize?: number; error?: string }> {
  const validation = validateDocumentFile(file);
  if (!validation.valid) {
    return { url: '', error: validation.error };
  }

  const timestamp = Date.now();
  const random = randomName();
  const extension = file.name.split('.').pop() || 'pdf';
  const path = `${roomCode}/${timestamp}-${random}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET_NAME)
    .upload(path, file);

  if (uploadError) {
    return { url: '', error: 'Failed to upload document' };
  }

  const { data } = supabase.storage.from(DOCUMENT_BUCKET_NAME).getPublicUrl(path);
  return { url: data.publicUrl, fileName: file.name, fileSize: file.size };
}

/** Load one room's pastes. The DB returns rows only for the exact room code. */
export async function fetchRoomPastes(roomCode: string): Promise<Paste[]> {
  const { data, error } = await supabase.rpc('get_pastes', { room: roomCode });
  if (error) throw error;
  return (data ?? []) as Paste[];
}

/**
 * Delete pastes and their files through the delete-pastes Edge Function.
 * No ids clears the whole room.
 */
export async function deletePastes(roomCode: string, ids?: string[]): Promise<{ error?: string }> {
  const { error } = await supabase.functions.invoke('delete-pastes', {
    body: ids ? { room: roomCode, ids } : { room: roomCode },
  });
  return error ? { error: 'Failed to delete' } : {};
}
