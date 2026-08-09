-- Schedules are for admins and managers, not every member.
--
-- 0043 let any active member read gantt_* — the same rule projects and coops use. The
-- schedule carries contract payment milestones and delivery dates, so it belongs with
-- `dashboard`: admins by default, plus whoever is explicitly granted the area.
--
-- Hiding the nav item would not have been enough. The browser talks to PostgREST
-- directly, so a member who knew the table names could still have read every row.

create or replace function can_read_gantt() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or has_perm('gantt', 'view') or has_perm('gantt', 'edit');
$$;

revoke all on function can_read_gantt() from public;
grant execute on function can_read_gantt() to authenticated;

drop policy if exists read_gantt_charts on gantt_charts;
create policy read_gantt_charts on gantt_charts for select using (can_read_gantt());

drop policy if exists read_gantt_tasks on gantt_tasks;
create policy read_gantt_tasks on gantt_tasks for select using (can_read_gantt());

drop policy if exists read_gantt_links on gantt_links;
create policy read_gantt_links on gantt_links for select using (can_read_gantt());

-- The source .mpp lands in the photos bucket under imports/. Reading there is governed
-- by "photos read scoped" (0030), which admits any member; narrow it for this prefix the
-- same way 0043 narrowed inserts — a restrictive policy is AND'd on top of the
-- permissive one, and is a no-op for every other path.
drop policy if exists "imports read gated" on storage.objects;
create policy "imports read gated" on storage.objects
  as restrictive for select
  using (
    bucket_id <> 'photos'
    or name not like 'imports/%'
    or can_read_gantt()
  );
