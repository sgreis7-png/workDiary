-- ימי עבודה פר-פרויקט, והתראות מתוזמנות שיוצאות רק בהם.
--
-- שישי-שבת אינם ימי עבודה — התראת "לא מולאה רשומה" ביום שישי מתריעה על רשומה
-- שאיש לא היה אמור למלא. אבל פרויקט בחו"ל עובד בסוף שבוע אחר, ולכן הימים הם
-- עמודה על הפרויקט ולא קבוע גלובלי. ברירת המחדל: ראשון-חמישי.
--
-- כל פונקציות ההתראה המתוזמנות (רשומה חסרה, חריגות לו"ז, תזכורות, אישורי שער)
-- נבדקות מול ימי העבודה של הפרויקט הרלוונטי. התראה שנחסמה ביום מנוחה אינה
-- אובדת אלא נדחית: מנגנוני ה"פעם אחת" (overdue_notices, gate_approval_notices,
-- alert_rule_fired) נכתבים רק כששולחים בפועל.

alter table projects add column if not exists
  work_days int[] not null default '{0,1,2,3,4}';  -- postgres dow: 0=ראשון

comment on column projects.work_days is
  'Days of week (0=Sunday .. 6=Saturday) on which this project works. Scheduled alerts fire only on these days.';

-- Is *today* (Asia/Jerusalem) a work day for this project? Null project (an
-- all-projects reminder rule) falls back to the Sunday-Thursday default.
create or replace function is_work_day(p_project uuid)
returns boolean
language sql stable set search_path = public as $$
  select extract(dow from now() at time zone 'Asia/Jerusalem')::int = any (
    coalesce((select work_days from projects where id = p_project), '{0,1,2,3,4}'::int[]))
$$;
revoke all on function is_work_day(uuid) from public;
revoke execute on function is_work_day(uuid) from anon, authenticated;

-- ---------- missing-entry alerts (body from 0060 + the work-day gate) ----------

create or replace function check_alert_rules_impl() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  for r in
    select ar.* from alert_rules ar
    where ar.kind = 'missing' and ar.active
      and ar.alert_hour = extract(hour from now() at time zone 'Asia/Jerusalem')::int
      and (ar.last_fired_at is null or ar.last_fired_at < now() - interval '50 minutes')
      and exists (select 1 from allowed_emails ae
                  where lower(ae.email) = lower(ar.email) and ae.active)
      and (
        (ar.frequency in ('daily', 'once'))
        or (ar.frequency = 'weekly'  and coalesce(ar.weekday, 0) = extract(dow from now() at time zone 'Asia/Jerusalem')::int)
        or (ar.frequency = 'monthly' and coalesce(ar.month_day, 1) = extract(day from now() at time zone 'Asia/Jerusalem')::int)
      )
  loop
    insert into notifications (recipient_email, title, body, link)
    select r.email,
           'לא מולאה רשומת יומן עבודה — ' || p.name,
           case r.frequency
             when 'once'    then 'לא נמצאה רשומה להיום עד ' || r.alert_hour || ':00 — התראה חד־פעמית'
             when 'daily'   then 'לא נמצאה רשומה להיום עד ' || r.alert_hour || ':00'
             when 'weekly'  then 'לא נמצאה רשומה בשבוע האחרון'
             else                'לא נמצאה רשומה החודש'
           end,
           '/new'
    from projects p
    where p.active
      and is_work_day(p.id)   -- no entry is expected on a rest day, so no alarm about one
      and (r.project_id is null or p.id = r.project_id)
      and not exists (
        select 1 from entries e
        where e.project_id = p.id
          and case r.frequency
            when 'daily'   then e.work_date = today
            when 'once'    then e.work_date = today
            when 'weekly'  then e.work_date >= today - 6
            else                date_trunc('month', e.work_date) = date_trunc('month', today)
          end
      )
      and (r.frequency <> 'once' or not exists (
        select 1 from alert_rule_fired f
        where f.rule_id = r.id and f.project_id = p.id
          and f.fired_on > coalesce(
            (select max(e2.work_date) from entries e2 where e2.project_id = p.id),
            date '1900-01-01')
      ));

    if r.frequency = 'once' then
      insert into alert_rule_fired (rule_id, project_id, fired_on)
      select r.id, p.id, today
      from projects p
      where p.active
        and is_work_day(p.id)   -- a gated day must not mark the streak as announced
        and (r.project_id is null or p.id = r.project_id)
        and not exists (
          select 1 from entries e where e.project_id = p.id and e.work_date = today)
        and not exists (
          select 1 from alert_rule_fired f
          where f.rule_id = r.id and f.project_id = p.id
            and f.fired_on > coalesce(
              (select max(e2.work_date) from entries e2 where e2.project_id = p.id),
              date '1900-01-01'))
      on conflict (rule_id, project_id) do update set fired_on = excluded.fired_on;
    end if;

    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
end; $$;

-- ---------- schedule overrun alerts (body from 0057 + the work-day gate) ----------

create or replace function gantt_overrun_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  t record;
  n int := 0;
begin
  for t in
    select tk.id, tk.name, tk.finish_ts, tk.pct, c.project_id, p.name as project_name
    from gantt_tasks tk
    join gantt_charts c on c.id = tk.chart_id and c.active
    join projects p on p.id = c.project_id
    where not tk.is_summary
      and tk.finish_ts is not null
      and tk.finish_ts < (now() at time zone 'Asia/Jerusalem')
      and coalesce(tk.pct, 0) < 100
      -- late on a rest day stays late; the notice waits for the next work day
      and is_work_day(c.project_id)
  loop
    with audience as (
      select pne.email
      from project_notify_emails(t.project_id) pne
      where pne.is_manager
      union
      select lower(ar.email)
      from alert_rules ar
      join allowed_emails ae on lower(ae.email) = lower(ar.email) and ae.active
      where ar.kind = 'overdue'
        and ar.active
        and (ar.project_id is null or ar.project_id = t.project_id)
        and (
          not exists (select 1 from alert_rule_tasks art where art.rule_id = ar.id)
          or exists (select 1 from alert_rule_tasks art
                      where art.rule_id = ar.id and art.task_id = t.id)
        )
    ), fresh as (
      select a.email from audience a
      where not exists (
        select 1 from overdue_notices o where o.task_id = t.id and o.email = a.email)
    ), sent as (
      insert into notifications (recipient_email, title, body, link)
      select f.email,
             'איחור בלוח הזמנים — ' || t.project_name,
             t.name || ' · תאריך סיום ' || to_char(t.finish_ts, 'DD/MM/YYYY')
               || ' · ' || coalesce(t.pct, 0)::text || '% הושלמו',
             '/gantt?project=' || t.project_id
      from fresh f
      returning recipient_email
    )
    insert into overdue_notices (task_id, email)
    select t.id, s.recipient_email from sent s
    on conflict do nothing;

    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function gantt_overrun_notify() from public;
revoke execute on function gantt_overrun_notify() from anon, authenticated;

-- ---------- repeating overdue reminders (body from 0058 + the work-day gate) ----------

create or replace function gantt_overdue_reminder()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  late_count int;
  n int := 0;
begin
  for r in
    select ar.*
    from alert_rules ar
    where ar.kind = 'overdue'
      and ar.active
      and ar.frequency <> 'once'
      and ar.alert_hour = extract(hour from now() at time zone 'Asia/Jerusalem')::int
      and (ar.last_fired_at is null or ar.last_fired_at < now() - interval '50 minutes')
      and (
        ar.frequency = 'daily'
        or (ar.frequency = 'weekly'
            and coalesce(ar.weekday, 0) = extract(dow from now() at time zone 'Asia/Jerusalem')::int)
        or (ar.frequency = 'monthly'
            and coalesce(ar.month_day, 1) = extract(day from now() at time zone 'Asia/Jerusalem')::int)
      )
      and exists (select 1 from allowed_emails ae
                   where lower(ae.email) = lower(ar.email) and ae.active)
  loop
    -- project rule: that project's work days; all-projects rule: the default week
    continue when not is_work_day(r.project_id);

    select count(*) into late_count
    from gantt_tasks tk
    join gantt_charts c on c.id = tk.chart_id and c.active
    where (r.project_id is null or c.project_id = r.project_id)
      and not tk.is_summary
      and tk.finish_ts is not null
      and tk.finish_ts < (now() at time zone 'Asia/Jerusalem')
      and coalesce(tk.pct, 0) < 100
      and (
        not exists (select 1 from alert_rule_tasks art where art.rule_id = r.id)
        or exists (select 1 from alert_rule_tasks art
                    where art.rule_id = r.id and art.task_id = tk.id)
      );

    if late_count > 0 then
      insert into notifications (recipient_email, title, body, link)
      values (
        lower(r.email),
        'תזכורת · ' || late_count::text || ' משימות באיחור',
        coalesce((select p.name from projects p where p.id = r.project_id), 'כל הפרויקטים')
          || ' · ' || case r.frequency
                        when 'daily' then 'תזכורת יומית'
                        when 'weekly' then 'תזכורת שבועית'
                        else 'תזכורת חודשית' end,
        case when r.project_id is null then '/gantt'
             else '/gantt?project=' || r.project_id end
      );
      n := n + 1;
    end if;

    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke all on function gantt_overdue_reminder() from public;
revoke execute on function gantt_overdue_reminder() from anon, authenticated;

-- ---------- gate approval reminders (body from 0056 + the work-day gate) ----------

create or replace function gate_approval_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select co.id as coop_id, co.name as coop_name, co.project_id,
           p.name as project_name, g.gate,
           (select count(*) from expected_gate_items(g.gate)) as expected,
           (select count(*) from coop_checklist_items ci
             where ci.coop_id = co.id and ci.gate = g.gate
               and ci.status in ('done', 'na')
               and ci.item_no in (select expected_gate_items(g.gate))) as answered,
           (select count(*) from coop_signatures s
             where s.coop_id = co.id and s.gate = g.gate) as signatures
    from coops co
    join projects p on p.id = co.project_id
    cross join (select distinct gate from gate_items) g
  loop
    continue when not is_work_day(r.project_id);
    continue when r.expected = 0 or r.answered < r.expected;
    continue when r.signatures >= 2;
    continue when exists (
      select 1 from gate_approval_notices ga
      where ga.coop_id = r.coop_id and ga.gate = r.gate);

    insert into notifications (recipient_email, title, body, link)
    select pne.email,
           'ממתין לאישור — ' || r.project_name,
           'לול ' || r.coop_name || ' · ' || gate_label(r.gate)
             || ' · הושלם וממתין לחתימות (' || r.signatures::text || ' מתוך 2)',
           '/defects/coop/' || r.coop_id || '?gate=' || r.gate
    from project_notify_emails(r.project_id) pne
    where pne.is_manager;

    insert into gate_approval_notices (coop_id, gate) values (r.coop_id, r.gate)
      on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gate_approval_notify() from public;
revoke execute on function gate_approval_notify() from anon, authenticated;
