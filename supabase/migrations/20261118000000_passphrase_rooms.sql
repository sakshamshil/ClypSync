-- Allow passphrase rooms next to 6-digit PIN rooms.
-- A passphrase room code is 'p_' + 64 hex chars (PBKDF2-SHA256 of the phrase,
-- derived in the browser). The raw phrase never reaches the server.

drop policy if exists anon_insert_pastes on public.pastes;
create policy anon_insert_pastes on public.pastes
  for insert to public
  with check (
    room_code ~ '^(\d{6}|p_[0-9a-f]{64})$'
    and type = any (array['text', 'image', 'document'])
    and char_length(content) > 0
    and char_length(content) <= case
      when type = 'text' then 500000
      when type = 'image' then 2048
      when type = 'document' then 2048
      else 0
    end
  );

drop policy if exists anon_upload_images on storage.objects;
create policy anon_upload_images on storage.objects
  for insert to anon
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] ~ '^(\d{6}|p_[0-9a-f]{64})$'
  );

drop policy if exists anon_upload_documents on storage.objects;
create policy anon_upload_documents on storage.objects
  for insert to public
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^(\d{6}|p_[0-9a-f]{64})$'
  );
