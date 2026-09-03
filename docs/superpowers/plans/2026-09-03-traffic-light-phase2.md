# Traffic Light Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the traffic-light report its fifth axis — customer commitments, with the written delay notice tracked as data — and send the whole report by mail automatically every Sunday morning.

**Architecture:** A new `customer_commitments` table feeds `tl_client()`, which replaces the phase-1 stub that always returned "not measured"; the board and drill-down pick it up with no client change beyond a new evidence table and an editable screen. The Sunday job gains a final step: a `pg_net` POST to a new `weekly-report` edge function, authenticated by a shared secret in Supabase Vault, which renders Hebrew HTML from the snapshot and sends it through Resend.

**Tech Stack:** Postgres (plpgsql, RLS, pg_cron, pg_net, vault), Supabase Edge Functions (Deno), React 18 + TypeScript + Vite, vitest.

Spec: `docs/superpowers/specs/2026-09-03-traffic-light-phase2-design.md`.

## Global Constraints

- **Migrations 0064-0070 are applied to the live project `fndoytitumlclapnjhnm` and must never be edited.** A repository hook enforces this. New work goes in `0071` and `0072`; anything that changes an existing function or policy re-emits it with `create or replace` / `drop policy if exists` from the new file.
- Two plpgsql shapes broke phase 1 on first contact with real data. Never write either: a local variable qualified with the function's own name (`tl_client.foo` — the implicit label covers parameters only, not `DECLARE`d variables), and a bare literal appended to a `text[]` (`colors || 'red'` parses `'red'` as an array literal — write `colors || 'red'::text`). Name locals so they cannot collide with a column of any table the function queries.
- Severity order stays `gray > red > amber > green > na`; project colour is the worst axis; `na` never raises a colour; gray overrides everything. Thresholds are read from `traffic_light_settings` at runtime, never hardcoded.
- Every user-facing string is bilingual `{ he, en }` and lives in `src/traffic/i18n.ts`; `src/i18n.test.ts` enforces both languages non-empty with no Hebrew left inside an English value.
- Security-definer functions: `set search_path = public`, `revoke all … from public`, and `revoke execute … from anon, authenticated` for internal helpers. Client-callable functions are granted to `authenticated` only.
- Secrets never appear in migration text or in the repository. The mail secret lives in `vault`; Resend credentials stay in the edge function's environment.
- Timezone for "today" in SQL: `(now() at time zone 'Asia/Jerusalem')::date`.
- Run `npm test`, `npx tsc --noEmit`, `npm run build` and `npx eslint src --max-warnings 999` (zero errors) before every commit. Commit messages end with the session's Co-Authored-By and Claude-Session trailers.
- Applying a migration to the live project is part of the task that writes it. Never call a SQL task finished on static reading alone — phase 1 proved that reading is not verification.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0071_customer_commitments.sql` | table, RLS, `client_window_days`, `tl_client()`, `tl_project()` re-emitted |
| `supabase/migrations/0072_weekly_report_mail.sql` | pg_net, vault secret, `extra_report_emails`, `report_mail_log`, `traffic_light_weekly()` re-emitted |
| `supabase/functions/weekly-report/index.ts` | secret check, snapshot read, Resend send |
| `supabase/functions/weekly-report/render.ts` | pure HTML renderer (unit-tested) |
| `src/traffic/model.ts` | `Settings` gains `client_window_days`; commitment types |
| `src/traffic/rules.ts` | `clientColor()` — the TS mirror |
| `src/traffic/rules.test.ts` | its boundary tests |
| `src/traffic/api.ts` | commitments CRUD, mail-log read |
| `src/traffic/i18n.ts` | new strings |
| `src/screens/traffic/Customer.tsx` | the editable commitments screen |
| `src/screens/traffic/TrafficProject.tsx` | client block gains its evidence table |
| `src/screens/traffic/TrafficSettings.tsx` | new threshold, extra recipients, last-send status |
| `src/App.tsx`, `src/screens/traffic/Deliveries.tsx` | route; link from the supply screen's sibling nav |
| `supabase/functions/weekly-report/render.test.ts` | renderer tests (run by the root vitest) |

---

### Task 1: Customer commitments — schema, RLS, threshold

**Files:**
- Create: `supabase/migrations/0071_customer_commitments.sql` (sections 1-2 only; Task 2 appends the function)

**Interfaces:**
- Produces table `customer_commitments` and column `traffic_light_settings.client_window_days` (int, default 14), both read by Task 2's `tl_client()` and Task 4's API layer.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it to the live project**

Use the Supabase MCP `apply_migration` on project `fndoytitumlclapnjhnm` (name `customer_commitments`). The account also holds `hlwmwxafdaljvzjghuiw` ("Matalot") — never touch it.

- [ ] **Step 3: Verify against the live database**

Run with `execute_sql` and confirm each:

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'customer_commitments' order by ordinal_position;
select client_window_days from traffic_light_settings where id = 1;   -- 14
select polname from pg_policies where tablename = 'customer_commitments';  -- 4 rows
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0071_customer_commitments.sql
git commit -m "feat(traffic): customer commitments table, policies and window threshold"
```

---

