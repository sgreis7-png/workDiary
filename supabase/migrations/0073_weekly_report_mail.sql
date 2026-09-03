-- דוח רמזור שלב ב׳ — שליחת הדוח השבועי במייל.
--
-- pg_net שולח POST אסינכרוני ל-edge function; הסוד יושב ב-vault ולא בקוד.
-- שליחה שנכשלת נרשמת ב-report_mail_log, אחרת כשל שקט מתגלה רק כששואלים למה
-- לא הגיע מייל. הסנאפשוט והמשימות נוצרים לפני השליחה ואינם תלויים בה.
--
-- הערה: הקובץ נקרא 0073 ולא 0072 כפי שכתוב ב-brief — 0072 כבר תפוס
-- (0072_customer_commitments_guard.sql) ומיגרציות הן write-once.

create extension if not exists pg_net with schema extensions;

alter table traffic_light_settings
  add column if not exists extra_report_emails text[] not null default '{}';

create table if not exists report_mail_log (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid references traffic_light_snapshots(id) on delete set null,
  requested_at    timestamptz not null default now(),
  request_id      bigint,
  recipient_count int,
  http_status     int,
  error           text
);
alter table report_mail_log enable row level security;
drop policy if exists read_report_mail_log on report_mail_log;
create policy read_report_mail_log on report_mail_log for select using (can_view('traffic_light'));

-- ---------- traffic_light_weekly() re-emitted ----------
-- הגוף זהה למותקן (0065) מלבד שלושה שינויים:
--   1. הסנאפשוט נשמר עם returning id into v_snapshot_id, כדי שאפשר יהיה לצרף אותו לשליחה;
--   2. סעיף המייל בסוף — fire-and-forget, בתוך begin/exception משלו;
--   3. ציר 'client' נוסף ל-axis_names ולשתי ביטויי התווית. ציר הלקוח כבר מחשב
--      צבעים אמיתיים (0071) אבל לא הופיע כאן, ולכן משימה שלו לא נוצרה כלל —
--      ואילו נוצרה, היא הייתה נקראת "להשלים נתונים: client" או מסומנת כבלת"מ.
create or replace function traffic_light_weekly() returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  p_payload jsonb;
  pr jsonb;
  n int := 0;
  axis_names text[] := array['time', 'supply', 'client', 'crew', 'issues'];
  a text; ax_json jsonb; t_title text;
  v_snapshot_id uuid;
  v_secret text;
  v_fn_url text;
  v_request_id bigint;
begin
  -- session_user, not current_user (see traffic_light()): security definer hides the caller.
  if not (session_user in ('postgres', 'supabase_admin')
          or coalesce(auth.role(), '') = 'service_role') then return 0; end if;
  p_payload := traffic_light(null);
  insert into traffic_light_snapshots (payload) values (p_payload) returning id into v_snapshot_id;

  for pr in select * from jsonb_array_elements(p_payload) loop
    -- gray → one task on axis 'gray'
    if pr ->> 'color' = 'gray' then
      if not exists (select 1 from work_tasks w where w.project_id = (pr ->> 'project_id')::uuid and w.source = 'traffic_light' and w.axis = 'gray' and w.status = 'open') then
        insert into work_tasks (title, project_id, source, axis, status, created_by)
        values ('רמזור · אפור · ' || coalesce(pr ->> 'gray_reason', ''), (pr ->> 'project_id')::uuid, 'traffic_light', 'gray', 'open', 'system');
        n := n + 1;
      end if;
    end if;
    foreach a in array axis_names loop
      ax_json := pr -> 'axes' -> a;
      if (ax_json ->> 'color') in ('red', 'amber') or coalesce((ax_json ->> 'missing_data')::boolean, false) then
        t_title := case
          when coalesce((ax_json ->> 'missing_data')::boolean, false) then 'להשלים נתונים: ' || case a when 'crew' then 'קבלנים והיקף מוסכם' when 'supply' then 'רשימת אספקות' when 'client' then 'לקוח' else a end
          else 'רמזור · ' || case a when 'time' then 'זמן' when 'supply' then 'הספקות' when 'client' then 'לקוח' when 'crew' then 'כוח אדם' else 'בלת"מ' end || ' · ' || left(coalesce(ax_json ->> 'reason', ''), 180) end;
        if not exists (select 1 from work_tasks w where w.project_id = (pr ->> 'project_id')::uuid and w.source = 'traffic_light' and w.axis = a and w.status = 'open') then
          insert into work_tasks (title, project_id, source, axis, status, created_by)
          values (t_title, (pr ->> 'project_id')::uuid, 'traffic_light', a, 'open', 'system');
          n := n + 1;
        end if;
      end if;
    end loop;
  end loop;

  insert into notifications (recipient_email, title, body, link)
  select lower(ae.email), '🚦 דוח רמזור שבועי מוכן',
         (select count(*) from jsonb_array_elements(p_payload) x where x ->> 'color' = 'red') || ' אדומים · ' ||
         (select count(*) from jsonb_array_elements(p_payload) x where x ->> 'color' = 'gray') || ' אפורים · ' || n || ' משימות חדשות',
         '/traffic'
    from allowed_emails ae
   where ae.active and ae.role in ('admin', 'manager')
     and not exists (select 1 from notifications nt
                      where nt.recipient_email = lower(ae.email)
                        and nt.link = '/traffic'
                        and nt.created_at > now() - interval '20 hours');

  -- the mail: fire-and-forget, so a mail failure can never cost us the snapshot
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'report_secret';
    select decrypted_secret into v_fn_url from vault.decrypted_secrets where name = 'report_fn_url';
    if v_secret is not null and v_fn_url is not null then
      select net.http_post(
        url := v_fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-report-secret', v_secret),
        body := jsonb_build_object('snapshot_id', v_snapshot_id)
      ) into v_request_id;
      insert into report_mail_log (snapshot_id, request_id) values (v_snapshot_id, v_request_id);
    end if;
  exception when others then
    insert into report_mail_log (snapshot_id, error) values (v_snapshot_id, sqlerrm);
  end;

  return n;
end $fn$;
revoke all on function traffic_light_weekly() from public;
revoke execute on function traffic_light_weekly() from anon, authenticated;
grant execute on function traffic_light_weekly() to service_role, postgres;

-- ---------- reconcile the async response ----------
-- pg_net מחזיר request_id מיד; התשובה נוחתת ב-net._http_response מאוחר יותר.
-- בלי הצעד הזה כשל HTTP (401 מסוד שגוי, 500 מהפונקציה) נשאר בלתי נראה.
create or replace function report_mail_reconcile() returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if session_user not in ('postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' then return; end if;
  update report_mail_log l
     set http_status = r.status_code,
         error = case when r.status_code between 200 and 299 then null else left(r.content, 500) end
    from net._http_response r
   where r.id = l.request_id and l.http_status is null;
end $fn$;
revoke all on function report_mail_reconcile() from public;
revoke execute on function report_mail_reconcile() from anon, authenticated;
grant execute on function report_mail_reconcile() to service_role, postgres;

select cron.schedule('traffic-light-mail-reconcile', '5 4 * * 0', $j$select report_mail_reconcile()$j$)
where not exists (select 1 from cron.job where jobname = 'traffic-light-mail-reconcile');
