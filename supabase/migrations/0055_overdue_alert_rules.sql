-- Schedule-overrun alerts move from a checkbox per task to a rule per person.
--
-- The first design put a tick box on every task in the editor. That does not survive contact with
-- a real schedule: an imported Microsoft Project file is a hundred rows, and asking someone to
-- tick the ones that matter — one at a time, inside the task editor — is work nobody will do. It
-- also put the setting in the wrong place: alerts are configured under "alert rules", and this is
-- an alert rule.
--
-- So: a rule names a project (or all projects) and either watches every task in it or a chosen
-- few. The rule belongs to whoever created it and notifies them, exactly like the existing
-- 'missing' rules — which is what makes it right for a manager who wants one project watched
-- closely and nothing else.

alter table alert_rules drop constraint if exists alert_rules_kind_check;
alter table alert_rules
  add constraint alert_rules_kind_check check (kind in ('missing', 'filled', 'overdue'));

create table if not exists alert_rule_tasks (
  rule_id uuid not null references alert_rules(id) on delete cascade,
  task_id uuid not null references gantt_tasks(id) on delete cascade,
  primary key (rule_id, task_id)
);
alter table alert_rule_tasks enable row level security;

drop policy if exists own_alert_rule_tasks on alert_rule_tasks;
create policy own_alert_rule_tasks on alert_rule_tasks for all
  using (exists (
    select 1 from alert_rules ar
    where ar.id = rule_id and lower(ar.email) = lower(auth.jwt() ->> 'email')))
  with check (exists (
    select 1 from alert_rules ar
    where ar.id = rule_id and lower(ar.email) = lower(auth.jwt() ->> 'email')));

comment on table alert_rule_tasks is
  'Tasks a specific overdue rule watches. Empty means every task in the rule''s project.';

create table if not exists overdue_notices (
  rule_id uuid not null references alert_rules(id) on delete cascade,
  task_id uuid not null references gantt_tasks(id) on delete cascade,
  noticed_at timestamptz not null default now(),
  primary key (rule_id, task_id)
);
alter table overdue_notices enable row level security;
-- No policy: only the definer function below touches it.

create or replace function gantt_overrun_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    -- One row per (rule, overdue task). A task counts as late once its finish day is behind us in
    -- local time — the schedule stores wall-clock dates, so comparing instants would fire a day
    -- early or late depending on the season.
    select ar.id as rule_id, ar.email, t.id as task_id, t.name, t.finish_ts, t.pct,
           c.project_id, p.name as project_name
    from alert_rules ar
    join gantt_charts c
      on c.active and (ar.project_id is null or c.project_id = ar.project_id)
    join projects p on p.id = c.project_id
    join gantt_tasks t on t.chart_id = c.id
    where ar.kind = 'overdue'
      and ar.active
      and not t.is_summary                -- a summary's dates are rolled up from its children
      and t.finish_ts is not null
      and t.finish_ts < (now() at time zone 'Asia/Jerusalem')
      and coalesce(t.pct, 0) < 100
      and (
        not exists (select 1 from alert_rule_tasks art where art.rule_id = ar.id)
        or exists (select 1 from alert_rule_tasks art where art.rule_id = ar.id and art.task_id = t.id)
      )
      and not exists (
        select 1 from overdue_notices o where o.rule_id = ar.id and o.task_id = t.id)
  loop
    insert into notifications (recipient_email, title, body, link)
    select r.email,
           'איחור בלוח הזמנים — ' || r.project_name,
           r.name || ' · תאריך סיום ' || to_char(r.finish_ts, 'DD/MM/YYYY')
             || ' · ' || coalesce(r.pct, 0)::text || '% הושלמו',
           '/gantt?project=' || r.project_id
    where exists (
      -- the rule owner must still be an active member, or a deactivated account keeps being
      -- written to and the notifications policy rejects the insert
      select 1 from allowed_emails ae
      where lower(ae.email) = lower(r.email) and ae.active);

    insert into overdue_notices (rule_id, task_id) values (r.rule_id, r.task_id)
      on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gantt_overrun_notify() from public;
revoke execute on function gantt_overrun_notify() from anon, authenticated;

comment on column gantt_tasks.alert_on_overrun is
  'Unused since 0055: overrun alerts are configured as alert rules, not per task.';
