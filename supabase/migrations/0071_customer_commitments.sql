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
