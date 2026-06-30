-- Server-side dashboard aggregation so the client doesn't fetch every entry.
create or replace function dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', (select count(*) from entries),
    'this_week', (select count(*) from entries where work_date >= (current_date - 7)),
    'by_project', (select coalesce(json_object_agg(project_id, c), '{}'::json)
                   from (select project_id, count(*) c from entries group by project_id) t),
    'latest_by_project', (select coalesce(json_object_agg(project_id, last), '{}'::json)
                   from (select project_id, max(work_date)::text last from entries group by project_id) t),
    'by_worker', (select coalesce(json_object_agg(created_by, c), '{}'::json)
                   from (select created_by, count(*) c from entries group by created_by) t),
    'by_weather', (select coalesce(json_object_agg(w, c), '{}'::json)
                   from (select values->>'weather' w, count(*) c from entries
                         where coalesce(values->>'weather', '') <> '' group by values->>'weather') t)
  );
$$;
grant execute on function dashboard_stats() to authenticated;
