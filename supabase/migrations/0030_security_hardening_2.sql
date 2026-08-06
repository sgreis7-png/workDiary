-- Security hardening round 2 (audit follow-up).
--
-- Core change: the allowlist stops being advisory. Until now every broad policy
-- said "auth.role() = 'authenticated'", so ANY auth user — including one created
-- by a direct auth.signUp() that never passed the register edge function — had
-- full read/write on company data, and flipping allowed_emails.active=false only
-- signed the user out client-side. is_member() moves both checks into the DB.
--
-- Verified before writing: all 7 allowlisted users are active, and the email
-- match must be case-insensitive (allowed_emails holds 'SGREIS7@GMAIL.COM'
-- while the profile is lowercase) — same pattern is_admin() already uses.

-- ---------- membership helper ----------

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
      and ae.active
  );
$$;

-- ---------- core diary tables ----------

drop policy if exists read_projects on projects;
create policy read_projects on projects for select using (is_member());

drop policy if exists read_fields on field_definitions;
create policy read_fields on field_definitions for select using (is_member());

drop policy if exists read_entries on entries;
create policy read_entries on entries for select using (is_member());

drop policy if exists insert_entries on entries;
create policy insert_entries on entries for insert
  with check (is_member() and created_by = auth.uid());

drop policy if exists read_assignments on project_assignments;
create policy read_assignments on project_assignments for select using (is_member());

drop policy if exists read_allowed_emails_authed on allowed_emails;
create policy read_allowed_emails_authed on allowed_emails for select using (is_member());

drop policy if exists read_profile_names on profiles;
create policy read_profile_names on profiles for select using (is_member() or id = auth.uid());

-- ---------- QC / defects tables ----------

drop policy if exists rw_coops on coops;
create policy rw_coops on coops for all using (is_member()) with check (is_member());
drop policy if exists rw_coop_resp on coop_responsibilities;
create policy rw_coop_resp on coop_responsibilities for all using (is_member()) with check (is_member());
drop policy if exists rw_coop_items on coop_checklist_items;
create policy rw_coop_items on coop_checklist_items for all using (is_member()) with check (is_member());
drop policy if exists rw_coop_defects on coop_defects;
create policy rw_coop_defects on coop_defects for all using (is_member()) with check (is_member());
drop policy if exists rw_coop_signatures on coop_signatures;
create policy rw_coop_signatures on coop_signatures for all using (is_member()) with check (is_member());
drop policy if exists rw_coop_concessions on coop_concessions;
create policy rw_coop_concessions on coop_concessions for all using (is_member()) with check (is_member());
drop policy if exists rw_defect_photos on defect_photos;
create policy rw_defect_photos on defect_photos for all using (is_member()) with check (is_member());
drop policy if exists rw_item_photos on coop_item_photos;
create policy rw_item_photos on coop_item_photos for all using (is_member()) with check (is_member());
drop policy if exists rw_work_tasks on work_tasks;
create policy rw_work_tasks on work_tasks for all using (is_member()) with check (is_member());
drop policy if exists read_defect_overrides on defect_item_overrides;
create policy read_defect_overrides on defect_item_overrides for select using (is_member());

-- Signature attribution: the table only stores a typed signer_name, so an
-- unsign could not be traced to an account. Additive column, existing rows stay
-- null so the existing unsign flow keeps working.
alter table coop_signatures add column if not exists signed_by uuid default auth.uid();

-- ---------- notifications: no spoofing to arbitrary addresses ----------

drop policy if exists insert_notifs_authed on notifications;
alter table notifications add column if not exists created_by uuid default auth.uid();
-- members may notify each other (assignment flows), but only real active
-- members can be targeted, and every row records who created it
create policy insert_notifs_member on notifications for insert
  with check (
    is_member()
    and exists (
      select 1 from allowed_emails a
      where lower(a.email) = lower(recipient_email) and a.active
    )
  );

-- ---------- chat: close the group-membership bypass ----------
-- send_own_messages only checked from_email, so a non-member of a group could
-- insert into it (permissive policies OR together, bypassing send_group_messages).

drop policy if exists send_own_messages on user_messages;
drop policy if exists send_group_messages on user_messages;
create policy send_messages on user_messages for insert
  with check (
    is_member()
    and lower(from_email) = lower(auth.jwt() ->> 'email')
    and (group_id is null or is_group_member(group_id))
  );

-- ---------- profiles: freeze identity columns on self-update ----------
-- update_own_profile allowed a member to rewrite their own role/email. Role is
-- cosmetic (is_admin() reads allowed_emails) but a spoofed email misleads chat.

create or replace function guard_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  new.id := old.id;
  new.email := old.email;
  new.role := old.role;
  return new;
end $$;

drop trigger if exists profiles_guard_columns on profiles;
create trigger profiles_guard_columns before update on profiles
  for each row execute function guard_profile_columns();

-- ---------- storage: path-scoped instead of bucket-wide ----------
-- Previously any authenticated user could read AND delete any object in the
-- private photos bucket — other people's site photos, gate signatures and
-- feedback screenshots.
--
-- Path layout: '<entryId>/<uuid>-<file>' entry photos | 'defects/<id>/...' |
-- 'signatures/<coopId>/...' | 'avatars/<userId>-<ts>.png' | 'feedback/<uuid>-...'

drop policy if exists "auth read photos" on storage.objects;
create policy "photos read scoped" on storage.objects for select
  using (
    bucket_id = 'photos' and is_member()
    and (is_admin() or name not like 'feedback/%')   -- screenshots are admin-only
  );

drop policy if exists "auth write photos" on storage.objects;
create policy "photos insert scoped" on storage.objects for insert
  with check (
    bucket_id = 'photos' and is_member()
    -- an avatar may only be written under the uploader's own id
    and (name not like 'avatars/%' or name like 'avatars/' || auth.uid()::text || '-%')
  );

drop policy if exists "auth delete photos" on storage.objects;
create policy "photos delete scoped" on storage.objects for delete
  using (
    bucket_id = 'photos' and is_member() and (
      is_admin()
      or name like 'avatars/' || auth.uid()::text || '-%'
      or name like 'defects/%'                       -- shared QC evidence
      -- entry photos: keyed on the entry id prefix rather than a join to
      -- entry_photos, because the app deletes that row before the object
      or exists (
        select 1 from entries e
        where e.id::text = split_part(storage.objects.name, '/', 1)
          and e.created_by = auth.uid()
      )
    )
  );
-- note: 'signatures/%' is intentionally absent — signature images are never
-- deleted by the app (re-signing upserts), and only an admin may remove them.

-- brand bucket is served publicly; only admins may publish into it
drop policy if exists "auth write brand" on storage.objects;
create policy "admin write brand" on storage.objects for insert
  with check (bucket_id = 'brand' and is_admin());

-- ---------- mail directory ----------
-- The recipient picker filtered to the company domain in the browser, which is
-- cosmetic — the REST API still returned every registered address. Serve the
-- list from a definer function so the filter is actually enforced.

create or replace function mail_directory()
returns table (name text, email text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) as name,
         lower(p.email) as email
  from public.profiles p
  join public.allowed_emails a on lower(a.email) = lower(p.email) and a.active
  where is_member() and p.email ilike '%@agrotop.co.il'
  order by 1;
$$;
revoke all on function mail_directory() from public;
grant execute on function mail_directory() to authenticated;