### Task 2: `tl_client()` — the fifth axis in SQL

**Files:**
- Modify: `supabase/migrations/0071_customer_commitments.sql` (append section 3)

**Interfaces:**
- Consumes the table and threshold from Task 1.
- Produces `tl_client(p projects, s traffic_light_settings, today date) returns jsonb` with the same envelope as its four siblings: `{color, reason, missing_data?, evidence: {items: [...]}}`; and a re-emitted `tl_project()` that calls it instead of the phase-1 stub.

Read `supabase/migrations/0065_traffic_light_fn.sql` for `tl_issues()` (the closest sibling in shape) and for the current `tl_project()` body you are re-emitting.

- [ ] **Step 1: Append the function**

```sql
-- ---------- 3. the client axis ----------
--
-- ירוק: אין התחייבות פתוחה שמועדה בחלון, או שכולן אושרו בכתב.
-- כתום: התחייבות שמועדה בחלון ואין אישור שהיא בדרך.
-- אדום: המועד חלף, לא בוצעה, והיא חוסמת עבודה שלנו.
-- כלל ההודעה: כשאדום ואין הודעה כתובה מהשבוע האחרון — זו הסיבה, וזו כותרת המשימה.
create or replace function tl_client(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_items jsonb;
  v_colors text[];
  v_worst text;
  v_total int;
  v_red_no_notice int;
  v_red_notice_on date;
begin
  select count(*) into v_total from customer_commitments c where c.project_id = p.id;
  if v_total = 0 then
    return jsonb_build_object(
      'color', 'na', 'reason', 'לא הוזנו התחייבויות לקוח', 'missing_data', true,
      'evidence', jsonb_build_object('items', '[]'::jsonb));
  end if;

  with w as (
    select c.*,
           (today - c.due_date) as days_late,
           case
             when c.due_date < today and c.status <> 'done' and c.blocking then 'red'
             when c.status = 'open' and c.due_date <= today + s.client_window_days then 'amber'
             else 'green' end as color
      from customer_commitments c
     where c.project_id = p.id
       and c.status <> 'done'
       and (c.due_date <= today + s.client_window_days or c.due_date < today)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'item', w.item, 'kind', w.kind, 'due_date', w.due_date,
           'status', w.status, 'confirmation_ref', w.confirmation_ref,
           'blocking', w.blocking, 'days_late', greatest(w.days_late, 0),
           'notice_sent_on', w.notice_sent_on, 'notice_ref', w.notice_ref,
           'color', w.color) order by tl_rank(w.color) desc, w.due_date), '[]'::jsonb),
         coalesce(array_agg(w.color), '{}'::text[]),
         count(*) filter (where w.color = 'red'
                            and (w.notice_sent_on is null or w.notice_sent_on < today - 7)),
         max(w.notice_sent_on) filter (where w.color = 'red')
    into v_items, v_colors, v_red_no_notice, v_red_notice_on
    from w;

  v_worst := tl_worst(v_colors);
  if v_worst = 'na' then v_worst := 'green'; end if;

  return jsonb_build_object(
    'color', v_worst,
    'reason', case v_worst
      when 'green' then 'אין התחייבות לקוח פתוחה שמועדה ב-' || s.client_window_days || ' הימים הקרובים'
      when 'amber' then (select count(*) from jsonb_array_elements(v_items) x where x ->> 'color' = 'amber')
                        || ' התחייבויות לקוח מועדן קרוב ואין אישור בכתב'
      else case when v_red_no_notice > 0
                then 'התחייבות לקוח חלפה וחוסמת עבודה — נדרשת הודעה כתובה ללקוח'
                else 'התחייבות לקוח חלפה וחוסמת עבודה — הודעה נשלחה ב-'
                     || to_char(v_red_notice_on, 'DD.MM.YYYY') end end,
    'evidence', jsonb_build_object('items', v_items));
end $$;

revoke all on function tl_client(projects, traffic_light_settings, date) from public;
revoke execute on function tl_client(projects, traffic_light_settings, date) from anon, authenticated;
```

- [ ] **Step 2: Re-emit `tl_project()` so it calls the new function**

Copy the current body from `0065` (lines 303-338) verbatim into `0071`, changing exactly two things: the `cli` declaration becomes `cli jsonb := tl_client(p, s, today);`, and both places that list the axes for the worst-of computation include it —

```sql
  color := tl_worst(array[t ->> 'color', sup ->> 'color', cli ->> 'color', cr ->> 'color', iss ->> 'color']);
  …
  select x into worst_axis from unnest(array[t, sup, cli, cr, iss]) x order by tl_rank(x ->> 'color') desc limit 1;
```

Everything else — the gray override, the `na → green` collapse, the `manager` lookup, the returned object — stays byte-identical. Re-emit the function's `revoke`/`grant` lines after it, matching `0065`.

- [ ] **Step 3: Apply and verify on the live database**

Apply as `customer_axis`. Then, with `execute_sql`:

```sql
select jsonb_pretty(traffic_light());
```

Every project must still return a real colour and none may carry a caught error. The client axis reads `na` with `missing_data: true` everywhere, since no commitments exist yet. Report the count of projects whose `axes.client.color` is `na`.

