-- קטגוריות ה-WBS מיושרות לשמות שבאמת מופיעים בגאנטים.
--
-- הרקע: ציר הזמן מתאים שורת סיכום בגאנט לקטגוריה לפי שם, בהתאמה מדויקת (tl_norm).
-- בפועל אף שם לא התאים — שבעת הגאנטים הפעילים מדברים אוצר מילים אחר לגמרי
-- ("עבודות בטון", "עבודות קונסטרוקציה", "כיסויים וחיפויים", "מערכת חשמל",
-- "מערכות אקלים", "ציוד BD", "עבודות מסגרות"), ולכן טבלת הקטגוריות במסך הרמזור
-- הוצגה ריקה מתאריכים ומאחוזים, ואזהרת "לא הותאמה" הופיעה לכל עשר השורות.
--
-- שני חלקים לתיקון:
--   1. הקטגוריות עצמן מקבלות את שמות הגאנט. אותו אוצר מילים משרת גם את טופס היומן
--      (שורות אחוזי ההתקדמות לכל לול) — זו כל הנקודה: שפה אחת לגאנט, ליומן ולרמזור.
--   2. הגאנטים אינם עקביים בינם לבין עצמם ("בטון" מול "עבודות בטון", "חשמל" מול
--      "מערכת חשמל", "לול 1 עבודות קונסטרוקציה"), ואי אפשר לדרוש שכל מתכנן ינסח
--      אותו דבר. wbs_gantt_aliases נותן לכל קטגוריה רשימת שמות נרדפים, ו-tl_time
--      מתאים גם דרכה.
--
-- השורות מתעדכנות במקום ולא נמחקות: ה-id שלהן מוחזק ב-project_deliveries.wbs_template_id
-- וב-issues.wbs_template_id. שלוש קטגוריות שאין להן מקבילה בגאנט מתקפלות לתוך אחרות
-- ומסומנות כלא-פעילות (הן נעלמות מהטופס, אבל ההפניות אליהן שורדות).
--
-- 0064-0075 כבר הוחלו על הפרויקט החי ואסור לערוך אותן.

-- ---------- 1. הקטגוריות ----------
-- עדכון במקום, לפי השם הישן. סדר חדש = סדר העבודה כפי שהוא מופיע בגאנטים.
update wbs_templates set sort_order = 1, name_he = 'עבודות בטון',        name_en = 'Concrete works',    critical = false where project_type = 'coop' and name_he = 'עבודות עפר ובטון';
update wbs_templates set sort_order = 3, name_he = 'עבודות קונסטרוקציה', name_en = 'Structure works',   critical = false where project_type = 'coop' and name_he = 'הקמת קונסטרוקציה (שלד)';
update wbs_templates set sort_order = 4, name_he = 'כיסויים וחיפויים',   name_en = 'Cladding & covering', critical = false where project_type = 'coop' and name_he = 'כיסוי תקרה וחיפוי קירות';
update wbs_templates set sort_order = 5, name_he = 'מערכת חשמל',         name_en = 'Electrical system', critical = true  where project_type = 'coop' and name_he = 'חשמל ובקרה';
update wbs_templates set sort_order = 6,                                 name_en = 'Climate systems',   critical = true  where project_type = 'coop' and name_he = 'מערכות אקלים';
update wbs_templates set sort_order = 7, name_he = 'ציוד BD',            name_en = 'BD equipment',      critical = true  where project_type = 'coop' and name_he = 'ציוד פנים';
update wbs_templates set sort_order = 9, name_he = 'עבודות גמר',         name_en = 'Finishing works',   critical = true  where project_type = 'coop' and name_he = 'הרצה, גמרים ומסירה';

-- מתקפלות: קורות בטון → עבודות בטון, כיסוי גג → כיסויים וחיפויים,
-- מערכת זבל / ספק חוץ → ציוד BD (ציוד ביג דצ׳מן כולל את קווי ההזנה, המים והזבל).
update wbs_templates set active = false
 where project_type = 'coop' and name_he in ('קורות בטון', 'כיסוי גג', 'מערכת זבל / ספק חוץ');

insert into wbs_templates (project_type, sort_order, name_he, name_en, critical) values
  ('coop', 2, 'עבודות מסגרות', 'Metalwork',    false),
  ('coop', 8, 'מערכת מים',     'Water system', true)
on conflict (project_type, name_he) do update
  set sort_order = excluded.sort_order, name_en = excluded.name_en,
      critical = excluded.critical, active = true;

