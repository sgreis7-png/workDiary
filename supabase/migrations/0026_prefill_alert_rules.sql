-- user_prefill: "שמור נתונים" — per-user saved name/phone for the entry form.
-- alert_rules: personal monitoring rules (missing-entry checks / new-record subscriptions).
-- admin_emails / filled_rule_emails: recipient lists for client-side notification fan-out.
-- check_alert_rules(): hourly pg_cron job firing 'missing' rules (pattern: notify_due_dates, 0025).

create table if not exists user_prefill (
  email      text primary key,
  name       text,
  phone      text,
  updated_at timestamptz not null default now()
);
alter table user_prefill enable row level security;
create policy own_prefill on user_prefill for all
  using (lower(auth.jwt()->>'email') = email)
  with check (lower(auth.jwt()->>'email') = email);

create table if not exists alert_rules (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  project_id    uuid references projects(id) on delete cascade,  -- null = all projects
  kind          text not null check (kind in ('missing','filled')),
  frequency     text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  alert_hour    int  not null default 20 check (alert_hour between 0 and 23),
  weekday       int  check (weekday between 0 and 6),      -- weekly: 0=Sunday
  month_day     int  check (month_day between 1 and 31),   -- monthly
  active        boolean not null default true,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table alert_rules enable row level security;
create policy own_alert_rules on alert_rules for all
  using (lower(auth.jwt()->>'email') = email)
  with check (lower(auth.jwt()->>'email') = email);

-- admin emails for client-side notification fan-out
create or replace function admin_emails() returns setof text
language sql security definer set search_path = public as $$
  select email from allowed_emails where role = 'admin' and active
$$;
grant execute on function admin_emails() to authenticated;

-- owners of active 'filled' rules matching a project (null project_id = all projects)
create or replace function filled_rule_emails(pid uuid) returns setof text
language sql security definer set search_path = public as $$
  select distinct email from alert_rules
  where kind = 'filled' and active and (project_id is null or project_id = pid)
$$;
grant execute on function filled_rule_emails(uuid) to authenticated;

-- hourly 'missing entry' rule checker; times are Israel local
create or replace function check_alert_rules() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select ar.* from alert_rules ar
    where ar.kind = 'missing' and ar.active
      and ar.alert_hour = extract(hour from now() at time zone 'Asia/Jerusalem')::int
      and (ar.last_fired_at is null or ar.last_fired_at < now() - interval '50 minutes')
      and (
        (ar.frequency = 'daily')
        or (ar.frequency = 'weekly'  and coalesce(ar.weekday, 0) = extract(dow from now() at time zone 'Asia/Jerusalem')::int)
        or (ar.frequency = 'monthly' and coalesce(ar.month_day, 1) = extract(day from now() at time zone 'Asia/Jerusalem')::int)
      )
  loop
    insert into notifications (recipient_email, title, body, link)
    select r.email,
           'לא מולאה רשומת יומן עבודה — ' || p.name,
           case r.frequency
             when 'daily'   then 'לא נמצאה רשומה להיום עד ' || r.alert_hour || ':00'
             when 'weekly'  then 'לא נמצאה רשומה בשבוע האחרון'
             else                'לא נמצאה רשומה החודש'
           end,
           '/new'
    from projects p
    where p.active
      and (r.project_id is null or p.id = r.project_id)
      and not exists (
        select 1 from entries e
        where e.project_id = p.id
          and case r.frequency
            when 'daily'   then e.work_date = (now() at time zone 'Asia/Jerusalem')::date
            when 'weekly'  then e.work_date >= (now() at time zone 'Asia/Jerusalem')::date - 6
            else                date_trunc('month', e.work_date) = date_trunc('month', (now() at time zone 'Asia/Jerusalem')::date)
          end
      );
    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
end; $$;

select cron.schedule('check-alert-rules', '0 * * * *', $$select check_alert_rules()$$)
where not exists (select 1 from cron.job where jobname = 'check-alert-rules');
