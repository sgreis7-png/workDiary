-- Entry ownership rules: anyone signed in can create; only the author OR an admin
-- can edit/delete an entry (and its photos).
drop policy if exists write_entries on entries;
create policy insert_entries on entries for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());
create policy update_entries on entries for update
  using (created_by = auth.uid() or is_admin())
  with check (created_by = auth.uid() or is_admin());
create policy delete_entries on entries for delete
  using (created_by = auth.uid() or is_admin());

-- photos follow their parent entry's permissions
drop policy if exists write_photos on entry_photos;
create policy rw_photos on entry_photos for all
  using (exists (select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())))
  with check (exists (select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())));

-- allow removing photo files from storage (needed on edit/delete)
create policy "auth delete photos" on storage.objects for delete
  using (bucket_id = 'photos' and auth.role() = 'authenticated');
