-- ניהול ליקויים — stage-gate QC module (one coop = one workbook instance).
-- Enum-ish values stored as canonical text ids; Hebrew labels live in app code.

create table if not exists coops (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  name               text not null,
  coop_type          text check (coop_type in ('broiler','layer','breeder')),
  farm_coop_count    int,
  equipment_supplier text,
  has_heating        boolean not null default true,
  has_cooling_pads   boolean not null default true,
  has_tunnel_shutter boolean not null default true,
  execution_manager  text,
  field_supervisor   text,
  opened_on          date,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

create table if not exists coop_responsibilities (
  coop_id      uuid not null references coops(id) on delete cascade,
  domain_key   text not null,
  responsible  text check (responsible in ('agrotop','customer','external')),
  external_who text,
  notes        text,
  primary key (coop_id, domain_key)
);

create table if not exists coop_checklist_items (
  coop_id     uuid not null references coops(id) on delete cascade,
  gate        text not null check (gate in ('pre_pour','gate1','gate2','gate3','gate4','gate5','gate6')),
  item_no     int  not null,
  status      text check (status in ('done','not_done','na')),
  severity    text check (severity in ('critical','major','minor')),
  note        text,
  external_by text,
  auto_na_reason text,
  updated_at  timestamptz not null default now(),
  primary key (coop_id, gate, item_no)
);

create table if not exists coop_defects (
  id           uuid primary key default gen_random_uuid(),
  coop_id      uuid not null references coops(id) on delete cascade,
  seq          int  not null,
  gate         text not null check (gate in ('pre_pour','gate1','gate2','gate3','gate4','gate5','gate6')),
  item_no      int,
  description  text,
  severity     text check (severity in ('critical','major','minor')),
  assignee     text,
  due_date     date,
  status       text not null default 'open' check (status in ('open','closed')),
  closed_on    date,
  closure_note text,
  created_at   timestamptz not null default now(),
  unique (coop_id, seq)
);

create table if not exists coop_signatures (
  coop_id        uuid not null references coops(id) on delete cascade,
  gate           text not null check (gate in ('pre_pour','gate1','gate2','gate3','gate4','gate5','gate6')),
  role           text not null check (role in ('manager','supervisor')),
  signer_name    text not null,
  signature_path text not null,
  signed_at      timestamptz not null default now(),
  primary key (coop_id, gate, role)
);

create table if not exists coop_concessions (
  id                        uuid primary key default gen_random_uuid(),
  coop_id                   uuid not null references coops(id) on delete cascade,
  gate                      text not null,
  defect_id                 uuid not null references coop_defects(id) on delete cascade,
  reason                    text,
  manager_name              text not null,
  manager_signature_path    text not null,
  supervisor_name           text not null,
  supervisor_signature_path text not null,
  signed_at                 timestamptz not null default now(),
  unique (defect_id)
);

-- RLS: same convention as entries — any authenticated user reads/writes.
alter table coops                 enable row level security;
alter table coop_responsibilities enable row level security;
alter table coop_checklist_items  enable row level security;
alter table coop_defects          enable row level security;
alter table coop_signatures       enable row level security;
alter table coop_concessions      enable row level security;

create policy rw_coops on coops for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_coop_resp on coop_responsibilities for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_coop_items on coop_checklist_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_coop_defects on coop_defects for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_coop_signatures on coop_signatures for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy rw_coop_concessions on coop_concessions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
