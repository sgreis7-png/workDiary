-- מסירה — שדות שמוסיפים בשטח.
--
-- 0077 נעל את קטלוג המערכות לאדמין. בפועל מנהל עבודה עומד בלול מול הלקוח עם מערכת שלא
-- מופיעה בטופס 70 (גנרטור, מנוע שער), וטלפון לאדמין הוא בדיוק הרגע שבו דף מודפס מנצח את
-- האפליקציה. כאן הקטלוגים נפתחים לכל מי שמורשה למלא מסירה, עם created_by, ומחיקה מוגבלת
-- ליוצר או לאדמין.
--
-- 14 השורות של טופס 70 מסומנות builtin ואינן ניתנות למחיקה לאף אחד, כולל אדמין: מסירה
-- בלי "אוורור" אינה טופס 70. להסתרה יש active.
--
-- מקביל ל-src/handover/ בצד הלקוח; src/handover/builtin.sql.test.ts שומר על ההתאמה בין
-- רשימת ה-builtin כאן ל-HANDOVER_SYSTEM_SEED.

-- ---- קטלוג המערכות: בעלות ונעילה של המובנות ----
alter table handover_systems add column if not exists builtin boolean not null default false;
alter table handover_systems add column if not exists created_by uuid;

update handover_systems set builtin = true where label in (
  'אוורור',
  'מערכת צינון',
  'חימום',
  'מערכת חשמל + מפיל וילון',
  'מערכת מים',
  'המטרה',
  'מיכלי תערובת',
  'מערכת האבסה',
  'מערכת שתייה',
  'מערכת תלייה וכננות',
  'מערכת תאים',
  'תאורה',
  'מערכת זבל',
  'מבנה/תשתית'
);

-- 0077 נתן ל-handover_systems מדיניות admin אחת (for all). מחליפים אותה בארבע מפורשות.
drop policy if exists admin_handover_systems on handover_systems;
drop policy if exists read_handover_systems on handover_systems;
create policy read_handover_systems on handover_systems for select using (is_member());

drop policy if exists insert_handover_systems on handover_systems;
create policy insert_handover_systems on handover_systems for insert
  with check (can_edit('handover') and created_by = auth.uid() and builtin = false);

-- אדמין מעדכן הכל (כולל כיבוי/הדלקה של שורה מובנית); מי שהוסיף שורה משלו מעדכן אותה,
-- ולא יכול להפוך אותה למובנית או להעביר בעלות.
drop policy if exists update_handover_systems on handover_systems;
create policy update_handover_systems on handover_systems for update
  using (is_admin() or (created_by = auth.uid() and builtin = false))
  with check (is_admin() or (created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_systems on handover_systems;
create policy delete_handover_systems on handover_systems for delete
  using (builtin = false and (is_admin() or created_by = auth.uid()));

-- ---- קטלוג שדות הכותרת הנוספים (תאום מלא ל-handover_systems) ----
create table if not exists handover_extra_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  builtin boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table handover_extra_fields enable row level security;

drop policy if exists read_handover_extra_fields on handover_extra_fields;
create policy read_handover_extra_fields on handover_extra_fields for select using (is_member());

drop policy if exists insert_handover_extra_fields on handover_extra_fields;
create policy insert_handover_extra_fields on handover_extra_fields for insert
  with check (can_edit('handover') and created_by = auth.uid() and builtin = false);

drop policy if exists update_handover_extra_fields on handover_extra_fields;
create policy update_handover_extra_fields on handover_extra_fields for update
  using (is_admin() or (created_by = auth.uid() and builtin = false))
  with check (is_admin() or (created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_extra_fields on handover_extra_fields;
create policy delete_handover_extra_fields on handover_extra_fields for delete
  using (builtin = false and (is_admin() or created_by = auth.uid()));

-- ---- השדות הנוספים בתוך הרשומה ----
-- [{label, value}] — מועתקים לתוך המסירה בשמירה, כמו שמות המערכות, כדי ששינוי בקטלוג
-- לא יכתוב מחדש מסמך שהלקוח חתם עליו. 0078 לא נוגע בעמודה הזו: שדה נוסף הוא רשות.
alter table handover_forms add column if not exists extra_fields jsonb not null default '[]';
