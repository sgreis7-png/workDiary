-- Make the per-area permissions mean something in the database.
--
-- The router gates every screen on an area (src/App.tsx), but the policies only asked
-- is_member(). Denying somebody an area therefore hid the tab and nothing else: the rows
-- were still readable and writable straight through PostgREST. Only the form builder and
-- the Gantt actually consulted has_perm().
--
-- The reason it could not simply be switched to has_perm() is that the defaults live in
-- TypeScript (MEMBER_DEFAULTS, src/lib/perms.ts) and an ordinary member has no row in
-- user_permissions at all. A policy asking has_perm('logbook','edit') would have denied
-- every foreman in the company. So the defaults move into the database first, and the
-- resolved level — admin, then explicit grant, then default — becomes the single answer
-- both sides ask.

-- ---------- 1. the defaults, mirrored from src/lib/perms.ts ----------

create table if not exists perm_defaults (
  area  text primary key,
  level text not null check (level in ('none', 'view', 'edit'))
);

-- Locked down entirely: no policy, so no client can read or write it. perm_level() is
-- SECURITY DEFINER and reads it regardless, which is the only access anything needs.
alter table perm_defaults enable row level security;

insert into perm_defaults (area, level) values
  ('logbook',        'edit'),
  ('calendar',       'view'),
  ('search',         'view'),
  ('projects',       'view'),
  ('export',         'view'),
  ('dashboard',      'none'),
  ('defects',        'edit'),
  ('form_builder',   'none'),
  ('coops_manage',   'none'),
  ('alert_rules',    'none'),
  ('gantt',          'none'),
  ('control_center', 'none')
on conflict (area) do update set level = excluded.level;

-- ---------- 2. the resolved level ----------

