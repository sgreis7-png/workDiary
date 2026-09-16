-- טופס מסירת פרויקט (טופס 70) — המסמך שבו הלקוח מאשר שכל מערכות הפרויקט נבדקו ונמסרו.
-- מקביל למודול src/handover/ בצד הלקוח: systems.ts מחזיק את אותם 14 שמות שנזרעים כאן,
-- ו-src/handover/systems.sql.test.ts שומר על ההתאמה.
--
-- החתימה נשמרת כווקטור (JSONB) בתוך השורה, בדיוק כמו ב-safety_forms (0061): 1-3KB, נטענת
-- עם הרשומה, ומודפסת חד בכל גודל — בלי bucket ובלי signed URLs.
--
-- מסירה נשמרת רק כשהיא חתומה (הוולידציה בצד הלקוח דורשת חתימת מקבל), ולכן כל שורה קיימת
-- היא מסמך חתום: update/delete מוגבלים לאדמין בלבד ולא ליוצר.

-- ---- רשימת המערכות, ניתנת לעריכה באדמין, נזרעת מטופס 70 ----
create table if not exists handover_systems (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table handover_systems enable row level security;

drop policy if exists read_handover_systems on handover_systems;
create policy read_handover_systems on handover_systems for select using (is_member());
drop policy if exists admin_handover_systems on handover_systems;
create policy admin_handover_systems on handover_systems for all
  using (is_admin()) with check (is_admin());

insert into handover_systems (label, sort_order) values
  ('אוורור',                    10),
  ('מערכת צינון',               20),
  ('חימום',                     30),
  ('מערכת חשמל + מפיל וילון',   40),
  ('מערכת מים',                 50),
  ('המטרה',                     60),
  ('מיכלי תערובת',              70),
  ('מערכת האבסה',               80),
  ('מערכת שתייה',               90),
  ('מערכת תלייה וכננות',       100),
  ('מערכת תאים',               110),
  ('תאורה',                    120),
  ('מערכת זבל',                130),
  ('מבנה/תשתית',               140)
on conflict (label) do nothing;

-- ---- טופסי המסירה ----
create table if not exists handover_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  handover_date date not null default current_date,
  client_name text not null default '',      -- שם הלקוח
  site_location text not null default '',    -- מיקום האתר
  project_nature text not null default '',   -- מהות הפרויקט
  attendees jsonb not null default '[]',     -- [{name,role}] — נוכחים במעמד המסירה
  systems jsonb not null default '[]',       -- [{label,status:'ok'|'bad',note}]
  notes text not null default '',
  receiver_name text not null default '',    -- שם מקבל הפרויקט
  receiver_role text not null default '',
  receiver_signature jsonb,
  signed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists handover_forms_project_date
  on handover_forms (project_id, handover_date desc);
alter table handover_forms enable row level security;

-- קריאה: מי שיש לו הרשאת צפייה, ותמיד היוצר עצמו (כמו safety_forms ב-0061).
drop policy if exists read_handover_forms on handover_forms;
create policy read_handover_forms on handover_forms for select
  using (can_view('handover') or (is_member() and created_by = auth.uid()));
drop policy if exists insert_handover_forms on handover_forms;
create policy insert_handover_forms on handover_forms for insert
  with check (can_edit('handover') and created_by = auth.uid());

-- מסמך חתום לא משנים: תיקון של מסירה שנחתמה עובר דרך אדמין בלבד. אין כאן can_edit()
-- בכוונה — לאדמין ממילא יש edit בכל אזור, וההגבלה היא כל הנקודה.
drop policy if exists update_handover_forms on handover_forms;
create policy update_handover_forms on handover_forms for update
  using (is_admin()) with check (is_admin());
drop policy if exists delete_handover_forms on handover_forms;
create policy delete_handover_forms on handover_forms for delete
  using (is_admin());

-- ---- ברירות מחדל לאזור ההרשאה החדש (role-keyed מאז 0050) ----
insert into perm_defaults (role, area, level) values
  ('member',  'handover', 'edit'),
  ('manager', 'handover', 'edit')
on conflict (role, area) do update set level = excluded.level;