Then prove the rules with a temporary row on one project, inside a transaction you roll back:

```sql
begin;
insert into customer_commitments (project_id, item, kind, due_date, status, blocking)
values ('7a8c83a9-66e9-4961-b850-f1f7a9ec9ee3', 'בדיקה', 'infrastructure', current_date - 3, 'open', true);
select jsonb_pretty(traffic_light('7a8c83a9-66e9-4961-b850-f1f7a9ec9ee3'::uuid) -> 0 -> 'axes' -> 'client');
rollback;
```

Expect red, with the reason naming the missing written notice. Report exactly what came back.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0071_customer_commitments.sql
git commit -m "feat(traffic): tl_client — the customer axis replaces the phase-1 stub"
```

---

### Task 3: The TypeScript mirror of the customer rule

**Files:**
- Modify: `src/traffic/model.ts`, `src/traffic/rules.ts`, `src/traffic/rules.test.ts`

**Interfaces:**
- Produces `Settings.client_window_days: number` (default 14 in `DEFAULT_SETTINGS`), `interface CommitmentFacts { due_date: string; status: 'open' | 'confirmed' | 'done'; blocking: boolean; notice_sent_on: string | null }`, and `clientColor(items: CommitmentFacts[], s: Settings, today?: string): Color`.

`src/traffic/rules.ts` is a parity spec for the SQL with no runtime consumer — its header says so. It exists so the thresholds are pinned by tests; keep it in step with Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `src/traffic/rules.test.ts`:

```ts
describe('clientColor (spec part A)', () => {
  const today = '2026-09-03'
  const base = { due_date: '2026-09-20', status: 'open' as const, blocking: false, notice_sent_on: null }

  it('is na when nothing was ever recorded', () => {
    expect(clientColor([], S, today)).toBe('na')
  })
  it('is green when a due commitment was confirmed in writing', () => {
    expect(clientColor([{ ...base, status: 'confirmed' }], S, today)).toBe('green')
    expect(clientColor([{ ...base, status: 'done' }], S, today)).toBe('green')
  })
  it('is green when an open commitment falls outside the window', () => {
    expect(clientColor([{ ...base, due_date: '2026-09-18' }], S, today)).toBe('amber')  // day 15 → inside? no: window is 14
    expect(clientColor([{ ...base, due_date: '2026-09-17' }], S, today)).toBe('amber')
    expect(clientColor([{ ...base, due_date: '2026-09-18' }], { ...S, client_window_days: 14 }, today)).toBe('amber')
  })
  it('is amber for an open commitment inside the window, exactly on the edge included', () => {
    expect(clientColor([{ ...base, due_date: '2026-09-17' }], S, today)).toBe('amber')
    expect(clientColor([{ ...base, due_date: '2026-09-18' }], S, today)).toBe('green')
  })
  it('is red only when an overdue commitment blocks our work', () => {
    expect(clientColor([{ ...base, due_date: '2026-09-01', blocking: true }], S, today)).toBe('red')
    expect(clientColor([{ ...base, due_date: '2026-09-01', blocking: false }], S, today)).toBe('amber')
  })
  it('stays red once the written notice was sent', () => {
    expect(clientColor([{ ...base, due_date: '2026-09-01', blocking: true, notice_sent_on: '2026-09-02' }], S, today)).toBe('red')
  })
})
```

The two window cases above disagree on purpose — resolve them while implementing: with `client_window_days = 14` and today 2026-09-03, a due date of 2026-09-17 is exactly on the edge and counts as inside; 2026-09-18 is outside. Fix the test block so it asserts exactly that (edge inside, one day past it green) before you implement, and delete the contradictory lines.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/traffic/rules.test.ts`
Expected: FAIL — `clientColor` is not exported.

- [ ] **Step 3: Implement**

In `src/traffic/model.ts`, add `client_window_days: number` to `Settings` and `client_window_days: 14` to `DEFAULT_SETTINGS`.

In `src/traffic/rules.ts`:

```ts
export interface CommitmentFacts {
  due_date: string
  status: 'open' | 'confirmed' | 'done'
  blocking: boolean
  notice_sent_on: string | null
}

/** Spec part A. Mirrors tl_client() in migration 0071. */
export function clientColor(items: CommitmentFacts[], s: Settings, today = todayIso()): Color {
  if (items.length === 0) return 'na'
  const out: Color[] = ['green']
  for (const c of items) {
    if (c.status === 'done') continue
    const overdue = dayDiff(today, c.due_date) > 0
    if (overdue && c.blocking) out.push('red')
    else if (c.status === 'open' && dayDiff(c.due_date, today) <= s.client_window_days) out.push('amber')
  }
  return worst(...out)
}
```

- [ ] **Step 4: Run to green**

