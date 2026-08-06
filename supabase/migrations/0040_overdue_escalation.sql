-- Overdue-defect escalation. A defect the assignee has ignored for 3+ days
-- past its due date is exactly what a manager needs pushed at them; today only
-- the assignee is reminded, forever. Regenerated from the 0039 body verbatim
-- with one appended insert — existing branches untouched.

create or replace function notify_due_dates_impl() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- defects: due within 2 days or overdue, open, with a known assignee user
  insert into notifications (recipient_email, title, body, link)
  select d.assignee_email,
         case when d.due_date < current_date
              then 'ליקוי באיחור: ' || coalesce(d.description, 'ליקוי #' || d.seq)
              else 'תאריך יעד מתקרב לליקוי: ' || coalesce(d.description, 'ליקוי #' || d.seq) end,
         'לול ' || c.name || ' · יעד ' || to_char(d.due_date, 'DD/MM/YYYY'),
         '/defects/coop/' || d.coop_id
  from coop_defects d
  join coops c on c.id = d.coop_id
  where d.status = 'open' and d.assignee_email is not null
    and exists (select 1 from allowed_emails ae
                where lower(ae.email) = lower(d.assignee_email) and ae.active)
    and d.due_date is not null
    and d.due_date <= current_date + 2
    and not exists (
      select 1 from notifications n
      where n.recipient_email = d.assignee_email
        and n.link = '/defects/coop/' || d.coop_id
        and n.created_at > now() - interval '20 hours'
        and n.title like '%ליקוי%'
    );

  -- work tasks: due within 2 days or overdue
  insert into notifications (recipient_email, title, body, link)
  select t.assignee_email,
         case when t.due_date < current_date
              then 'משימה באיחור: ' || t.title
              else 'תאריך יעד מתקרב למשימה: ' || t.title end,
         'יעד ' || to_char(t.due_date, 'DD/MM/YYYY'),
         '/tasks'
  from work_tasks t
  where t.status = 'open' and t.assignee_email is not null
    and exists (select 1 from allowed_emails ae
                where lower(ae.email) = lower(t.assignee_email) and ae.active)
    and t.due_date is not null
    and t.due_date <= current_date + 2
    and not exists (
      select 1 from notifications n
      where n.recipient_email = t.assignee_email
        and n.link = '/tasks'
        and n.created_at > now() - interval '20 hours'
        and n.title like '%משימה%'
    );

  -- escalation: a defect open more than 3 days past its due date stops being
  -- the assignee's private problem — every active admin is notified, once per
  -- 20h window per defect
  insert into notifications (recipient_email, title, body, link)
  select ae.email,
         'ליקוי באיחור של יותר מ-3 ימים — נדרשת התערבות',
         'לול ' || c.name || ' · ' || coalesce(d.description, 'ליקוי #' || d.seq)
           || ' · אחראי: ' || coalesce(d.assignee, d.assignee_email, '—')
           || ' · יעד ' || to_char(d.due_date, 'DD/MM/YYYY'),
         '/defects/coop/' || d.coop_id
  from coop_defects d
  join coops c on c.id = d.coop_id
  cross join allowed_emails ae
  where d.status = 'open'
    and d.due_date is not null
    and d.due_date < current_date - 3
    and ae.role = 'admin' and ae.active
    and not exists (
      select 1 from notifications n
      where n.recipient_email = ae.email
        and n.link = '/defects/coop/' || d.coop_id
        and n.title like '%התערבות%'
        and n.created_at > now() - interval '20 hours'
    );
end; $$;
