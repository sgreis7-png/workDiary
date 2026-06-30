-- Assign workers by email (the allowlist) so ANY authorized worker can be
-- assigned, not only those who already registered an account.
drop table if exists project_assignments;
create table project_assignments (
  project_id uuid not null references projects(id) on delete cascade,
  email      text not null,
  primary key (project_id, email)
);
alter table project_assignments enable row level security;
create policy read_assignments on project_assignments for select using (auth.role() = 'authenticated');
create policy admin_write_assignments on project_assignments for all using (is_admin()) with check (is_admin());
