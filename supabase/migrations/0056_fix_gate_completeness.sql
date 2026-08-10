-- The "gate awaiting approval" rule was wrong, and wrong in the direction that cries wolf.
--
-- coop_checklist_items holds a row only for an item somebody actually answered. The test was
-- "no row is unanswered", which is trivially true for a gate where almost nothing has been
-- answered at all: one item marked N/A out of eighteen read as finished. Two of the three notices
-- it sent were false — gate6 had 1 row of 18, gate5 had 1 of 19. Only לול 1 / gate1 was genuine.
--
-- To know a gate is finished, the database has to know how many items it should have. The list
-- lives in TypeScript (GATES in src/defects/model.ts) with per-item overrides in
-- defect_item_overrides, so the base numbers and names are mirrored here, and a test fails if the
-- two ever drift — the same arrangement as perm_defaults.

create table if not exists gate_items (
  gate    text not null check (gate in ('pre_pour','gate1','gate2','gate3','gate4','gate5','gate6')),
  item_no int  not null,
  label   text,
  primary key (gate, item_no)
);
alter table gate_items enable row level security;
-- No policy: only the definer functions below read it.

insert into gate_items (gate, item_no)
select g.gate, i
from (values ('pre_pour', 7), ('gate1', 10), ('gate2', 10), ('gate3', 9),
             ('gate4', 10), ('gate5', 19), ('gate6', 18)) as g(gate, n),
     generate_series(1, g.n) as i
on conflict do nothing;

update gate_items set label = v.label
from (values
  ('pre_pour', 'טרום יציקה'),
  ('gate1', 'שער 1'), ('gate2', 'שער 2'), ('gate3', 'שער 3'),
  ('gate4', 'שער 4'), ('gate5', 'שער 5'), ('gate6', 'שער 6')
) as v(gate, label)
where gate_items.gate = v.gate;

comment on table gate_items is
  'Base checklist item numbers and gate names, mirroring GATES in src/defects/model.ts. Needed because coop_checklist_items records only answered items, so absence means unanswered, not complete.';

create or replace function gate_label(p_gate text)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(max(label), p_gate) from gate_items where gate = p_gate;
$$;

create or replace function expected_gate_items(p_gate text)
returns setof int
language sql stable security definer set search_path = public as $$
  -- base items the admin has not switched off ...
  select gi.item_no
  from gate_items gi
  left join defect_item_overrides o on o.gate = gi.gate and o.item_no = gi.item_no
  where gi.gate = p_gate and coalesce(o.active, true)
  union
  -- ... plus any the admin added
  select o.item_no
  from defect_item_overrides o
  where o.gate = p_gate and o.is_custom and o.active;
$$;

create or replace function gate_approval_notify()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select co.id as coop_id, co.name as coop_name, co.project_id,
           p.name as project_name, g.gate,
           (select count(*) from expected_gate_items(g.gate)) as expected,
           (select count(*) from coop_checklist_items ci
             where ci.coop_id = co.id and ci.gate = g.gate
               and ci.status in ('done', 'na')
               and ci.item_no in (select expected_gate_items(g.gate))) as answered,
           (select count(*) from coop_signatures s
             where s.coop_id = co.id and s.gate = g.gate) as signatures
    from coops co
    join projects p on p.id = co.project_id
    cross join (select distinct gate from gate_items) g
  loop
    -- Finished means every expected item is answered — 'done' or 'na', because marking an item
    -- not-applicable is a decision, not an omission.
    continue when r.expected = 0 or r.answered < r.expected;
    continue when r.signatures >= 2;
    continue when exists (
      select 1 from gate_approval_notices ga
      where ga.coop_id = r.coop_id and ga.gate = r.gate);

    insert into notifications (recipient_email, title, body, link)
    select pne.email,
           'ממתין לאישור — ' || r.project_name,
           'לול ' || r.coop_name || ' · ' || gate_label(r.gate)
             || ' · הושלם וממתין לחתימות (' || r.signatures::text || ' מתוך 2)',
           -- carries the gate, so pressing the notification opens what is waiting rather than the
           -- house and a hunt through seven tabs
           '/defects/coop/' || r.coop_id || '?gate=' || r.gate
    from project_notify_emails(r.project_id) pne
    where pne.is_manager;   -- approval is a manager's act, so only they are asked for it

    insert into gate_approval_notices (coop_id, gate) values (r.coop_id, r.gate)
      on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function gate_label(text) from public;
revoke all on function expected_gate_items(text) from public;
revoke all on function gate_approval_notify() from public;
revoke execute on function gate_label(text) from anon, authenticated;
revoke execute on function expected_gate_items(text) from anon, authenticated;
revoke execute on function gate_approval_notify() from anon, authenticated;
