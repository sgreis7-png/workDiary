-- In-app notifications (e.g. "you were assigned to project X").
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient on notifications (recipient_email, read, created_at desc);
alter table notifications enable row level security;

-- recipients see and update (mark read) their own, by signed-in email
create policy read_own_notifs on notifications for select
  using (lower(recipient_email) = lower(auth.jwt() ->> 'email'));
create policy update_own_notifs on notifications for update
  using (lower(recipient_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(recipient_email) = lower(auth.jwt() ->> 'email'));
-- admins create notifications (assignment, etc.)
create policy admin_insert_notifs on notifications for insert with check (is_admin());
