-- דוח רמזור — שלב א׳: תשתית נתונים.
--
-- הצבע נגזר מספים מספריים בלבד (traffic_light_settings), ומחושב בפונקציה אחת
-- (0065). כאן: העמודות והטבלאות שהפונקציה קוראת, ההרשאות, והטריגרים שהופכים
-- רשומת יומן לפריט במרשם הבלת"מ ולסימון "הגיע לאתר".

-- ---------- 1. perm areas ----------
insert into perm_defaults (role, area, level) values
  ('member',  'traffic_light', 'none'),
  ('manager', 'traffic_light', 'edit'),
  ('member',  'deliveries',    'none'),
  ('manager', 'deliveries',    'none')
on conflict (role, area) do update set level = excluded.level;

-- ---------- 2. WBS templates ----------
create table if not exists wbs_templates (
  id           uuid primary key default gen_random_uuid(),
  project_type text not null,
  sort_order   int  not null,
  name_he      text not null,
  name_en      text not null,
  critical     boolean not null default false,
  active       boolean not null default true,
  unique (project_type, name_he)
);
alter table wbs_templates enable row level security;
drop policy if exists read_wbs_templates on wbs_templates;
create policy read_wbs_templates on wbs_templates for select using (is_member());
drop policy if exists admin_wbs_templates on wbs_templates;
create policy admin_wbs_templates on wbs_templates for all using (is_admin()) with check (is_admin());

-- mirrored by COOP_TEMPLATE in src/traffic/wbs.ts (wbs.test.ts)
insert into wbs_templates (project_type, sort_order, name_he, name_en, critical) values
  ('coop', 1, 'עבודות עפר ובטון', 'Earthworks & concrete', false),
  ('coop', 2, 'הקמת קונסטרוקציה (שלד)', 'Structure erection (frame)', false),
  ('coop', 3, 'קורות בטון', 'Concrete beams', false),
  ('coop', 4, 'כיסוי תקרה וחיפוי קירות', 'Ceiling & wall cladding', false),
  ('coop', 5, 'כיסוי גג', 'Roof covering', false),
  ('coop', 6, 'ציוד פנים', 'Interior equipment', true),
  ('coop', 7, 'מערכות אקלים', 'Climate systems', true),
  ('coop', 8, 'חשמל ובקרה', 'Electrical & controls', true),
  ('coop', 9, 'מערכת זבל / ספק חוץ', 'Manure system / external supplier', true),
  ('coop', 10, 'הרצה, גמרים ומסירה', 'Commissioning, finishes & handover', true)
on conflict (project_type, name_he) do nothing;

-- old fixed diary task names → template sort_order (mirrored by LEGACY_TASK_MAP)
create table if not exists wbs_legacy_names (
  legacy_name   text not null,
  project_type  text not null,
  template_sort int  not null,
  primary key (legacy_name, project_type)
);
alter table wbs_legacy_names enable row level security;
drop policy if exists read_wbs_legacy on wbs_legacy_names;
create policy read_wbs_legacy on wbs_legacy_names for select using (is_member());

insert into wbs_legacy_names (legacy_name, project_type, template_sort) values
  ('הקמת קונס׳ (שלד)', 'coop', 2),
  ('Structure erection (frame)', 'coop', 2),
  ('גמר קורות בטון', 'coop', 3),
  ('Concrete beams finish', 'coop', 3),
  ('כיסוי תקרה', 'coop', 4),
  ('Ceiling covering', 'coop', 4),
  ('חיפוי קירות', 'coop', 4),
  ('Wall cladding', 'coop', 4),
  ('כיסוי גג', 'coop', 5),
  ('Roof covering', 'coop', 5),
  ('ציוד פנים (אוכל, מים)', 'coop', 6),
  ('Interior equipment (feed, water)', 'coop', 6),
  ('ציוד אקלים', 'coop', 7),
  ('Climate equipment', 'coop', 7),
  ('חשמל ובקרה', 'coop', 8),
  ('Electrical & controls', 'coop', 8),
  ('גמרים ומסירה', 'coop', 10),
  ('Finishes & handover', 'coop', 10)
on conflict do nothing;

-- ---------- 3. projects ----------
alter table projects add column if not exists contract_due_date date;
alter table projects add column if not exists project_type text not null default 'coop';
comment on column projects.contract_due_date is 'תאריך מסירה חוזי. Null → ציר הזמן אדום ("אין תאריך חוזי").';
comment on column projects.project_type is 'Selects the wbs_templates rows (coop, hatchery, …).';

