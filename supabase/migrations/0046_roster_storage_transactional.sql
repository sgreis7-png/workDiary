-- Three narrower holes the audit found, plus one it filed under code quality that is
-- really a data-integrity bug.

-- ---------- 1. the staff roster ----------
--
-- Any active member could read allowed_emails: every colleague's address, display name,
-- role and account state. They need *some* of that — the defect assignee picker lists
-- people, and notifications have to skip addresses that are no longer active — so the
-- table cannot simply be closed. Two functions serve exactly those needs, and the table
-- itself becomes admin-only.

create or replace function member_directory()
returns table (email text, name text)
language sql stable security definer set search_path = public as $$
  select lower(ae.email) as email,
         coalesce(nullif(btrim(ae.display_name), ''), split_part(ae.email, '@', 1)) as name
  from allowed_emails ae
  where ae.active and ae.registered and is_member()
  order by 2;
$$;

-- Which of these addresses are still active members. Takes the list the caller already
-- has rather than handing back the whole roster to be filtered client-side.
create or replace function active_recipients(p_emails text[])
returns table (email text)
language sql stable security definer set search_path = public as $$
  select lower(ae.email)
  from allowed_emails ae
  where ae.active
    and is_member()
    and lower(ae.email) = any (select lower(unnest(p_emails)));
$$;

revoke all on function member_directory() from public;
revoke all on function active_recipients(text[]) from public;
grant execute on function member_directory() to authenticated;
grant execute on function active_recipients(text[]) to authenticated;

-- is_member() and is_admin() are SECURITY DEFINER and keep reading the table regardless,
-- so sign-in and every policy that depends on membership are unaffected.
drop policy if exists read_allowed_emails_authed on allowed_emails;
create policy read_allowed_emails_admin on allowed_emails for select using (is_admin());

-- ---------- 2. assigning staff to a project, atomically ----------
--
-- setProjectStaff() deleted every assignment and then inserted the replacements as two
-- separate requests. A failure between them — a dropped connection on a phone is enough —
-- left the project with nobody assigned, and the UI had already moved on.

create or replace function set_project_staff(p_project uuid, p_emails text[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from project_assignments where project_id = p_project;

  if p_emails is not null and array_length(p_emails, 1) > 0 then
    insert into project_assignments (project_id, email)
    select p_project, lower(btrim(e))
    from unnest(p_emails) e
    where btrim(e) <> ''
    on conflict (project_id, email) do nothing;
  end if;
end $$;

revoke all on function set_project_staff(uuid, text[]) from public;
grant execute on function set_project_staff(uuid, text[]) to authenticated;

-- ---------- 3. the photos bucket ----------

-- A size ceiling at the bucket, so it is enforced whatever the client does. Matches the
-- 50MB already configured for local development in supabase/config.toml.
update storage.buckets set file_size_limit = 52428800 where id = 'photos';

-- Deliberately no allowed_mime_types allowlist. The bucket legitimately holds JPEG and
-- PNG photos, PNG signatures *and* the .mpp schedule imports — which browsers commonly
-- report with an empty type, so an allowlist would reject the Gantt import that the
-- converter depends on.
--
-- What is worth refusing outright is the handful of types that turn a private file store
-- into a content-serving one. SVG is on the list because it can carry script and the
-- bucket hands out signed URLs on this origin's behalf.
drop policy if exists "photos reject active content" on storage.objects;
create policy "photos reject active content" on storage.objects
  as restrictive for insert
  with check (
    bucket_id <> 'photos'
    or coalesce(metadata ->> 'mimetype', '') not in (
      'text/html', 'application/xhtml+xml', 'image/svg+xml',
      'application/javascript', 'text/javascript', 'application/xml', 'text/xml'
    )
  );
