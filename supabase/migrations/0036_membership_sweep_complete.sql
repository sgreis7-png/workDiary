-- Completes the membership sweep. 0035 gated the identity-keyed policies it
-- listed, but the sweep was partial: group chat, several sibling tables, and —
-- most importantly — the destructive entry policies were left ungated, so a
-- deactivated worker could still delete their own diary entries.
--
-- It also repairs a regression 0035 introduced: insert_audit was rewritten to
-- `with check (is_member())`, which dropped the actor binding it existed for.

-- ---------- 1. repair the audit-log actor binding (0035 regression) ----------
drop policy if exists insert_audit on audit_log;
create policy insert_audit on audit_log for insert
  with check (is_member() and lower(actor_email) = lower(auth.jwt() ->> 'email'));

-- ---------- 2. group chat ----------
-- read_own_messages was gated, but read_group_messages is a separate permissive
-- SELECT policy and policies OR together — so group history stayed readable to
-- anyone still listed in chat_group_members, including deactivated accounts.
drop policy if exists read_group_messages on user_messages;
create policy read_group_messages on user_messages for select
  using (is_member() and group_id is not null and is_group_member(group_id));

drop policy if exists read_my_groups on chat_groups;
create policy read_my_groups on chat_groups for select
  using (is_member() and (is_group_member(id) or lower(created_by) = lower(auth.jwt() ->> 'email')));

drop policy if exists read_group_members on chat_group_members;
create policy read_group_members on chat_group_members for select
  using (is_member() and (
    is_group_member(group_id)
    or exists (select 1 from chat_groups g
               where g.id = group_id and lower(g.created_by) = lower(auth.jwt() ->> 'email'))
  ));

drop policy if exists ack_own_messages on user_messages;
create policy ack_own_messages on user_messages for update
  using (is_member() and lower(to_email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(to_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists ack_insert on message_acks;
create policy ack_insert on message_acks for insert
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

-- ---------- 3. destructive entry policies ----------
-- `created_by = auth.uid()` is a direct predicate, so it does not depend on the
-- gated read policy: a deactivated worker could delete a day's reports without
-- ever reading them.
drop policy if exists update_entries on entries;
create policy update_entries on entries for update
  using (is_member() and (created_by = auth.uid() or is_admin()))
  with check (is_member() and (created_by = auth.uid() or is_admin()));

drop policy if exists delete_entries on entries;
create policy delete_entries on entries for delete
  using (is_member() and (created_by = auth.uid() or is_admin()));

-- ---------- 4. remaining identity-keyed siblings ----------
drop policy if exists own_prefill_locations on user_prefill_locations;
create policy own_prefill_locations on user_prefill_locations for all
  using (is_member() and lower(auth.jwt() ->> 'email') = email)
  with check (is_member() and lower(auth.jwt() ->> 'email') = email);

drop policy if exists update_own_notifs on notifications;
create policy update_own_notifs on notifications for update
  using (is_member() and lower(recipient_email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(recipient_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists rw_own_priority on project_priorities;
create policy rw_own_priority on project_priorities for all
  using (is_member() and user_id = auth.uid())
  with check (is_member() and user_id = auth.uid());

drop policy if exists update_own_profile on profiles;
create policy update_own_profile on profiles for update
  using (is_member() and id = auth.uid())
  with check (is_member() and id = auth.uid());

drop policy if exists insert_own_feedback on feedback_reports;
create policy insert_own_feedback on feedback_reports for insert
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

-- personal distribution lists carry customer names and addresses
drop policy if exists rw_own_lists on distribution_lists;
create policy rw_own_lists on distribution_lists for all
  using (is_member() and (owner = auth.uid() or is_admin()))
  with check (is_member() and ((owner = auth.uid() and not shared) or is_admin()));

drop policy if exists rw_own_recipients on list_recipients;
create policy rw_own_recipients on list_recipients for all
  using (is_member() and exists (
    select 1 from distribution_lists l
    where l.id = list_id and (l.owner = auth.uid() or is_admin())))
  with check (is_member() and exists (
    select 1 from distribution_lists l
    where l.id = list_id and (l.owner = auth.uid() or is_admin())));

-- a form-builder grant must not outlive membership
drop policy if exists granted_write_fields on field_definitions;
create policy granted_write_fields on field_definitions for all
  using (is_member() and has_perm('form_builder', 'edit'))
  with check (is_member() and has_perm('form_builder', 'edit'));

drop policy if exists granted_write_defect_overrides on defect_item_overrides;
create policy granted_write_defect_overrides on defect_item_overrides for all
  using (is_member() and has_perm('form_builder', 'edit'))
  with check (is_member() and has_perm('form_builder', 'edit'));

-- ---------- 5. cron helpers get the same in-body guard as rl_check ----------
-- Wrapped rather than rewritten: the bodies are long (defects + work tasks,
-- each with its own dedup window) and re-typing them risks dropping a branch.
-- The originals are renamed and kept verbatim; the public name becomes a guard.
-- guarded: a bare ALTER ... RENAME aborts the whole migration on a re-run, and
-- "fix" it by dropping the _impl first and the wrapper gets renamed onto itself,
-- giving a self-recursive cron function
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'notify_due_dates_impl') then
    alter function public.notify_due_dates() rename to notify_due_dates_impl;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'check_alert_rules_impl') then
    alter function public.check_alert_rules() rename to check_alert_rules_impl;
  end if;
end $$;

create or replace function notify_due_dates() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') then return; end if;
  perform notify_due_dates_impl();
end $$;

create or replace function check_alert_rules() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') then return; end if;
  perform check_alert_rules_impl();
end $$;

revoke all on function notify_due_dates_impl() from public, anon, authenticated;
revoke all on function check_alert_rules_impl() from public, anon, authenticated;
revoke all on function notify_due_dates() from anon, authenticated;
revoke all on function check_alert_rules() from anon, authenticated;

-- ---------- 6. registration must prove address control ----------
-- allowed_emails rows are claimable by whoever registers first, and addresses
-- are guessable (firstname@agrotop.co.il). A short code, generated when the
-- admin authorizes the address and handed to the worker out of band, means
-- knowing the address is no longer enough.
alter table allowed_emails add column if not exists registration_code text;

create or replace function gen_registration_code() returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

-- backfill so existing unregistered rows are not left claimable
update allowed_emails
   set registration_code = gen_registration_code()
 where registration_code is null and not registered;

alter table allowed_emails
  alter column registration_code set default gen_registration_code();
