-- Tighten distribution-list access: previously ANY authenticated user could read,
-- edit, or delete every list/recipient. Restrict to the owner (or an admin).
drop policy if exists rw_lists on distribution_lists;
create policy rw_own_lists on distribution_lists for all
  using (owner = auth.uid() or is_admin())
  with check (owner = auth.uid() or is_admin());

drop policy if exists rw_recipients on list_recipients;
create policy rw_own_recipients on list_recipients for all
  using (exists (select 1 from distribution_lists l where l.id = list_id and (l.owner = auth.uid() or is_admin())))
  with check (exists (select 1 from distribution_lists l where l.id = list_id and (l.owner = auth.uid() or is_admin())));
