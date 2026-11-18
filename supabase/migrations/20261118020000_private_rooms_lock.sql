-- Step 2 of 2: close direct access. Apply only after the new client is live.
-- After this, anon can insert pastes and upload files, nothing more:
--   * pastes are read through get_pastes(room)
--   * pastes and files are deleted by the delete-pastes Edge Function
--   * files are served by their public URL, which only the room's pastes reveal

-- pastes: no direct read or delete
drop policy if exists anon_select_pastes on public.pastes;
drop policy if exists anon_delete_pastes on public.pastes;

-- Stop postgres_changes for this table. Broadcasts replace it.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pastes'
  ) then
    alter publication supabase_realtime drop table public.pastes;
  end if;
end $$;

-- storage: no listing, no overwrite, no delete. Public buckets still serve a
-- file to anyone who has its exact URL.
drop policy if exists "Everything policy 1ffg0oo_0" on storage.objects;
drop policy if exists "Everything policy 1ffg0oo_1" on storage.objects;
drop policy if exists "Everything policy 1ffg0oo_2" on storage.objects;
drop policy if exists "Everything policy 1ffg0oo_3" on storage.objects;
drop policy if exists anon_read_images on storage.objects;
drop policy if exists anon_read_documents on storage.objects;
drop policy if exists anon_delete_images on storage.objects;
drop policy if exists anon_delete_documents on storage.objects;

-- Keep the upload rules in one place.
drop policy if exists anon_upload_images on storage.objects;
create policy anon_upload_images on storage.objects
  for insert to anon
  with check (bucket_id = 'images' and public.is_valid_room((storage.foldername(name))[1]));

drop policy if exists anon_upload_documents on storage.objects;
create policy anon_upload_documents on storage.objects
  for insert to anon
  with check (bucket_id = 'documents' and public.is_valid_room((storage.foldername(name))[1]));