-- Same precedence as resolvePerm() on the client: an admin has edit everywhere, an
-- explicit grant wins over the default, and anything unknown is 'none'. An area added to
-- the TypeScript union but not to perm_defaults therefore fails closed.
create or replace function perm_level(p_area text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not is_member() then 'none'
    when is_admin() then 'edit'
    else coalesce(
      (select up.level from user_permissions up
        where lower(up.email) = lower(auth.jwt() ->> 'email') and up.area = p_area),
      (select pd.level from perm_defaults pd where pd.area = p_area),
      'none')
  end;
$$;

create or replace function can_view(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level(p_area) in ('view', 'edit');
$$;

create or replace function can_edit(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level(p_area) = 'edit';
$$;

revoke all on function perm_level(text) from public;
revoke all on function can_view(text) from public;
revoke all on function can_edit(text) from public;
grant execute on function perm_level(text) to authenticated;
grant execute on function can_view(text) to authenticated;
grant execute on function can_edit(text) to authenticated;

-- ---------- 3. diary ----------

-- `or created_by = auth.uid()` is deliberate. Losing read access to your own reports is
-- the one lockout with no recovery path, and an author seeing their own work is not what
-- the permission is protecting.
drop policy if exists read_entries on entries;
create policy read_entries on entries for select
  using (can_view('logbook') or (is_member() and created_by = auth.uid()));

drop policy if exists insert_entries on entries;
create policy insert_entries on entries for insert
  with check (can_edit('logbook') and created_by = auth.uid());

-- created_by is checked directly rather than through the read policy, so a member holding
-- only 'view' cannot delete a day's reports without being able to read them.
drop policy if exists update_entries on entries;
create policy update_entries on entries for update
  using (can_edit('logbook') and (created_by = auth.uid() or is_admin()))
  with check (can_edit('logbook') and (created_by = auth.uid() or is_admin()));

drop policy if exists delete_entries on entries;
create policy delete_entries on entries for delete
  using (can_edit('logbook') and (created_by = auth.uid() or is_admin()));

drop policy if exists read_photos on entry_photos;
create policy read_photos on entry_photos for select
  using (
    can_view('logbook')
    or (is_member() and exists (select 1 from entries e where e.id = entry_id and e.created_by = auth.uid()))
  );

drop policy if exists rw_photos on entry_photos;
create policy rw_photos on entry_photos for all
  using (can_edit('logbook') and exists (
    select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())))
  with check (can_edit('logbook') and exists (
    select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())));

-- ---------- 4. quality control ----------

drop policy if exists rw_coops on coops;
drop policy if exists read_coops on coops;
create policy read_coops on coops for select using (can_view('defects'));
drop policy if exists insert_coops on coops;
create policy insert_coops on coops for insert with check (can_edit('defects'));
-- editing and deleting a house is its own grant, matching the UI (coops_manage)
drop policy if exists update_coops on coops;
create policy update_coops on coops for update
  using (can_edit('coops_manage')) with check (can_edit('coops_manage'));
drop policy if exists delete_coops on coops;
create policy delete_coops on coops for delete using (can_edit('coops_manage'));

drop policy if exists rw_coop_resp on coop_responsibilities;
drop policy if exists read_coop_resp on coop_responsibilities;
create policy read_coop_resp on coop_responsibilities for select using (can_view('defects'));
drop policy if exists write_coop_resp on coop_responsibilities;
create policy write_coop_resp on coop_responsibilities for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_coop_items on coop_checklist_items;
drop policy if exists read_coop_items on coop_checklist_items;
create policy read_coop_items on coop_checklist_items for select using (can_view('defects'));
drop policy if exists write_coop_items on coop_checklist_items;
create policy write_coop_items on coop_checklist_items for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_coop_defects on coop_defects;
drop policy if exists read_coop_defects on coop_defects;
create policy read_coop_defects on coop_defects for select using (can_view('defects'));
drop policy if exists write_coop_defects on coop_defects;
create policy write_coop_defects on coop_defects for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_coop_signatures on coop_signatures;
drop policy if exists read_coop_signatures on coop_signatures;
create policy read_coop_signatures on coop_signatures for select using (can_view('defects'));
drop policy if exists write_coop_signatures on coop_signatures;
create policy write_coop_signatures on coop_signatures for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_coop_concessions on coop_concessions;
drop policy if exists read_coop_concessions on coop_concessions;
create policy read_coop_concessions on coop_concessions for select using (can_view('defects'));
drop policy if exists write_coop_concessions on coop_concessions;
create policy write_coop_concessions on coop_concessions for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_defect_photos on defect_photos;
drop policy if exists read_defect_photos on defect_photos;
create policy read_defect_photos on defect_photos for select using (can_view('defects'));
drop policy if exists write_defect_photos on defect_photos;
create policy write_defect_photos on defect_photos for all
  using (can_edit('defects')) with check (can_edit('defects'));

drop policy if exists rw_coop_item_photos on coop_item_photos;
drop policy if exists read_coop_item_photos on coop_item_photos;
create policy read_coop_item_photos on coop_item_photos for select using (can_view('defects'));
drop policy if exists write_coop_item_photos on coop_item_photos;
create policy write_coop_item_photos on coop_item_photos for all
  using (can_edit('defects')) with check (can_edit('defects'));

-- ---------- 5. aggregates ----------

-- dashboard_stats() aggregates every entry, so it belongs behind the dashboard area
-- rather than behind mere membership. Body unchanged from 0034 apart from the guard;
-- callers without the area get zeros, so the screen degrades instead of erroring.
create or replace function dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select case when not can_view('dashboard') then
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

-- can_read_gantt() predates this and says the same thing; keep the name working and
-- route it through the shared resolver so there is one implementation.
create or replace function can_read_gantt() returns boolean
language sql stable security definer set search_path = public as $$
  select can_view('gantt');
$$;

-- ---------- 6. self-check ----------
-- A wrong defaults table is the failure that would lock the company out, so assert it
-- here: a bad migration aborts instead of shipping.
do $$
declare
  missing text;
  wrong   text;
begin
  select string_agg(a, ', ') into missing
  from unnest(array['logbook','calendar','search','projects','export','dashboard',
                    'defects','form_builder','coops_manage','alert_rules','gantt',
                    'control_center']) a
  where not exists (select 1 from perm_defaults d where d.area = a);
  if missing is not null then
    raise exception 'perm_defaults is missing areas: %', missing;
  end if;

  select string_agg(area || '=' || level, ', ') into wrong
  from perm_defaults
  where (area = 'logbook' and level <> 'edit')
     or (area = 'defects' and level <> 'edit')
     or (area = 'dashboard' and level <> 'none')
     or (area = 'control_center' and level <> 'none');
  if wrong is not null then
    raise exception 'perm_defaults disagrees with src/lib/perms.ts: %', wrong;
  end if;
end $$;

-- Left on is_member() on purpose:
--   projects            reference data every screen needs to render a project name; the
--                       store loads it globally, so gating it breaks the whole app for a
--                       user rather than hiding one area
--   work_tasks          /tasks has no permission area in the router, so there is nothing
--                       to enforce yet
--   allowed_emails      members need the roster to assign a defect; narrowing it needs a
--                       function that returns only names, and a client change with it
