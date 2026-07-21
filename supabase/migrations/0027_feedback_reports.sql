-- "דווח" — user feedback: bug reports and feature/change requests, sent to admins.
-- Screenshot (optional) lives in the existing private 'photos' bucket under feedback/.

create table if not exists feedback_reports (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  kind       text not null default 'bug' check (kind in ('bug','request')),
  message    text not null,
  photo_path text,
  status     text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
alter table feedback_reports enable row level security;

-- anyone signed-in files reports as themselves; admins see and manage all, reporters see their own
create policy insert_own_feedback on feedback_reports for insert
  with check (lower(auth.jwt()->>'email') = email);
create policy read_feedback on feedback_reports for select
  using (is_admin() or lower(auth.jwt()->>'email') = email);
create policy admin_update_feedback on feedback_reports for update
  using (is_admin()) with check (is_admin());
create policy admin_delete_feedback on feedback_reports for delete
  using (is_admin());
