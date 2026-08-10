-- Two wrong column assumptions in 0051, both of which plpgsql only checks when the function
-- runs — so the migration succeeded, the hourly jobs were scheduled, and they would have failed
-- silently every hour with nobody the wiser. Caught by reading the actual table definitions
-- rather than trusting the names, and then by running both functions.
--
--   gantt_tasks has `pct`. There is no `pct_complete`.
--
--   coop_checklist_items.status is 'done' | 'na' | 'not_done'. There is no 'pending', so the test
--   for "items still open" matched nothing and every gate read as finished — the first dry run
--   claimed five gates were awaiting approval when the true answer is three.
--
-- A gate is finished when every item is answered: 'done' or 'na'. 'na' counts, because marking an
-- item not-applicable is a decision, not an omission.

create or replace function gantt_overrun_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select t.id, t.name, t.finish_ts, t.pct, c.project_id, p.name as project_name
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
      and coalesce(t.pct, 0) < 100
  loop
    insert into notifications (recipient_email, title, body, link)
    select pne.email,
           'חריגה בלוח הזמנים — ' || r.project_name,
           r.name || ' · תאריך סיום ' || to_char(r.finish_ts, 'DD/MM/YYYY')
             || ' · ' || coalesce(r.pct, 0)::text || '% הושלמו',
           '/gantt?project=' || r.project_id
    from project_notify_emails(r.project_id) pne;

    update gantt_tasks set overdue_notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gantt_overrun_notify() from public;

create or replace function gate_approval_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select ci.coop_id, ci.gate, co.name as coop_name, co.project_id, p.name as project_name,
           count(*) filter (where ci.status is null or ci.status = 'not_done') as unanswered,
           (select count(*) from coop_signatures s
             where s.coop_id = ci.coop_id and s.gate = ci.gate) as signatures
    from coop_checklist_items ci
    join coops co on co.id = ci.coop_id
    join projects p on p.id = co.project_id
    group by ci.coop_id, ci.gate, co.name, co.project_id, p.name
  loop
    continue when r.unanswered > 0 or r.signatures >= 2;
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