Run: `npx vitest run src/traffic/rules.test.ts` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/traffic/model.ts src/traffic/rules.ts src/traffic/rules.test.ts
git commit -m "feat(traffic): clientColor rule mirror and its boundary tests"
```

---

### Task 4: API layer and strings for commitments

**Files:**
- Modify: `src/traffic/api.ts`, `src/traffic/i18n.ts`

**Interfaces:**
- Produces `type CommitmentKind = 'infrastructure' | 'permit' | 'access' | 'plan_approval' | 'payment_milestone' | 'other'`, `COMMITMENT_KINDS: CommitmentKind[]`, `type CommitmentStatus = 'open' | 'confirmed' | 'done'`, `COMMITMENT_STATUSES`, `interface Commitment { id; project_id; item; kind; due_date; status; confirmation_ref: string | null; blocking: boolean; notice_sent_on: string | null; notice_ref: string | null; notes: string | null; updated_at: string; updated_by: string | null }`, and `fetchCommitments(projectId)`, `upsertCommitment(c, by)`, `deleteCommitment(id)`.
- Produces i18n keys used by Task 5: `nav_customer`, `cust_title`, `cust_add`, `cust_col_item`, `cust_col_kind`, `cust_col_due`, `cust_col_status`, `cust_col_ref`, `cust_col_blocking`, `cust_col_notice`, `cust_col_notice_ref`, `cust_days_late`, `kind_infrastructure`, `kind_permit`, `kind_access`, `kind_plan_approval`, `kind_payment_milestone`, `kind_other`, `cstatus_open`, `cstatus_confirmed`, `cstatus_done`, `cust_notice_missing`, `cust_empty`.

Follow the existing file exactly: the deliveries block is the closest model, including the `.select('id')` + zero-row throw on RLS-gated writes (Postgres reports a filtered-out write as success).

- [ ] **Step 1: Add the strings**

In `src/traffic/i18n.ts`, add to `TL` (Hebrew first, English genuinely English — the i18n test rejects Hebrew inside an English value):

```ts
  nav_customer:        { he: 'התחייבויות לקוח', en: 'Customer commitments' },
  cust_title:          { he: 'התחייבויות לקוח', en: 'Customer commitments' },
  cust_add:            { he: '+ התחייבות', en: '+ Commitment' },
  cust_col_item:       { he: 'פריט', en: 'Item' },
  cust_col_kind:       { he: 'סוג', en: 'Kind' },
  cust_col_due:        { he: 'תאריך מוסכם', en: 'Agreed date' },
  cust_col_status:     { he: 'סטטוס', en: 'Status' },
  cust_col_ref:        { he: 'אסמכתא לאישור', en: 'Confirmation ref.' },
  cust_col_blocking:   { he: 'חוסם עבודה', en: 'Blocks work' },
  cust_col_notice:     { he: 'הודעה נשלחה', en: 'Notice sent' },
  cust_col_notice_ref: { he: 'אסמכתא להודעה', en: 'Notice ref.' },
  cust_days_late:      { he: 'ימי איחור', en: 'Days late' },
  cust_notice_missing: { he: 'נדרשת הודעה כתובה ללקוח', en: 'A written notice to the customer is required' },
  cust_empty:          { he: 'לא הוזנו התחייבויות לקוח', en: 'No customer commitments recorded' },
  kind_infrastructure: { he: 'תשתיות', en: 'Infrastructure' },
  kind_permit:         { he: 'היתר', en: 'Permit' },
  kind_access:         { he: 'גישה לאתר', en: 'Site access' },
  kind_plan_approval:  { he: 'אישור תוכניות', en: 'Drawing approval' },
  kind_payment_milestone: { he: 'אבן דרך לתשלום', en: 'Payment milestone' },
  kind_other:          { he: 'אחר', en: 'Other' },
  cstatus_open:        { he: 'פתוח', en: 'Open' },
  cstatus_confirmed:   { he: 'אושר בכתב', en: 'Confirmed in writing' },
  cstatus_done:        { he: 'בוצע', en: 'Done' },
```

and the two accessors beside the existing ones:

```ts
export const commitmentKindLabel = (lang: Lang, k: string) => tl(lang, `kind_${k}` as TLKey)
export const commitmentStatusLabel = (lang: Lang, s: string) => tl(lang, `cstatus_${s}` as TLKey)
```

- [ ] **Step 2: Run the i18n test**

Run: `npx vitest run src/i18n.test.ts` → PASS (it checks both languages are filled).

- [ ] **Step 3: Add the API functions**

In `src/traffic/api.ts`, after the deliveries block:

```ts
// ---------- customer commitments ----------
export type CommitmentKind = 'infrastructure' | 'permit' | 'access' | 'plan_approval' | 'payment_milestone' | 'other'
export const COMMITMENT_KINDS: CommitmentKind[] = ['infrastructure', 'permit', 'access', 'plan_approval', 'payment_milestone', 'other']
export type CommitmentStatus = 'open' | 'confirmed' | 'done'
export const COMMITMENT_STATUSES: CommitmentStatus[] = ['open', 'confirmed', 'done']

export interface Commitment {
  id: string; project_id: string; item: string; kind: CommitmentKind
  due_date: string; status: CommitmentStatus; confirmation_ref: string | null
  blocking: boolean; notice_sent_on: string | null; notice_ref: string | null
  notes: string | null; updated_at: string; updated_by: string | null
}

