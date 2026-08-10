-- A late task alerts once, in real time. Repeating it is opt-in.
--
-- The immediate alert stays as it is: the hour a task passes its finish date, everyone answerable
-- hears once and never again for that task. That is the right default — a task being late is a fact
-- you learn once, and hearing it hourly is how people learn to ignore the bell.
--
-- On top of that, someone who wants chasing can ask for a reminder: daily, weekly or monthly. It is
-- a single summary — "9 tasks are late in כפר יובל" — not one message per task, because a repeat
-- per task is exactly the nag the once-only default exists to prevent.
--
-- 'once' becomes a frequency so the intent is stored rather than inferred from a null.

alter table alert_rules drop constraint if exists alert_rules_frequency_check;
alter table alert_rules
  add constraint alert_rules_frequency_check
  check (frequency in ('once', 'daily', 'weekly', 'monthly'));

create or replace function gantt_overdue_reminder()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  late_count int;
  n int := 0;
begin
  for r in
    -- Same cadence test as check_alert_rules: the right hour, the right day, and not already fired
    -- inside this window. The 50-minute guard is what stops an hourly job double-firing when a run
    -- straddles the hour.
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

    -- Nothing late is not news. Silence here is the reminder working.
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

    -- Stamped whether or not anything was sent, so an empty week does not make the next run think
    -- it still owes a message from this one.
    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke all on function gantt_overdue_reminder() from public;
revoke execute on function gantt_overdue_reminder() from anon, authenticated;

comment on function gantt_overdue_reminder() is
  'Hourly. One summary per repeating overdue rule whose hour and day match. The real-time alert is gantt_overrun_notify(); this is the opt-in repeat on top of it.';

select cron.unschedule('gantt-overdue-reminder') where exists (
  select 1 from cron.job where jobname = 'gantt-overdue-reminder');
select cron.schedule('gantt-overdue-reminder', '20 * * * *', $$select gantt_overdue_reminder()$$);
