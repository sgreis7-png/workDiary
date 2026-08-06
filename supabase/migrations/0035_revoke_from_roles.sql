-- Round 4. Two classes of problem, both proven by probing the live API with the
-- anon key (which ships inside the JS bundle, so "anon" means anyone).
--
-- 1. `revoke ... from public` in 0030/0031/0034 was INERT. Supabase grants
--    EXECUTE directly to the `anon` and `authenticated` roles, and revoking
--    from PUBLIC does not remove a direct role grant. rl_check,
--    notify_due_dates and check_alert_rules were still callable
--    unauthenticated — the unauthenticated password-reset DoS that 0034
--    claimed to close was in fact still open.
--
-- 2. 0029's shared-list policies are the only ones in the schema whose
--    predicate never references auth.* at all, so recipient names and email
--    addresses of a shared list would be world-readable with the anon key.
--    Latent only because no list is shared yet.

-- ---------- 1. actually revoke, by naming the roles ----------

revoke execute on function rl_check(text, text, integer, integer) from anon, authenticated;
revoke execute on function notify_due_dates() from anon, authenticated;
revoke execute on function check_alert_rules() from anon, authenticated;

-- Defence in depth: a grant can be reintroduced by tooling, so the bodies now
-- refuse anyone who is not the service role. Both cron jobs run as `postgres`
-- (the owner) and every edge function calls rl_check through a service-role
-- client, so no legitimate caller is affected.
create or replace function rl_check(p_actor text, p_action text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  -- p_max is caller-supplied; reachable from the client this is a way to both
  -- write rate_events at will and burn another account's reset budget
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') then
    return false;
  end if;
  delete from rate_events where at < now() - interval '1 day';
  select count(*) into cnt from rate_events
    where actor = p_actor and action = p_action and at > now() - make_interval(secs => p_window_seconds);
  if cnt >= p_max then return false; end if;
  insert into rate_events(actor, action) values (p_actor, p_action);
  return true;
end; $$;

-- ---------- 2. shared distribution lists need an authenticated reader ----------

drop policy if exists read_shared_lists on distribution_lists;
create policy read_shared_lists on distribution_lists for select
  using (shared and is_member());

drop policy if exists read_shared_recipients on list_recipients;
create policy read_shared_recipients on list_recipients for select
  using (exists (
    select 1 from distribution_lists l
    where l.id = list_id and l.shared and is_member()
  ));

-- ---------- 3. identity-keyed policies also require membership ----------
-- These key on "the row is mine" but never checked that I am still a member, so
-- a deactivated account kept reading its notification and DM history (which
-- carries project names, coop names and defect descriptions) for the life of
-- its refresh token, and any non-member could seed itself alert rules that the
-- cron job then answers with a per-project notification — a project-name oracle.
--
-- profiles.read_own_profile is deliberately NOT gated: auth.tsx must still load
-- the profile of a deactivated user in order to sign them out.

drop policy if exists read_own_notifs on notifications;
create policy read_own_notifs on notifications for select
  using (is_member() and lower(recipient_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists own_alert_rules on alert_rules;
create policy own_alert_rules on alert_rules for all
  using (is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists read_own_messages on user_messages;
create policy read_own_messages on user_messages for select
  using (is_member() and (
    lower(from_email) = lower(auth.jwt() ->> 'email')
    or lower(to_email) = lower(auth.jwt() ->> 'email')
  ));

drop policy if exists own_prefill on user_prefill;
create policy own_prefill on user_prefill for all
  using (is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists rw_own_push on push_subscriptions;
create policy rw_own_push on push_subscriptions for all
  using (is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

-- a non-member could create a group with an arbitrary name and add real staff,
-- so it appeared in their chat list (they could not post to it)
drop policy if exists create_groups on chat_groups;
create policy create_groups on chat_groups for insert
  with check (is_member() and lower(created_by) = lower(auth.jwt() ->> 'email'));

-- forged audit rows (read is already admin-only, so this is log integrity)
drop policy if exists insert_audit on audit_log;
create policy insert_audit on audit_log for insert with check (is_member());