export async function fetchCommitments(projectId: string): Promise<Commitment[]> {
  const { data, error } = await supabase.from('customer_commitments').select('*')
    .eq('project_id', projectId).order('due_date')
  if (error) throw error
  return (data ?? []) as Commitment[]
}

export async function upsertCommitment(
  c: Partial<Commitment> & { project_id: string; item: string; due_date: string }, by: string,
): Promise<Commitment> {
  const { data, error } = await supabase.from('customer_commitments')
    .upsert({ ...c, updated_by: by.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('*').single()
  if (error) throw error
  return data as Commitment
}

export async function deleteCommitment(id: string): Promise<void> {
  const { data, error } = await supabase.from('customer_commitments').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה למחוק התחייבות')
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx eslint src/traffic` → zero errors.

```bash
git add src/traffic/api.ts src/traffic/i18n.ts
git commit -m "feat(traffic): commitments api and strings"
```

---

### Task 5: The customer screen and the drill-down block

**Files:**
- Create: `src/screens/traffic/Customer.tsx`
- Modify: `src/App.tsx`, `src/screens/traffic/TrafficProject.tsx`

**Interfaces:**
- Consumes Task 4's API and strings, and the `client` axis evidence Task 2 emits (`evidence.items` with `id, item, kind, due_date, status, confirmation_ref, blocking, days_late, notice_sent_on, notice_ref, color`).

**Design:** invoke `frontend-design` before writing the screen. Direction: this is a working table like the deliveries and issues screens — someone sits with it and edits rows. It carries one thing they do not: the written-notice columns, which are the contractual protection. A row that is red and has no notice must be the most legible thing on the screen. Reuse `src/styles/traffic.css` (`.tl-table`, `.tl-block`, `.is-critical`) and the app's tokens; no new colour values; Hebrew RTL first; cards on phones with `data-label` on every cell.

- [ ] **Step 1: Build the screen**

`src/screens/traffic/Customer.tsx`, modelled on `src/screens/traffic/Deliveries.tsx` — read that file first and mirror its structure: `useParams` for the project, a `reload` that catches into `setErr`, inline editing that skips a write when the value did not change, `data-label` on every cell, and the add row at the bottom. Columns: item, kind (select), agreed date, status (select), confirmation ref, blocks work (checkbox), notice sent (date), notice ref, delete.

Editing is allowed when `canEdit('traffic_light')` **or** the user manages this project. The client cannot evaluate `is_project_manager()`, so gate the UI on `canEdit('traffic_light') || assignments[projectId]?.includes(user.id)` using the store's `assignments` map — and let a rejected write surface its error, since the database is the real gate. Say in a comment that the policy is the authority and the UI check is a courtesy.

Highlight a row whose `status !== 'done'`, whose due date has passed and which blocks work, and whose `notice_sent_on` is empty or older than 7 days: add the `is-critical` class and show `cust_notice_missing` beside the item.

- [ ] **Step 2: Route it**

In `src/App.tsx`, beside the existing traffic routes:

```tsx
        <Route path="traffic/:projectId/customer" element={<RequirePerm area="traffic_light"><Customer /></RequirePerm>} />
```

with the matching `const Customer = lazy(() => import('./screens/traffic/Customer'))`.

A project manager without the `traffic_light` area cannot reach this route. That is deliberate for now: the screen lives inside the traffic-light module. Note it in your report so the controller can decide whether to widen it later.

- [ ] **Step 3: Fill the drill-down block**

In `src/screens/traffic/TrafficProject.tsx`, the client block currently renders the phase-2 placeholder hint. Replace it with an evidence table in the same shape as the supply block: item, kind, agreed date, status, days late, blocking, notice sent — plus a `TrafficDot` per row from its `color`, and a link to `/traffic/${projectId}/customer` reading `tl(lang, 'cust_title')`. Add the `Cust` row type beside the existing `Item`/`Crew`/`Iss` types at the top of the file. Every array read defaults with `?? []`, as the others do — the evidence may be absent.

- [ ] **Step 4: Verify**

Run `npm test`, `npx tsc --noEmit`, `npm run build`, `npx eslint src/screens/traffic` → zero errors. Then `npm run dev`, open a project's traffic screen, confirm the client block renders (its axis is `na` until commitments exist, so expect the "not measured" state and the link), and open the customer screen and add a row through the UI against the live database. Delete it afterwards. Report what you saw.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traffic/Customer.tsx src/App.tsx src/screens/traffic/TrafficProject.tsx
git commit -m "feat(traffic): customer commitments screen and drill-down block"
```

---

### Task 6: The weekly report renderer

**Files:**
- Create: `supabase/functions/weekly-report/render.ts`, `supabase/functions/weekly-report/render.test.ts`

**Interfaces:**
- Produces `renderWeeklyReport(input: { payload: ProjectLightLike[]; tasks: TaskLike[]; takenAt: string; appUrl: string }): { subject: string; html: string }`.
- `ProjectLightLike` mirrors what `traffic_light()` emits (see `src/traffic/model.ts`'s `ProjectLight`); `TaskLike` is `{ title: string; assignee_email: string | null; due_date: string | null; project_id: string | null; axis: string | null }`.

This file is pure — no Deno APIs, no network — so the root vitest can run its test even though it lives under `supabase/functions/`. Check `vitest.config.ts`'s include pattern; if it does not pick up that directory, put the test at `src/traffic/weeklyReport.test.ts` and import across, rather than widening the config.

Mail clients ignore stylesheets, so the HTML is tables with inline styles, exactly like `src/report.ts`. Read that file for the colour constants and the table idiom, and reuse them.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { renderWeeklyReport } from '../../supabase/functions/weekly-report/render'   // adjust to the chosen location

const red = {
  project_id: 'p1', name: 'כפר יובל', manager: 'משה', color: 'red', gray_reason: null,
  action_line: 'בלת"מ חוסם עבודה', due: { contract: '2026-11-30', forecast: '2026-12-20', delta_days: 20 },
  axes: {
    time: { color: 'amber', reason: 'סיום חזוי +20 ימים' }, supply: { color: 'green', reason: 'הכל באתר' },
    client: { color: 'na', reason: 'לא הוזנו התחייבויות לקוח' }, crew: { color: 'na', reason: 'לא הוגדרו קבלנים' },
    issues: { color: 'red', reason: 'בלת"מ #3 חוסם עבודה' },
  },
  last_entry_on: '2026-09-02',
}
const green = { ...red, project_id: 'p2', name: 'נחם', color: 'green', action_line: '',
  axes: { ...red.axes, issues: { color: 'green', reason: 'אין בלת"מ פתוח' } } }

describe('renderWeeklyReport', () => {
  it('names every project and the reason behind a red one', () => {
    const { html } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).toContain('כפר יובל')
    expect(html).toContain('נחם')
    expect(html).toContain('בלת"מ #3 חוסם עבודה')
  })
  it('details the non-green projects only', () => {
    const { html } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    const detailStart = html.indexOf('פירוט')
    expect(html.slice(detailStart)).toContain('כפר יובל')
    expect(html.slice(detailStart)).not.toContain('נחם')
  })
  it('renders no task section when there are no tasks', () => {
    const { html } = renderWeeklyReport({ payload: [green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).not.toContain('משימות פתוחות')
  })
  it('groups tasks by assignee and names an unassigned one', () => {
    const { html } = renderWeeklyReport({
      payload: [red], appUrl: 'https://x.test', takenAt: '2026-09-06T04:00:00Z',
      tasks: [
        { title: 'לשלוח הודעה ללקוח', assignee_email: 'a@x.co', due_date: '2026-09-10', project_id: 'p1', axis: 'client' },
        { title: 'להשלים נתונים: קבלנים', assignee_email: null, due_date: null, project_id: 'p1', axis: 'crew' },
      ],
    })
    expect(html).toContain('משימות פתוחות')
    expect(html).toContain('a@x.co')
    expect(html).toContain('ללא אחראי')
  })
  it('counts the colours in the subject', () => {
    const { subject } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(subject).toContain('1 אדום')
  })
  it('escapes a project name that contains markup', () => {
    const { html } = renderWeeklyReport({
      payload: [{ ...green, name: '<script>x</script>' }], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).not.toContain('<script>')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run <the test path>` — FAIL, module missing.

- [ ] **Step 3: Implement the renderer**

Write `render.ts` with: an `esc()` that escapes `& < > "` (copy the one in `src/report.ts`), a colour map from the app's tokens as literal hex (`green #3aaa35`, `amber #d8a01a`, `red #c14a15`, `gray #68766f`, `na` an outlined circle), a board table sorted red → gray → amber → green then name, a detail section per non-green project listing its five axes with colour and reason, and a task section grouped by assignee with `ללא אחראי` for the unassigned, omitted entirely when the list is empty. The document is `dir="rtl"`, the subject is `🚦 דוח רמזור שבועי — <N> אדום · <N> אפור · <N> כתום`, and every project row links to `${appUrl}/traffic/${project_id}`.

- [ ] **Step 4: Green, then commit**

Run the test → PASS, then `npm test` → all pass.

```bash
git add supabase/functions/weekly-report/render.ts <the test path>
git commit -m "feat(traffic): weekly report HTML renderer"
```

---

### Task 7: The `weekly-report` edge function

**Files:**
- Create: `supabase/functions/weekly-report/index.ts`

**Interfaces:**
- Consumes `renderWeeklyReport` from Task 6.
- Produces an HTTP endpoint expecting `POST { snapshot_id }` with header `x-report-secret`, returning `{ ok: true, recipients: <n> }` or an error object.

Read `supabase/functions/reset-password/index.ts` first: it is the pattern for a Resend-sending function in this repo, including the shared `cors.ts` helpers and the `createClient(URL, SERVICE)` idiom with the pinned esm.sh version.

- [ ] **Step 1: Write the function**

Behaviour, in order:

1. `OPTIONS` → the shared CORS response; anything but `POST` → 405.
2. Compare the `x-report-secret` header against `Deno.env.get('REPORT_SECRET')`; mismatch or missing → 401 `{ error: 'unauthorized' }`. Compare with a constant-time comparison, not `===`, since this is a bearer secret.
3. Read `snapshot_id` from the body; load that row from `traffic_light_snapshots` with the service key. Missing → 404.
4. Load the open traffic-light tasks: `work_tasks` where `source = 'traffic_light'` and `status = 'open'`.
5. Recipients: `allowed_emails` where `active` and `role in ('admin','manager')`, plus `traffic_light_settings.extra_report_emails`, lowercased, deduplicated, and filtered to values containing `@`. None → 200 `{ ok: true, recipients: 0 }` without calling Resend.
6. `renderWeeklyReport(...)`, then one Resend call with the recipients in `bcc` (so nobody sees the list) and `to` set to `RESEND_FROM`.
7. Write `report_mail_log`: snapshot id, recipient count, the HTTP status Resend returned, and its error text when it failed. Return that status.

Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL`, `REPORT_SECRET` — the first five already exist for `reset-password`; `REPORT_SECRET` is new and is set by the deployer.

- [ ] **Step 2: Deploy it**

Deploy with the Supabase MCP `deploy_edge_function` to project `fndoytitumlclapnjhnm`. Then report to the controller that `REPORT_SECRET` must be set in the function's environment and stored in the vault under the same value — the controller handles the secret itself; **do not invent one and do not print any secret in your report.**

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/weekly-report/index.ts
git commit -m "feat(traffic): weekly-report edge function"
```

---

### Task 8: Wire the Sunday job to the mail

**Files:**
- Create: `supabase/migrations/0072_weekly_report_mail.sql`

**Interfaces:**
- Consumes the deployed function from Task 7.
- Produces `traffic_light_settings.extra_report_emails text[]`, table `report_mail_log`, and a re-emitted `traffic_light_weekly()` whose last step posts to the function.

Read the current `traffic_light_weekly()` in `0065`/`0066` — you re-emit it whole with one section appended.

- [ ] **Step 1: Write the migration**

```sql
-- דוח רמזור שלב ב׳ — שליחת הדוח השבועי במייל.
--
-- pg_net שולח POST אסינכרוני ל-edge function; הסוד יושב ב-vault ולא בקוד.
-- שליחה שנכשלת נרשמת ב-report_mail_log, אחרת כשל שקט מתגלה רק כששואלים למה
-- לא הגיע מייל. הסנאפשוט והמשימות נוצרים לפני השליחה ואינם תלויים בה.

create extension if not exists pg_net with schema extensions;

alter table traffic_light_settings
  add column if not exists extra_report_emails text[] not null default '{}';

create table if not exists report_mail_log (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid references traffic_light_snapshots(id) on delete set null,
  requested_at    timestamptz not null default now(),
  request_id      bigint,
  recipient_count int,
  http_status     int,
  error           text
);
alter table report_mail_log enable row level security;
drop policy if exists read_report_mail_log on report_mail_log;
create policy read_report_mail_log on report_mail_log for select using (can_view('traffic_light'));
```

Then re-emit `traffic_light_weekly()` with a final section, after the notification insert:

```sql
  -- the mail: fire-and-forget, so a mail failure can never cost us the snapshot
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'report_secret';
    select decrypted_secret into v_fn_url from vault.decrypted_secrets where name = 'report_fn_url';
    if v_secret is not null and v_fn_url is not null then
      select net.http_post(
        url := v_fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-report-secret', v_secret),
        body := jsonb_build_object('snapshot_id', v_snapshot_id)
      ) into v_request_id;
      insert into report_mail_log (snapshot_id, request_id) values (v_snapshot_id, v_request_id);
    end if;
  exception when others then
    insert into report_mail_log (snapshot_id, error) values (v_snapshot_id, sqlerrm);
  end;
```

The current function inserts the snapshot without keeping its id — change that insert to `returning id into v_snapshot_id` and declare `v_snapshot_id uuid`, `v_secret text`, `v_fn_url text`, `v_request_id bigint`. Keep every other line byte-identical, including the task-creation loop, the 20-hour notification guard, and the `session_user` guard at the top.

Add a second function that reconciles the async response, and schedule it 5 minutes after the report:

```sql
create or replace function report_mail_reconcile() returns void
language plpgsql security definer set search_path = public as $$
begin
  if session_user not in ('postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' then return; end if;
  update report_mail_log l
     set http_status = r.status_code,
         error = case when r.status_code between 200 and 299 then null else left(r.content, 500) end
    from net._http_response r
   where r.id = l.request_id and l.http_status is null;
end $$;
revoke all on function report_mail_reconcile() from public;
revoke execute on function report_mail_reconcile() from anon, authenticated;
grant execute on function report_mail_reconcile() to service_role, postgres;

select cron.schedule('traffic-light-mail-reconcile', '5 4 * * 0', $$select report_mail_reconcile()$$)
where not exists (select 1 from cron.job where jobname = 'traffic-light-mail-reconcile');
```

- [ ] **Step 2: Apply and verify**

Apply as `weekly_report_mail`. Then verify without sending anything to anyone:

```sql
select extname from pg_extension where extname = 'pg_net';
select extra_report_emails from traffic_light_settings where id = 1;
select jobname, schedule from cron.job where jobname like 'traffic-light%' order by jobname;
```

Do **not** call `traffic_light_weekly()` — it would mail every manager. The controller decides when to run the first one.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0072_weekly_report_mail.sql
git commit -m "feat(traffic): weekly report mail — pg_net dispatch, log and reconcile"
```

---

### Task 9: Thresholds screen — the new setting, recipients and last-send status

**Files:**
- Modify: `src/screens/traffic/TrafficSettings.tsx`, `src/traffic/api.ts`, `src/traffic/i18n.ts`

**Interfaces:**
- Consumes `client_window_days` (Task 3) and `report_mail_log` (Task 8).
- Produces `fetchLastMailLog(): Promise<{ requested_at: string; recipient_count: number | null; http_status: number | null; error: string | null } | null>` in `src/traffic/api.ts`.

- [ ] **Step 1: Strings**

Add to `TL`:

```ts
  s_client_window_days: { he: 'לקוח: חלון התחייבויות (ימים)', en: 'Customer: commitments window (days)' },
  settings_recipients:  { he: 'נמענים נוספים לדוח השבועי', en: 'Extra weekly-report recipients' },
  settings_recipients_hint: { he: 'כתובות מופרדות בפסיק. אדמינים ומנהלים מקבלים אוטומטית.', en: 'Comma-separated. Admins and managers receive it automatically.' },
  settings_last_mail:   { he: 'שליחה אחרונה', en: 'Last send' },
  settings_mail_never:  { he: 'הדוח עדיין לא נשלח', en: 'The report has not been sent yet' },
  settings_mail_failed: { he: 'השליחה האחרונה נכשלה', en: 'The last send failed' },
```

- [ ] **Step 2: API**

```ts
export interface MailLogRow {
  requested_at: string; recipient_count: number | null; http_status: number | null; error: string | null
}
export async function fetchLastMailLog(): Promise<MailLogRow | null> {
  const { data, error } = await supabase.from('report_mail_log')
    .select('requested_at,recipient_count,http_status,error')
    .order('requested_at', { ascending: false }).limit(1)
  if (error) throw error
  return (data?.[0] as MailLogRow) ?? null
}
```

- [ ] **Step 3: Screen**

Add `client_window_days` to the settings form's key list so it renders with the other thresholds and is covered by the existing validation (non-negative integer).

Add the recipients field: a text input bound to `extra_report_emails.join(', ')`, parsed back on change by splitting on commas, trimming, lowercasing, dropping entries without `@`. Show `settings_recipients_hint` beneath it. Include it in the same save as the thresholds.

Add a status line at the top of the screen, read once on mount: never sent → `settings_mail_never`; sent with a 2xx → `settings_last_mail` with the date, time and recipient count; anything else → `settings_mail_failed` with the status and the error text, styled with the app's alert class.

- [ ] **Step 4: Verify and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run build`, `npx eslint src/screens/traffic` → zero errors. Open the screen against the live database and confirm the new field saves and the status line reads "not sent yet".

```bash
git add src/screens/traffic/TrafficSettings.tsx src/traffic/api.ts src/traffic/i18n.ts
git commit -m "feat(traffic): customer window, report recipients and last-send status"
```

---

### Task 10: End-to-end check and documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Live end-to-end**

With the controller's approval for the mail step (ask before sending — it reaches real managers):

1. Enter one overdue blocking commitment on a pilot project through the UI; confirm the board's client dot turns red and the action line names the missing written notice.
2. Record a notice date on it; confirm the colour stays red and the reason changes to name the notice.
3. Set the commitment to `done`; confirm the axis returns to green.
4. Delete the test row.

Report each observed result, not the expected one.

- [ ] **Step 2: README**

Extend the traffic-light feature bullet to mention the customer axis and the automatic Sunday mail, and add `customer_commitments` and `report_mail_log` to the data-model table. Match the file's existing tone.

- [ ] **Step 3: Full verification**

Run `npm test`, `npx tsc --noEmit`, `npm run build`, `npx eslint src --max-warnings 999`. Report errors and warnings separately, and say whether the branch changed the warning count.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: traffic-light phase 2"
```

---

## Self-review against the spec

- **Part A data model** — Task 1 (table, RLS with `is_project_manager`, `client_window_days`).
- **Part A rules, including the written-notice rule** — Task 2 in SQL, Task 3 as the tested TS mirror.
- **Part A screen and drill-down block** — Task 5.
- **Part B delivery path** (pg_net, vault secret, edge function, Resend) — Tasks 7 and 8.
- **Part B recipients** (admins/managers + extras) — Task 7 reads them, Task 9 edits them.
- **Part B content** (board, non-green detail, tasks by assignee) — Task 6, with tests.
- **Part B failure visibility** (`report_mail_log`, reconcile, status line) — Tasks 8 and 9.
- **Timing** — unchanged `0 4 * * 0`, stated in Task 8.
- **Phase-1 lessons** — carried into the Global Constraints and repeated in Task 2, where the new plpgsql is written.
- **Testing** — rules (3), renderer (6), i18n (4), live SQL verification (2, 8), live UI walk (10).

One open item the plan records rather than decides: a project manager who lacks the `traffic_light` area can write commitments per the database policy but cannot reach the screen, because the route is gated on the area. Task 5 flags it for the controller.
