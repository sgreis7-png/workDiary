-- Per-user area permissions + user-to-user messages with read acknowledgement.

-- ---------- permissions ----------
-- A row overrides the role default for one area. level: none / view / edit.
create table if not exists user_permissions (
  email text not null,
  area  text not null,
  level text not null check (level in ('none','view','edit')),
  updated_at timestamptz not null default now(),
  primary key (email, area)
);
alter table user_permissions enable row level security;
create policy read_permissions on user_permissions for select
  using (auth.role() = 'authenticated');
create policy admin_write_permissions on user_permissions for all
  using (is_admin()) with check (is_admin());

-- true when the signed-in user has an explicit grant at the given level
create or replace function has_perm(p_area text, p_level text) returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from user_permissions
    where lower(email) = lower(auth.jwt() ->> 'email')
      and area = p_area and level = p_level
  );
$$;

-- granted non-admin editors may write the form-builder tables
create policy granted_write_fields on field_definitions for all
  using (has_perm('form_builder','edit')) with check (has_perm('form_builder','edit'));
create policy granted_write_defect_overrides on defect_item_overrides for all
  using (has_perm('form_builder','edit')) with check (has_perm('form_builder','edit'));

-- everyone signed in may list the allowlist (message recipients, name lookups)
create policy read_allowed_emails_authed on allowed_emails for select
  using (auth.role() = 'authenticated');

-- ---------- messages ----------
create table if not exists user_messages (
  id         uuid primary key default gen_random_uuid(),
  from_email text not null,
  from_name  text,
  to_email   text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  ack_at     timestamptz
);
create index if not exists user_messages_to on user_messages (to_email, ack_at, created_at desc);
alter table user_messages enable row level security;

create policy send_own_messages on user_messages for insert
  with check (lower(from_email) = lower(auth.jwt() ->> 'email'));
create policy read_own_messages on user_messages for select
  using (lower(from_email) = lower(auth.jwt() ->> 'email')
      or lower(to_email)   = lower(auth.jwt() ->> 'email'));
create policy ack_own_messages on user_messages for update
  using (lower(to_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(to_email) = lower(auth.jwt() ->> 'email'));
