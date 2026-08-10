-- Who hears about a project, schedule overruns, and gates waiting for a signature.
--
-- The recipient rule now lives in one function instead of being assembled in the client. Three
-- groups, and nobody else: admins, company managers, and the people assigned to that project —
-- workers and its project managers alike. A member with no connection to a project gets nothing
-- about it, which is what was asked for and what the client already did; putting it here means a
-- future caller cannot get it wrong.

create or replace function project_notify_emails(p_project uuid, p_exclude text default null)
returns table (email text, is_manager boolean)
language sql stable security definer set search_path = public as $$
  with people as (
    -- everyone answerable company-wide
    select lower(ae.email) as email, true as is_manager
    from allowed_emails ae
    where ae.active and ae.registered and ae.role in ('admin', 'manager')
    union
    -- everyone attached to this project, flagged if they run it
    select lower(pa.email), bool_or(pa.is_manager)
    from project_assignments pa
    join allowed_emails ae on lower(ae.email) = lower(pa.email)
    where pa.project_id = p_project and ae.active and ae.registered
    group by lower(pa.email)
  )
  select email, bool_or(is_manager) as is_manager
  from people
  where p_exclude is null or email <> lower(p_exclude)
  group by email;
$$;

revoke all on function project_notify_emails(uuid, text) from public;
grant execute on function project_notify_emails(uuid, text) to authenticated;

-- ---------- staff assignment carries the manager flag ----------
--
-- Replaces the two-argument version from 0046. Still one transaction, still admin-only.
drop function if exists set_project_staff(uuid, text[]);

create or replace function set_project_staff(
  p_project uuid, p_emails text[], p_managers text[] default '{}'
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from project_assignments where project_id = p_project;

  if p_emails is not null and array_length(p_emails, 1) > 0 then
    insert into project_assignments (project_id, email, is_manager)
    select p_project, lower(btrim(e)),
           lower(btrim(e)) = any (select lower(btrim(m)) from unnest(coalesce(p_managers, '{}')) m)
    from unnest(p_emails) e
    where btrim(e) <> ''
    on conflict (project_id, email) do update set is_manager = excluded.is_manager;
  end if;
end $$;

revoke all on function set_project_staff(uuid, text[], text[]) from public;
grant execute on function set_project_staff(uuid, text[], text[]) to authenticated;

-- ---------- schedule overrun alerts ----------
--
-- Per-task, opt-in, and stored on the task so it travels with the schedule. A task whose finish
-- date has passed while it is not complete raises one notification — once, not hourly, which is
-- what `overdue_notified_at` is for.

alter table gantt_tasks add column if not exists alert_on_overrun boolean not null default false;
alter table gantt_tasks add column if not exists overdue_notified_at timestamptz;

comment on column gantt_tasks.alert_on_overrun is
  'Notify the people answerable for this project when this task passes its finish date unfinished.';

create index if not exists gantt_tasks_overrun
  on gantt_tasks (chart_id) where alert_on_overrun;

create or replace function gantt_overrun_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select t.id, t.name, t.finish_ts, t.pct_complete, c.project_id, p.name as project_name
    from gantt_tasks t
    join gantt_charts c on c.id = t.chart_id
    join projects p on p.id = c.project_id
    where t.alert_on_overrun
      and t.overdue_notified_at is null
      and not t.is_summary
      and t.finish_ts is not null
      -- wall-clock, matching how the schedule stores its dates: a task is late once its finish
      -- day is behind us, not the instant it turns midnight somewhere else
      and t.finish_ts < (now() at time zone 'Asia/Jerusalem')
      and coalesce(t.pct_complete, 0) < 100
  loop
    insert into notifications (recipient_email, title, body, link)
    select pne.email,
           'חריגה בלוח הזמנים — ' || r.project_name,
           r.name || ' · תאריך סיום ' || to_char(r.finish_ts, 'DD/MM/YYYY')
             || ' · ' || coalesce(r.pct_complete, 0)::text || '% הושלמו',
           '/gantt?project=' || r.project_id
    from project_notify_emails(r.project_id) pne;

    update gantt_tasks set overdue_notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gantt_overrun_notify() from public;

-- ---------- gates waiting for approval ----------
--
-- A gate is approved by two signatures, manager and supervisor (coop_signatures, from 0020). A
-- gate whose checklist is finished but whose signatures are missing is work that is done and
-- waiting on a person — exactly the thing worth telling that person about. Once per gate.

create table if not exists gate_approval_notices (
  coop_id uuid not null references coops(id) on delete cascade,
  gate    text not null,
  noticed_at timestamptz not null default now(),
  primary key (coop_id, gate)
);
alter table gate_approval_notices enable row level security;
-- No policy: only the definer function below touches it.

create or replace function gate_approval_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select ci.coop_id, ci.gate, co.name as coop_name, co.project_id, p.name as project_name,
           count(*) filter (where ci.status is null or ci.status = 'pending') as unfinished,
           (select count(*) from coop_signatures s
             where s.coop_id = ci.coop_id and s.gate = ci.gate) as signatures
    from coop_checklist_items ci
    join coops co on co.id = ci.coop_id
    join projects p on p.id = co.project_id
    group by ci.coop_id, ci.gate, co.name, co.project_id, p.name
  loop
    -- every item answered, fewer than the two signatures present, and not already announced
    continue when r.unfinished > 0 or r.signatures >= 2;
    continue when exists (
      select 1 from gate_approval_notices g
      where g.coop_id = r.coop_id and g.gate = r.gate);

    insert into notifications (recipient_email, title, body, link)
    select pne.email,
           'ממתין לאישור — ' || r.project_name,
           'לול ' || r.coop_name || ' · ' || r.gate || ' · הושלם וממתין לחתימות',
           '/defects/coop/' || r.coop_id
    from project_notify_emails(r.project_id) pne
    where pne.is_manager;   -- approval is a manager's act, so only they are asked for it

    insert into gate_approval_notices (coop_id, gate) values (r.coop_id, r.gate)
      on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gate_approval_notify() from public;

-- ---------- schedule ----------
--
-- Hourly, beside check_alert_rules(). Overruns are day-scale, so hourly is soon enough to be
-- useful and rare enough not to become noise.
select cron.unschedule('gantt-overrun') where exists (
  select 1 from cron.job where jobname = 'gantt-overrun');
select cron.schedule('gantt-overrun', '15 * * * *', $$select gantt_overrun_notify()$$);

select cron.unschedule('gate-approval') where exists (
  select 1 from cron.job where jobname = 'gate-approval');
select cron.schedule('gate-approval', '35 * * * *', $$select gate_approval_notify()$$);
