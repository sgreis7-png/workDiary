-- Group conversations + per-member read acknowledgements.

create table if not exists chat_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists chat_group_members (
  group_id uuid not null references chat_groups(id) on delete cascade,
  email    text not null,
  primary key (group_id, email)
);

alter table user_messages alter column to_email drop not null;
alter table user_messages add column if not exists group_id uuid references chat_groups(id) on delete cascade;

create table if not exists message_acks (
  message_id uuid not null references user_messages(id) on delete cascade,
  email      text not null,
  ack_at     timestamptz not null default now(),
  primary key (message_id, email)
);

create or replace function is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from chat_group_members
    where group_id = gid and lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

alter table chat_groups        enable row level security;
alter table chat_group_members enable row level security;
alter table message_acks       enable row level security;

create policy read_my_groups on chat_groups for select
  using (is_group_member(id) or lower(created_by) = lower(auth.jwt() ->> 'email'));
create policy create_groups on chat_groups for insert
  with check (lower(created_by) = lower(auth.jwt() ->> 'email'));
create policy delete_own_groups on chat_groups for delete
  using (lower(created_by) = lower(auth.jwt() ->> 'email'));

create policy read_group_members on chat_group_members for select
  using (is_group_member(group_id)
      or exists(select 1 from chat_groups g where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email')));
create policy manage_group_members on chat_group_members for all
  using (exists(select 1 from chat_groups g where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email')))
  with check (exists(select 1 from chat_groups g where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email')));

-- group messages: members read + send
create policy read_group_messages on user_messages for select
  using (group_id is not null and is_group_member(group_id));
create policy send_group_messages on user_messages for insert
  with check (group_id is not null and is_group_member(group_id)
          and lower(from_email) = lower(auth.jwt() ->> 'email'));

create policy ack_insert on message_acks for insert
  with check (lower(email) = lower(auth.jwt() ->> 'email'));
create policy ack_read on message_acks for select
  using (lower(email) = lower(auth.jwt() ->> 'email')
      or exists(select 1 from user_messages m where m.id = message_id
                and (m.group_id is not null and is_group_member(m.group_id)
                     or lower(m.from_email) = lower(auth.jwt() ->> 'email'))));