-- ---------- 2. שמות היומן הישנים ----------
-- הטבלה ממפה שם משימה שנשמר ברשומות ישנות אל sort_order של קטגוריה. מספרי הסדר
-- השתנו, ולכן כל השורות של coop נבנות מחדש — שורה שנשארה על מספר ישן הייתה מפנה
-- עכשיו לקטגוריה אחרת לגמרי. נוספים כאן גם שמות הקטגוריות עצמן לפני השינוי, כדי
-- שרשומות שנשמרו בחודשים האחרונים ימשיכו להיספר.
delete from wbs_legacy_names where project_type = 'coop';
insert into wbs_legacy_names (legacy_name, project_type, template_sort) values
  ('עבודות עפר ובטון', 'coop', 1), ('Earthworks & concrete', 'coop', 1),
  ('קורות בטון', 'coop', 1),       ('Concrete beams', 'coop', 1),
  ('גמר קורות בטון', 'coop', 1),   ('Concrete beams finish', 'coop', 1),
  ('הקמת קונסטרוקציה (שלד)', 'coop', 3), ('Structure erection (frame)', 'coop', 3),
  ('הקמת קונס׳ (שלד)', 'coop', 3),
  ('כיסוי תקרה וחיפוי קירות', 'coop', 4), ('Ceiling & wall cladding', 'coop', 4),
  ('כיסוי תקרה', 'coop', 4),       ('Ceiling covering', 'coop', 4),
  ('חיפוי קירות', 'coop', 4),      ('Wall cladding', 'coop', 4),
  ('כיסוי גג', 'coop', 4),         ('Roof covering', 'coop', 4),
  ('חשמל ובקרה', 'coop', 5),       ('Electrical & controls', 'coop', 5),
  ('ציוד אקלים', 'coop', 6),       ('Climate equipment', 'coop', 6),
  ('ציוד פנים', 'coop', 7),        ('Interior equipment', 'coop', 7),
  ('ציוד פנים (אוכל, מים)', 'coop', 7), ('Interior equipment (feed, water)', 'coop', 7),
  ('מערכת זבל / ספק חוץ', 'coop', 7), ('Manure system / external supplier', 'coop', 7),
  ('הרצה, גמרים ומסירה', 'coop', 9), ('Commissioning, finishes & handover', 'coop', 9),
  ('גמרים ומסירה', 'coop', 9),     ('Finishes & handover', 'coop', 9)
on conflict (legacy_name, project_type) do update set template_sort = excluded.template_sort;

-- ---------- 3. שמות נרדפים לשורות הסיכום בגאנט ----------
create table if not exists wbs_gantt_aliases (
  template_id uuid not null references wbs_templates(id) on delete cascade,
  alias       text not null,
  primary key (template_id, alias)
);
alter table wbs_gantt_aliases enable row level security;
drop policy if exists read_wbs_gantt_aliases on wbs_gantt_aliases;
create policy read_wbs_gantt_aliases on wbs_gantt_aliases for select using (is_member());
drop policy if exists admin_wbs_gantt_aliases on wbs_gantt_aliases;
create policy admin_wbs_gantt_aliases on wbs_gantt_aliases for all
  using (is_admin()) with check (is_admin());

-- הנוסחים שנמצאו בפועל בגאנטים הפעילים. tl_norm מנרמל רווחים, גרשיים ואותיות,
-- ולכן די בנוסח אחד לכל וריאציה של ריווח.
insert into wbs_gantt_aliases (template_id, alias)
select t.id, a.alias
  from (values
    ('עבודות בטון',        'בטון'),
    ('עבודות קונסטרוקציה', 'קונסטרוקציה'),
    ('עבודות קונסטרוקציה', 'לול 1 עבודות קונסטרוקציה'),
    ('עבודות קונסטרוקציה', 'לול 2 עבודות קונסטרוקציה'),
    ('כיסויים וחיפויים',   'פנלים'),
    ('כיסויים וחיפויים',   'גג'),
    ('כיסויים וחיפויים',   'כיסוי גג'),
    ('מערכת חשמל',         'חשמל'),
    ('מערכות אקלים',       'מערכת אקלים'),
    ('ציוד BD',            'ציוד אוכל מים')
  ) as a(name_he, alias)
  join wbs_templates t on t.project_type = 'coop' and t.name_he = a.name_he
on conflict do nothing;

