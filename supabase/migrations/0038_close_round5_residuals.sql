-- Round-5 residuals.
--
-- Two of these matter: a deactivated user could still destroy other people's
-- chat history, and the registration secret introduced in 0036 was readable by
-- every member — which turned an outsider defence into an insider escalation.

-- ---------- 1. deleting a chat group cascades into everyone's messages ----------
-- delete_own_groups keyed on created_by with no nested read, so gating
-- read_my_groups did not touch it: a deactivated account could blind-delete
-- `chat_groups?created_by=eq.<self>` and take every message other people had
-- sent in those groups with it (both child tables cascade).
drop policy if exists delete_own_groups on chat_groups;
create policy delete_own_groups on chat_groups for delete
  using (is_member() and lower(created_by) = lower(auth.jwt() ->> 'email'));

-- ---------- 2. registration codes leave the member-readable table ----------
-- allowed_emails is readable row- and column-wide by every member (the chat and
-- assignee pickers need the names), so storing the code there let any member
-- claim a colleague's pending account — and a pending role='admin' row made
-- that a member→admin escalation.
create table if not exists registration_codes (
  email text primary key,
  code text not null,
  created_at timestamptz not null default now()
);
alter table registration_codes enable row level security;

-- admins manage them; the register edge function reads with the service role,
-- which bypasses RLS entirely
drop policy if exists admin_rw_reg_codes on registration_codes;
create policy admin_rw_reg_codes on registration_codes for all
  using (is_admin()) with check (is_admin());

-- carry over anything 0036 minted, then drop the exposed column
insert into registration_codes (email, code)
select lower(email), registration_code from allowed_emails
where registration_code is not null
on conflict (email) do nothing;

alter table allowed_emails drop column if exists registration_code;
drop function if exists gen_registration_code();

/** Mint (or re-mint) a code for an address. Admin-only; returns the code so the
    invite screen can show it. */
create or replace function issue_registration_code(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into registration_codes (email, code) values (lower(p_email), c)
  on conflict (email) do update set code = excluded.code, created_at = now();
  return c;
end $$;
revoke all on function issue_registration_code(text) from public, anon;
grant execute on function issue_registration_code(text) to authenticated;

-- ---------- 3. remaining ungated identity-keyed policies ----------
-- These were protected only by the accident that their predicates read an
-- RLS-gated table; make the membership requirement explicit so a future
-- refactor to a definer helper cannot silently re-open them.
drop policy if exists ack_read on message_acks;
create policy ack_read on message_acks for select
  using (is_member() and (
    lower(email) = lower(auth.jwt() ->> 'email')
    or exists (select 1 from user_messages m
               where m.id = message_id and lower(m.from_email) = lower(auth.jwt() ->> 'email'))
  ));

drop policy if exists read_feedback on feedback_reports;
create policy read_feedback on feedback_reports for select
  using (is_member() and (is_admin() or lower(email) = lower(auth.jwt() ->> 'email')));

drop policy if exists rw_photos on entry_photos;
create policy rw_photos on entry_photos for all
  using (is_member() and exists (
    select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())))
  with check (is_member() and exists (
    select 1 from entries e where e.id = entry_id and (e.created_by = auth.uid() or is_admin())));

drop policy if exists manage_group_members on chat_group_members;
create policy manage_group_members on chat_group_members for all
  using (is_member() and exists (
    select 1 from chat_groups g
    where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email')))
  with check (is_member() and exists (
    select 1 from chat_groups g
    where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email')));

-- ---------- 4. message_acks re-ack ----------
-- ackGroupMessage upserts, but there was no UPDATE policy, so acking the same
-- message twice failed with 42501. Latent since 0024.
drop policy if exists ack_update on message_acks;
create policy ack_update on message_acks for update
  using (is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));
