-- `revoke all on function ... from public` does not do what it looks like it does.
--
-- Supabase's default privileges grant EXECUTE on new functions to `anon` and `authenticated` as
-- named roles. Revoking from PUBLIC leaves those named grants standing, so three functions written
-- for the service role and the cron were callable by anyone holding the publishable key:
--
--   log_report_send        an audit log the audited party could write, including entries naming
--                          somebody else as the sender. That is not an audit log.
--   gantt_overrun_notify   inserts notifications, checks no membership of its own
--   gate_approval_notify   same
--
-- Both notify functions are idempotent, so the exposure was bounded to making notifications appear
-- sooner than scheduled rather than fabricating them endlessly. Still not an anonymous caller's
-- decision to make.
--
-- The lesson generalises: every `revoke all ... from public` added in 0043–0053 needs the role
-- names spelled out if the intent was "service role only". The self-check below fails the
-- migration rather than trusting that it worked.
--
-- The cron jobs run as `postgres`, which keeps EXECUTE, so the schedules are unaffected.

revoke execute on function log_report_send(text, text, text[], text) from anon, authenticated;
revoke execute on function gantt_overrun_notify() from anon, authenticated;
revoke execute on function gate_approval_notify() from anon, authenticated;

-- may_send_report(), my_role(), is_manager(), is_project_manager(), member_directory(),
-- active_recipients() and entry_photo_readable() stay callable by `authenticated` on purpose:
-- each is SECURITY DEFINER and answers a question about the caller's own access, which the client
-- is allowed to ask. They check is_member() internally, so an anonymous caller learns nothing.

do $$
declare
  r record;
  bad text := '';
begin
  for r in
    select p.proname, coalesce(array_to_string(p.proacl::text[], ' '), '') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('gantt_overrun_notify', 'gate_approval_notify', 'log_report_send')
  loop
    if r.acl like '%authenticated=X%' or r.acl like '%anon=X%' then
      bad := bad || r.proname || ' ';
    end if;
  end loop;
  if bad <> '' then
    raise exception 'still client-callable: %', bad;
  end if;
end $$;
