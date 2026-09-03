-- דוח רמזור שלב ב׳ — תיקוני הסקירה הסופית לפני מיזוג.
--
-- 1. משימות "להשלים נתונים" רק לפרויקט שה-PMO כבר התחיל להגדיר.
--    בייצור יש 16 פרויקטים פעילים ולאף אחד מהם אין תאריך מסירה חוזי, קבלנים,
--    אספקות או התחייבויות לקוח. בלי התנאי הזה הרצת יום ראשון הראשונה הייתה
--    פותחת שלוש משימות לכל פרויקט בבת אחת — כ-48 משימות שהן רעש, וזה הדבר
--    הראשון שמישהו יראה מהפיצ׳ר. contract_due_date (המגיע לתשלובת דרך
--    payload.due.contract) הוא הסימן שהגדרת הפרויקט התחילה: פרויקט עם תאריך
--    חוזי ובלי קבלנים עדיין מקבל את המשימה שלו; פרויקט שלא הוגדר כלל לא מקבל.
--    ענף האדום/כתום וענף האפור נשארים בדיוק כפי שהם.
--
-- 2. customer_commitments_guard() — 0072 דילגה על מוסכמת ה-revoke שכבר תפסה
--    שלושה חורים אמיתיים בפרויקט הזה (ראו src/lib/function.grants.test.ts):
--    revoke from public לבדו משאיר את anon ו-authenticated, שקיבלו execute
--    כתפקידים בשם דרך ברירת המחדל של Supabase.
--
-- 0064–0074 כבר הוחלו על הפרויקט החי ואסור לערוך אותן; התיקונים נעשים כאן.

-- ---------- traffic_light_weekly() re-emitted ----------
-- הגוף זהה למותקן (נקרא מ-pg_proc, זהה ל-0074) מלבד תנאי אחד: ענף
-- missing_data דורש עכשיו גם תאריך מסירה חוזי.
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
      -- missing_data תמיד מגיע עם color = 'na' (ראו tl_supply/tl_crew/tl_client),
      -- ולכן שני הענפים זרים זה לזה והתנאי החדש נוגע רק בענף החסר.
      if (ax_json ->> 'color') in ('red', 'amber')
         or (coalesce((ax_json ->> 'missing_data')::boolean, false)
             and (pr -> 'due' ->> 'contract') is not null) then
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
    if v_secret is not null and v_fn_url is not null
       and not exists (select 1 from report_mail_log
                        where requested_at > now() - interval '20 hours') then
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

-- ---------- customer_commitments_guard() grants ----------
-- פונקציית טריגר בלבד: הטריגר עצמו רץ בהרשאות הבעלים, ואין שום סיבה שלקוח
-- יוכל לקרוא לה ישירות עם NEW משלו.
revoke all on function customer_commitments_guard() from public;
revoke execute on function customer_commitments_guard() from anon, authenticated;
