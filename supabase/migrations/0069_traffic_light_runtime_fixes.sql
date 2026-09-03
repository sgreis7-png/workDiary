-- דוח רמזור — תיקוני זמן ריצה: כל 16 הפרויקטים חזרו אפורים עם שגיאה שנתפסה.
--
-- מיגרציות 0064-0068 כבר הוחלו על מסד הנתונים המתארח ואסור לערוך אותן; התיקון כאן
-- משדר מחדש את tl_time בלבד (create or replace), עם אותו security/volatility/search_path
-- ואותם revokes שהיו ב-0066. שאר הפונקציות ללא שינוי. כללי הצבעים לא משתנים כלל —
-- הספים, סדר החומרה (gray > red > amber > green > na), "צבע הפרויקט = הציר הגרוע ביותר"
-- ו-gray שגובר על הכל נשארים בדיוק כפי שהוגדרו.
--
-- שני באגים ב-plpgsql, שניהם ב-tl_time, שניהם שוחזרו במבודד על מסד הנתונים החי:
--
-- 1. missing FROM-clause entry for table "tl_time"
--    התווית האוטומטית של הבלוק החיצוני בשם הפונקציה מכסה רק את *הפרמטרים* של הפונקציה,
--    ולא משתנים שהוצהרו ב-DECLARE הראשי. לכן tl_time.chart_id, כאשר chart_id הוא
--    משתנה מוצהר, אינו נפתר כמשתנה ו-plpgsql מעביר אותו כפי שהוא ל-parser של SQL,
--    שקורא אותו כהפניה לטבלה "tl_time". שוחזר: fnname.PARAMETER -> תקין,
--    fnname.DECLARED_VAR -> missing FROM-clause entry.
--    הכתיב הזה נבחר במקור כי plpgsql.variable_conflict = error במסד הזה, כך ש-chart_id
--    לא מוסמך היה מתנגש עם העמודה gantt_tasks.chart_id. התיקון החסין הוא לשנות את שם
--    המשתנה ל-v_chart_id, שאינו יכול להתנגש עם אף עמודה, ולוותר על ההסמכה לגמרי.
--    chart_id הוא המשתנה המקומי היחיד ב-tl_time שמצל על עמודה של טבלה שהיא שואלת.
--
-- 2. malformed array literal: "red"
--    colors := colors || 'red' — colors הוא text[] ו-'red' הוא ליטרל מטיפוס unknown,
--    כך ש-Postgres בוחר את anyarray || anyarray ולא את anyarray || anyelement,
--    ומנסה לפרסר את 'red' כליטרל של מערך. שוחזר: c := c || 'red' נכשל,
--    c := c || 'red'::text תקין. התיקון: הסמכת טיפוס מפורשת ::text על כל ששת
--    הליטרלים בבלוק ברמת הפרויקט. שאר ההשרשורים ל-colors (ב-tl_time וגם ב-tl_crew)
--    כבר משתמשים במשתנה text מוטיפס ולכן היו תקינים; tl_supply/tl_issues בונים את
--    colors דרך array_agg ואינם מושפעים.
--
-- הסדר בין השניים מסביר את הפילוג שנצפה: 4 פרויקטים עם גאנט פעיל מגיעים קודם להפניה
-- המוסמכת ונופלים על שגיאה 1; 12 פרויקטים ללא גאנט פעיל מדלגים על הבלוק ההוא ונופלים
-- על שגיאה 2.

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
    select gt.start_ts::date, gt.finish_ts::date, gt.base_start_ts::date, gt.base_finish_ts::date, gt.pct
      into g_start, g_finish, g_base_start, g_base_finish, g_pct
      from gantt_tasks gt
     where gt.chart_id = v_chart_id and gt.is_summary and tl_norm(gt.name) = tl_norm(t.name_he)
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
