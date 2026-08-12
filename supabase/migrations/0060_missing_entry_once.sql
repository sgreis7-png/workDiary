-- תדירות "חד פעמי" לכלל של רשומה חסרה: התראה אחת ביום הראשון שבו אין רשומה,
-- ואחר כך שקט — עד שתמולא רשומה חדשה ותיפתח "רצועת החסרה" חדשה.
--
-- המצב נשמר פר (כלל, פרויקט): מתי הותרע לאחרונה. ההתראה נורית רק אם מאז
-- ההתרעה האחרונה נרשמה רשומה (כלומר הרצף הנוכחי הוא רצף חדש).

create table if not exists alert_rule_fired (
  rule_id    uuid not null references alert_rules(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  fired_on   date not null,
  primary key (rule_id, project_id)
);

-- Written only by the definer cron function; clients never touch it.
alter table alert_rule_fired enable row level security;
revoke all on table alert_rule_fired from public, anon, authenticated;

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
      -- only still-active members are notified: a worker who left with an
      -- active rule kept receiving these indefinitely (definer, so RLS never saw it)
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
      -- 'once': only the first unfilled day of a streak. Silent afterwards until an
      -- entry is filed again — a fired_on newer than the project's last entry means
      -- the current streak was already announced.
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
