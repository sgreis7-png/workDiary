-- Email case-normalization at the column level.
--
-- The register hardening replaced .ilike with an exact .eq on a lowercased
-- input — correct against LIKE wildcards, but it broke registration for any
-- allowlist row stored with capitals (one such row exists: SGREIS7@GMAIL.COM).
-- Every comparison in the schema already does lower(email) = lower(...), so
-- the data itself being mixed-case buys nothing and keeps forcing every reader
-- to remember the wrapper. Normalize the stored values and keep them that way.

update allowed_emails set email = lower(email) where email <> lower(email);
update project_assignments set email = lower(email) where email <> lower(email);
update user_permissions set email = lower(email) where email <> lower(email);
update alert_rules set email = lower(email) where email <> lower(email);
update registration_codes set email = lower(email) where email <> lower(email);

create or replace function lower_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(new.email);
  return new;
end $$;

drop trigger if exists allowed_emails_lower on allowed_emails;
create trigger allowed_emails_lower before insert or update on allowed_emails
  for each row execute function lower_email();
drop trigger if exists project_assignments_lower on project_assignments;
create trigger project_assignments_lower before insert or update on project_assignments
  for each row execute function lower_email();
drop trigger if exists user_permissions_lower on user_permissions;
create trigger user_permissions_lower before insert or update on user_permissions
  for each row execute function lower_email();
drop trigger if exists registration_codes_lower on registration_codes;
create trigger registration_codes_lower before insert or update on registration_codes
  for each row execute function lower_email();

-- notify_due_dates_impl fans out to assignee_email without the active-member
-- filter its sibling got in 0037. Regenerated from the verbatim 0025 body with
-- one added predicate per branch — not retyped.
create or replace function notify_due_dates_impl() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- defects: due within 2 days or overdue, open, with a known assignee user
  insert into notifications (recipient_email, title, body, link)
  select d.assignee_email,
         case when d.due_date < current_date
              then 'ליקוי באיחור: ' || coalesce(d.description, 'ליקוי #' || d.seq)
              else 'תאריך יעד מתקרב לליקוי: ' || coalesce(d.description, 'ליקוי #' || d.seq) end,
         'לול ' || c.name || ' · יעד ' || to_char(d.due_date, 'DD/MM/YYYY'),
         '/defects/coop/' || d.coop_id
  from coop_defects d
  join coops c on c.id = d.coop_id
  where d.status = 'open' and d.assignee_email is not null
    and exists (select 1 from allowed_emails ae
                where lower(ae.email) = lower(d.assignee_email) and ae.active)
    and d.due_date is not null
    and d.due_date <= current_date + 2
    and not exists (
      select 1 from notifications n
      where n.recipient_email = d.assignee_email
        and n.link = '/defects/coop/' || d.coop_id
        and n.created_at > now() - interval '20 hours'
        and n.title like '%ליקוי%'
    );

  -- work tasks: due within 2 days or overdue
  insert into notifications (recipient_email, title, body, link)
  select t.assignee_email,
         case when t.due_date < current_date
              then 'משימה באיחור: ' || t.title
              else 'תאריך יעד מתקרב למשימה: ' || t.title end,
         'יעד ' || to_char(t.due_date, 'DD/MM/YYYY'),
         '/tasks'
  from work_tasks t
  where t.status = 'open' and t.assignee_email is not null
    and exists (select 1 from allowed_emails ae
                where lower(ae.email) = lower(t.assignee_email) and ae.active)
    and t.due_date is not null
    and t.due_date <= current_date + 2
    and not exists (
      select 1 from notifications n
      where n.recipient_email = t.assignee_email
        and n.link = '/tasks'
        and n.created_at > now() - interval '20 hours'
        and n.title like '%משימה%'
    );
end; $$;
