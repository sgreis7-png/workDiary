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
