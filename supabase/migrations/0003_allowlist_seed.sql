-- Allowlist auth model + role source of truth + starter seed.
-- Workers can only register if an admin pre-authorized their email (allowed_emails).
-- Role/active live in allowed_emails; profiles holds the display name for entry authors.

-- profile extras (name shown on entry cards, active gate kept in sync for convenience)
alter table profiles add column if not exists name text;
alter table profiles add column if not exists active boolean not null default true;

-- the allowlist: admin authorizes an email before the worker may set a password
create table if not exists allowed_emails (
  email text primary key,
  display_name text,
  role text not null default 'member' check (role in ('member','admin')),
  active boolean not null default true,
  registered boolean not null default false,
  created_at timestamptz not null default now()
);
alter table allowed_emails enable row level security;
create policy admin_rw_allowed on allowed_emails for all using (is_admin()) with check (is_admin());

-- role check now reads the allowlist by the signed-in email (immediate, no token refresh needed)
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
      and ae.role = 'admin' and ae.active
  );
$$;

-- self-status RPC: lets a (non-admin) user learn their own role/active/name at login
create or replace function me()
returns table(role text, active boolean, name text)
language sql stable security definer as $$
  select coalesce(ae.role, 'member'),
         coalesce(ae.active, true),
         coalesce(p.name, split_part(auth.jwt() ->> 'email', '@', 1))
  from (select 1) x
  left join allowed_emails ae on lower(ae.email) = lower(auth.jwt() ->> 'email')
  left join profiles p on p.id = auth.uid();
$$;
grant execute on function me() to authenticated;

-- recreate signup handler: copy role/name/active from the allowlist, mark registered
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
declare a allowed_emails;
begin
  select * into a from allowed_emails where lower(email) = lower(new.email);
  insert into profiles(id, role, name, active)
  values (new.id,
          coalesce(a.role, 'member'),
          coalesce(a.display_name, split_part(new.email, '@', 1)),
          coalesce(a.active, true))
  on conflict (id) do update
    set role = excluded.role, name = excluded.name, active = excluded.active;
  update allowed_emails set registered = true where lower(email) = lower(new.email);
  return new;
end; $$;

-- authenticated users may read author display names for entry cards
create policy read_profile_names on profiles for select using (auth.role() = 'authenticated');

-- starter projects
insert into projects (name, active) values
  ('בני נצרים', true),
  ('כפר יובל', true),
  ('מסועי ביצים — דצמן', true)
on conflict do nothing;

-- bootstrap the first admin. CHANGE this email if the owner uses a different login.
insert into allowed_emails (email, display_name, role) values
  ('stephanie.g@agrotop.co.il', 'סטפני', 'admin')
on conflict (email) do update set role = 'admin', active = true;
