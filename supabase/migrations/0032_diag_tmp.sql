-- Temporary diagnostic (dropped in the next migration): inspect the live
-- policies and helper results for notifications, to find why a legitimate
-- member notification is refused.
create or replace function diag_notifs()
returns table (policyname text, cmd text, qual text, withcheck text)
language sql stable security definer set search_path = public, pg_catalog as $$
  select policyname::text, cmd::text, coalesce(qual, '')::text, coalesce(with_check, '')::text
  from pg_policies where schemaname = 'public' and tablename = 'notifications';
$$;
grant execute on function diag_notifs() to authenticated;

create or replace function diag_checks(p_email text)
returns table (member boolean, admin boolean, active_email boolean, jwt_email text)
language sql stable security definer set search_path = public as $$
  select is_member(), is_admin(), is_active_email(p_email), auth.jwt() ->> 'email';
$$;
grant execute on function diag_checks(text) to authenticated;
