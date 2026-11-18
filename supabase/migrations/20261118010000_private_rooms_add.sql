-- Step 1 of 2 (additive, safe to run while the old client is live).
-- Reads go through a function that needs the room code, and live updates go
-- out as broadcasts on a per-room topic instead of postgres_changes.

create or replace function public.is_valid_room(code text)
returns boolean
language sql
immutable
as $$
  select code ~ '^(\d{6}|p_[0-9a-f]{64})$'
$$;

-- Return the pastes of one room. You must know the room code to call it.
create or replace function public.get_pastes(room text)
returns setof public.pastes
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.pastes
  where public.is_valid_room(room)
    and room_code = room
  order by created_at desc
$$;

revoke all on function public.get_pastes(text) from public;
grant execute on function public.get_pastes(text) to anon, authenticated;

-- Broadcast each insert/delete to the topic 'room:<code>'. Only clients that
-- know the code can subscribe to that topic.
create or replace function public.broadcast_paste_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(to_jsonb(new), 'insert', 'room:' || new.room_code, false);
    return new;
  else
    perform realtime.send(jsonb_build_object('id', old.id), 'delete', 'room:' || old.room_code, false);
    return old;
  end if;
end;
$$;

drop trigger if exists pastes_broadcast on public.pastes;
create trigger pastes_broadcast
  after insert or delete on public.pastes
  for each row execute function public.broadcast_paste_change();

-- The table also has its own CHECK on room_code. Widen it for passphrase codes.
alter table public.pastes drop constraint if exists pastes_room_code_format;
alter table public.pastes add constraint pastes_room_code_format
  check (room_code ~ '^(\d{6}|p_[0-9a-f]{64})$');