-- ---------- 4. contractors + agreed headcount ----------
create table if not exists project_contractors (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  name           text not null,
  agreed_workers int  not null default 0 check (agreed_workers >= 0),
  critical       boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists project_contractors_project on project_contractors (project_id);
alter table project_contractors enable row level security;
drop policy if exists read_project_contractors on project_contractors;
create policy read_project_contractors on project_contractors for select using (is_member());
drop policy if exists write_project_contractors on project_contractors;
create policy write_project_contractors on project_contractors for all
  using (is_admin() or can_edit('traffic_light'))
  with check (is_admin() or can_edit('traffic_light'));

-- ---------- 5. deliveries ----------
create table if not exists project_deliveries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  item            text not null,
  wbs_template_id uuid references wbs_templates(id) on delete set null,
  need_date       date not null,
  status          text not null default 'not_ordered'
                  check (status in ('not_ordered', 'ordered', 'shipped', 'on_site')),
  eta             date,
  owner_email     text,
  notes           text,
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create index if not exists project_deliveries_project_need on project_deliveries (project_id, need_date);
alter table project_deliveries enable row level security;
drop policy if exists read_project_deliveries on project_deliveries;
create policy read_project_deliveries on project_deliveries for select using (is_member());
drop policy if exists write_project_deliveries on project_deliveries;
create policy write_project_deliveries on project_deliveries for all
  using (is_admin() or can_edit('traffic_light') or can_edit('deliveries'))
  with check (is_admin() or can_edit('traffic_light') or can_edit('deliveries'));

-- ---------- 6. issues register (מרשם בלת"מ) ----------
create table if not exists issues (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  seq             int  not null default 0,
  entry_id        uuid unique references entries(id) on delete set null,
  opened_on       date not null default current_date,
  description     text not null default '',
  owner_kind      text not null default 'other'
                  check (owner_kind in ('engineering', 'purchasing', 'customer', 'contractor', 'weather', 'other')),
  owner_email     text,
  due_date        date,
  blocking        boolean not null default false,
  wbs_template_id uuid references wbs_templates(id) on delete set null,
  systemic        boolean not null default false,
  closed_on       date,
  closure_note    text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  unique (project_id, seq)
);
create index if not exists issues_project_open on issues (project_id) where closed_on is null;
alter table issues enable row level security;

drop policy if exists read_issues on issues;
create policy read_issues on issues for select using (is_member());
drop policy if exists insert_issues on issues;
create policy insert_issues on issues for insert with check (is_member());
-- PMO edits anything; the diary author may still edit their own open item
drop policy if exists update_issues on issues;
create policy update_issues on issues for update
  using (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid() and closed_on is null))
  with check (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid()));
drop policy if exists delete_issues on issues;
create policy delete_issues on issues for delete using (is_admin() or can_edit('traffic_light'));

-- per-project running number
create or replace function issues_assign_seq() returns trigger
language plpgsql as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq from issues where project_id = new.project_id;
  end if;
  return new;
end $$;
drop trigger if exists issues_seq on issues;
create trigger issues_seq before insert on issues for each row execute function issues_assign_seq();

-- ---------- 7. work_tasks: source + axis, PMO-only closing of traffic-light tasks ----------
alter table work_tasks add column if not exists source text not null default 'manual'
  check (source in ('manual', 'traffic_light'));
alter table work_tasks add column if not exists axis text
  check (axis in ('time', 'supply', 'client', 'crew', 'issues', 'gray'));
alter table work_tasks add column if not exists closed_by text;
create index if not exists work_tasks_tl_open on work_tasks (project_id, axis)
  where source = 'traffic_light' and status = 'open';

drop policy if exists rw_work_tasks on work_tasks;
drop policy if exists read_work_tasks on work_tasks;
create policy read_work_tasks on work_tasks for select using (is_member());
drop policy if exists insert_work_tasks on work_tasks;
create policy insert_work_tasks on work_tasks for insert with check (is_member());
drop policy if exists update_work_tasks on work_tasks;
create policy update_work_tasks on work_tasks for update
  using (is_member())
  with check (is_member() and (source <> 'traffic_light' or status <> 'done' or can_edit('traffic_light')));
drop policy if exists delete_work_tasks on work_tasks;
create policy delete_work_tasks on work_tasks for delete
  using (is_member() and (source <> 'traffic_light' or is_admin() or can_edit('traffic_light')));

-- `with check` sees only the new row, so a member could rewrite source to 'manual' and
-- close a traffic-light task in the same statement. The provenance columns are therefore
-- immutable to anyone but an admin or a traffic_light editor.
create or replace function work_tasks_guard_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or can_edit('traffic_light') then return new; end if;
  new.source := old.source;
  new.axis   := old.axis;
  if old.source = 'traffic_light' and new.status = 'done' and old.status <> 'done' then
    raise exception 'רק PMO רשאי לסגור משימת רמזור' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists work_tasks_guard_source_trg on work_tasks;
create trigger work_tasks_guard_source_trg before update on work_tasks
  for each row execute function work_tasks_guard_source();

