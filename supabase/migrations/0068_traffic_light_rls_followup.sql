-- מעקב אחרי תיקוני ה-RLS של 0067. סוגר שני תיקונים בינוניים ושני תיקונים קלים:
--   1. work_tasks_guard_source(): closed_by/created_by/done_at ננעלים רק כשהמקור traffic_light,
--      לא על כל שורה — נעילה גורפת שברה סימון "בוצע" למשימה ידנית רגילה.
--   2. entries_to_issue(): ה-on conflict לא פתח מחדש בלת"מ שהטריגר הזה עצמו סגר — סתירה שחזרה
--      למחלקה אמיתית לא נראתה במרשם לעולם.
--   3. tl_owner_kind(text): revoke ...from public לא חוסם — anon/authenticated נשארים מורשים
--      כברירת מחדל של Supabase; שולל מהם בשמם.
--   4. TrafficProject.tsx: כפתור "משימה" מוסתר ממי שאין לו can_edit('traffic_light').

-- ---------- 1. work_tasks_guard_source: pin provenance columns only for traffic_light rows ----------
-- לפני התיקון: closed_by/created_by/done_at ננעלו לערך הישן על כל שורה, כולל משימות source =
-- 'manual'. מסך המשימות שולח {status, done_at, closed_by} כשמישהו מסמן משימה ידנית שלו כבוצעה —
-- ה-status נכנס אבל done_at/closed_by חוזרים ל-null בשקט, וגם פתיחה מחדש לא יכולה לנקות done_at ישן.
create or replace function work_tasks_guard_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or can_edit('traffic_light') then return new; end if;
  new.source := old.source;
  new.axis   := old.axis;
  if old.source = 'traffic_light' then
    new.project_id := old.project_id;
    new.closed_by  := old.closed_by;
    new.created_by := old.created_by;
    new.done_at    := old.done_at;
  end if;
  if old.source = 'traffic_light' and new.status = 'done' and old.status <> 'done' then
    raise exception 'רק PMO רשאי לסגור משימת רמזור' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- 2. entries_to_issue: re-open an issue this same trigger closed ----------
-- לפני התיקון: תיקון 0067 סגר את הפריט האוטומטי כשהמחלקה חזרה ל"אין", אבל ענף ה-on conflict
-- לא ניקה closed_on/closure_note — אז תיקון חוזר לאותה שורה (מחלקה אמיתית → אין → מחלקה אמיתית
-- שוב) משאיר את הבלת"מ סגור לנצח, בעוד הבעיה חיה ביומן ולא נראית במרשם הפתוח.
-- מחרוזת הסימון חייבת להישאר זהה בשני המקומות בפונקציה.
create or replace function entries_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text := tl_owner_kind(new.values ->> 'malfunction_dept');
  blocking boolean := lower(trim(coalesce(new.values ->> 'issue_blocking', ''))) in ('כן', 'yes', 'true');
begin
  if kind is null then
    -- dept went back to "none": close the auto item unless the PMO already took it over
    update issues set closed_on = current_date, closure_note = 'הבלת"מ בוטל ביומן העבודה'
     where entry_id = new.id and owner_email is null and due_date is null and closed_on is null;
    return new;
  end if;
  insert into issues (project_id, entry_id, opened_on, description, owner_kind, blocking, created_by)
  values (new.project_id, new.id, coalesce(new.work_date, current_date),
          coalesce(new.values ->> 'malfunction', ''), kind, blocking, new.created_by)
  on conflict (entry_id) do update
    set description = excluded.description,
        owner_kind  = case when issues.owner_email is null then excluded.owner_kind else issues.owner_kind end,
        blocking    = excluded.blocking,
        -- the dept came back from "none": reopen only if this trigger is the one that closed
        -- it (the marker matches exactly); a PMO closure carries a different closure_note and
        -- must stay closed.
        closed_on    = case when issues.closure_note = 'הבלת"מ בוטל ביומן העבודה' then null else issues.closed_on end,
        closure_note = case when issues.closure_note = 'הבלת"מ בוטל ביומן העבודה' then null else issues.closure_note end;
  return new;
exception when others then
  raise warning 'entries_to_issue: %', sqlerrm;
  return new;
end $$;

-- ---------- 3. tl_owner_kind: revoke from the named client roles, not just public ----------
-- "revoke all ... from public" (0067) לא חוסם: Supabase מעניק EXECUTE ל-anon ול-authenticated
-- כתפקידים בשמם, לא דרך public — התבנית המתועדת בראש src/lib/function.grants.test.ts. הפונקציה
-- היא מיפוי תוויות טהור בלי גישה לנתונים, אבל אין סיבה שתהיה קריאה ישירות מהדפדפן.
revoke execute on function tl_owner_kind(text) from anon, authenticated;
