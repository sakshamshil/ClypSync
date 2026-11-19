-- Raise upload limits: images 20 MB, documents 30 MB (must match src/lib/supabase.ts).
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'images';
update storage.buckets set file_size_limit = 30 * 1024 * 1024 where id = 'documents';