-- ---------- 4. tl_time משדר מחדש: התאמה גם דרך שם נרדף ----------
-- הגוף זהה למותקן (0069) מלבד תנאי ה-where של שורת הגאנט. כללי הצבעים, הספים
-- וסדר החומרה ללא שינוי.
create or replace function tl_time(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_chart_id uuid;
  forecast date;
  delta int;
  colors text[] := '{}';
  cats jsonb := '[]'::jsonb;
  unmatched text[] := '{}';
  latest jsonb;
  t record;
  g_start date; g_finish date; g_base_start date; g_base_finish date; g_pct int;
  cat_pct numeric;
  cat_color text;
  blocked_seq int; blocked_due date;
  reason text;
  extra text;
begin
  select c.id into v_chart_id from gantt_charts c where c.project_id = p.id and c.active order by c.imported_at desc limit 1;
  if v_chart_id is not null then
    select gt.finish_ts::date into forecast from gantt_tasks gt
      where gt.chart_id = v_chart_id and gt.milestone and gt.name like '%מסירה סופית%'
      order by gt.finish_ts desc limit 1;
    if forecast is null then
      select max(gt.finish_ts)::date into forecast from gantt_tasks gt where gt.chart_id = v_chart_id;
    end if;
  end if;
  delta := case when forecast is null or p.contract_due_date is null then null else forecast - p.contract_due_date end;

  -- project level (spec 4.1)
  if p.contract_due_date is null then
    colors := colors || 'red'::text; reason := 'אין תאריך מסירה חוזי במערכת';
  elsif p.contract_due_date < today then
    colors := colors || 'red'::text; reason := 'תאריך המסירה החוזי חלף (' || to_char(p.contract_due_date, 'DD.MM.YYYY') || ')';
  elsif delta is null then
    colors := colors || 'amber'::text; reason := 'אין תאריך סיום חזוי בגאנט';
  elsif delta <= s.time_amber_days then
    colors := colors || 'green'::text; reason := 'סיום חזוי ' || case when delta >= 0 then '+' else '' end || delta || ' ימים מול החוזי';
  elsif delta <= s.time_red_days then
    colors := colors || 'amber'::text; reason := 'סיום חזוי +' || delta || ' ימים אחרי התאריך החוזי';
  else
    colors := colors || 'red'::text; reason := 'סיום חזוי +' || delta || ' ימים אחרי התאריך החוזי';
  end if;

  -- latest diary entry: category pct = mean over coops of matching rows
  select e.values into latest from entries e where e.project_id = p.id order by e.work_date desc, e.created_at desc limit 1;

  for t in select * from wbs_templates w where w.project_type = coalesce(p.project_type, 'coop') and w.active order by w.sort_order loop
    -- שורת הסיכום: שם הקטגוריה בעברית או באנגלית, או אחד השמות הנרדפים שלה
    select gt.start_ts::date, gt.finish_ts::date, gt.base_start_ts::date, gt.base_finish_ts::date, gt.pct
      into g_start, g_finish, g_base_start, g_base_finish, g_pct
      from gantt_tasks gt
     where gt.chart_id = v_chart_id and gt.is_summary
       and (tl_norm(gt.name) in (tl_norm(t.name_he), tl_norm(t.name_en))
            or exists (select 1 from wbs_gantt_aliases a
                        where a.template_id = t.id and tl_norm(a.alias) = tl_norm(gt.name)))
     order by gt.sort_order limit 1;
    if v_chart_id is not null and g_start is null then unmatched := unmatched || t.name_he; end if;

    -- diary pct: rows whose task maps to this template row (direct name or legacy map)
    select avg(nullif(r ->> 'pct','')::numeric) into cat_pct
      from jsonb_array_elements(tl_json_array(latest -> 'progress_coops')) c
      cross join lateral jsonb_array_elements(coalesce(c -> 'rows', '[]'::jsonb)) r
     where tl_norm(r ->> 'task') in (tl_norm(t.name_he), tl_norm(t.name_en))
        or exists (select 1 from wbs_legacy_names ln
                    where ln.project_type = t.project_type and ln.template_sort = t.sort_order
                      and tl_norm(ln.legacy_name) = tl_norm(r ->> 'task'));

    select i.due_date, i.seq into blocked_due, blocked_seq from issues i
     where i.project_id = p.id and i.closed_on is null and i.blocking and i.wbs_template_id = t.id
     order by i.due_date nulls first limit 1;

    cat_color := 'green';
    if g_finish is not null and g_finish < today and coalesce(cat_pct, g_pct, 0) < 100 then cat_color := 'amber'; end if;
    if t.critical and g_start is not null and g_base_start is not null and g_start > g_base_start then cat_color := 'amber'; end if;
    if t.critical and blocked_seq is not null
       and (blocked_due is null or blocked_due > today + s.issue_block_resolve_days) then cat_color := 'red'; end if;
    if g_start is not null then colors := colors || cat_color; end if;

    cats := cats || jsonb_build_object(
      'template_id', t.id, 'sort_order', t.sort_order, 'name_he', t.name_he, 'name_en', t.name_en, 'critical', t.critical,
      'matched', g_start is not null,
      'start', g_start, 'finish', g_finish, 'base_start', g_base_start, 'base_finish', g_base_finish,
      'gantt_pct', g_pct, 'diary_pct', round(cat_pct), 'blocked_issue', blocked_seq, 'color', cat_color);
  end loop;

  if tl_worst(colors) <> tl_worst(array[colors[1]]) then
    select string_agg(x ->> 'name_he', ', ') into extra
      from jsonb_array_elements(cats) x where x ->> 'color' = tl_worst(colors);
    reason := reason || coalesce(' · ' || extra, '');
  end if;

  return jsonb_build_object(
    'color', tl_worst(colors), 'reason', reason,
    'contract', p.contract_due_date, 'forecast', forecast, 'delta_days', delta,
    'evidence', jsonb_build_object('categories', cats, 'unmatched', to_jsonb(unmatched), 'has_chart', v_chart_id is not null));
end $$;
revoke all on function tl_time(projects, traffic_light_settings, date) from public;
revoke execute on function tl_time(projects, traffic_light_settings, date) from anon, authenticated;
