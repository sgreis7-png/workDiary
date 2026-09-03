-- דוח רמזור — תיקוני RLS מבדיקת הרשאות של הענף. סוגר תשעה ממצאים:
--   1. entries_arrivals(): מגדר את הפיכת האספקה ל-on_site רק למי שמורשה
--      (deliveries/traffic_light) או משויך לפרויקט ב-project_assignments.
--   2. read_issues: קריאה מותנית ב-can_view('traffic_light') / can_edit('deliveries') /
--      המדווח על הבלת"מ שלו, במקום is_member() גורף.
--   3. insert_issues: with check אמיתי — הדוור חייב להיות היוצר, הפריט פתוח, ולא systemic.
--   4. update_issues: המדווח לא יכול לסגור את הבלת"מ שלו עצמו (with check).
--   5. entries_to_issue(): כשהמחלקה חוזרת ל"אין", סוגר את הפריט האוטומטי במקום למחוק אותו.
--   6. work_tasks_guard_source(): נועל גם closed_by/created_by/done_at, ואת project_id
--      כשהמקור traffic_light.
--   7. insert_work_tasks: חבר לא יכול להטביע source = 'traffic_light' על משימה חדשה.
--   8. מסיר את המדיניות הכפולה read_project_deliveries (הוחלפה כבר ב-0066).
--   9. תברואה: issues_assign_seq() מקבל search_path קבוע; tl_owner_kind נשלל מ-public.
--
-- 0064-0066 נשארים ללא שינוי: הם כבר הוחלו על מסד הנתונים המתארח, ומיגרציה שהוחלה
-- אסור לערוך לעולם — כל תיקון כאן מחליף אובייקטים קיימים (create or replace function,
-- drop+create policy, drop policy by name) ולא נוגע בקובצי 0064/0065/0066 עצמם.

-- ---------- ruling: project_contractors / project_deliveries reads stay is_member() ----------
-- הביקורת שאלה גם על שתי הטבלאות האלה. הפסיקה: להשאיר. טופס היומן היומי צריך אותן בפועל —
-- טבלת הצוות מציעה את קבלני הפרויקט, ובורר "הגיע לאתר" מציג את האספקות הממתינות שלו — כך
-- שצמצום הקריאה כאן ישבור את הטופס היומי בדיוק לאנשי השטח שלמענם הוא נבנה. אין שינוי כאן
-- ל-read_project_contractors או ל-select_project_deliveries/read_project_deliveries (מעבר
-- לסעיף 8, שמסיר כפילות מדיניות בלבד ואינו מצמצם דבר).

-- ---------- 1. entries_arrivals: guard the delivery-status flip ----------
-- לפני התיקון: כל חבר שיכול לשמור יומן יכול היה למנות מזהי אספקה שרירותיים ב-arrived_items,
-- והטריגר definer הפך אותם ל-on_site ללא שום בדיקת הרשאה — עקיפה של המדיניות שמייעדת את
-- הכתיבה הזו למחזיקי deliveries/traffic_light.
create or replace function entries_arrivals() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  allowed boolean;
begin
  allowed := can_edit('deliveries') or can_edit('traffic_light') or exists (
    select 1 from project_assignments pa
    where pa.project_id = new.project_id
      and lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
  if not allowed then return new; end if;
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

-- ---------- 2. read_issues: gate by the traffic-light/deliveries permission, not membership ----------
-- לפני התיקון: הטבלה כולה נקראה ע"י is_member(), כך שמשתמש בלי הרשאת traffic_light יכול
-- היה לקרוא את כל המרשם דרך PostgREST ישירות, בעוד מסך האזור חסום לו.
drop policy if exists read_issues on issues;
create policy read_issues on issues for select
  using (can_view('traffic_light') or can_edit('deliveries') or (is_member() and created_by = auth.uid()));

-- ---------- 3. insert_issues: a real with check ----------
-- לפני התיקון: with check (is_member()) לא הגביל דבר — חבר יכול היה לפתוח בלת"מ מזויף על
-- כל פרויקט. systemic היא שיקול דעת PMO על תבנית חוצת-פרויקטים, ואסור שידווח לעצמו.
drop policy if exists insert_issues on issues;
create policy insert_issues on issues for insert
  with check (is_member() and created_by = auth.uid() and closed_on is null and not systemic);

-- ---------- 4. update_issues: the author cannot close their own item ----------
-- לפני התיקון: ה-using דרש closed_on is null אבל ה-with check לא, כך שהמדווח יכול היה
-- לסגור את הפריט שלו בעצמו ולהוציא אותו מהדוח. ענפי ה-PMO נשארים יכולים לסגור.
drop policy if exists update_issues on issues;
create policy update_issues on issues for update
  using (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid() and closed_on is null))
  with check (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid() and closed_on is null));

-- ---------- 5. entries_to_issue: close the untouched auto-item instead of deleting it ----------
-- לפני התיקון: כשהמחלקה חזרה ל"אין" הפונקציה מחקה שורה שהמתקשר לא היה רשאי למחוק ישירות
-- (delete_issues דורש PMO). שאר הפונקציה זהה בייט לבייט ל-0064.
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
        blocking    = excluded.blocking;
  return new;
exception when others then
  raise warning 'entries_to_issue: %', sqlerrm;
  return new;
end $$;

-- ---------- 6. work_tasks_guard_source: pin provenance and attribution columns ----------
-- לפני התיקון: הסגירה הייתה חתומה, אבל חבר עדיין יכול היה להעביר משימת רמזור לפרויקט
-- אחר או לבטל את השיוך (המשימה נעלמת מהלוח והג'וב השבועי בונה אותה מחדש), ולהטביע
-- closed_by/created_by/done_at חופשי — לייחס סגירה לעמית.
create or replace function work_tasks_guard_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or can_edit('traffic_light') then return new; end if;
  new.source := old.source;
  new.axis   := old.axis;
  new.closed_by  := old.closed_by;
  new.created_by := old.created_by;
  new.done_at    := old.done_at;
  if old.source = 'traffic_light' then
    new.project_id := old.project_id;
  end if;
  if old.source = 'traffic_light' and new.status = 'done' and old.status <> 'done' then
    raise exception 'רק PMO רשאי לסגור משימת רמזור' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- 7. insert_work_tasks: a member cannot mint a traffic-light-sourced task ----------
drop policy if exists insert_work_tasks on work_tasks;
create policy insert_work_tasks on work_tasks for insert
  with check (is_member() and (coalesce(source, 'manual') = 'manual' or is_admin() or can_edit('traffic_light')));

-- ---------- 8. project_deliveries: drop the superseded 0064 SELECT policy ----------
-- 0066 יצרה select_project_deliveries בלי להסיר את read_project_deliveries מ-0064.
-- הפרדיקטים זהים היום כך שהאיחוד לא מזיק, אך צמצום עתידי של אחת מהן היה בוטל בשקט
-- ע"י השנייה. read_project_deliveries נשארת נמחקת; select_project_deliveries (0066) שולטת.
drop policy if exists read_project_deliveries on project_deliveries;

-- ---------- 9. hygiene ----------
create or replace function issues_assign_seq() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.project_id::text));
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq from issues where project_id = new.project_id;
  end if;
  return new;
end $$;

revoke all on function tl_owner_kind(text) from public;
