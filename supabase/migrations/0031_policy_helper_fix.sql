-- Follow-up to 0030. Two of its policies checked a second RLS-protected table
-- from inside a policy predicate (allowed_emails from notifications, entries
-- from storage.objects). Nested policy evaluation made those predicates fail
-- even for legitimate rows — verified live: an admin could no longer create the
-- assignment notification that the defect/task flows depend on.
--
-- Same rules, but expressed through SECURITY DEFINER helpers so the inner
-- lookup is not itself subject to RLS.

create or replace function is_active_email(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(p_email) and a.active
  );
$$;

/** True when the signed-in user authored the entry owning this storage path.
    Entry photos are stored as '<entryId>/<uuid>-<file>'. */
create or replace function owns_entry_photo(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.entries e
    where e.id::text = split_part(p_path, '/', 1)
      and e.created_by = auth.uid()
  );
$$;

revoke all on function is_active_email(text) from public;
revoke all on function owns_entry_photo(text) from public;
grant execute on function is_active_email(text) to authenticated;
grant execute on function owns_entry_photo(text) to authenticated;

drop policy if exists insert_notifs_member on notifications;
create policy insert_notifs_member on notifications for insert
  with check (is_member() and is_active_email(recipient_email));

drop policy if exists "photos delete scoped" on storage.objects;
create policy "photos delete scoped" on storage.objects for delete
  using (
    bucket_id = 'photos' and is_member() and (
      is_admin()
      or name like 'avatars/' || auth.uid()::text || '-%'
      or name like 'defects/%'
      or owns_entry_photo(name)
    )
  );
