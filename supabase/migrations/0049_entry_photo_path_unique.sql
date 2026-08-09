-- Saving an entry is now idempotent: the client mints the entry id, and a retry after a
-- half-finished save upserts the same row instead of creating a second entry. The photo rows
-- have to be idempotent the same way, and `on conflict (storage_path)` needs this to exist.
--
-- A storage path is unique by construction — it starts with the entry id — and production had
-- 39 rows with 39 distinct paths when this was written, so nothing has to be cleaned up first.

drop index if exists entry_photos_storage_path;
create unique index if not exists entry_photos_storage_path_key
  on entry_photos (storage_path);
