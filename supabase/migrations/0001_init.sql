-- roles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin'))
);

create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- form template
create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_he text not null,
  label_en text not null,
  type text not null check (type in ('text','long_text','number','date','phone','select','photo')),
  required boolean not null default false,
  options jsonb not null default '[]',
  sort_order int not null default 0,
  active boolean not null default true
);

-- entries
create table entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  created_by uuid not null references auth.users(id),
  work_date date,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  values jsonb not null default '{}'
);
create index entries_values_gin on entries using gin (values);
create index entries_work_date on entries (work_date);
create index entries_project on entries (project_id);

create table entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

-- distribution
create table distribution_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table list_recipients (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references distribution_lists(id) on delete cascade,
  email text not null,
  display_name text
);

-- RLS
alter table profiles enable row level security;
alter table projects enable row level security;
alter table field_definitions enable row level security;
alter table entries enable row level security;
alter table entry_photos enable row level security;
alter table distribution_lists enable row level security;
alter table list_recipients enable row level security;

create policy read_own_profile on profiles for select using (id = auth.uid());

create policy read_projects on projects for select using (auth.role() = 'authenticated');
create policy write_projects on projects for all using (is_admin()) with check (is_admin());

create policy read_fields on field_definitions for select using (auth.role() = 'authenticated');
create policy write_fields on field_definitions for all using (is_admin()) with check (is_admin());

create policy read_entries on entries for select using (auth.role() = 'authenticated');
create policy write_entries on entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy read_photos on entry_photos for select using (auth.role() = 'authenticated');
create policy write_photos on entry_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy rw_lists on distribution_lists for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_recipients on list_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- auto-create profile on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles(id, role) values (new.id, 'member') on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- photos storage bucket
insert into storage.buckets (id, name, public) values ('photos','photos', false)
  on conflict do nothing;
create policy "auth read photos" on storage.objects for select
  using (bucket_id = 'photos' and auth.role() = 'authenticated');
create policy "auth write photos" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');
