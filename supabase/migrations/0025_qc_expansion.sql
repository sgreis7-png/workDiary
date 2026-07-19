-- QC expansion: defect photos, optional user assignee, work tasks with due dates,
-- audit log, push subscriptions, and cron-driven due-date notifications.

-- ---------- defect / checklist photos ----------
create table if not exists defect_photos (
  id           uuid primary key default gen_random_uuid(),
  defect_id    uuid not null references coop_defects(id) on delete cascade,
  storage_path text not null,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
create table if not exists coop_item_photos (
  id           uuid primary key default gen_random_uuid(),
  coop_id      uuid not null references coops(id) on delete cascade,
  gate         text not null,
  item_no      int  not null,
  storage_path text not null,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
alter table defect_photos enable row level security;
alter table coop_item_photos enable row level security;
create policy rw_defect_photos on defect_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_item_photos on coop_item_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- optional user assignee on defects ----------
alter table coop_defects add column if not exists assignee_email text;

-- ---------- work tasks (עבודות לביצוע) ----------
create table if not exists work_tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  notes          text,
  project_id     uuid references projects(id) on delete set null,
  assignee_email text,
  due_date       date,
  status         text not null default 'open' check (status in ('open','done')),
  created_by     text not null,
  created_at     timestamptz not null default now(),
  done_at        timestamptz
);
alter table work_tasks enable row level security;
create policy rw_work_tasks on work_tasks for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- audit log ----------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_time on audit_log (created_at desc);
alter table audit_log enable row level security;
create policy insert_audit on audit_log for insert
  with check (lower(actor_email) = lower(auth.jwt() ->> 'email'));
create policy read_audit_admin on audit_log for select using (is_admin());

-- ---------- web push subscriptions ----------
create table if not exists push_subscriptions (
  email      text not null,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  primary key (email, endpoint)
);
alter table push_subscriptions enable row level security;
create policy rw_own_push on push_subscriptions for all
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- ---------- due-date notifications (pg_cron, daily 04:00 UTC ≈ 07:00 IL) ----------
create extension if not exists pg_cron;

create or replace function notify_due_dates() returns void
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
  where d.status = 'open' and d.assignee_email is not null and d.due_date is not null
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
  where t.status = 'open' and t.assignee_email is not null and t.due_date is not null
    and t.due_date <= current_date + 2
    and not exists (
      select 1 from notifications n
      where n.recipient_email = t.assignee_email
        and n.link = '/tasks'
        and n.created_at > now() - interval '20 hours'
        and n.title like '%משימה%'
    );
end; $$;

select cron.schedule('notify-due-dates', '0 4 * * *', $$select notify_due_dates()$$)
where not exists (select 1 from cron.job where jobname = 'notify-due-dates');

-- assignment notifications come from regular users too (internal tool)
create policy insert_notifs_authed on notifications for insert
  with check (auth.role() = 'authenticated');
