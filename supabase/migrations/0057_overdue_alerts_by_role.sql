-- Who hears about a late task, settled: it is automatic and it follows the role.
--
--   admin            every project
--   manager          every project
--   project manager  only the projects they manage
--
-- No configuration needed — which is the point, because an alert nobody switched on is an alert
-- nobody gets, and that is what the previous version amounted to.
--
-- project_notify_emails(project) already returns admins, company managers and that project's
-- managers, flagged; filtering on the flag is exactly the rule above, in one place, shared with
-- the gate-approval alert.
--
-- Personal 'overdue' rules stay, for anyone the roles do not already cover — a member who wants
-- one project, or a few named tasks, watched. Nobody is notified twice for the same task: the
-- record is per person per task rather than per rule per task, so the automatic recipients and a
-- rule owner cannot both fire for the same thing.

drop table if exists overdue_notices;
create table overdue_notices (
  task_id uuid not null references gantt_tasks(id) on delete cascade,
  email   text not null,
  noticed_at timestamptz not null default now(),
  primary key (task_id, email)
);
alter table overdue_notices enable row level security;
-- No policy: only the definer function below touches it.

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
    where not tk.is_summary               -- a summary's dates are rolled up from its children
      and tk.finish_ts is not null
      -- wall-clock: the schedule stores dates, so a task is late once its finish day is behind us
      -- in local time, not the instant it turns midnight somewhere else
      and tk.finish_ts < (now() at time zone 'Asia/Jerusalem')
      and coalesce(tk.pct, 0) < 100
  loop
    with audience as (
      -- by role: admins and company managers everywhere, this project's managers here
      select pne.email
      from project_notify_emails(t.project_id) pne
      where pne.is_manager
      union
      -- and anyone who asked for this project, or for this task specifically
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
             -- carries the project, so pressing it opens this schedule and not the first one
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

comment on function gantt_overrun_notify() is
  'Hourly. A late task notifies admins and managers on every project, that project''s managers, and anyone with a matching personal overdue rule. Once per person per task.';
