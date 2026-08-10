-- A third role, and a per-project one.
--
-- Until now the only roles were 'member' and 'admin', so "manager" and "project manager" —
-- the terms the notification rules are written in — had nowhere to live. Two separate ideas,
-- deliberately kept separate:
--
--   manager          a company-wide role: sees the schedule, the control centre and the
--                    statistics across every project. Cannot administer users; that stays with
--                    admin.
--   project manager  a flag on one person's assignment to one project. Says nothing about what
--                    they may see elsewhere, only that they are answerable for this project and
--                    should hear what happens in it.
--
-- An admin is a manager for every purpose below, and a company manager is a manager of every
-- project, so no rule has to name all three.

-- ---------- 1. let the role exist ----------
--
-- Both constraints, and profiles is not optional: handle_new_user() copies the role from
-- allowed_emails into profiles on first sign-in, so leaving profiles at ('member','admin')
-- would let an admin create a manager and then fail that person's registration.

alter table allowed_emails drop constraint if exists allowed_emails_role_check;
alter table allowed_emails
  add constraint allowed_emails_role_check check (role in ('member', 'manager', 'admin'));

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('member', 'manager', 'admin'));

alter table project_assignments
  add column if not exists is_manager boolean not null default false;

comment on column project_assignments.is_manager is
  'This person manages this project: they receive its notifications and its schedule overruns.';

-- ---------- 2. helpers ----------

create or replace function my_role()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ae.role from allowed_emails ae
      where lower(ae.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and ae.active),
    'member');
$$;

create or replace function is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('manager', 'admin');
$$;

/** True when the caller is answerable for this project. Admins and company managers count:
    the flag widens who is responsible, it never narrows it. */
create or replace function is_project_manager(p_project uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager() or exists (
    select 1 from project_assignments pa
    where pa.project_id = p_project
      and pa.is_manager
      and lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function my_role() from public;
revoke all on function is_manager() from public;
revoke all on function is_project_manager(uuid) from public;
grant execute on function my_role() to authenticated;
grant execute on function is_manager() to authenticated;
grant execute on function is_project_manager(uuid) to authenticated;

-- ---------- 3. permission defaults, per role ----------
--
-- perm_defaults was keyed by area alone, which was enough when 'member' was the only role with
-- defaults. A manager needs different ones — the schedule and the control centre are the point
-- of the role — so the table gains the role it applies to.

alter table perm_defaults add column if not exists role text not null default 'member';
alter table perm_defaults drop constraint if exists perm_defaults_pkey;
alter table perm_defaults add primary key (role, area);
alter table perm_defaults drop constraint if exists perm_defaults_role_check;
alter table perm_defaults add constraint perm_defaults_role_check
  check (role in ('member', 'manager'));   -- admin resolves to 'edit' without consulting this

insert into perm_defaults (role, area, level) values
  ('manager', 'logbook',        'edit'),
  ('manager', 'calendar',       'view'),
  ('manager', 'search',         'view'),
  ('manager', 'projects',       'view'),
  ('manager', 'export',         'view'),
  ('manager', 'dashboard',      'view'),
  ('manager', 'control_center', 'view'),
  -- view, not edit: changing the schedule is what the new edit mode guards, and an admin
  -- grants it deliberately per person
  ('manager', 'gantt',          'view'),
  ('manager', 'defects',        'edit'),
  ('manager', 'coops_manage',   'none'),
  ('manager', 'alert_rules',    'view'),
  ('manager', 'form_builder',   'none')
on conflict (role, area) do update set level = excluded.level;

-- Same resolution order as before — admin, then the person's own override, then the default —
-- except the default now depends on which role they hold.
create or replace function perm_level(p_area text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not is_member() then 'none'
    when is_admin() then 'edit'
    else coalesce(
      (select up.level from user_permissions up
        where lower(up.email) = lower(auth.jwt() ->> 'email') and up.area = p_area),
      (select pd.level from perm_defaults pd where pd.area = p_area and pd.role = my_role()),
      (select pd.level from perm_defaults pd where pd.area = p_area and pd.role = 'member'),
      'none')
  end;
$$;

-- ---------- 4. who may read the assignment list ----------
--
-- It was readable by any authenticated request — not even a member check — while it names who
-- works on what. The client needs it to build notification recipients, so members keep reading
-- it; anonymous callers no longer do.
drop policy if exists read_assignments on project_assignments;
create policy read_assignments on project_assignments for select using (is_member());

-- ---------- 5. self-check ----------
--
-- The same guard 0045 ends with: if the defaults in the database and the defaults in the client
-- ever drift, the router shows one thing and the database enforces another.
do $$
declare
  n int;
begin
  select count(*) into n from perm_defaults where role = 'manager';
  if n <> 12 then
    raise exception 'expected 12 manager defaults, found %', n;
  end if;
  if (select level from perm_defaults where role = 'manager' and area = 'control_center') <> 'view' then
    raise exception 'a manager must be able to see the control centre';
  end if;
  if (select level from perm_defaults where role = 'member' and area = 'control_center') <> 'none' then
    raise exception 'a plain member must not see the control centre';
  end if;
end $$;
