-- "שמור נתונים": location is saved per user *per project* (name/phone stay global per user).
create table if not exists user_prefill_locations (
  email         text not null,
  project_id    uuid not null references projects(id) on delete cascade,
  site_location text,
  updated_at    timestamptz not null default now(),
  primary key (email, project_id)
);
alter table user_prefill_locations enable row level security;
create policy own_prefill_locations on user_prefill_locations for all
  using (lower(auth.jwt()->>'email') = email)
  with check (lower(auth.jwt()->>'email') = email);
