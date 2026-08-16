-- Daily safety-briefing (toolbox talk) sign-off forms.
--
-- Signatures are vector strokes (JSONB), not images: a signature is ~1-3KB of points,
-- renders crisply at any size (screen, print, mail), and lives inside the form row —
-- no storage bucket, no signed URLs. Workers are free-text name + id_number captured
-- per form; suggestions come from the project's previous forms, not from a roster.

-- ---- editable topic list, seeded from the official paper form ----
create table if not exists safety_topics (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table safety_topics enable row level security;

drop policy if exists read_safety_topics on safety_topics;
create policy read_safety_topics on safety_topics for select using (is_member());
drop policy if exists admin_safety_topics on safety_topics;
create policy admin_safety_topics on safety_topics for all
  using (is_admin()) with check (is_admin());

insert into safety_topics (label, sort_order) values
  ('ציוד מגן אישי',                          10),
  ('הוראות בטיחות באתר והכרתו',              20),
  ('עבודה בגובה',                            30),
  ('חפירות — סיכונים ותקנות',                40),
  ('חשמל — סיכונים והוראות בטיחות',          50),
  ('כלי עבודה מיטלטלים',                     60),
  ('עבודה חמה',                              70),
  ('גיהות — אבק, רעש, מזג אוויר קיצוני',     80),
  ('ארגונומיה — משאות כבדים, עבודה במאמץ',   90),
  ('מצבי חירום — שריפה, ירי טילים',         100)
on conflict (label) do nothing;

-- ---- the forms ----
create table if not exists safety_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  training_date date not null default current_date,
  topics jsonb not null default '[]',   -- labels of the topics actually covered
  workers jsonb not null default '[]',  -- [{name,id_number,signature,signed_at}]
  instructor_name text not null default '',
  instructor_qualification text not null default '',
  instructor_signature jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists safety_forms_project_date
  on safety_forms (project_id, training_date desc);
alter table safety_forms enable row level security;

-- Same shape as the entries policies in 0045: viewers read, an author always
-- reads their own rows, editing stays with the author (or an admin).
drop policy if exists read_safety_forms on safety_forms;
create policy read_safety_forms on safety_forms for select
  using (can_view('safety') or (is_member() and created_by = auth.uid()));
drop policy if exists insert_safety_forms on safety_forms;
create policy insert_safety_forms on safety_forms for insert
  with check (can_edit('safety') and created_by = auth.uid());
drop policy if exists update_safety_forms on safety_forms;
create policy update_safety_forms on safety_forms for update
  using (can_edit('safety') and (created_by = auth.uid() or is_admin()))
  with check (can_edit('safety') and (created_by = auth.uid() or is_admin()));
drop policy if exists delete_safety_forms on safety_forms;
create policy delete_safety_forms on safety_forms for delete
  using (can_edit('safety') and (created_by = auth.uid() or is_admin()));

-- ---- defaults for the new area (role-keyed since 0050) ----
insert into perm_defaults (role, area, level) values
  ('member',  'safety', 'edit'),
  ('manager', 'safety', 'edit')
on conflict (role, area) do update set level = excluded.level;
