-- Optional: assign workers to projects (admin-managed). Everyone can read; only
-- admins write. Purely informational/optional — does not restrict access.
create table if not exists project_assignments (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  primary key (project_id, user_id)
);
alter table project_assignments enable row level security;
create policy read_assignments on project_assignments for select using (auth.role() = 'authenticated');
create policy admin_write_assignments on project_assignments for all using (is_admin()) with check (is_admin());
