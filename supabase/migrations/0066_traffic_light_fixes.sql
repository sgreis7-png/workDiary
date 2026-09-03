-- דוח רמזור — תיקוני סקירה סופית (4 פריטים שנותרו פתוחים מתוך תשעה).
--
-- 0064 ו-0065 נשארים ללא שינוי: הגרסאות שכבר הוחלו על מסד הנתונים המתארח אסור
-- לערוך; כל תיקון כאן מוחלף בעזרת create or replace function / drop+create policy,
-- כלומר מחליף אובייקטים שממילא ניתן להחליף במיגרציה מאוחרת יותר.

-- ---------- 1. tl_time / tl_crew: guard numeric casts on empty strings ----------
-- '' ::numeric raises (null does not); one bad diary row used to blank every project.
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
    select avg(nullif(r ->> 'pct','')::numeric) into cat_pct
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
revoke all on function tl_time(projects, traffic_light_settings, date) from public;
revoke execute on function tl_time(projects, traffic_light_settings, date) from anon, authenticated;

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
             coalesce(sum(nullif(r ->> 'workers','')::numeric), 0) as workers
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
revoke all on function tl_crew(projects, traffic_light_settings, date) from public;
revoke execute on function tl_crew(projects, traffic_light_settings, date) from anon, authenticated;

-- ---------- traffic_light: isolate a failing project instead of aborting the report ----------
-- Same key set as a normal element (color/gray_reason/axes/due/last_entry_on/gantt_imported_at/
-- action_line) so the client's types still hold for a gray "computation failed" row.
create or replace function traffic_light(p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s traffic_light_settings%rowtype;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  res jsonb := '[]'::jsonb;
  p projects%rowtype;
  proj_res jsonb;
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
    begin
      proj_res := tl_project(p, s, today);
    exception when others then
      proj_res := jsonb_build_object(
        'project_id', p.id, 'name', p.name, 'manager', p.pmo, 'project_type', coalesce(p.project_type, 'coop'),
        'color', 'gray', 'gray_reason', 'שגיאה בחישוב הרמזור לפרויקט: ' || sqlerrm,
        'axes', jsonb_build_object(
          'time', '{}'::jsonb, 'supply', '{}'::jsonb, 'client', '{}'::jsonb, 'crew', '{}'::jsonb, 'issues', '{}'::jsonb),
        'due', jsonb_build_object('contract', null, 'forecast', null, 'delta_days', null),
        'last_entry_on', null, 'gantt_imported_at', null,
        'action_line', 'שגיאה בחישוב הרמזור לפרויקט: ' || sqlerrm);
    end;
    res := res || proj_res;
  end loop;
  return res;
end $$;

revoke all on function traffic_light(uuid) from public;
grant execute on function traffic_light(uuid) to authenticated;

-- ---------- 2. issues_assign_seq: serialise concurrent numbering ----------
-- Two concurrent diary saves on one project used to race max(seq)+1 and collide on the
-- unique (project_id, seq) constraint; the calling trigger swallows that into a warning,
-- so the entry saved and the issue was silently never registered.
create or replace function issues_assign_seq() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.project_id::text));
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq from issues where project_id = new.project_id;
  end if;
  return new;
end $$;

-- ---------- 3. project_deliveries: split the write policy ----------
-- A purchasing user holding only `deliveries` could delete supply rows outright under the
-- single `for all` policy; delete now requires traffic_light.
drop policy if exists write_project_deliveries on project_deliveries;
drop policy if exists select_project_deliveries on project_deliveries;
drop policy if exists insert_project_deliveries on project_deliveries;
drop policy if exists update_project_deliveries on project_deliveries;
drop policy if exists delete_project_deliveries on project_deliveries;

create policy select_project_deliveries on project_deliveries for select using (is_member());
create policy insert_project_deliveries on project_deliveries for insert
  with check (is_admin() or can_edit('traffic_light') or can_edit('deliveries'));
create policy update_project_deliveries on project_deliveries for update
  using (is_admin() or can_edit('traffic_light') or can_edit('deliveries'))
  with check (is_admin() or can_edit('traffic_light') or can_edit('deliveries'));
create policy delete_project_deliveries on project_deliveries for delete
  using (is_admin() or can_edit('traffic_light'));

-- ---------- 4. work_tasks.source: land the missing check constraint ----------
-- `add column if not exists ... check (...)` in 0064 skips the whole statement — check
-- included — on a database where the column already exists, so the constraint never lands.
-- Guarded so this is safe whether or not 0064 already created it.
do $$ begin
  alter table work_tasks add constraint work_tasks_source_check check (source in ('manual', 'traffic_light'));
exception when duplicate_object then null;
end $$;
