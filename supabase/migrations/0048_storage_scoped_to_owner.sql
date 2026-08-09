-- ---------- 1. the policy 0045 failed to drop ----------
--
-- 0025 created `rw_item_photos` on coop_item_photos and 0030 recreated it under the same
-- name. 0045 tried to drop `rw_coop_item_photos` — a name that never existed anywhere — and
-- `if exists` swallowed the mistake without a word. Permissive policies are combined with OR,
-- so the old `is_member()` grant has been standing beside the new read/write policies and
-- ORing away can_view('defects') for that one table ever since.
--
-- Every other table 0045 and 0046 rewrote was checked by replaying all policy statements in
-- order: this is the only survivor. src/lib/rls.policies.test.ts now enforces that.

drop policy if exists rw_item_photos on coop_item_photos;

-- ---------- 2. photo objects follow the record that owns them ----------
--
-- `photos read scoped` (0030) let any active member read almost the entire private bucket —
-- everything except feedback screenshots. Since 0045 the area permissions decide who may read
-- an entry or a defect, but they stopped at the database row: the image bytes stayed open, and
-- the storage API can list a bucket, so paths did not even have to be guessed. Revoking
-- someone's access to the diary hid the entries and left the site photos reachable.
--
-- This is added as RESTRICTIVE rather than by rewriting the permissive policy. Restrictive
-- policies can only narrow, they compose with the gates 0043/0044 already added for schedule
-- imports, and if a prefix here were wrong the failure would be a visible refusal rather than
-- a silent grant.
--
-- Path layout, all in the one 'photos' bucket:
--   <entryId>/<uuid>-<file>          diary photos
--   defects/<defectId>/<ts>.jpg      defect photos
--   signatures/<coopId>/...          gate + concession signatures
--   chat/<uuid>-<file>               chat attachments
--   avatars/<userId>-<ts>.png        profile pictures
--   feedback/<uuid>-<file>           bug-report screenshots
--   imports/<chartId>/<file>         Microsoft Project files

-- Mirrors read_photos on entry_photos: the area, or your own entry either way. Definer,
-- because it reads `entries` while deciding whether the caller may read the object.
create or replace function entry_photo_readable(p_path text)
returns boolean
language sql stable security definer set search_path = public as $$
  select can_view('logbook')
      or exists (
        select 1 from entries e
        where e.id::text = split_part(p_path, '/', 1)   -- text compare: the prefix may not be a uuid
          and e.created_by = auth.uid()
      );
$$;

revoke all on function entry_photo_readable(text) from public;
grant execute on function entry_photo_readable(text) to authenticated;

drop policy if exists "photos read owned" on storage.objects;
create policy "photos read owned" on storage.objects
  as restrictive for select
  using (
    bucket_id <> 'photos'
    or is_admin()
    or case
      -- bug reports can carry any screen the reporter had open
      when name like 'feedback/%'   then false
      -- avatars and chat: a name and a face are already visible to colleagues, and the
      -- attachment is only reachable through a message row the reader is allowed to see.
      -- No definer here on purpose — user_messages' own policies apply inside this subquery,
      -- so "can read the message" is exactly what decides it.
      when name like 'avatars/%'    then is_member()
      when name like 'chat/%'       then exists (
        select 1 from user_messages m where m.attachment_path = name
      )
      when name like 'imports/%'    then can_read_gantt()
      when name like 'defects/%'    then can_view('defects')
      when name like 'signatures/%' then can_view('defects')
      -- anything else is a diary photo, whose first path segment is the entry id
      else entry_photo_readable(name)
    end
  );

-- The chat and diary branches above look a path up per object, so give them an index.
create index if not exists user_messages_attachment_path
  on user_messages (attachment_path) where attachment_path is not null;
create index if not exists entry_photos_storage_path
  on entry_photos (storage_path);
