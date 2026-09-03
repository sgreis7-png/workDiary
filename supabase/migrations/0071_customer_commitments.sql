-- דוח רמזור שלב ב׳ — התחייבויות לקוח.
--
-- העיכובים שקבלן לא יכול לפתור בעבודה קשה יותר: תשתיות, היתרים, גישה לאתר,
-- אישור תוכניות ואבני דרך לתשלום. שני שדות ההודעה (notice_sent_on, notice_ref)
-- הם ההגנה החוזית על הארכת זמן — הם נתון, לא משימה שמישהו סוגר.
--
-- 0064-0070 כבר הוחלו ואסור לערוך אותן; כל שינוי לאובייקט קיים נעשה כאן מחדש.

-- ---------- 1. the table ----------
create table if not exists customer_commitments (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  item             text not null,
  kind             text not null default 'other'
                   check (kind in ('infrastructure','permit','access','plan_approval','payment_milestone','other')),
  due_date         date not null,
  status           text not null default 'open'
                   check (status in ('open','confirmed','done')),
  confirmation_ref text,
  blocking         boolean not null default false,
  notice_sent_on   date,
  notice_ref       text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text
);
create index if not exists customer_commitments_project_due
  on customer_commitments (project_id, due_date);
alter table customer_commitments enable row level security;

-- Read like the deliveries list: any member. Write: the PMO, or the person who runs
-- this project — a work manager on site is who knows the customer finished the
-- infrastructure. is_project_manager() comes from 0050.
drop policy if exists read_customer_commitments on customer_commitments;
create policy read_customer_commitments on customer_commitments for select using (is_member());
drop policy if exists insert_customer_commitments on customer_commitments;
create policy insert_customer_commitments on customer_commitments for insert
  with check (is_admin() or can_edit('traffic_light') or is_project_manager(project_id));
drop policy if exists update_customer_commitments on customer_commitments;
create policy update_customer_commitments on customer_commitments for update
  using (is_admin() or can_edit('traffic_light') or is_project_manager(project_id))
  with check (is_admin() or can_edit('traffic_light') or is_project_manager(project_id));
drop policy if exists delete_customer_commitments on customer_commitments;
create policy delete_customer_commitments on customer_commitments for delete
  using (is_admin() or can_edit('traffic_light'));

-- ---------- 2. the threshold ----------
alter table traffic_light_settings
  add column if not exists client_window_days int not null default 14;
comment on column traffic_light_settings.client_window_days is
  'ציר הלקוח: חלון ההסתכלות קדימה על התחייבויות פתוחות, בימים.';

