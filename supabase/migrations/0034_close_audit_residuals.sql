-- Closes the residual findings from the post-remediation audit of 0030/0031.
-- Theme: 0030 gated the tables, but several SECURITY DEFINER RPCs and two
-- policies were still reachable without membership, so company aggregates and
-- staff addresses remained obtainable by any authenticated account.
--
-- Every function below keeps its original signature and result shape; only a
-- membership gate is added, so callers need no changes.

-- ---------- 1. definer RPCs must check membership ----------

-- dashboard_stats() bypasses RLS by design (it aggregates over all entries).
-- Ungated it handed entry/photo/malfunction counts, per-project timelines and
-- per-worker activity to any authenticated caller. Body is unchanged from 0017
-- apart from the guard; non-members get zeros/empties rather than an error, so
-- the Dashboard degrades quietly instead of breaking.
create or replace function dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select case when not is_member() then
    json_build_object(
      'total', 0, 'this_week', 0, 'this_month', 0, 'total_photos', 0, 'unsent', 0,
      'malfunctions_this_month', 0,
      'by_project', '{}'::json, 'latest_by_project', '{}'::json,
      'by_worker', '{}'::json, 'by_weather', '{}'::json)
  else
    json_build_object(
      'total', (select count(*) from entries),
      'this_week', (select count(*) from entries where work_date >= (current_date - 7)),
      'this_month', (select count(*) from entries where work_date >= date_trunc('month', current_date)::date),
      'total_photos', (select count(*) from entry_photos),
      'unsent', (select count(*) from entries where last_sent_at is null),
      -- literal none-set ('', 'none', 'אין') mirrors deptIdOf() in src/data.ts
      'malfunctions_this_month', (select count(*) from entries
          where work_date >= date_trunc('month', current_date)::date
            and coalesce(lower(btrim(values->>'malfunction_dept')), '') not in ('', 'none', 'אין')),
      'by_project', (select coalesce(json_object_agg(project_id, c), '{}'::json)
                     from (select project_id, count(*) c from entries group by project_id) t),
      'latest_by_project', (select coalesce(json_object_agg(project_id, last), '{}'::json)
                     from (select project_id, max(work_date)::text last from entries group by project_id) t),
      'by_worker', (select coalesce(json_object_agg(created_by, c), '{}'::json)
                     from (select created_by, count(*) c from entries group by created_by) t),
      'by_weather', (select coalesce(json_object_agg(w, c), '{}'::json)
                     from (select values->>'weather' w, count(*) c from entries
                           where coalesce(values->>'weather', '') <> '' group by values->>'weather') t))
  end;
$$;

-- staff address lists (bodies unchanged, membership added)
create or replace function admin_emails() returns setof text
language sql stable security definer set search_path = public as $$
  select email from allowed_emails where role = 'admin' and active and is_member()
$$;

create or replace function filled_rule_emails(pid uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct email from alert_rules
  where kind = 'filled' and active and (project_id is null or project_id = pid)
    and is_member()
$$;

-- is_active_email() was granted to `authenticated`, making it a membership /
-- address-existence oracle — exactly what the reset-password fix removed.
create or replace function is_active_email(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member() and exists(
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(p_email) and a.active
  );
$$;

-- the only definer function still missing a pinned search_path — and it is the
-- one that grants write access to the form-builder tables
create or replace function has_perm(p_area text, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.user_permissions
    where lower(email) = lower(auth.jwt() ->> 'email')
      and area = p_area and level = p_level
  );
$$;

-- ---------- 2. definer RPCs must not be callable with the anon key ----------
-- rl_check kept the default PUBLIC EXECUTE, so anyone holding the (public) anon
-- key could burn a victim's password-reset budget or bulk-insert rate_events.
-- The edge functions call it with the service role, so nothing legitimate breaks.
revoke all on function rl_check(text, text, integer, integer) from public;
grant execute on function rl_check(text, text, integer, integer) to service_role;

-- cron-invoked; postgres owns the cron jobs, service_role kept for manual runs
revoke all on function notify_due_dates() from public;
revoke all on function check_alert_rules() from public;
grant execute on function notify_due_dates() to service_role, postgres;
grant execute on function check_alert_rules() to service_role, postgres;

-- ---------- 3. two policies left on bare `authenticated` ----------

-- leaked entry ids and original photo filenames to any authenticated account
drop policy if exists read_photos on entry_photos;
create policy read_photos on entry_photos for select using (is_member());

-- leaked the per-user permission matrix; usePerms only ever reads the caller's
-- own rows, and the admin dialog runs as an admin
drop policy if exists read_permissions on user_permissions;
create policy read_permissions on user_permissions for select
  using (is_member() and (lower(email) = lower(auth.jwt() ->> 'email') or is_admin()));

-- ---------- 4. storage: defects/ was a blanket member-wide delete ----------
-- The app never deletes defect photo objects (deleteDefectPhoto removes only the
-- row), so the grant bought nothing while letting any member destroy QC
-- evidence. Admins keep the escape hatch through is_admin().
drop policy if exists "photos delete scoped" on storage.objects;
create policy "photos delete scoped" on storage.objects for delete
  using (
    bucket_id = 'photos' and is_member() and (
      is_admin()
      or name like 'avatars/' || auth.uid()::text || '-%'
      or owns_entry_photo(name)
    )
  );

-- ---------- 5. profile guard must not fire for service-role writes ----------
-- handle_new_user() upserts profiles with the service role, where auth.uid() is
-- null — the guard then reverted role/email to their previous values.
create or replace function guard_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  new.id := old.id;
  new.email := old.email;
  new.role := old.role;
  return new;
end $$;
