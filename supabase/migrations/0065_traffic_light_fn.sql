-- דוח רמזור — המנוע. פונקציה אחת, traffic_light(), היא מקור האמת לצבע: המסך החי
-- קורא לה, וגם הסנאפשוט השבועי. הספים נקראים מ-traffic_light_settings; הכללים
-- משוכפלים ב-src/traffic/rules.ts לבדיקות יחידה בלבד.

-- ---------- helpers ----------

-- same as normName() in src/traffic/wbs.ts
create or replace function tl_norm(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[׳״''"]', '', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function tl_rank(p_color text) returns int
language sql immutable as $$
  select case p_color when 'gray' then 4 when 'red' then 3 when 'amber' then 2 when 'green' then 1 else 0 end;
$$;

create or replace function tl_worst(p_colors text[]) returns text
language sql immutable as $$
  select coalesce((select c from unnest(p_colors) c order by tl_rank(c) desc limit 1), 'na');
$$;

-- A values key the client stored as a JSON string; malformed content degrades to an
-- empty array rather than aborting the whole report.
create or replace function tl_json_array(p jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if p is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p) = 'array' then return p; end if;
  if jsonb_typeof(p) = 'string' then return (p #>> '{}')::jsonb; end if;
  return '[]'::jsonb;
exception when others then
  return '[]'::jsonb;
end $$;

-- ---------- gray: no diary in the last N work days, or stale / missing gantt ----------
create or replace function tl_gray(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  d date := today - 1;
  n_workdays int := 0;
  guard int := 0;
  has_entry boolean := false;
  last_entry date;
  chart_imported timestamptz;
  age int;
begin
  select max(e.work_date) into last_entry from entries e where e.project_id = p.id;
  -- walk back over the project's work days (default Sun-Fri) until N are collected;
  -- today is checked separately below, so the window is today plus the N preceding work days
  while n_workdays < s.gray_missing_workdays and guard < 60 loop
    if extract(dow from d)::int = any (coalesce(p.work_days, '{0,1,2,3,4,5}'::int[])) then
      n_workdays := n_workdays + 1;
      if exists (select 1 from entries e where e.project_id = p.id and e.work_date = d) then has_entry := true; end if;
    end if;
    d := d - 1; guard := guard + 1;
  end loop;
  -- an entry filed today also counts as reporting
  if exists (select 1 from entries e where e.project_id = p.id and e.work_date = today) then has_entry := true; end if;

  select c.imported_at into chart_imported
    from gantt_charts c where c.project_id = p.id and c.active order by c.imported_at desc limit 1;
  age := case when chart_imported is null then null else (today - (chart_imported at time zone 'Asia/Jerusalem')::date) end;

  return jsonb_build_object(
    'last_entry_on', last_entry,
    'gantt_imported_at', chart_imported,
    'reason', case
      when not has_entry then 'לא התקבל יומן עבודה ב-' || s.gray_missing_workdays || ' ימי העבודה האחרונים'
      when age is null then 'אין גאנט פעיל לפרויקט'
      when age > s.gray_gantt_days then 'הגאנט לא עודכן ' || age || ' ימים (מעל ' || s.gray_gantt_days || ')'
      else null end);
end $$;

-- ---------- time: forecast vs contract + category table ----------
create or replace function tl_time(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  chart_id uuid;
  forecast date;
  delta int;
  colors text[] := '{}';
  cats jsonb := '[]'::jsonb;
  unmatched text[] := '{}';
  latest jsonb;
  t record;
  g_start date; g_finish date; g_base_start date; g_base_finish date; g_pct int;
  cat_pct numeric;
  cat_color text;
  blocked_seq int; blocked_due date;
  reason text;
  extra text;
begin
  select c.id into chart_id from gantt_charts c where c.project_id = p.id and c.active order by c.imported_at desc limit 1;
  if chart_id is not null then
    select gt.finish_ts::date into forecast from gantt_tasks gt
      where gt.chart_id = tl_time.chart_id and gt.milestone and gt.name like '%מסירה סופית%'
      order by gt.finish_ts desc limit 1;
    if forecast is null then
      select max(gt.finish_ts)::date into forecast from gantt_tasks gt where gt.chart_id = tl_time.chart_id;
    end if;
  end if;
  delta := case when forecast is null or p.contract_due_date is null then null else forecast - p.contract_due_date end;

  -- project level (spec 4.1)
  if p.contract_due_date is null then
    colors := colors || 'red'; reason := 'אין תאריך מסירה חוזי במערכת';
  elsif p.contract_due_date < today then
    colors := colors || 'red'; reason := 'תאריך המסירה החוזי חלף (' || to_char(p.contract_due_date, 'DD.MM.YYYY') || ')';
  elsif delta is null then
    colors := colors || 'amber'; reason := 'אין תאריך סיום חזוי בגאנט';
  elsif delta <= s.time_amber_days then
    colors := colors || 'green'; reason := 'סיום חזוי ' || case when delta >= 0 then '+' else '' end || delta || ' ימים מול החוזי';
  elsif delta <= s.time_red_days then
    colors := colors || 'amber'; reason := 'סיום חזוי +' || delta || ' ימים אחרי התאריך החוזי';
  else
    colors := colors || 'red'; reason := 'סיום חזוי +' || delta || ' ימים אחרי התאריך החוזי';
  end if;

  -- latest diary entry: category pct = mean over coops of matching rows
  select e.values into latest from entries e where e.project_id = p.id order by e.work_date desc, e.created_at desc limit 1;

  for t in select * from wbs_templates w where w.project_type = coalesce(p.project_type, 'coop') and w.active order by w.sort_order loop
    select gt.start_ts::date, gt.finish_ts::date, gt.base_start_ts::date, gt.base_finish_ts::date, gt.pct
      into g_start, g_finish, g_base_start, g_base_finish, g_pct
      from gantt_tasks gt
     where gt.chart_id = tl_time.chart_id and gt.is_summary and tl_norm(gt.name) = tl_norm(t.name_he)
     order by gt.sort_order limit 1;
    if chart_id is not null and g_start is null then unmatched := unmatched || t.name_he; end if;

    -- diary pct: rows whose task maps to this template row (direct name or legacy map)
    select avg((r ->> 'pct')::numeric) into cat_pct
      from jsonb_array_elements(tl_json_array(latest -> 'progress_coops')) c
      cross join lateral jsonb_array_elements(coalesce(c -> 'rows', '[]'::jsonb)) r
     where tl_norm(r ->> 'task') in (tl_norm(t.name_he), tl_norm(t.name_en))
        or exists (select 1 from wbs_legacy_names ln
                    where ln.project_type = t.project_type and ln.template_sort = t.sort_order
                      and tl_norm(ln.legacy_name) = tl_norm(r ->> 'task'));

    select i.due_date, i.seq into blocked_due, blocked_seq from issues i
     where i.project_id = p.id and i.closed_on is null and i.blocking and i.wbs_template_id = t.id
     order by i.due_date nulls first limit 1;

    cat_color := 'green';
    if g_finish is not null and g_finish < today and coalesce(cat_pct, g_pct, 0) < 100 then cat_color := 'amber'; end if;
    if t.critical and g_start is not null and g_base_start is not null and g_start > g_base_start then cat_color := 'amber'; end if;
    if t.critical and blocked_seq is not null
       and (blocked_due is null or blocked_due > today + s.issue_block_resolve_days) then cat_color := 'red'; end if;
    if g_start is not null then colors := colors || cat_color; end if;

    cats := cats || jsonb_build_object(
      'template_id', t.id, 'sort_order', t.sort_order, 'name_he', t.name_he, 'name_en', t.name_en, 'critical', t.critical,
      'matched', g_start is not null,
      'start', g_start, 'finish', g_finish, 'base_start', g_base_start, 'base_finish', g_base_finish,
      'gantt_pct', g_pct, 'diary_pct', round(cat_pct), 'blocked_issue', blocked_seq, 'color', cat_color);
  end loop;

  if tl_worst(colors) <> tl_worst(array[colors[1]]) then
    select string_agg(x ->> 'name_he', ', ') into extra
      from jsonb_array_elements(cats) x where x ->> 'color' = tl_worst(colors);
    reason := reason || coalesce(' · ' || extra, '');
  end if;

  return jsonb_build_object(
    'color', tl_worst(colors), 'reason', reason,
    'contract', p.contract_due_date, 'forecast', forecast, 'delta_days', delta,
    'evidence', jsonb_build_object('categories', cats, 'unmatched', to_jsonb(unmatched), 'has_chart', chart_id is not null));
end $$;

-- ---------- supply: items inside the lookahead window ----------
create or replace function tl_supply(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  n_all int;
  items jsonb;
  colors text[];
  worst text;
begin
  select count(*) into n_all from project_deliveries d where d.project_id = p.id;
  if n_all = 0 then
    return jsonb_build_object('color', 'na', 'reason', 'לא הוגדרה רשימת אספקות', 'missing_data', true, 'evidence', '{"items":[]}'::jsonb);
  end if;

  with w as (
    select d.*, coalesce(tpl.critical, false) as critical,
           case
             when d.status = 'on_site' then 'green'
             when d.status = 'not_ordered' then case when d.need_date <= today + s.supply_red_window_days then 'red' else 'amber' end
             when d.eta is null then 'amber'
             when d.eta > d.need_date then case when coalesce(tpl.critical, false) then 'red' else 'amber' end
             when d.need_date - d.eta >= s.supply_eta_margin_days then 'green'
             else 'amber' end as color
      from project_deliveries d
      left join wbs_templates tpl on tpl.id = d.wbs_template_id
     where d.project_id = p.id and d.status <> 'on_site' and d.need_date <= today + s.lookahead_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'item', w.item, 'need_date', w.need_date, 'status', w.status, 'eta', w.eta,
           'gap_days', case when w.eta is null then null else w.eta - w.need_date end,
           'critical', w.critical, 'color', w.color) order by w.need_date), '[]'::jsonb),
         coalesce(array_agg(w.color), '{}'::text[])
    into items, colors
    from w;

  worst := tl_worst(colors);
  if worst = 'na' then worst := 'green'; end if;
  return jsonb_build_object(
    'color', worst,
    'reason', case worst
      when 'green' then 'כל האספקות ל-' || (s.lookahead_days / 7) || ' השבועות הקרובים באתר או עם ETA מאושר'
      else (select count(*) from jsonb_array_elements(items) x where x ->> 'color' = worst) || ' פריטים ' ||
           case worst when 'red' then 'לא הוזמנו / ETA אחרי הצורך בקטגוריה קריטית' else 'ללא ETA או עם ETA אחרי תאריך הצורך' end end,
    'evidence', jsonb_build_object('items', items));
end $$;

-- ---------- crew: agreed vs reported headcount over the window ----------
create or replace function tl_crew(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  rows_json jsonb := '[]'::jsonb;
  colors text[] := '{}';
  c record;
  actual numeric; n_days int; absences int; ratio numeric; color text;
  series jsonb;
begin
  if not exists (select 1 from project_contractors pc where pc.project_id = p.id and pc.active) then
    return jsonb_build_object('color', 'na', 'reason', 'לא הוגדרו קבלנים והיקף מוסכם', 'missing_data', true, 'evidence', '{"contractors":[]}'::jsonb);
  end if;

  for c in select * from project_contractors pc where pc.project_id = p.id and pc.active order by pc.critical desc, pc.name loop
    -- one row per work day that has an entry: workers reported for this contractor (0 = absence)
    with dd as (
      select e.work_date,
             coalesce(sum((r ->> 'workers')::numeric), 0) as workers
        from entries e
        left join lateral jsonb_array_elements(tl_json_array(e.values -> 'crew_rows')) r
          on tl_norm(r ->> 'contractor') = tl_norm(c.name)
       where e.project_id = p.id and e.work_date > today - 28 and e.work_date <= today
       group by e.work_date
    )
    select coalesce(avg(dd.workers) filter (where dd.work_date > today - s.crew_window_days), 0),
           count(*) filter (where dd.work_date > today - s.crew_window_days),
           count(*) filter (where dd.work_date > today - s.crew_window_days and dd.workers = 0),
           coalesce(jsonb_agg(jsonb_build_object('date', dd.work_date, 'workers', dd.workers) order by dd.work_date), '[]'::jsonb)
      into actual, n_days, absences, series
      from dd;

    ratio := case when c.agreed_workers = 0 or n_days = 0 then null else actual / c.agreed_workers end;
    color := 'green';
    if ratio is not null and ratio * 100 < s.crew_green_pct then color := 'amber'; end if;
    if c.critical and absences = 1 then color := tl_worst(array[color, 'amber']); end if;
    if c.critical and ratio is not null and ratio * 100 < s.crew_red_pct then color := 'red'; end if;
    if absences >= 2 then color := 'red'; end if;
    if n_days = 0 then color := 'green'; end if;   -- nothing reported in the window: gray handles that
    colors := colors || color;

    rows_json := rows_json || jsonb_build_object(
      'name', c.name, 'critical', c.critical, 'agreed', c.agreed_workers,
      'actual', round(actual, 1), 'ratio', round(coalesce(ratio, 0), 2), 'days', n_days, 'absences', absences,
      'series', series, 'color', color);
  end loop;

  return jsonb_build_object(
    'color', tl_worst(colors),
    'reason', case tl_worst(colors)
      when 'green' then 'כל הקבלנים לפחות ' || s.crew_green_pct || '% מההיקף המוסכם'
      else (select string_agg(x ->> 'name' || ' ' || round((x ->> 'ratio')::numeric * 100) || '%' ||
                              case when (x ->> 'absences')::int > 0 then ' (' || (x ->> 'absences') || ' ימי היעדרות)' else '' end, ', ')
              from jsonb_array_elements(rows_json) x where x ->> 'color' = tl_worst(colors)) end,
    'evidence', jsonb_build_object('contractors', rows_json));
end $$;

-- ---------- issues: the open register ----------
create or replace function tl_issues(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  items jsonb; colors text[]; worst text;
begin
  with o as (
    select i.*, today - i.opened_on as days_open,
           case when i.blocking or i.systemic then 'red'
                when today - i.opened_on > s.issue_open_days and (i.owner_email is null or i.due_date is null) then 'amber'
                else 'green' end as color
      from issues i where i.project_id = p.id and i.closed_on is null)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'seq', o.seq, 'description', o.description, 'owner_kind', o.owner_kind, 'owner_email', o.owner_email,
           'due_date', o.due_date, 'days_open', o.days_open, 'blocking', o.blocking, 'systemic', o.systemic,
           'entry_id', o.entry_id, 'color', o.color) order by tl_rank(o.color) desc, o.days_open desc), '[]'::jsonb),
         coalesce(array_agg(o.color), '{}'::text[])
    into items, colors from o;
  worst := tl_worst(colors); if worst = 'na' then worst := 'green'; end if;
  return jsonb_build_object(
    'color', worst,
    'reason', case worst
      when 'green' then 'אין בלת"מ פתוח מעל ' || s.issue_open_days || ' ימים ואין חוסם'
      when 'red' then (select string_agg('#' || (x ->> 'seq') || ' ' || left(x ->> 'description', 60) ||
                          case when (x ->> 'systemic')::boolean then ' — בלת"מ מערכתי, משימה להנדסה' else ' — חוסם עבודה' end, ' · ')
                         from jsonb_array_elements(items) x where x ->> 'color' = 'red')
      else (select count(*) from jsonb_array_elements(items) x where x ->> 'color' = 'amber') || ' פריטים פתוחים מעל ' || s.issue_open_days || ' ימים ללא אחראי ותאריך' end,
    'evidence', jsonb_build_object('items', items));
end $$;

-- ---------- one project ----------
create or replace function tl_project(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  gray jsonb := tl_gray(p, s, today);
  t jsonb := tl_time(p, s, today);
  sup jsonb := tl_supply(p, s, today);
  cr jsonb := tl_crew(p, s, today);
  iss jsonb := tl_issues(p, s, today);
  cli jsonb := jsonb_build_object('color', 'na', 'reason', 'שלב ב׳');
  color text;
  action text;
  worst_axis jsonb;
  manager text;
begin
  color := tl_worst(array[t ->> 'color', sup ->> 'color', cr ->> 'color', iss ->> 'color']);
  if color = 'na' then color := 'green'; end if;
  if gray ->> 'reason' is not null then color := 'gray'; end if;

  select x into worst_axis from unnest(array[t, sup, cr, iss]) x order by tl_rank(x ->> 'color') desc limit 1;
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

-- ---------- the RPC ----------
create or replace function traffic_light(p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s traffic_light_settings%rowtype;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  res jsonb := '[]'::jsonb;
  p projects%rowtype;
begin
  -- session_user, not current_user: inside a SECURITY DEFINER function current_user is
  -- the owner (postgres) for every caller, so it can never identify who is asking.
  -- pg_cron runs as the postgres session; the service key sets auth.role() to service_role.
  if not (session_user in ('postgres', 'supabase_admin')
          or coalesce(auth.role(), '') = 'service_role'
          or can_view('traffic_light')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from traffic_light_settings where id = 1;
  for p in select * from projects pr where pr.active and (p_project is null or pr.id = p_project) order by pr.name loop
    res := res || tl_project(p, s, today);
  end loop;
  return res;
end $$;

revoke all on function traffic_light(uuid) from public;
grant execute on function traffic_light(uuid) to authenticated;

revoke all on function tl_norm(text) from public;  grant execute on function tl_norm(text) to authenticated;
revoke all on function tl_rank(text) from public;  grant execute on function tl_rank(text) to authenticated;
revoke all on function tl_worst(text[]) from public; grant execute on function tl_worst(text[]) to authenticated;
revoke all on function tl_json_array(jsonb) from public;
revoke execute on function tl_json_array(jsonb) from anon, authenticated;
revoke all on function tl_gray(projects, traffic_light_settings, date) from public;
revoke execute on function tl_gray(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_time(projects, traffic_light_settings, date) from public;
revoke execute on function tl_time(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_supply(projects, traffic_light_settings, date) from public;
revoke execute on function tl_supply(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_crew(projects, traffic_light_settings, date) from public;
revoke execute on function tl_crew(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_issues(projects, traffic_light_settings, date) from public;
revoke execute on function tl_issues(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_project(projects, traffic_light_settings, date) from public;
revoke execute on function tl_project(projects, traffic_light_settings, date) from anon, authenticated;

-- ---------- weekly snapshot + tasks (Sunday 07:00 Israel ≈ 04:00 UTC) ----------
create or replace function traffic_light_weekly() returns integer
language plpgsql security definer set search_path = public as $$
declare
  p_payload jsonb;
  pr jsonb;
  n int := 0;
  axis_names text[] := array['time', 'supply', 'crew', 'issues'];
  a text; ax_json jsonb; t_title text;
begin
  -- session_user, not current_user (see traffic_light()): security definer hides the caller.
  if not (session_user in ('postgres', 'supabase_admin')
          or coalesce(auth.role(), '') = 'service_role') then return 0; end if;
  p_payload := traffic_light(null);
  insert into traffic_light_snapshots (payload) values (p_payload);

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
          when coalesce((ax_json ->> 'missing_data')::boolean, false) then 'להשלים נתונים: ' || case a when 'crew' then 'קבלנים והיקף מוסכם' when 'supply' then 'רשימת אספקות' else a end
          else 'רמזור · ' || case a when 'time' then 'זמן' when 'supply' then 'הספקות' when 'crew' then 'כוח אדם' else 'בלת"מ' end || ' · ' || left(coalesce(ax_json ->> 'reason', ''), 180) end;
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
  return n;
end $$;
revoke all on function traffic_light_weekly() from public;
revoke execute on function traffic_light_weekly() from anon, authenticated;
grant execute on function traffic_light_weekly() to service_role, postgres;

select cron.schedule('traffic-light-weekly', '0 4 * * 0', $$select traffic_light_weekly()$$)
where not exists (select 1 from cron.job where jobname = 'traffic-light-weekly');
