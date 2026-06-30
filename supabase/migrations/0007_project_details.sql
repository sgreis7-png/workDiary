-- Richer project metadata that admins fill in on create/edit.
alter table projects add column if not exists location   text;
alter table projects add column if not exists budget     numeric;
alter table projects add column if not exists pmo        text;   -- PMO / manager in charge
alter table projects add column if not exists start_date date;
alter table projects add column if not exists end_date   date;
alter table projects add column if not exists staff      text;
alter table projects add column if not exists notes      text;
