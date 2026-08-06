-- Weekly digest notification. The digest itself is computed by the /digest
-- screen from RLS-scoped data; this only tells the people with dashboard-level
-- access (admins) that a fresh week is ready, Sunday 05:00 Israel (02:00 UTC —
-- Israel is UTC+2/+3, so 05:00 winter / 06:00 summer; close enough for a
-- morning digest without tz gymnastics in cron).
create or replace function weekly_digest_notify() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') then return; end if;
  insert into notifications (recipient_email, title, body, link)
  select ae.email,
         '📊 הסיכום השבועי מוכן',
         'רשומות, התקדמות, ליקויים ובטיחות — לכל הפרויקטים בשבוע האחרון',
         '/digest'
  from allowed_emails ae
  where ae.role = 'admin' and ae.active
    and not exists (
      select 1 from notifications n
      where n.recipient_email = ae.email
        and n.link = '/digest'
        and n.created_at > now() - interval '6 days'
    );
end $$;
revoke all on function weekly_digest_notify() from public, anon, authenticated;
grant execute on function weekly_digest_notify() to service_role, postgres;

select cron.schedule('weekly-digest', '0 2 * * 0', $$select weekly_digest_notify()$$)
where not exists (select 1 from cron.job where jobname = 'weekly-digest');
