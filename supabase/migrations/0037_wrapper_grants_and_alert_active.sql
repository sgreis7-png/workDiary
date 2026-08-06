-- Two loose ends from 0036.
--
-- 1. The guard wrappers were created fresh (the rename freed the name), so they
--    picked up the default PUBLIC EXECUTE grant. Probing live with the anon key
--    returned 204, i.e. anon reaches them. The in-body service-role guard makes
--    that a no-op, but the grant should not be there — and note the lesson from
--    0035 in reverse: here the grant really is PUBLIC, so PUBLIC must be named.
revoke all on function notify_due_dates() from public, anon, authenticated;
revoke all on function check_alert_rules() from public, anon, authenticated;
grant execute on function notify_due_dates() to service_role, postgres;
grant execute on function check_alert_rules() to service_role, postgres;

-- 2. check_alert_rules_impl fans out to alert_rules.email with no membership
--    check, and it is SECURITY DEFINER so RLS never sees it. A worker who left
--    with an active rule kept receiving notifications indefinitely. Filter the
--    recipients to active members, matching the app-side notify.ts invariant.

create or replace function check_alert_rules_impl() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
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
        (ar.frequency = 'daily')
        or (ar.frequency = 'weekly'  and coalesce(ar.weekday, 0) = extract(dow from now() at time zone 'Asia/Jerusalem')::int)
        or (ar.frequency = 'monthly' and coalesce(ar.month_day, 1) = extract(day from now() at time zone 'Asia/Jerusalem')::int)
      )
  loop
    insert into notifications (recipient_email, title, body, link)
    select r.email,
           'לא מולאה רשומת יומן עבודה — ' || p.name,
           case r.frequency
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
            when 'daily'   then e.work_date = (now() at time zone 'Asia/Jerusalem')::date
            when 'weekly'  then e.work_date >= (now() at time zone 'Asia/Jerusalem')::date - 6
            else                date_trunc('month', e.work_date) = date_trunc('month', (now() at time zone 'Asia/Jerusalem')::date)
          end
      );
    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
end; $$;
