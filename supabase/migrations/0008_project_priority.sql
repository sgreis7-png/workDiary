-- Company priority (admin-set, global) + per-user priority. Higher = shown first.
alter table projects add column if not exists priority int not null default 0;

create table if not exists project_priorities (
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  priority   int  not null default 0,
  primary key (user_id, project_id)
);
alter table project_priorities enable row level security;
create policy rw_own_priority on project_priorities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
