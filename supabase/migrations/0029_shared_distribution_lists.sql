-- Shared distribution lists: admins can mark a list as shared so every user
-- can pick it in the send dialog. Personal lists stay owner-only.
alter table distribution_lists add column if not exists shared boolean not null default false;

-- Everyone may read shared lists (and their recipients); writes stay owner/admin.
create policy read_shared_lists on distribution_lists
  for select using (shared);
create policy read_shared_recipients on list_recipients
  for select using (exists (select 1 from distribution_lists l where l.id = list_id and l.shared));

-- Only admins may create/keep a list shared — a member marking their own list
-- shared would broadcast it to the whole company.
drop policy rw_own_lists on distribution_lists;
create policy rw_own_lists on distribution_lists
  for all
  using (owner = auth.uid() or is_admin())
  with check ((owner = auth.uid() and not shared) or is_admin());