-- ---------- 8. thresholds (single row) + snapshots ----------
create table if not exists traffic_light_settings (
  id                        int primary key default 1 check (id = 1),
  time_amber_days           int not null default 7,
  time_red_days             int not null default 30,
  lookahead_days            int not null default 42,
  supply_red_window_days    int not null default 21,
  supply_eta_margin_days    int not null default 5,
  crew_green_pct            int not null default 90,
  crew_red_pct              int not null default 70,
  crew_window_days          int not null default 7,
  issue_open_days           int not null default 7,
  issue_block_resolve_days  int not null default 14,
  gray_missing_workdays     int not null default 2,
  gray_gantt_days           int not null default 14,
  updated_at                timestamptz not null default now()
);
insert into traffic_light_settings (id) values (1) on conflict (id) do nothing;
alter table traffic_light_settings enable row level security;
drop policy if exists read_tl_settings on traffic_light_settings;
create policy read_tl_settings on traffic_light_settings for select using (is_member());
drop policy if exists admin_tl_settings on traffic_light_settings;
create policy admin_tl_settings on traffic_light_settings for update using (is_admin()) with check (is_admin());

create table if not exists traffic_light_snapshots (
  id        uuid primary key default gen_random_uuid(),
  taken_at  timestamptz not null default now(),
  payload   jsonb not null
);
alter table traffic_light_snapshots enable row level security;
drop policy if exists read_tl_snapshots on traffic_light_snapshots;
create policy read_tl_snapshots on traffic_light_snapshots for select using (can_view('traffic_light'));

-- ---------- 9. diary → register / arrivals ----------

-- Malfunction departments become the spec's closed owner list. Old labels still map.
update field_definitions set options =
  '[{"he":"אין","en":"None"},{"he":"הנדסה","en":"Engineering"},{"he":"רכש-הספקות","en":"Purchasing & supply"},{"he":"לקוח","en":"Customer"},{"he":"קבלן","en":"Contractor"},{"he":"מזג אוויר","en":"Weather"},{"he":"אחר","en":"Other"}]'::jsonb
where key = 'malfunction_dept';

-- stored label (any language, old or new) → owner_kind; null = no malfunction
create or replace function tl_owner_kind(p_label text) returns text
language sql immutable as $$
  select case lower(trim(coalesce(p_label, '')))
    when 'הנדסה' then 'engineering' when 'engineering' then 'engineering'
    when 'רכש-הספקות' then 'purchasing' when 'purchasing & supply' then 'purchasing'
    when 'רכש' then 'purchasing' when 'purchasing' then 'purchasing'
    when 'לוגיסטיקה ומחסן' then 'purchasing' when 'logistics & warehouse' then 'purchasing' when 'logistics_warehouse' then 'purchasing'
    when 'לקוח' then 'customer' when 'customer' then 'customer'
    when 'לקוחות' then 'customer' when 'customers' then 'customer'
    when 'קבלן' then 'contractor' when 'contractor' then 'contractor'
    when 'קבלנים' then 'contractor' when 'contractors' then 'contractor'
    when 'מזג אוויר' then 'weather' when 'weather' then 'weather'
    when 'כספים' then 'other' when 'finance' then 'other'
    when 'אחר' then 'other' when 'other' then 'other'
    else null end;
$$;

create or replace function entries_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text := tl_owner_kind(new.values ->> 'malfunction_dept');
  blocking boolean := lower(trim(coalesce(new.values ->> 'issue_blocking', ''))) in ('כן', 'yes', 'true');
begin
  if kind is null then
    -- dept went back to "none": drop the auto item unless the PMO already took it over
    delete from issues where entry_id = new.id and owner_email is null and due_date is null and closed_on is null;
    return new;
  end if;
  insert into issues (project_id, entry_id, opened_on, description, owner_kind, blocking, created_by)
  values (new.project_id, new.id, coalesce(new.work_date, current_date),
          coalesce(new.values ->> 'malfunction', ''), kind, blocking, new.created_by)
  on conflict (entry_id) do update
    set description = excluded.description,
        owner_kind  = case when issues.owner_email is null then excluded.owner_kind else issues.owner_kind end,
        blocking    = excluded.blocking;
  return new;
exception when others then
  raise warning 'entries_to_issue: %', sqlerrm;
  return new;
end $$;
drop trigger if exists entries_to_issue_trg on entries;
create trigger entries_to_issue_trg after insert or update of values on entries
  for each row execute function entries_to_issue();

-- arrived_items is stored as a JSON *string* (the client JSON.stringify()s every table
-- key) — accept a real array too.
create or replace function entries_arrivals() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  begin
    select array_agg(x::uuid) into ids
    from jsonb_array_elements_text(
      case when jsonb_typeof(new.values -> 'arrived_items') = 'string'
           then (new.values ->> 'arrived_items')::jsonb
           else coalesce(new.values -> 'arrived_items', '[]'::jsonb) end) as x
    where x ~ '^[0-9a-f-]{36}$';
  exception when others then ids := null; end;
  if ids is null then return new; end if;
  update project_deliveries
     set status = 'on_site', updated_at = now(),
         updated_by = coalesce((select lower(email) from auth.users where id = new.created_by), 'diary')
   where id = any (ids) and project_id = new.project_id and status <> 'on_site';
  return new;
exception when others then
  raise warning 'entries_arrivals: %', sqlerrm;
  return new;
end $$;
drop trigger if exists entries_arrivals_trg on entries;
create trigger entries_arrivals_trg after insert or update of values on entries
  for each row execute function entries_arrivals();