-- ---------- 3. the client axis ----------
--
-- ירוק: אין התחייבות פתוחה שמועדה בחלון, או שכולן אושרו בכתב.
-- כתום: התחייבות שמועדה בחלון ואין אישור שהיא בדרך.
-- אדום: המועד חלף, לא בוצעה, והיא חוסמת עבודה שלנו.
-- כלל ההודעה: כשאדום ואין הודעה כתובה מהשבוע האחרון — זו הסיבה, וזו כותרת המשימה.
create or replace function tl_client(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_items jsonb;
  v_colors text[];
  v_worst text;
  v_total int;
  v_red_no_notice int;
  v_red_notice_on date;
begin
  select count(*) into v_total from customer_commitments c where c.project_id = p.id;
  if v_total = 0 then
    return jsonb_build_object(
      'color', 'na', 'reason', 'לא הוזנו התחייבויות לקוח', 'missing_data', true,
      'evidence', jsonb_build_object('items', '[]'::jsonb));
  end if;

  with w as (
    select c.*,
           (today - c.due_date) as days_late,
           case
             when c.due_date < today and c.status <> 'done' and c.blocking then 'red'
             when c.status = 'open' and c.due_date <= today + s.client_window_days then 'amber'
             else 'green' end as color
      from customer_commitments c
     where c.project_id = p.id
       and c.status <> 'done'
       and (c.due_date <= today + s.client_window_days or c.due_date < today)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'item', w.item, 'kind', w.kind, 'due_date', w.due_date,
           'status', w.status, 'confirmation_ref', w.confirmation_ref,
           'blocking', w.blocking, 'days_late', greatest(w.days_late, 0),
           'notice_sent_on', w.notice_sent_on, 'notice_ref', w.notice_ref,
           'color', w.color) order by tl_rank(w.color) desc, w.due_date), '[]'::jsonb),
         coalesce(array_agg(w.color), '{}'::text[]),
         count(*) filter (where w.color = 'red'
                            and (w.notice_sent_on is null or w.notice_sent_on < today - 7)),
         max(w.notice_sent_on) filter (where w.color = 'red')
    into v_items, v_colors, v_red_no_notice, v_red_notice_on
    from w;

  v_worst := tl_worst(v_colors);
  if v_worst = 'na' then v_worst := 'green'; end if;

  return jsonb_build_object(
    'color', v_worst,
    'reason', case v_worst
      when 'green' then 'אין התחייבות לקוח פתוחה שמועדה ב-' || s.client_window_days || ' הימים הקרובים'
      when 'amber' then (select count(*) from jsonb_array_elements(v_items) x where x ->> 'color' = 'amber')
                        || ' התחייבויות לקוח מועדן קרוב ואין אישור בכתב'
      else case when v_red_no_notice > 0
                then 'התחייבות לקוח חלפה וחוסמת עבודה — נדרשת הודעה כתובה ללקוח'
                else 'התחייבות לקוח חלפה וחוסמת עבודה — הודעה נשלחה ב-'
                     || to_char(v_red_notice_on, 'DD.MM.YYYY') end end,
    'evidence', jsonb_build_object('items', v_items));
end $$;

revoke all on function tl_client(projects, traffic_light_settings, date) from public;
revoke execute on function tl_client(projects, traffic_light_settings, date) from anon, authenticated;

-- ---------- 4. tl_project re-emitted so it calls tl_client ----------
--
-- הגוף זהה לזה שב-0065 מלבד שני שינויים: cli מחושב מ-tl_client במקום להיות stub,
-- והוא נכלל בשני המקומות שמחשבים את הציר הגרוע ביותר. כללי הצבעים לא משתנים.
create or replace function tl_project(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  gray jsonb := tl_gray(p, s, today);
  t jsonb := tl_time(p, s, today);
  sup jsonb := tl_supply(p, s, today);
  cr jsonb := tl_crew(p, s, today);
  iss jsonb := tl_issues(p, s, today);
  cli jsonb := tl_client(p, s, today);
  color text;
  action text;
  worst_axis jsonb;
  manager text;
begin
  color := tl_worst(array[t ->> 'color', sup ->> 'color', cli ->> 'color', cr ->> 'color', iss ->> 'color']);
  if color = 'na' then color := 'green'; end if;
  if gray ->> 'reason' is not null then color := 'gray'; end if;

  select x into worst_axis from unnest(array[t, sup, cli, cr, iss]) x order by tl_rank(x ->> 'color') desc limit 1;
  action := case
    when color = 'gray' then gray ->> 'reason'
    when color = 'green' then ''
    else coalesce(worst_axis ->> 'reason', '') end;

  select e.values ->> 'manager_name' into manager from entries e where e.project_id = p.id order by e.work_date desc, e.created_at desc limit 1;

  return jsonb_build_object(
    'project_id', p.id, 'name', p.name, 'manager', coalesce(nullif(manager, ''), p.pmo), 'project_type', coalesce(p.project_type, 'coop'),
    'color', color, 'gray_reason', gray ->> 'reason',
    'axes', jsonb_build_object(
      'time', t - 'contract' - 'forecast' - 'delta_days', 'supply', sup, 'client', cli, 'crew', cr, 'issues', iss),
    'due', jsonb_build_object('contract', t -> 'contract', 'forecast', t -> 'forecast', 'delta_days', t -> 'delta_days'),
    'last_entry_on', gray -> 'last_entry_on', 'gantt_imported_at', gray -> 'gantt_imported_at',
    'action_line', action);
end $$;

revoke all on function tl_project(projects, traffic_light_settings, date) from public;
revoke execute on function tl_project(projects, traffic_light_settings, date) from anon, authenticated;
