-- Admin-editable overrides for the stage-gate checklist items.
-- Base items live in app code (src/defects/model.ts); a row here overrides one item:
--   text     — replacement wording (null = keep the built-in text)
--   active   — false hides the item from new/existing coops
--   is_custom — true for admin-added items (item_no above the built-in range)
create table if not exists defect_item_overrides (
  gate      text not null check (gate in ('pre_pour','gate1','gate2','gate3','gate4','gate5','gate6')),
  item_no   int  not null,
  text      text,
  active    boolean not null default true,
  is_custom boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (gate, item_no)
);

alter table defect_item_overrides enable row level security;
create policy read_defect_overrides on defect_item_overrides for select
  using (auth.role() = 'authenticated');
create policy admin_write_defect_overrides on defect_item_overrides for all
  using (is_admin()) with check (is_admin());
