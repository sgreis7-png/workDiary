-- Gantt schedules per project, imported from Microsoft Project.
--
-- The .mpp file is read by services/mpp-converter (MPXJ on a JVM) and lands here as
-- rows, which then become the live schedule: editing a bar in the app writes to
-- gantt_tasks. The values as imported are kept in base_start_ts/base_finish_ts so the
-- current plan can always be compared against what the customer's file said.
--
-- ext_uid is MPXJ's task UniqueID. It is stable inside one file, so links and parent
-- pointers are expressed in those terms rather than in our own uuids — a re-import of
-- the same schedule then lines up row for row.

create table if not exists gantt_charts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  source_file  text,                  -- original filename, for display
  source_path  text,                  -- storage object: 'imports/<chartId>/<file>'
  status_date  timestamp,             -- MS Project status date, when the file carries one
  span_start   timestamp,
  span_finish  timestamp,
  imported_by  uuid references auth.users(id),
  imported_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  active       boolean not null default true
);

create table if not exists gantt_tasks (
  id             uuid primary key default gen_random_uuid(),
  chart_id       uuid not null references gantt_charts(id) on delete cascade,
  ext_uid        integer not null,
  parent_ext_uid integer,
  sort_order     integer not null default 0,
  depth          integer not null default 0,
  wbs            text,
  name           text not null,
  -- wall-clock, not instants: a schedule day is the same day in every timezone
  start_ts       timestamp not null,
  finish_ts      timestamp not null,
  base_start_ts  timestamp,
  base_finish_ts timestamp,
  duration_days  numeric,
  pct            integer not null default 0 check (pct between 0 and 100),
  milestone      boolean not null default false,
  is_summary     boolean not null default false,
  critical       boolean not null default false,
  notes          text,
  resources      text[] not null default '{}',
  updated_at     timestamptz not null default now(),
  unique (chart_id, ext_uid)
);

create table if not exists gantt_links (
  id            uuid primary key default gen_random_uuid(),
  chart_id      uuid not null references gantt_charts(id) on delete cascade,
  pred_ext_uid  integer not null,
  succ_ext_uid  integer not null,
  kind          text not null default 'FS' check (kind in ('FS', 'SS', 'FF', 'SF')),
  lag_days      numeric not null default 0,
  unique (chart_id, pred_ext_uid, succ_ext_uid)
);

create index if not exists gantt_charts_project_idx on gantt_charts (project_id);
create index if not exists gantt_tasks_chart_idx    on gantt_tasks (chart_id, sort_order);
create index if not exists gantt_links_chart_idx    on gantt_links (chart_id);

-- ---------- RLS ----------
-- Read: any active member, same as projects (0030:27).
-- Write: admins, or a user granted the 'gantt' area at edit level (0022:19-32).

alter table gantt_charts enable row level security;
alter table gantt_tasks  enable row level security;
alter table gantt_links  enable row level security;

drop policy if exists read_gantt_charts on gantt_charts;
create policy read_gantt_charts on gantt_charts for select using (is_member());
drop policy if exists write_gantt_charts on gantt_charts;
create policy write_gantt_charts on gantt_charts for all
  using (is_admin() or has_perm('gantt', 'edit'))
  with check (is_admin() or has_perm('gantt', 'edit'));

drop policy if exists read_gantt_tasks on gantt_tasks;
create policy read_gantt_tasks on gantt_tasks for select using (is_member());
drop policy if exists write_gantt_tasks on gantt_tasks;
create policy write_gantt_tasks on gantt_tasks for all
  using (is_admin() or has_perm('gantt', 'edit'))
  with check (is_admin() or has_perm('gantt', 'edit'));

drop policy if exists read_gantt_links on gantt_links;
create policy read_gantt_links on gantt_links for select using (is_member());
drop policy if exists write_gantt_links on gantt_links;
create policy write_gantt_links on gantt_links for all
  using (is_admin() or has_perm('gantt', 'edit'))
  with check (is_admin() or has_perm('gantt', 'edit'));

-- ---------- storage ----------
-- Source files live in the private 'photos' bucket under 'imports/<chartId>/'.
-- Reading is already covered by "photos read scoped" (0030:131), and inserting by
-- "photos insert scoped" (0030:138) — which lets any member write any non-avatar path.
--
-- Narrowing that to schedule editors is done with a RESTRICTIVE policy rather than by
-- recreating the permissive one. Permissive policies are OR'd, so a second one could
-- only widen access; and rewriting a live security policy from a migration file risks
-- reverting whatever else has landed on it since. This one is AND'd on top, and is a
-- no-op for every path except the import prefix.

drop policy if exists "imports insert gated" on storage.objects;
create policy "imports insert gated" on storage.objects
  as restrictive for insert
  with check (
    bucket_id <> 'photos'
    or name not like 'imports/%'
    or is_admin()
    or has_perm('gantt', 'edit')
  );
