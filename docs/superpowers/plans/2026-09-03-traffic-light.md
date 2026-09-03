# דוח רמזור (Traffic Light) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase-1 traffic-light report for admins/managers: data foundations (contract date, WBS templates, contractors, deliveries, issues register), a `traffic_light()` SQL function that colors every active project on four axes plus gray, a weekly snapshot that creates tasks, and three screens (board, project drill-down, tasks).

**Architecture:** One `security definer` SQL function is the single source of color truth; the live board and the Sunday cron both call it. Setup data lives in new tables under RLS keyed on two new perm areas (`traffic_light`, `deliveries`). The diary gains three structured sections stored inside `entries.values` (like `progress_coops`); triggers turn them into `issues` rows and delivery arrivals. Pure TS rules (`src/traffic/rules.ts`) mirror the SQL thresholds for unit tests and client-side recoloring.

**Tech Stack:** React 18 + TypeScript + Vite, hand-authored CSS with tokens, Supabase (Postgres RLS, plpgsql, pg_cron), vitest.

Spec: `docs/superpowers/specs/2026-09-03-traffic-light-design.md`.

## Global Constraints

- Migrations are numbered `0064_…`, `0065_…` in `supabase/migrations/`; every policy is `drop policy if exists` then `create policy` (re-runnable), matching 0045/0061.
- Every SQL function callable from the browser: `revoke all … from public; grant execute … to authenticated`. Cron-only functions are granted to `service_role, postgres` only and start with the `auth.role()` guard used in 0042.
- Perm areas: `traffic_light` (member none, manager edit; admin resolves to edit) and `deliveries` (member none, manager none). Both seeded into `perm_defaults` and mirrored in `src/lib/perms.ts`; `src/lib/perms.sql.test.ts` must keep passing.
- All UI strings bilingual `{ he, en }`; new dictionaries are registered in `src/i18n.test.ts`.
- Time zone for "today" in SQL: `(now() at time zone 'Asia/Jerusalem')::date`.
- Color severity order: `gray > red > amber > green > na`. Project color = worst axis; gray overrides.
- Run `npm test` and `npm run lint` before every commit. `npm run build` before the final commit.
- Commit messages: conventional commits, end with the Co-Authored-By / Claude-Session trailer configured for this session.
- Deviation from spec (accepted): `crew_rows`, `issue_blocking`, `arrived_items` are **not** `field_definitions` rows. They are fixed keys inside `entries.values` rendered by dedicated form sections, exactly like `progress_coops` / `safety_training`, because the generic renderer cannot draw tables or project-scoped option lists.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0064_traffic_light_schema.sql` | tables, columns, seeds, RLS, triggers, perm defaults |
| `supabase/migrations/0065_traffic_light_fn.sql` | `traffic_light()` + helpers, weekly job, cron |
| `src/traffic/model.ts` | output types, severity, `worst()` |
| `src/traffic/rules.ts` | pure threshold→color rules |
| `src/traffic/wbs.ts` | coop template constant, legacy-name map, `normName` |
| `src/traffic/api.ts` | RPC + CRUD for contractors, deliveries, issues, settings, templates, snapshots |
| `src/traffic/i18n.ts` | `TL` dictionary, `tl(lang, key)` |
| `src/screens/traffic/TrafficBoard.tsx` | 8.1 |
| `src/screens/traffic/TrafficProject.tsx` | 8.2 |
| `src/screens/traffic/Deliveries.tsx`, `Issues.tsx` | PMO / purchasing screens |
| `src/screens/traffic/WbsTemplates.tsx`, `TrafficSettings.tsx` | admin screens |
| `src/styles/traffic.css` | module styles |
| `src/lib/perms.ts`, `src/data.ts`, `src/lib/reportTables.ts`, `src/store.tsx`, `src/api.ts`, `src/report.ts` | modified |
| `src/screens/EntryForm.tsx`, `src/screens/EntryDetail.tsx`, `src/screens/admin/Projects.tsx`, `src/screens/Tasks.tsx`, `src/App.tsx`, `src/components/Shell.tsx` | modified |

---

### Task 1: Perm areas `traffic_light` and `deliveries`

**Files:**
- Modify: `src/lib/perms.ts`
- Create: `supabase/migrations/0064_traffic_light_schema.sql` (perm section only; later tasks append)
- Modify: `src/lib/perms.sql.test.ts`

**Interfaces:**
- Produces: `PermArea` union gains `'traffic_light' | 'deliveries'`; `can('traffic_light')`, `canEdit('deliveries')` via existing `usePerms()`.

- [ ] **Step 1: Extend the sql test to read 0064**

In `src/lib/perms.sql.test.ts` add after `const SQL61 = …`:

```ts
const SQL64 = readFileSync('supabase/migrations/0064_traffic_light_schema.sql', 'utf8')
```

In `seededDefaults()` after the SQL61 loop add:

```ts
  for (const [, area, level] of SQL64.matchAll(/\('member',\s*'(\w+)',\s*'(none|view|edit)'\)/g)) {
    out[area] = level as PermLevel
  }
```

Add to the `describe('perm_defaults mirrors MEMBER_DEFAULTS')` block:

```ts
  it('seeds manager rows for the traffic-light areas that match MANAGER_DEFAULTS', () => {
    for (const area of ['traffic_light', 'deliveries'] as PermArea[]) {
      const m = [...SQL64.matchAll(new RegExp(`\\('manager',\\s*'${area}',\\s*'(none|view|edit)'\\)`, 'g'))]
      expect(m.length, area).toBe(1)
      expect(m[0][1], area).toBe(resolvePerm('manager', {}, area))
    }
  })
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/lib/perms.sql.test.ts`
Expected: FAIL — `ENOENT … 0064_traffic_light_schema.sql`.

- [ ] **Step 3: Add the areas to perms.ts**

In `src/lib/perms.ts`:

```ts
export type PermArea =
  | 'dashboard' | 'logbook' | 'calendar' | 'search' | 'projects' | 'export'
  | 'defects' | 'form_builder' | 'coops_manage' | 'alert_rules' | 'gantt' | 'control_center'
  | 'safety' | 'traffic_light' | 'deliveries'
```

Append to `PERM_AREAS` (after `safety`):

```ts
  { key: 'traffic_light', label: 'דוח רמזור', label_en: 'Traffic-light report' },
  { key: 'deliveries', label: 'רשימת אספקות — עדכון סטטוס', label_en: 'Deliveries — status updates' },
```

Add to `MEMBER_DEFAULTS`:

```ts
  traffic_light: 'none', // דוח רמזור — סמנכ"ל, מנהלים ואדמין בלבד
  deliveries: 'none',    // רכש/יבוא מקבלים הענקה ידנית
```

Add to `MANAGER_DEFAULTS`:

```ts
  traffic_light: 'edit', // מנהלים רואים ומנהלים משימות רמזור
  deliveries: 'none',
```

- [ ] **Step 4: Create the migration with the perm rows**

Create `supabase/migrations/0064_traffic_light_schema.sql`:

```sql
-- דוח רמזור — שלב א׳: תשתית נתונים.
--
-- הצבע נגזר מספים מספריים בלבד (traffic_light_settings), ומחושב בפונקציה אחת
-- (0065). כאן: העמודות והטבלאות שהפונקציה קוראת, ההרשאות, והטריגרים שהופכים
-- רשומת יומן לפריט במרשם הבלת"מ ולסימון "הגיע לאתר".

-- ---------- 1. perm areas ----------
insert into perm_defaults (role, area, level) values
  ('member',  'traffic_light', 'none'),
  ('manager', 'traffic_light', 'edit'),
  ('member',  'deliveries',    'none'),
  ('manager', 'deliveries',    'none')
on conflict (role, area) do update set level = excluded.level;
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/perms.sql.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/perms.ts src/lib/perms.sql.test.ts supabase/migrations/0064_traffic_light_schema.sql
git commit -m "feat(traffic): perm areas traffic_light and deliveries"
```

---

### Task 2: WBS module — template constant, legacy map, name normalization

**Files:**
- Create: `src/traffic/wbs.ts`
- Create: `src/traffic/wbs.test.ts`
- Modify: `supabase/migrations/0064_traffic_light_schema.sql` (append section 2)

**Interfaces:**
- Produces:
  - `interface WbsTemplate { id: string; project_type: string; sort_order: number; name_he: string; name_en: string; critical: boolean; active: boolean }`
  - `COOP_TEMPLATE: Omit<WbsTemplate,'id'|'active'>[]` (10 rows, sort_order 1..10)
  - `LEGACY_TASK_MAP: { legacy: string; project_type: 'coop'; sort: number }[]`
  - `normName(s: string): string`
  - `templateSortFor(task: string, type: string, templates: WbsTemplate[]): number | null`

- [ ] **Step 1: Write failing tests**

`src/traffic/wbs.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COOP_TEMPLATE, LEGACY_TASK_MAP, normName, templateSortFor, type WbsTemplate } from './wbs'

const SQL = readFileSync('supabase/migrations/0064_traffic_light_schema.sql', 'utf8')

const tpl: WbsTemplate[] = COOP_TEMPLATE.map((r, i) => ({ ...r, id: `t${i}`, active: true }))

describe('normName', () => {
  it('trims, collapses spaces, strips hebrew punctuation and quotes', () => {
    expect(normName('  הקמת   קונס׳ (שלד) ')).toBe('הקמת קונס (שלד)')
    expect(normName('בלת"מ')).toBe('בלתמ')
    expect(normName('Roof Covering')).toBe('roof covering')
  })
})

describe('COOP_TEMPLATE', () => {
  it('has the 10 spec categories in order with rows 6-10 critical', () => {
    expect(COOP_TEMPLATE.map((r) => r.sort_order)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(COOP_TEMPLATE.filter((r) => r.critical).map((r) => r.sort_order)).toEqual([6,7,8,9,10])
    expect(COOP_TEMPLATE[8].name_he).toBe('מערכת זבל / ספק חוץ')
  })
  it('is seeded identically in 0064', () => {
    for (const r of COOP_TEMPLATE) {
      expect(SQL, r.name_he).toContain(`('coop', ${r.sort_order}, '${r.name_he}', '${r.name_en.replace(/'/g, "''")}', ${r.critical})`)
    }
  })
})

describe('legacy task map', () => {
  it('maps every old diary task (he + en) to a template row', () => {
    const olds = ['הקמת קונס׳ (שלד)', 'גמר קורות בטון', 'כיסוי תקרה', 'חיפוי קירות', 'כיסוי גג',
      'ציוד פנים (אוכל, מים)', 'ציוד אקלים', 'חשמל ובקרה', 'גמרים ומסירה',
      'Structure erection (frame)', 'Concrete beams finish', 'Ceiling covering', 'Wall cladding', 'Roof covering',
      'Interior equipment (feed, water)', 'Climate equipment', 'Electrical & controls', 'Finishes & handover']
    for (const o of olds) expect(templateSortFor(o, 'coop', tpl), o).not.toBeNull()
    expect(templateSortFor('כיסוי תקרה', 'coop', tpl)).toBe(4)
    expect(templateSortFor('חיפוי קירות', 'coop', tpl)).toBe(4)
    expect(templateSortFor('Finishes & handover', 'coop', tpl)).toBe(10)
  })
  it('matches a current template name directly and returns null for unknown', () => {
    expect(templateSortFor(' ציוד פנים ', 'coop', tpl)).toBe(6)
    expect(templateSortFor('Interior equipment', 'coop', tpl)).toBe(6)
    expect(templateSortFor('משהו אחר', 'coop', tpl)).toBeNull()
  })
  it('is seeded identically in 0064 (wbs_legacy_names)', () => {
    for (const m of LEGACY_TASK_MAP) {
      expect(SQL, m.legacy).toContain(`('${m.legacy.replace(/'/g, "''")}', 'coop', ${m.sort})`)
    }
  })
})
```

- [ ] **Step 2: Run to see failure**

Run: `npx vitest run src/traffic/wbs.test.ts`
Expected: FAIL — cannot resolve `./wbs`.

- [ ] **Step 3: Implement `src/traffic/wbs.ts`**

```ts
// WBS categories: the shared language of the diary, the Gantt and the traffic light.
// The live list is wbs_templates (DB, admin-editable); COOP_TEMPLATE is the seed and the
// offline fallback. Legacy diary task names (the fixed 9-row list that shipped before
// 2026-09) are mapped here so old entries keep counting. The same two lists are seeded
// by migration 0064 — wbs.test.ts holds them in agreement.

export interface WbsTemplate {
  id: string
  project_type: string
  sort_order: number
  name_he: string
  name_en: string
  critical: boolean
  active: boolean
}

export const COOP_TEMPLATE: Omit<WbsTemplate, 'id' | 'active'>[] = [
  { project_type: 'coop', sort_order: 1,  name_he: 'עבודות עפר ובטון',           name_en: 'Earthworks & concrete',                 critical: false },
  { project_type: 'coop', sort_order: 2,  name_he: 'הקמת קונסטרוקציה (שלד)',     name_en: 'Structure erection (frame)',            critical: false },
  { project_type: 'coop', sort_order: 3,  name_he: 'קורות בטון',                 name_en: 'Concrete beams',                        critical: false },
  { project_type: 'coop', sort_order: 4,  name_he: 'כיסוי תקרה וחיפוי קירות',    name_en: 'Ceiling & wall cladding',               critical: false },
  { project_type: 'coop', sort_order: 5,  name_he: 'כיסוי גג',                   name_en: 'Roof covering',                         critical: false },
  { project_type: 'coop', sort_order: 6,  name_he: 'ציוד פנים',                  name_en: 'Interior equipment',                    critical: true },
  { project_type: 'coop', sort_order: 7,  name_he: 'מערכות אקלים',               name_en: 'Climate systems',                       critical: true },
  { project_type: 'coop', sort_order: 8,  name_he: 'חשמל ובקרה',                 name_en: 'Electrical & controls',                 critical: true },
  { project_type: 'coop', sort_order: 9,  name_he: 'מערכת זבל / ספק חוץ',        name_en: 'Manure system / external supplier',     critical: true },
  { project_type: 'coop', sort_order: 10, name_he: 'הרצה, גמרים ומסירה',         name_en: 'Commissioning, finishes & handover',    critical: true },
]

/** Old fixed diary rows → template sort_order. Two old rows fold into category 4. */
export const LEGACY_TASK_MAP: { legacy: string; project_type: 'coop'; sort: number }[] = [
  { legacy: 'הקמת קונס׳ (שלד)',             project_type: 'coop', sort: 2 },
  { legacy: 'Structure erection (frame)',    project_type: 'coop', sort: 2 },
  { legacy: 'גמר קורות בטון',               project_type: 'coop', sort: 3 },
  { legacy: 'Concrete beams finish',         project_type: 'coop', sort: 3 },
  { legacy: 'כיסוי תקרה',                   project_type: 'coop', sort: 4 },
  { legacy: 'Ceiling covering',              project_type: 'coop', sort: 4 },
  { legacy: 'חיפוי קירות',                  project_type: 'coop', sort: 4 },
  { legacy: 'Wall cladding',                 project_type: 'coop', sort: 4 },
  { legacy: 'כיסוי גג',                     project_type: 'coop', sort: 5 },
  { legacy: 'Roof covering',                 project_type: 'coop', sort: 5 },
  { legacy: 'ציוד פנים (אוכל, מים)',         project_type: 'coop', sort: 6 },
  { legacy: 'Interior equipment (feed, water)', project_type: 'coop', sort: 6 },
  { legacy: 'ציוד אקלים',                   project_type: 'coop', sort: 7 },
  { legacy: 'Climate equipment',             project_type: 'coop', sort: 7 },
  { legacy: 'חשמל ובקרה',                   project_type: 'coop', sort: 8 },
  { legacy: 'Electrical & controls',         project_type: 'coop', sort: 8 },
  { legacy: 'גמרים ומסירה',                 project_type: 'coop', sort: 10 },
  { legacy: 'Finishes & handover',           project_type: 'coop', sort: 10 },
]

/** Same normalization as tl_norm() in 0065: lower, trim, collapse spaces, drop ׳ ״ ' ". */
export function normName(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[׳״'"]/g, '').replace(/\s+/g, ' ').trim()
}

/** sort_order of the template row a diary task name belongs to, or null. */
export function templateSortFor(task: string, projectType: string, templates: WbsTemplate[]): number | null {
  const n = normName(task)
  if (!n) return null
  const direct = templates.find((t) => t.project_type === projectType && t.active !== false
    && (normName(t.name_he) === n || normName(t.name_en) === n))
  if (direct) return direct.sort_order
  const legacy = LEGACY_TASK_MAP.find((m) => m.project_type === projectType && normName(m.legacy) === n)
  return legacy ? legacy.sort : null
}

export const templateLabel = (t: Pick<WbsTemplate, 'name_he' | 'name_en'>, lang: 'he' | 'en') =>
  lang === 'he' ? t.name_he : t.name_en
```

- [ ] **Step 4: Append the seed tables to 0064**

Append to `supabase/migrations/0064_traffic_light_schema.sql`:

```sql
-- ---------- 2. WBS templates ----------
create table if not exists wbs_templates (
  id           uuid primary key default gen_random_uuid(),
  project_type text not null,
  sort_order   int  not null,
  name_he      text not null,
  name_en      text not null,
  critical     boolean not null default false,
  active       boolean not null default true,
  unique (project_type, name_he)
);
alter table wbs_templates enable row level security;
drop policy if exists read_wbs_templates on wbs_templates;
create policy read_wbs_templates on wbs_templates for select using (is_member());
drop policy if exists admin_wbs_templates on wbs_templates;
create policy admin_wbs_templates on wbs_templates for all using (is_admin()) with check (is_admin());

-- mirrored by COOP_TEMPLATE in src/traffic/wbs.ts (wbs.test.ts)
insert into wbs_templates (project_type, sort_order, name_he, name_en, critical) values
  ('coop', 1, 'עבודות עפר ובטון', 'Earthworks & concrete', false),
  ('coop', 2, 'הקמת קונסטרוקציה (שלד)', 'Structure erection (frame)', false),
  ('coop', 3, 'קורות בטון', 'Concrete beams', false),
  ('coop', 4, 'כיסוי תקרה וחיפוי קירות', 'Ceiling & wall cladding', false),
  ('coop', 5, 'כיסוי גג', 'Roof covering', false),
  ('coop', 6, 'ציוד פנים', 'Interior equipment', true),
  ('coop', 7, 'מערכות אקלים', 'Climate systems', true),
  ('coop', 8, 'חשמל ובקרה', 'Electrical & controls', true),
  ('coop', 9, 'מערכת זבל / ספק חוץ', 'Manure system / external supplier', true),
  ('coop', 10, 'הרצה, גמרים ומסירה', 'Commissioning, finishes & handover', true)
on conflict (project_type, name_he) do nothing;

-- old fixed diary task names → template sort_order (mirrored by LEGACY_TASK_MAP)
create table if not exists wbs_legacy_names (
  legacy_name   text not null,
  project_type  text not null,
  template_sort int  not null,
  primary key (legacy_name, project_type)
);
alter table wbs_legacy_names enable row level security;
drop policy if exists read_wbs_legacy on wbs_legacy_names;
create policy read_wbs_legacy on wbs_legacy_names for select using (is_member());

insert into wbs_legacy_names (legacy_name, project_type, template_sort) values
  ('הקמת קונס׳ (שלד)', 'coop', 2),
  ('Structure erection (frame)', 'coop', 2),
  ('גמר קורות בטון', 'coop', 3),
  ('Concrete beams finish', 'coop', 3),
  ('כיסוי תקרה', 'coop', 4),
  ('Ceiling covering', 'coop', 4),
  ('חיפוי קירות', 'coop', 4),
  ('Wall cladding', 'coop', 4),
  ('כיסוי גג', 'coop', 5),
  ('Roof covering', 'coop', 5),
  ('ציוד פנים (אוכל, מים)', 'coop', 6),
  ('Interior equipment (feed, water)', 'coop', 6),
  ('ציוד אקלים', 'coop', 7),
  ('Climate equipment', 'coop', 7),
  ('חשמל ובקרה', 'coop', 8),
  ('Electrical & controls', 'coop', 8),
  ('גמרים ומסירה', 'coop', 10),
  ('Finishes & handover', 'coop', 10)
on conflict do nothing;
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/traffic/wbs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/traffic/wbs.ts src/traffic/wbs.test.ts supabase/migrations/0064_traffic_light_schema.sql
git commit -m "feat(traffic): WBS template module + seeded wbs_templates / legacy names"
```

---

### Task 3: Schema — project columns, contractors, deliveries, issues, tasks, settings, snapshots, triggers

**Files:**
- Modify: `supabase/migrations/0064_traffic_light_schema.sql` (append sections 3–9)
- Modify: `src/data.ts` (Project type)
- Modify: `src/api.ts` (`PROJECT_COLS`, `cleanProject`)

**Interfaces:**
- Produces tables read by Task 5's SQL function and Task 6's API: `project_contractors`, `project_deliveries`, `issues`, `traffic_light_settings`, `traffic_light_snapshots`, `work_tasks.source/axis/closed_by`, `projects.contract_due_date/project_type`.
- Entry value keys consumed by triggers: `crew_rows` (JSON `[{contractor,workers,hours}]`), `issue_blocking` (`'כן'|'לא'|'yes'|'no'`), `arrived_items` (JSON `string[]` of delivery ids, stored as a JSON string like every other table key).

- [ ] **Step 1: Append the schema to 0064**

```sql
-- ---------- 3. projects ----------
alter table projects add column if not exists contract_due_date date;
alter table projects add column if not exists project_type text not null default 'coop';
comment on column projects.contract_due_date is 'תאריך מסירה חוזי. Null → ציר הזמן אדום ("אין תאריך חוזי").';
comment on column projects.project_type is 'Selects the wbs_templates rows (coop, hatchery, …).';

-- ---------- 4. contractors + agreed headcount ----------
create table if not exists project_contractors (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  name           text not null,
  agreed_workers int  not null default 0 check (agreed_workers >= 0),
  critical       boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists project_contractors_project on project_contractors (project_id);
alter table project_contractors enable row level security;
drop policy if exists read_project_contractors on project_contractors;
create policy read_project_contractors on project_contractors for select using (is_member());
drop policy if exists write_project_contractors on project_contractors;
create policy write_project_contractors on project_contractors for all
  using (is_admin() or can_edit('traffic_light'))
  with check (is_admin() or can_edit('traffic_light'));

-- ---------- 5. deliveries ----------
create table if not exists project_deliveries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  item            text not null,
  wbs_template_id uuid references wbs_templates(id) on delete set null,
  need_date       date not null,
  status          text not null default 'not_ordered'
                  check (status in ('not_ordered', 'ordered', 'shipped', 'on_site')),
  eta             date,
  owner_email     text,
  notes           text,
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create index if not exists project_deliveries_project_need on project_deliveries (project_id, need_date);
alter table project_deliveries enable row level security;
drop policy if exists read_project_deliveries on project_deliveries;
create policy read_project_deliveries on project_deliveries for select using (is_member());
drop policy if exists write_project_deliveries on project_deliveries;
create policy write_project_deliveries on project_deliveries for all
  using (is_admin() or can_edit('traffic_light') or can_edit('deliveries'))
  with check (is_admin() or can_edit('traffic_light') or can_edit('deliveries'));

-- ---------- 6. issues register (מרשם בלת"מ) ----------
create table if not exists issues (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  seq             int  not null default 0,
  entry_id        uuid unique references entries(id) on delete set null,
  opened_on       date not null default current_date,
  description     text not null default '',
  owner_kind      text not null default 'other'
                  check (owner_kind in ('engineering', 'purchasing', 'customer', 'contractor', 'weather', 'other')),
  owner_email     text,
  due_date        date,
  blocking        boolean not null default false,
  wbs_template_id uuid references wbs_templates(id) on delete set null,
  systemic        boolean not null default false,
  closed_on       date,
  closure_note    text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  unique (project_id, seq)
);
create index if not exists issues_project_open on issues (project_id) where closed_on is null;
alter table issues enable row level security;

drop policy if exists read_issues on issues;
create policy read_issues on issues for select using (is_member());
drop policy if exists insert_issues on issues;
create policy insert_issues on issues for insert with check (is_member());
-- PMO edits anything; the diary author may still edit their own open item
drop policy if exists update_issues on issues;
create policy update_issues on issues for update
  using (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid() and closed_on is null))
  with check (is_admin() or can_edit('traffic_light') or (is_member() and created_by = auth.uid()));
drop policy if exists delete_issues on issues;
create policy delete_issues on issues for delete using (is_admin() or can_edit('traffic_light'));

-- per-project running number
create or replace function issues_assign_seq() returns trigger
language plpgsql as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq from issues where project_id = new.project_id;
  end if;
  return new;
end $$;
drop trigger if exists issues_seq on issues;
create trigger issues_seq before insert on issues for each row execute function issues_assign_seq();

-- ---------- 7. work_tasks: source + axis, PMO-only closing of traffic-light tasks ----------
alter table work_tasks add column if not exists source text not null default 'manual'
  check (source in ('manual', 'traffic_light'));
alter table work_tasks add column if not exists axis text
  check (axis in ('time', 'supply', 'client', 'crew', 'issues', 'gray'));
alter table work_tasks add column if not exists closed_by text;
create index if not exists work_tasks_tl_open on work_tasks (project_id, axis)
  where source = 'traffic_light' and status = 'open';

drop policy if exists rw_work_tasks on work_tasks;
drop policy if exists read_work_tasks on work_tasks;
create policy read_work_tasks on work_tasks for select using (is_member());
drop policy if exists insert_work_tasks on work_tasks;
create policy insert_work_tasks on work_tasks for insert with check (is_member());
drop policy if exists update_work_tasks on work_tasks;
create policy update_work_tasks on work_tasks for update
  using (is_member())
  with check (is_member() and (source <> 'traffic_light' or status <> 'done' or can_edit('traffic_light')));
drop policy if exists delete_work_tasks on work_tasks;
create policy delete_work_tasks on work_tasks for delete
  using (is_member() and (source <> 'traffic_light' or is_admin() or can_edit('traffic_light')));

-- ---------- 8. thresholds (single row) + snapshots ----------
create table if not exists traffic_light_settings (
  id                        int primary key default 1 check (id = 1),
  time_amber_days           int not null default 7,
  time_red_days             int not null default 30,
  lookahead_days            int not null default 42,
  supply_red_window_days    int not null default 21,
  supply_eta_margin_days    int not null default 5,
  crew_green_pct            int not null default 90,
  crew_red_pct              int not null default 70,
  crew_window_days          int not null default 7,
  issue_open_days           int not null default 7,
  issue_block_resolve_days  int not null default 14,
  gray_missing_workdays     int not null default 2,
  gray_gantt_days           int not null default 14,
  updated_at                timestamptz not null default now()
);
insert into traffic_light_settings (id) values (1) on conflict (id) do nothing;
alter table traffic_light_settings enable row level security;
drop policy if exists read_tl_settings on traffic_light_settings;
create policy read_tl_settings on traffic_light_settings for select using (is_member());
drop policy if exists admin_tl_settings on traffic_light_settings;
create policy admin_tl_settings on traffic_light_settings for update using (is_admin()) with check (is_admin());

create table if not exists traffic_light_snapshots (
  id        uuid primary key default gen_random_uuid(),
  taken_at  timestamptz not null default now(),
  payload   jsonb not null
);
alter table traffic_light_snapshots enable row level security;
drop policy if exists read_tl_snapshots on traffic_light_snapshots;
create policy read_tl_snapshots on traffic_light_snapshots for select using (can_view('traffic_light'));

-- ---------- 9. diary → register / arrivals ----------

-- Malfunction departments become the spec's closed owner list. Old labels still map.
update field_definitions set options =
  '[{"he":"אין","en":"None"},{"he":"הנדסה","en":"Engineering"},{"he":"רכש-הספקות","en":"Purchasing & supply"},{"he":"לקוח","en":"Customer"},{"he":"קבלן","en":"Contractor"},{"he":"מזג אוויר","en":"Weather"},{"he":"אחר","en":"Other"}]'::jsonb
where key = 'malfunction_dept';

-- stored label (any language, old or new) → owner_kind; null = no malfunction
create or replace function tl_owner_kind(p_label text) returns text
language sql immutable as $$
  select case lower(trim(coalesce(p_label, '')))
    when 'הנדסה' then 'engineering' when 'engineering' then 'engineering'
    when 'רכש-הספקות' then 'purchasing' when 'purchasing & supply' then 'purchasing'
    when 'רכש' then 'purchasing' when 'purchasing' then 'purchasing'
    when 'לוגיסטיקה ומחסן' then 'purchasing' when 'logistics & warehouse' then 'purchasing' when 'logistics_warehouse' then 'purchasing'
    when 'לקוח' then 'customer' when 'customer' then 'customer'
    when 'לקוחות' then 'customer' when 'customers' then 'customer'
    when 'קבלן' then 'contractor' when 'contractor' then 'contractor'
    when 'קבלנים' then 'contractor' when 'contractors' then 'contractor'
    when 'מזג אוויר' then 'weather' when 'weather' then 'weather'
    when 'כספים' then 'other' when 'finance' then 'other'
    when 'אחר' then 'other' when 'other' then 'other'
    else null end;
$$;

create or replace function entries_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text := tl_owner_kind(new.values ->> 'malfunction_dept');
  blocking boolean := lower(trim(coalesce(new.values ->> 'issue_blocking', ''))) in ('כן', 'yes', 'true');
begin
  if kind is null then
    -- dept went back to "none": drop the auto item unless the PMO already took it over
    delete from issues where entry_id = new.id and owner_email is null and due_date is null and closed_on is null;
    return new;
  end if;
  insert into issues (project_id, entry_id, opened_on, description, owner_kind, blocking, created_by)
  values (new.project_id, new.id, coalesce(new.work_date, current_date),
          coalesce(new.values ->> 'malfunction', ''), kind, blocking, new.created_by)
  on conflict (entry_id) do update
    set description = excluded.description,
        owner_kind  = case when issues.owner_email is null then excluded.owner_kind else issues.owner_kind end,
        blocking    = excluded.blocking;
  return new;
exception when others then
  raise warning 'entries_to_issue: %', sqlerrm;
  return new;
end $$;
drop trigger if exists entries_to_issue_trg on entries;
create trigger entries_to_issue_trg after insert or update of values on entries
  for each row execute function entries_to_issue();

-- arrived_items is stored as a JSON *string* (the client JSON.stringify()s every table
-- key) — accept a real array too.
create or replace function entries_arrivals() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  begin
    select array_agg(x::uuid) into ids
    from jsonb_array_elements_text(
      case when jsonb_typeof(new.values -> 'arrived_items') = 'string'
           then (new.values ->> 'arrived_items')::jsonb
           else coalesce(new.values -> 'arrived_items', '[]'::jsonb) end) as x
    where x ~ '^[0-9a-f-]{36}$';
  exception when others then ids := null; end;
  if ids is null then return new; end if;
  update project_deliveries
     set status = 'on_site', updated_at = now(),
         updated_by = coalesce((select lower(email) from auth.users where id = new.created_by), 'diary')
   where id = any (ids) and project_id = new.project_id and status <> 'on_site';
  return new;
exception when others then
  raise warning 'entries_arrivals: %', sqlerrm;
  return new;
end $$;
drop trigger if exists entries_arrivals_trg on entries;
create trigger entries_arrivals_trg after insert or update of values on entries
  for each row execute function entries_arrivals();
```

- [ ] **Step 2: Extend the Project type and columns**

`src/data.ts` — add two optional fields to `Project`:

```ts
  contract_due_date?: string | null // תאריך מסירה חוזי (traffic light, time axis)
  project_type?: string | null      // wbs_templates.project_type; default 'coop'
```

`src/api.ts`:

```ts
const PROJECT_COLS = 'id,name,active,location,budget,pmo,start_date,end_date,staff,notes,priority,work_days,contract_due_date,project_type'
```

In `cleanProject` add to the returned object:

```ts
    contract_due_date: p.contract_due_date || null,
    project_type: p.project_type || 'coop',
```

- [ ] **Step 3: Lint + tests**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0064_traffic_light_schema.sql src/data.ts src/api.ts
git commit -m "feat(traffic): schema — contractors, deliveries, issues register, settings, snapshots, diary triggers"
```

---

### Task 4: Pure TS model + threshold rules

**Files:**
- Create: `src/traffic/model.ts`
- Create: `src/traffic/rules.ts`
- Create: `src/traffic/rules.test.ts`

**Interfaces:**
- Produces (`model.ts`):
  - `type Color = 'gray' | 'red' | 'amber' | 'green' | 'na'`
  - `type AxisKey = 'time' | 'supply' | 'client' | 'crew' | 'issues'`
  - `AXES: AxisKey[]` in display order `['time','supply','client','crew','issues']`
  - `rank(c: Color): number` (gray 4, red 3, amber 2, green 1, na 0), `worst(...cs: Color[]): Color`
  - `interface Settings` (all 12 columns of `traffic_light_settings`, numbers) + `DEFAULT_SETTINGS`
  - `interface AxisResult { color: Color; reason: string; missing_data?: boolean; evidence?: Record<string, unknown> }`
  - `interface ProjectLight { project_id: string; name: string; manager: string | null; project_type: string; color: Color; gray_reason: string | null; axes: Record<AxisKey, AxisResult>; due: { contract: string | null; forecast: string | null; delta_days: number | null }; last_entry_on: string | null; gantt_imported_at: string | null; action_line: string }`
- Produces (`rules.ts`): `timeColor`, `categoryColor`, `supplyItemColor`, `crewColor`, `issuesColor`, `grayReason` — signatures below.

- [ ] **Step 1: Write the failing tests**

`src/traffic/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, rank, worst } from './model'
import { categoryColor, crewColor, grayReason, issuesColor, supplyItemColor, timeColor } from './rules'

const S = DEFAULT_SETTINGS

describe('severity', () => {
  it('orders gray > red > amber > green > na', () => {
    expect([rank('gray'), rank('red'), rank('amber'), rank('green'), rank('na')]).toEqual([4, 3, 2, 1, 0])
    expect(worst('green', 'amber', 'na')).toBe('amber')
    expect(worst('red', 'gray')).toBe('gray')
    expect(worst()).toBe('na')
  })
})

describe('timeColor (project level, spec 4.1)', () => {
  it('is red without a contract date', () => {
    expect(timeColor(null, 10, S)).toEqual({ color: 'red', delta: null })
  })
  it('thresholds: ≤7 green, 8–30 amber, >30 red', () => {
    expect(timeColor('2026-12-01', 7, S).color).toBe('green')
    expect(timeColor('2026-12-01', 8, S).color).toBe('amber')
    expect(timeColor('2026-12-01', 30, S).color).toBe('amber')
    expect(timeColor('2026-12-01', 31, S).color).toBe('red')
    expect(timeColor('2026-12-01', -23, S).color).toBe('green')
  })
  it('is red when the contract date already passed', () => {
    expect(timeColor('2026-01-01', 0, S, '2026-09-03').color).toBe('red')
  })
})

describe('categoryColor (spec 4.1 category level)', () => {
  const base = { critical: false, planned_finish: '2026-08-01', pct: 100, start: '2026-05-01', base_start: '2026-05-01', blocked_due: undefined as string | null | undefined, blocked: false }
  it('finished category on time is green', () => {
    expect(categoryColor(base, S, '2026-09-03')).toBe('green')
  })
  it('finish date passed and pct < 100 is amber', () => {
    expect(categoryColor({ ...base, pct: 80 }, S, '2026-09-03')).toBe('amber')
  })
  it('critical category whose start slipped past baseline is amber', () => {
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', start: '2026-10-05', base_start: '2026-10-01', pct: 0 }, S, '2026-09-03')).toBe('amber')
    expect(categoryColor({ ...base, critical: false, planned_finish: '2026-12-01', start: '2026-10-05', base_start: '2026-10-01', pct: 0 }, S, '2026-09-03')).toBe('green')
  })
  it('critical category blocked with no fix inside 14 days is red', () => {
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: null }, S, '2026-09-03')).toBe('red')
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: '2026-09-30' }, S, '2026-09-03')).toBe('red')
    expect(categoryColor({ ...base, critical: true, planned_finish: '2026-12-01', pct: 0, blocked: true, blocked_due: '2026-09-10' }, S, '2026-09-03')).toBe('green')
  })
})

describe('supplyItemColor (spec 4.2)', () => {
  const today = '2026-09-03'
  it('on site is green', () => {
    expect(supplyItemColor({ status: 'on_site', need_date: '2026-09-10', eta: null, critical: false }, S, today)).toBe('green')
  })
  it('ETA at least 5 days before need is green, later is amber, none is amber', () => {
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-15', critical: false }, S, today)).toBe('green')
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-16', critical: false }, S, today)).toBe('amber')
    expect(supplyItemColor({ status: 'ordered', need_date: '2026-09-20', eta: null, critical: false }, S, today)).toBe('amber')
  })
  it('ETA after need on a critical category is red', () => {
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-25', critical: true }, S, today)).toBe('red')
    expect(supplyItemColor({ status: 'shipped', need_date: '2026-09-20', eta: '2026-09-25', critical: false }, S, today)).toBe('amber')
  })
  it('not ordered and needed within 3 weeks is red, later is amber', () => {
    expect(supplyItemColor({ status: 'not_ordered', need_date: '2026-09-24', eta: null, critical: false }, S, today)).toBe('red')
    expect(supplyItemColor({ status: 'not_ordered', need_date: '2026-09-25', eta: null, critical: false }, S, today)).toBe('amber')
  })
})

describe('crewColor (spec 4.4)', () => {
  it('all contractors ≥ 90% is green', () => {
    expect(crewColor([{ name: 'a', critical: true, ratio: 0.9, absences: 0 }], S)).toBe('green')
  })
  it('70–90% is amber; critical absence day is amber', () => {
    expect(crewColor([{ name: 'a', critical: false, ratio: 0.89, absences: 0 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: true, ratio: 1, absences: 1 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: false, ratio: 1, absences: 1 }], S)).toBe('green')
  })
  it('critical < 70% or ≥ 2 absences is red', () => {
    expect(crewColor([{ name: 'a', critical: true, ratio: 0.69, absences: 0 }], S)).toBe('red')
    expect(crewColor([{ name: 'a', critical: false, ratio: 0.69, absences: 0 }], S)).toBe('amber')
    expect(crewColor([{ name: 'a', critical: false, ratio: 1, absences: 2 }], S)).toBe('red')
  })
  it('no contractors is na', () => { expect(crewColor([], S)).toBe('na') })
})

describe('issuesColor (spec 4.5)', () => {
  const today = '2026-09-03'
  it('nothing old, nothing blocking is green', () => {
    expect(issuesColor([{ opened_on: '2026-09-01', owner_email: null, due_date: null, blocking: false, systemic: false }], S, today)).toBe('green')
  })
  it('open > 7 days without owner or date is amber', () => {
    expect(issuesColor([{ opened_on: '2026-08-26', owner_email: null, due_date: '2026-09-20', blocking: false, systemic: false }], S, today)).toBe('amber')
    expect(issuesColor([{ opened_on: '2026-08-26', owner_email: 'x@y', due_date: '2026-09-20', blocking: false, systemic: false }], S, today)).toBe('green')
  })
  it('blocking or systemic is red', () => {
    expect(issuesColor([{ opened_on: '2026-09-02', owner_email: 'x@y', due_date: '2026-09-05', blocking: true, systemic: false }], S, today)).toBe('red')
    expect(issuesColor([{ opened_on: '2026-09-02', owner_email: 'x@y', due_date: '2026-09-05', blocking: false, systemic: true }], S, today)).toBe('red')
  })
})

describe('grayReason (spec 4.6)', () => {
  it('flags a missing diary over the last 2 work days and a stale gantt', () => {
    expect(grayReason({ entryInLastWorkdays: false, ganttAgeDays: 3 }, S)).toContain('יומן')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: 15 }, S)).toContain('גאנט')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: null }, S)).toContain('גאנט')
    expect(grayReason({ entryInLastWorkdays: true, ganttAgeDays: 14 }, S)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see failure**

Run: `npx vitest run src/traffic/rules.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/traffic/model.ts`**

```ts
// Shapes of the traffic-light report. Produced by traffic_light() (migration 0065) and
// mirrored here; the TS rules in ./rules.ts exist for unit tests and client recoloring,
// never as a second source of the board's colors.

export type Color = 'gray' | 'red' | 'amber' | 'green' | 'na'
export type AxisKey = 'time' | 'supply' | 'client' | 'crew' | 'issues'
export const AXES: AxisKey[] = ['time', 'supply', 'client', 'crew', 'issues']

const RANK: Record<Color, number> = { gray: 4, red: 3, amber: 2, green: 1, na: 0 }
export const rank = (c: Color): number => RANK[c] ?? 0
export function worst(...cs: Color[]): Color {
  let out: Color = 'na'
  for (const c of cs) if (rank(c) > rank(out)) out = c
  return out
}

export interface Settings {
  time_amber_days: number
  time_red_days: number
  lookahead_days: number
  supply_red_window_days: number
  supply_eta_margin_days: number
  crew_green_pct: number
  crew_red_pct: number
  crew_window_days: number
  issue_open_days: number
  issue_block_resolve_days: number
  gray_missing_workdays: number
  gray_gantt_days: number
}

export const DEFAULT_SETTINGS: Settings = {
  time_amber_days: 7, time_red_days: 30, lookahead_days: 42,
  supply_red_window_days: 21, supply_eta_margin_days: 5,
  crew_green_pct: 90, crew_red_pct: 70, crew_window_days: 7,
  issue_open_days: 7, issue_block_resolve_days: 14,
  gray_missing_workdays: 2, gray_gantt_days: 14,
}

export interface AxisResult {
  color: Color
  reason: string
  missing_data?: boolean
  evidence?: Record<string, unknown>
}

export interface ProjectLight {
  project_id: string
  name: string
  manager: string | null
  project_type: string
  color: Color
  gray_reason: string | null
  axes: Record<AxisKey, AxisResult>
  due: { contract: string | null; forecast: string | null; delta_days: number | null }
  last_entry_on: string | null
  gantt_imported_at: string | null
  action_line: string
}

/** Board order: red, gray, amber, green (spec 8.1), then name. */
const BOARD_ORDER: Record<Color, number> = { red: 0, gray: 1, amber: 2, green: 3, na: 4 }
export const sortForBoard = (a: ProjectLight, b: ProjectLight): number =>
  BOARD_ORDER[a.color] - BOARD_ORDER[b.color] || a.name.localeCompare(b.name)

export const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000)
export const todayIso = (): string => new Date().toISOString().slice(0, 10)
```

- [ ] **Step 4: Implement `src/traffic/rules.ts`**

```ts
// Threshold → color, one function per spec table (chapter 4). Pure, date-in / color-out.
// These mirror the plpgsql in 0065; keep the two in step when a threshold moves.
import { dayDiff, todayIso, worst, type Color, type Settings } from './model'

/** Spec 4.1 project level. delta = forecast − contract (days). */
export function timeColor(contract: string | null, delta: number | null, s: Settings, today = todayIso()): { color: Color; delta: number | null } {
  if (!contract) return { color: 'red', delta: null }
  if (dayDiff(contract, today) < 0) return { color: 'red', delta }
  if (delta === null) return { color: 'amber', delta }
  if (delta <= s.time_amber_days) return { color: 'green', delta }
  if (delta <= s.time_red_days) return { color: 'amber', delta }
  return { color: 'red', delta }
}

export interface CategoryFacts {
  critical: boolean
  planned_finish: string | null
  start: string | null
  base_start: string | null
  pct: number
  blocked: boolean
  blocked_due?: string | null
}

/** Spec 4.1 category level. */
export function categoryColor(c: CategoryFacts, s: Settings, today = todayIso()): Color {
  const out: Color[] = ['green']
  if (c.planned_finish && dayDiff(c.planned_finish, today) < 0 && c.pct < 100) out.push('amber')
  if (c.critical && c.start && c.base_start && dayDiff(c.start, c.base_start) > 0) out.push('amber')
  if (c.critical && c.blocked) {
    const fixSoon = c.blocked_due != null && dayDiff(c.blocked_due, today) <= s.issue_block_resolve_days
    if (!fixSoon) out.push('red')
  }
  return worst(...out)
}

export interface SupplyFacts {
  status: 'not_ordered' | 'ordered' | 'shipped' | 'on_site'
  need_date: string
  eta: string | null
  critical: boolean
}

/** Spec 4.2, one item already inside the lookahead window. */
export function supplyItemColor(i: SupplyFacts, s: Settings, today = todayIso()): Color {
  if (i.status === 'on_site') return 'green'
  const daysToNeed = dayDiff(i.need_date, today)
  if (i.status === 'not_ordered') return daysToNeed <= s.supply_red_window_days ? 'red' : 'amber'
  if (!i.eta) return 'amber'
  const slack = dayDiff(i.need_date, i.eta) // positive = eta before need
  if (slack < 0) return i.critical ? 'red' : 'amber'
  return slack >= s.supply_eta_margin_days ? 'green' : 'amber'
}

export interface CrewFacts { name: string; critical: boolean; ratio: number; absences: number }

/** Spec 4.4. ratio = actual / agreed over the window; absences = work days with 0. */
export function crewColor(rows: CrewFacts[], s: Settings): Color {
  if (rows.length === 0) return 'na'
  const out: Color[] = ['green']
  for (const r of rows) {
    const pct = r.ratio * 100
    if (r.absences >= 2) out.push('red')
    if (r.critical && pct < s.crew_red_pct) out.push('red')
    else if (pct < s.crew_green_pct) out.push('amber')
    if (r.critical && r.absences === 1) out.push('amber')
  }
  return worst(...out)
}

export interface IssueFacts {
  opened_on: string
  owner_email: string | null
  due_date: string | null
  blocking: boolean
  systemic: boolean
}

/** Spec 4.5, open issues only. */
export function issuesColor(items: IssueFacts[], s: Settings, today = todayIso()): Color {
  const out: Color[] = ['green']
  for (const i of items) {
    if (i.blocking || i.systemic) out.push('red')
    const age = dayDiff(today, i.opened_on)
    if (age > s.issue_open_days && (!i.owner_email || !i.due_date)) out.push('amber')
  }
  return worst(...out)
}

/** Spec 4.6. Returns the Hebrew reason, or null when the project is reporting. */
export function grayReason(f: { entryInLastWorkdays: boolean; ganttAgeDays: number | null }, s: Settings): string | null {
  if (!f.entryInLastWorkdays) return `לא התקבל יומן עבודה ב-${s.gray_missing_workdays} ימי העבודה האחרונים`
  if (f.ganttAgeDays === null) return 'אין גאנט פעיל לפרויקט'
  if (f.ganttAgeDays > s.gray_gantt_days) return `הגאנט לא עודכן ${f.ganttAgeDays} ימים (מעל ${s.gray_gantt_days})`
  return null
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/traffic/rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/traffic/model.ts src/traffic/rules.ts src/traffic/rules.test.ts
git commit -m "feat(traffic): pure threshold rules + report model"
```

---

### Task 5: `traffic_light()` SQL function + weekly job (migration 0065)

**Files:**
- Create: `supabase/migrations/0065_traffic_light_fn.sql`
- Create: `src/traffic/fn.sql.test.ts` (shape checks on the migration text, same style as `perms.sql.test.ts`)

**Interfaces:**
- Produces RPC `traffic_light(p_project uuid default null) returns jsonb` — array of `ProjectLight` (Task 4 model). Callable by `authenticated`; raises `forbidden` unless `can_view('traffic_light')`.
- Produces `traffic_light_weekly() returns integer` (service_role/postgres only) scheduled as cron job `traffic-light-weekly` at `0 4 * * 0`.
- Helper functions (internal, revoked from authenticated): `tl_norm(text)`, `tl_rank(text)`, `tl_worst(text[])`, `tl_gray(projects, traffic_light_settings, date)`, `tl_time(...)`, `tl_supply(...)`, `tl_crew(...)`, `tl_issues(...)`, `tl_project(...)`.

- [ ] **Step 1: Write the shape test**

`src/traffic/fn.sql.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync('supabase/migrations/0065_traffic_light_fn.sql', 'utf8')

describe('0065 traffic_light()', () => {
  it('guards the RPC with can_view(traffic_light) and exposes it to authenticated only', () => {
    expect(SQL).toMatch(/can_view\('traffic_light'\)/)
    expect(SQL).toContain("grant execute on function traffic_light(uuid) to authenticated")
    expect(SQL).toContain('revoke all on function traffic_light(uuid) from public')
  })
  it('keeps the helpers and the weekly job away from browser callers', () => {
    for (const fn of ['tl_project(projects, traffic_light_settings, date)', 'tl_time(projects, traffic_light_settings, date)',
      'tl_supply(projects, traffic_light_settings, date)', 'tl_crew(projects, traffic_light_settings, date)',
      'tl_issues(projects, traffic_light_settings, date)', 'tl_gray(projects, traffic_light_settings, date)', 'traffic_light_weekly()']) {
      expect(SQL, fn).toContain(`revoke execute on function ${fn} from anon, authenticated`)
    }
  })
  it('schedules the Sunday job once', () => {
    expect(SQL).toContain("cron.schedule('traffic-light-weekly', '0 4 * * 0'")
    expect(SQL).toContain("where not exists (select 1 from cron.job where jobname = 'traffic-light-weekly')")
  })
  it('normalizes names the same way as normName()', () => {
    expect(SQL).toMatch(/regexp_replace\(.*'\[׳״''"\]'.*'g'\)/)
  })
})
```

- [ ] **Step 2: Run to see failure**

Run: `npx vitest run src/traffic/fn.sql.test.ts`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0065_traffic_light_fn.sql`:

```sql
-- דוח רמזור — המנוע. פונקציה אחת, traffic_light(), היא מקור האמת לצבע: המסך החי
-- קורא לה, וגם הסנאפשוט השבועי. הספים נקראים מ-traffic_light_settings; הכללים
-- משוכפלים ב-src/traffic/rules.ts לבדיקות יחידה בלבד.

-- ---------- helpers ----------

-- same as normName() in src/traffic/wbs.ts
create or replace function tl_norm(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[׳״''"]', '', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function tl_rank(p_color text) returns int
language sql immutable as $$
  select case p_color when 'gray' then 4 when 'red' then 3 when 'amber' then 2 when 'green' then 1 else 0 end;
$$;

create or replace function tl_worst(p_colors text[]) returns text
language sql immutable as $$
  select coalesce((select c from unnest(p_colors) c order by tl_rank(c) desc limit 1), 'na');
$$;

-- ---------- gray: no diary in the last N work days, or stale / missing gantt ----------
create or replace function tl_gray(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  d date := today - 1;
  found int := 0;
  guard int := 0;
  has_entry boolean := false;
  last_entry date;
  chart record;
  age int;
begin
  select max(work_date) into last_entry from entries where project_id = p.id;
  -- walk back over the project's work days (default Sun-Fri) until N are collected
  while found < s.gray_missing_workdays and guard < 60 loop
    if extract(dow from d)::int = any (coalesce(p.work_days, '{0,1,2,3,4,5}'::int[])) then
      found := found + 1;
      if exists (select 1 from entries e where e.project_id = p.id and e.work_date = d) then has_entry := true; end if;
    end if;
    d := d - 1; guard := guard + 1;
  end loop;
  -- an entry filed today also counts as reporting
  if exists (select 1 from entries e where e.project_id = p.id and e.work_date = today) then has_entry := true; end if;

  select c.imported_at into chart from gantt_charts c where c.project_id = p.id and c.active order by c.imported_at desc limit 1;
  age := case when chart.imported_at is null then null else (today - (chart.imported_at at time zone 'Asia/Jerusalem')::date) end;

  return jsonb_build_object(
    'last_entry_on', last_entry,
    'gantt_imported_at', chart.imported_at,
    'reason', case
      when not has_entry then 'לא התקבל יומן עבודה ב-' || s.gray_missing_workdays || ' ימי העבודה האחרונים'
      when age is null then 'אין גאנט פעיל לפרויקט'
      when age > s.gray_gantt_days then 'הגאנט לא עודכן ' || age || ' ימים (מעל ' || s.gray_gantt_days || ')'
      else null end);
end $$;

-- ---------- time: forecast vs contract + category table ----------
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
  g record;
  cat_pct numeric;
  cat_color text;
  blocked record;
  reason text;
begin
  select c.id into chart_id from gantt_charts c where c.project_id = p.id and c.active order by c.imported_at desc limit 1;
  if chart_id is not null then
    select (finish_ts)::date into forecast from gantt_tasks
      where chart_id = tl_time.chart_id and milestone and name like '%מסירה סופית%' order by finish_ts desc limit 1;
    if forecast is null then
      select max(finish_ts)::date into forecast from gantt_tasks where chart_id = tl_time.chart_id;
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
    select gt.start_ts::date as start_d, gt.finish_ts::date as finish_d,
           gt.base_start_ts::date as base_start_d, gt.base_finish_ts::date as base_finish_d, gt.pct
      into g
      from gantt_tasks gt
     where gt.chart_id = tl_time.chart_id and gt.is_summary and tl_norm(gt.name) = tl_norm(t.name_he)
     order by gt.sort_order limit 1;
    if chart_id is not null and g.start_d is null then unmatched := unmatched || t.name_he; end if;

    -- diary pct: rows whose task maps to this template row (direct name or legacy map)
    select avg((r ->> 'pct')::numeric) into cat_pct
      from jsonb_array_elements(case when jsonb_typeof(latest -> 'progress_coops') = 'string'
                                     then (latest ->> 'progress_coops')::jsonb
                                     else coalesce(latest -> 'progress_coops', '[]'::jsonb) end) c
      cross join lateral jsonb_array_elements(coalesce(c -> 'rows', '[]'::jsonb)) r
     where tl_norm(r ->> 'task') in (tl_norm(t.name_he), tl_norm(t.name_en))
        or exists (select 1 from wbs_legacy_names ln
                    where ln.project_type = t.project_type and ln.template_sort = t.sort_order
                      and tl_norm(ln.legacy_name) = tl_norm(r ->> 'task'));

    select i.due_date, i.seq into blocked from issues i
     where i.project_id = p.id and i.closed_on is null and i.blocking and i.wbs_template_id = t.id
     order by i.due_date nulls first limit 1;

    cat_color := 'green';
    if g.finish_d is not null and g.finish_d < today and coalesce(cat_pct, g.pct, 0) < 100 then cat_color := 'amber'; end if;
    if t.critical and g.start_d is not null and g.base_start_d is not null and g.start_d > g.base_start_d then cat_color := 'amber'; end if;
    if t.critical and blocked.seq is not null
       and (blocked.due_date is null or blocked.due_date > today + s.issue_block_resolve_days) then cat_color := 'red'; end if;
    if g.start_d is not null then colors := colors || cat_color; end if;

    cats := cats || jsonb_build_object(
      'template_id', t.id, 'sort_order', t.sort_order, 'name_he', t.name_he, 'name_en', t.name_en, 'critical', t.critical,
      'matched', g.start_d is not null,
      'start', g.start_d, 'finish', g.finish_d, 'base_start', g.base_start_d, 'base_finish', g.base_finish_d,
      'gantt_pct', g.pct, 'diary_pct', round(cat_pct), 'blocked_issue', blocked.seq, 'color', cat_color);
  end loop;

  if tl_worst(colors) <> tl_worst(array[colors[1]]) then
    reason := reason || ' · ' || (select string_agg(x ->> 'name_he', ', ') from jsonb_array_elements(cats) x where x ->> 'color' = tl_worst(colors));
  end if;

  return jsonb_build_object(
    'color', tl_worst(colors), 'reason', reason,
    'contract', p.contract_due_date, 'forecast', forecast, 'delta_days', delta,
    'evidence', jsonb_build_object('categories', cats, 'unmatched', to_jsonb(unmatched), 'has_chart', chart_id is not null));
end $$;

-- ---------- supply: items inside the lookahead window ----------
create or replace function tl_supply(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  n_all int;
  items jsonb;
  colors text[];
  worst text;
begin
  select count(*) into n_all from project_deliveries d where d.project_id = p.id;
  if n_all = 0 then
    return jsonb_build_object('color', 'na', 'reason', 'לא הוגדרה רשימת אספקות', 'missing_data', true, 'evidence', '{"items":[]}'::jsonb);
  end if;

  with w as (
    select d.*, coalesce(t.critical, false) as critical,
           case
             when d.status = 'on_site' then 'green'
             when d.status = 'not_ordered' then case when d.need_date <= today + s.supply_red_window_days then 'red' else 'amber' end
             when d.eta is null then 'amber'
             when d.eta > d.need_date then case when coalesce(t.critical, false) then 'red' else 'amber' end
             when d.need_date - d.eta >= s.supply_eta_margin_days then 'green'
             else 'amber' end as color
      from project_deliveries d
      left join wbs_templates t on t.id = d.wbs_template_id
     where d.project_id = p.id and d.status <> 'on_site' and d.need_date <= today + s.lookahead_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'item', w.item, 'need_date', w.need_date, 'status', w.status, 'eta', w.eta,
           'gap_days', case when w.eta is null then null else w.eta - w.need_date end,
           'critical', w.critical, 'color', w.color) order by w.need_date), '[]'::jsonb),
         coalesce(array_agg(w.color), '{}')
    into items, colors
    from w;

  worst := tl_worst(colors);
  if worst = 'na' then worst := 'green'; end if;
  return jsonb_build_object(
    'color', worst,
    'reason', case worst
      when 'green' then 'כל האספקות ל-' || (s.lookahead_days / 7) || ' השבועות הקרובים באתר או עם ETA מאושר'
      else (select count(*) from jsonb_array_elements(items) x where x ->> 'color' = worst) || ' פריטים ' ||
           case worst when 'red' then 'לא הוזמנו / ETA אחרי הצורך בקטגוריה קריטית' else 'ללא ETA או עם ETA אחרי תאריך הצורך' end end,
    'evidence', jsonb_build_object('items', items));
end $$;

-- ---------- crew: agreed vs reported headcount over the window ----------
create or replace function tl_crew(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  rows_json jsonb := '[]'::jsonb;
  colors text[] := '{}';
  c record;
  d record;
  actual numeric; days int; absences int; ratio numeric; color text;
  series jsonb;
begin
  if not exists (select 1 from project_contractors pc where pc.project_id = p.id and pc.active) then
    return jsonb_build_object('color', 'na', 'reason', 'לא הוגדרו קבלנים והיקף מוסכם', 'missing_data', true, 'evidence', '{"contractors":[]}'::jsonb);
  end if;

  for c in select * from project_contractors pc where pc.project_id = p.id and pc.active order by pc.critical desc, pc.name loop
    -- one row per work day that has an entry: workers reported for this contractor (0 = absence)
    with days as (
      select e.work_date,
             coalesce(sum((r ->> 'workers')::numeric), 0) as workers
        from entries e
        left join lateral jsonb_array_elements(
          case when jsonb_typeof(e.values -> 'crew_rows') = 'string' then (e.values ->> 'crew_rows')::jsonb
               else coalesce(e.values -> 'crew_rows', '[]'::jsonb) end) r
          on tl_norm(r ->> 'contractor') = tl_norm(c.name)
       where e.project_id = p.id and e.work_date > today - 28 and e.work_date <= today
       group by e.work_date
    )
    select coalesce(avg(workers) filter (where work_date > today - s.crew_window_days), 0),
           count(*) filter (where work_date > today - s.crew_window_days),
           count(*) filter (where work_date > today - s.crew_window_days and workers = 0),
           coalesce(jsonb_agg(jsonb_build_object('date', work_date, 'workers', workers) order by work_date), '[]'::jsonb)
      into actual, days, absences, series
      from days;

    ratio := case when c.agreed_workers = 0 or days = 0 then null else actual / c.agreed_workers end;
    color := 'green';
    if ratio is not null and ratio * 100 < s.crew_green_pct then color := 'amber'; end if;
    if c.critical and absences = 1 then color := tl_worst(array[color, 'amber']); end if;
    if c.critical and ratio is not null and ratio * 100 < s.crew_red_pct then color := 'red'; end if;
    if absences >= 2 then color := 'red'; end if;
    if days = 0 then color := 'green'; end if;   -- nothing reported in the window: gray handles that
    colors := colors || color;

    rows_json := rows_json || jsonb_build_object(
      'name', c.name, 'critical', c.critical, 'agreed', c.agreed_workers,
      'actual', round(actual, 1), 'ratio', round(coalesce(ratio, 0), 2), 'days', days, 'absences', absences,
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

-- ---------- issues: the open register ----------
create or replace function tl_issues(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  items jsonb; colors text[]; worst text;
begin
  with o as (
    select i.*, today - i.opened_on as days_open,
           case when i.blocking or i.systemic then 'red'
                when today - i.opened_on > s.issue_open_days and (i.owner_email is null or i.due_date is null) then 'amber'
                else 'green' end as color
      from issues i where i.project_id = p.id and i.closed_on is null)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'seq', o.seq, 'description', o.description, 'owner_kind', o.owner_kind, 'owner_email', o.owner_email,
           'due_date', o.due_date, 'days_open', o.days_open, 'blocking', o.blocking, 'systemic', o.systemic,
           'entry_id', o.entry_id, 'color', o.color) order by tl_rank(o.color) desc, o.days_open desc), '[]'::jsonb),
         coalesce(array_agg(o.color), '{}')
    into items, colors from o;
  worst := tl_worst(colors); if worst = 'na' then worst := 'green'; end if;
  return jsonb_build_object(
    'color', worst,
    'reason', case worst
      when 'green' then 'אין בלת"מ פתוח מעל ' || s.issue_open_days || ' ימים ואין חוסם'
      when 'red' then (select string_agg('#' || (x ->> 'seq') || ' ' || left(x ->> 'description', 60) ||
                          case when (x ->> 'systemic')::boolean then ' — בלת"מ מערכתי, משימה להנדסה' else ' — חוסם עבודה' end, ' · ')
                         from jsonb_array_elements(items) x where x ->> 'color' = 'red')
      else (select count(*) from jsonb_array_elements(items) x where x ->> 'color' = 'amber') || ' פריטים פתוחים מעל ' || s.issue_open_days || ' ימים ללא אחראי ותאריך' end,
    'evidence', jsonb_build_object('items', items));
end $$;

-- ---------- one project ----------
create or replace function tl_project(p projects, s traffic_light_settings, today date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  gray jsonb := tl_gray(p, s, today);
  t jsonb := tl_time(p, s, today);
  sup jsonb := tl_supply(p, s, today);
  cr jsonb := tl_crew(p, s, today);
  iss jsonb := tl_issues(p, s, today);
  cli jsonb := jsonb_build_object('color', 'na', 'reason', 'שלב ב׳');
  color text;
  action text;
  worst_axis jsonb;
  manager text;
begin
  color := tl_worst(array[t ->> 'color', sup ->> 'color', cr ->> 'color', iss ->> 'color']);
  if color = 'na' then color := 'green'; end if;
  if gray ->> 'reason' is not null then color := 'gray'; end if;

  select x into worst_axis from unnest(array[t, sup, cr, iss]) x order by tl_rank(x ->> 'color') desc limit 1;
  action := case
    when color = 'gray' then gray ->> 'reason'
    when color = 'green' then ''
    else coalesce(worst_axis ->> 'reason', '') end;

  select e.values ->> 'manager_name' into manager from entries e where e.project_id = p.id order by e.work_date desc, e.created_at desc limit 1;

  return jsonb_build_object(
    'project_id', p.id, 'name', p.name, 'manager', coalesce(nullif(manager, ''), p.pmo), 'project_type', coalesce(p.project_type, 'coop'),
    'color', color, 'gray_reason', gray ->> 'reason',
    'axes', jsonb_build_object(
      'time', t - 'contract' - 'forecast' - 'delta_days', 'supply', sup, 'client', cli, 'crew', cr, 'issues', iss),
    'due', jsonb_build_object('contract', t -> 'contract', 'forecast', t -> 'forecast', 'delta_days', t -> 'delta_days'),
    'last_entry_on', gray -> 'last_entry_on', 'gantt_imported_at', gray -> 'gantt_imported_at',
    'action_line', action);
end $$;

-- ---------- the RPC ----------
create or replace function traffic_light(p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s traffic_light_settings%rowtype;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  out jsonb := '[]'::jsonb;
  p projects%rowtype;
begin
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') and not can_view('traffic_light') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from traffic_light_settings where id = 1;
  for p in select * from projects pr where pr.active and (p_project is null or pr.id = p_project) order by pr.name loop
    out := out || tl_project(p, s, today);
  end loop;
  return out;
end $$;

revoke all on function traffic_light(uuid) from public;
grant execute on function traffic_light(uuid) to authenticated;

revoke all on function tl_norm(text) from public;  grant execute on function tl_norm(text) to authenticated;
revoke all on function tl_rank(text) from public;  grant execute on function tl_rank(text) to authenticated;
revoke all on function tl_worst(text[]) from public; grant execute on function tl_worst(text[]) to authenticated;
revoke all on function tl_gray(projects, traffic_light_settings, date) from public;
revoke execute on function tl_gray(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_time(projects, traffic_light_settings, date) from public;
revoke execute on function tl_time(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_supply(projects, traffic_light_settings, date) from public;
revoke execute on function tl_supply(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_crew(projects, traffic_light_settings, date) from public;
revoke execute on function tl_crew(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_issues(projects, traffic_light_settings, date) from public;
revoke execute on function tl_issues(projects, traffic_light_settings, date) from anon, authenticated;
revoke all on function tl_project(projects, traffic_light_settings, date) from public;
revoke execute on function tl_project(projects, traffic_light_settings, date) from anon, authenticated;

-- ---------- weekly snapshot + tasks (Sunday 07:00 Israel ≈ 04:00 UTC) ----------
create or replace function traffic_light_weekly() returns integer
language plpgsql security definer set search_path = public as $$
declare
  payload jsonb;
  pr jsonb; ax record;
  n int := 0;
  axis_names text[] := array['time', 'supply', 'crew', 'issues'];
  a text; axis jsonb; title text;
begin
  if coalesce(auth.role(), 'postgres') not in ('service_role', 'postgres') then return 0; end if;
  payload := traffic_light(null);
  insert into traffic_light_snapshots (payload) values (payload);

  for pr in select * from jsonb_array_elements(payload) loop
    -- gray → one task on axis 'gray'
    if pr ->> 'color' = 'gray' then
      if not exists (select 1 from work_tasks w where w.project_id = (pr ->> 'project_id')::uuid and w.source = 'traffic_light' and w.axis = 'gray' and w.status = 'open') then
        insert into work_tasks (title, project_id, source, axis, created_by)
        values ('רמזור · אפור · ' || (pr ->> 'gray_reason'), (pr ->> 'project_id')::uuid, 'traffic_light', 'gray', 'system');
        n := n + 1;
      end if;
    end if;
    foreach a in array axis_names loop
      axis := pr -> 'axes' -> a;
      if (axis ->> 'color') in ('red', 'amber') or coalesce((axis ->> 'missing_data')::boolean, false) then
        title := case
          when coalesce((axis ->> 'missing_data')::boolean, false) then 'להשלים נתונים: ' || case a when 'crew' then 'קבלנים והיקף מוסכם' when 'supply' then 'רשימת אספקות' else a end
          else 'רמזור · ' || case a when 'time' then 'זמן' when 'supply' then 'הספקות' when 'crew' then 'כוח אדם' else 'בלת"מ' end || ' · ' || left(axis ->> 'reason', 180) end;
        if not exists (select 1 from work_tasks w where w.project_id = (pr ->> 'project_id')::uuid and w.source = 'traffic_light' and w.axis = a and w.status = 'open') then
          insert into work_tasks (title, project_id, source, axis, created_by)
          values (title, (pr ->> 'project_id')::uuid, 'traffic_light', a, 'system');
          n := n + 1;
        end if;
      end if;
    end loop;
  end loop;

  insert into notifications (recipient_email, title, body, link)
  select lower(ae.email), '🚦 דוח רמזור שבועי מוכן',
         (select count(*) from jsonb_array_elements(payload) x where x ->> 'color' = 'red') || ' אדומים · ' ||
         (select count(*) from jsonb_array_elements(payload) x where x ->> 'color' = 'gray') || ' אפורים · ' || n || ' משימות חדשות',
         '/traffic'
    from allowed_emails ae
   where ae.active and ae.role in ('admin', 'manager');
  return n;
end $$;
revoke all on function traffic_light_weekly() from public;
revoke execute on function traffic_light_weekly() from anon, authenticated;
grant execute on function traffic_light_weekly() to service_role, postgres;

select cron.schedule('traffic-light-weekly', '0 4 * * 0', $$select traffic_light_weekly()$$)
where not exists (select 1 from cron.job where jobname = 'traffic-light-weekly');
```

- [ ] **Step 4: Run the shape test**

Run: `npx vitest run src/traffic/fn.sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply both migrations to the project and smoke-test**

Use the Supabase MCP `apply_migration` for `0064_traffic_light_schema` then `0065_traffic_light_fn` (project is the WorkDiary Supabase project; confirm with `list_projects`). Then `execute_sql`:

```sql
select jsonb_pretty(traffic_light());
```

Expected: a JSON array, one element per active project, each with `color`, `axes.time/supply/client/crew/issues`, `due`, `action_line`. Projects without a diary in the last 2 work days come back `gray`; projects without contractors/deliveries have `crew`/`supply` = `na` with `missing_data: true`. If the function errors, fix the SQL in the migration file and re-apply (`create or replace` makes it idempotent).

Also verify the trigger path:

```sql
select seq, description, owner_kind, blocking from issues order by created_at desc limit 5;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0065_traffic_light_fn.sql src/traffic/fn.sql.test.ts
git commit -m "feat(traffic): traffic_light() engine, weekly snapshot + task creation"
```

---

### Task 6: Traffic API layer + i18n dictionary

**Files:**
- Create: `src/traffic/api.ts`
- Create: `src/traffic/i18n.ts`
- Modify: `src/i18n.test.ts` (register `TL`)

**Interfaces:**
- Produces (`api.ts`):
  - `fetchTrafficLight(projectId?: string): Promise<ProjectLight[]>`
  - `fetchSnapshots(limit = 12): Promise<{ id: string; taken_at: string }[]>`, `fetchSnapshot(id: string): Promise<{ id: string; taken_at: string; payload: ProjectLight[] }>`
  - `fetchSettings(): Promise<Settings>`, `updateSettings(patch: Partial<Settings>): Promise<void>`
  - `fetchTemplates(): Promise<WbsTemplate[]>`, `upsertTemplate(t: Partial<WbsTemplate> & { project_type: string; name_he: string; name_en: string; sort_order: number }): Promise<void>`, `deleteTemplate(id: string)`
  - `interface Contractor { id: string; project_id: string; name: string; agreed_workers: number; critical: boolean; active: boolean }`, `fetchContractors(projectId)`, `upsertContractor(c)`, `deleteContractor(id)`
  - `interface Delivery { id: string; project_id: string; item: string; wbs_template_id: string | null; need_date: string; status: DeliveryStatus; eta: string | null; owner_email: string | null; notes: string | null; updated_at: string; updated_by: string | null }`, `type DeliveryStatus = 'not_ordered'|'ordered'|'shipped'|'on_site'`, `fetchDeliveries(projectId)`, `upsertDelivery(d, by: string)`, `deleteDelivery(id)`
  - `interface Issue { id: string; project_id: string; seq: number; entry_id: string | null; opened_on: string; description: string; owner_kind: OwnerKind; owner_email: string | null; due_date: string | null; blocking: boolean; wbs_template_id: string | null; systemic: boolean; closed_on: string | null; closure_note: string | null; created_by: string | null }`, `type OwnerKind = 'engineering'|'purchasing'|'customer'|'contractor'|'weather'|'other'`, `fetchIssues(projectId, open: boolean)`, `updateIssue(id, patch)`, `createIssue(i)`
  - `createTrafficTask(projectId: string, axis: AxisKey | 'gray', title: string, createdBy: string, assignee?: string | null, due?: string | null): Promise<void>`
- Produces (`i18n.ts`): `TL` dictionary and `tl(lang, key)`.

- [ ] **Step 1: Register the dictionary in the completeness test (fails first)**

In `src/i18n.test.ts` add the import and the row:

```ts
import { TL as TRAFFIC_TL } from './traffic/i18n'
…
  ['traffic/i18n.ts', TRAFFIC_TL as Record<string, { he: string; en: string }>],
```

Run: `npx vitest run src/i18n.test.ts` → FAIL (module missing).

- [ ] **Step 2: Create `src/traffic/i18n.ts`**

```ts
// Bilingual strings for the traffic-light module (רמזור).
import type { Lang } from '../i18n'

export const TL = {
  nav_traffic:        { he: 'רמזור', en: 'Traffic light' },
  nav_wbs:            { he: 'תבניות WBS', en: 'WBS templates' },
  nav_tl_settings:    { he: 'ספי רמזור', en: 'Traffic-light thresholds' },

  board_kicker:       { he: 'בקרת פרויקטים', en: 'Project control' },
  board_title:        { he: 'דוח רמזור', en: 'Traffic-light report' },
  board_live:         { he: 'חי', en: 'Live' },
  board_snapshot:     { he: 'סנאפשוט', en: 'Snapshot' },
  board_snapshot_of:  { he: 'סנאפשוט מ-', en: 'Snapshot of ' },
  board_live_failed:  { he: 'החישוב החי נכשל — מציג סנאפשוט', en: 'Live calculation failed — showing snapshot' },
  board_empty:        { he: 'אין פרויקטים פעילים', en: 'No active projects' },
  board_col_project:  { he: 'פרויקט', en: 'Project' },
  board_col_due:      { he: 'מסירה', en: 'Delivery' },
  board_col_action:   { he: 'נדרש מסמנכ"ל השבוע', en: 'Required from the VP this week' },
  board_col_last:     { he: 'דיווח אחרון', en: 'Last report' },
  board_no_contract:  { he: 'אין תאריך חוזי', en: 'No contract date' },
  board_days:         { he: 'ימים', en: 'days' },
  board_no_report:    { he: 'אין דיווח', en: 'No report' },
  board_run_weekly:   { he: 'הפק סנאפשוט עכשיו', en: 'Snapshot now' },

  axis_time:          { he: 'זמן', en: 'Time' },
  axis_supply:        { he: 'הספקות', en: 'Supplies' },
  axis_client:        { he: 'לקוח', en: 'Customer' },
  axis_crew:          { he: 'כוח אדם', en: 'Crew' },
  axis_issues:        { he: 'בלת"מ', en: 'Issues' },
  axis_gray:          { he: 'דיווח', en: 'Reporting' },

  color_green:        { he: 'ירוק', en: 'Green' },
  color_amber:        { he: 'כתום', en: 'Amber' },
  color_red:          { he: 'אדום', en: 'Red' },
  color_gray:         { he: 'אפור', en: 'Gray' },
  color_na:           { he: 'לא נמדד', en: 'Not measured' },

  proj_back:          { he: 'לדוח הרמזור', en: 'Back to the board' },
  proj_task_btn:      { he: 'משימה', en: 'Task' },
  proj_task_title:    { he: 'משימה חדשה מהרמזור', en: 'New traffic-light task' },
  proj_task_what:     { he: 'מה', en: 'What' },
  proj_task_who:      { he: 'מי', en: 'Who' },
  proj_task_when:     { he: 'עד מתי', en: 'By when' },
  proj_task_save:     { he: 'יצירת משימה', en: 'Create task' },
  proj_tasks_title:   { he: 'משימות פתוחות', en: 'Open tasks' },
  proj_tasks_empty:   { he: 'אין משימות פתוחות לפרויקט', en: 'No open tasks for this project' },
  proj_logbook_link:  { he: 'יומני העבודה של השבוע', en: 'This week’s diary entries' },
  proj_gantt_link:    { he: 'לוח הזמנים', en: 'Schedule' },
  proj_deliveries_link: { he: 'רשימת אספקות', en: 'Deliveries list' },
  proj_issues_link:   { he: 'מרשם בלת"מ', en: 'Issues register' },
  proj_phase2:        { he: 'ציר הלקוח מוגדר בשלב ב׳', en: 'Customer axis arrives in phase 2' },
  proj_unmatched:     { he: 'קטגוריות שלא נמצאו בגאנט', en: 'Categories not found in the schedule' },
  proj_no_chart:      { he: 'אין גאנט פעיל', en: 'No active schedule' },

  cat_col_name:       { he: 'קטגוריה', en: 'Category' },
  cat_col_planned:    { he: 'מתוכנן', en: 'Planned' },
  cat_col_baseline:   { he: 'בייסליין', en: 'Baseline' },
  cat_col_gantt_pct:  { he: '% גאנט', en: 'Gantt %' },
  cat_col_diary_pct:  { he: '% ביומן', en: 'Diary %' },
  cat_col_color:      { he: 'צבע', en: 'Color' },
  cat_critical:       { he: 'קריטית', en: 'Critical' },

  sup_col_item:       { he: 'פריט', en: 'Item' },
  sup_col_cat:        { he: 'קטגוריה', en: 'Category' },
  sup_col_need:       { he: 'תאריך צורך', en: 'Need date' },
  sup_col_status:     { he: 'סטטוס', en: 'Status' },
  sup_col_eta:        { he: 'ETA', en: 'ETA' },
  sup_col_gap:        { he: 'פער', en: 'Gap' },
  sup_col_owner:      { he: 'אחראי', en: 'Owner' },
  sup_status_not_ordered: { he: 'לא הוזמן', en: 'Not ordered' },
  sup_status_ordered: { he: 'הוזמן', en: 'Ordered' },
  sup_status_shipped: { he: 'נשלח', en: 'Shipped' },
  sup_status_on_site: { he: 'באתר', en: 'On site' },
  sup_add:            { he: '+ פריט אספקה', en: '+ Delivery item' },
  sup_title:          { he: 'רשימת אספקות', en: 'Deliveries' },
  sup_window_only:    { he: 'רק 6 השבועות הקרובים', en: 'Next 6 weeks only' },

  crew_col_name:      { he: 'קבלן', en: 'Contractor' },
  crew_col_agreed:    { he: 'מוסכם', en: 'Agreed' },
  crew_col_actual:    { he: 'בפועל (ממוצע)', en: 'Actual (avg)' },
  crew_col_ratio:     { he: 'יחס', en: 'Ratio' },
  crew_col_absences:  { he: 'היעדרויות', en: 'Absences' },
  crew_chart_title:   { he: '4 שבועות אחורה', en: 'Last 4 weeks' },

  iss_title:          { he: 'מרשם בלת"מ', en: 'Issues register' },
  iss_col_seq:        { he: '#', en: '#' },
  iss_col_desc:       { he: 'תיאור', en: 'Description' },
  iss_col_owner:      { he: 'גורם אחראי', en: 'Owner' },
  iss_col_owner_email: { he: 'אחראי (אדם)', en: 'Owner (person)' },
  iss_col_due:        { he: 'תאריך יעד', en: 'Due' },
  iss_col_days:       { he: 'ימים פתוח', en: 'Days open' },
  iss_col_blocking:   { he: 'חוסם', en: 'Blocking' },
  iss_col_systemic:   { he: 'מערכתי', en: 'Systemic' },
  iss_col_category:   { he: 'קטגוריה חסומה', en: 'Blocked category' },
  iss_open:           { he: 'פתוחים', en: 'Open' },
  iss_closed:         { he: 'סגורים', en: 'Closed' },
  iss_close:          { he: 'סגירה', en: 'Close' },
  iss_close_note:     { he: 'הערת סגירה', en: 'Closure note' },
  iss_reopen:         { he: 'פתיחה מחדש', en: 'Reopen' },
  iss_add:            { he: '+ בלת"מ ידני', en: '+ Manual issue' },
  iss_from_entry:     { he: 'מהיומן', en: 'From diary' },
  owner_engineering:  { he: 'הנדסה', en: 'Engineering' },
  owner_purchasing:   { he: 'רכש-הספקות', en: 'Purchasing & supply' },
  owner_customer:     { he: 'לקוח', en: 'Customer' },
  owner_contractor:   { he: 'קבלן', en: 'Contractor' },
  owner_weather:      { he: 'מזג אוויר', en: 'Weather' },
  owner_other:        { he: 'אחר', en: 'Other' },

  form_crew_section:  { he: 'כוח אדם באתר', en: 'Crew on site' },
  form_crew_contractor: { he: 'קבלן', en: 'Contractor' },
  form_crew_workers:  { he: 'עובדים', en: 'Workers' },
  form_crew_hours:    { he: 'שעות', en: 'Hours' },
  form_crew_add:      { he: '+ קבלן', en: '+ Contractor' },
  form_crew_free:     { he: 'קבלן אחר…', en: 'Other contractor…' },
  form_blocking_q:    { he: 'הבלת"מ חוסם עבודה?', en: 'Does the issue block work?' },
  form_yes:           { he: 'כן', en: 'Yes' },
  form_no:            { he: 'לא', en: 'No' },
  form_arrived_section: { he: 'הגיע לאתר היום', en: 'Arrived on site today' },
  form_arrived_hint:  { he: 'סימון מעדכן את רשימת האספקות ל"באתר"', en: 'Ticking marks the delivery as on site' },
  form_arrived_none:  { he: 'אין אספקות ממתינות לפרויקט', en: 'No pending deliveries for this project' },

  proj_contract_due:  { he: 'תאריך מסירה חוזי', en: 'Contract delivery date' },
  proj_type:          { he: 'סוג פרויקט', en: 'Project type' },
  proj_contractors:   { he: 'קבלנים והיקף מוסכם', en: 'Contractors & agreed headcount' },
  proj_contractor_name: { he: 'שם הקבלן', en: 'Contractor name' },
  proj_agreed:        { he: 'עובדים מוסכם / שבוע', en: 'Agreed workers / week' },
  proj_critical:      { he: 'קריטי', en: 'Critical' },
  proj_add_contractor: { he: '+ קבלן', en: '+ Contractor' },

  wbs_title:          { he: 'תבניות מבנה פירוק (WBS)', en: 'WBS templates' },
  wbs_type:           { he: 'סוג פרויקט', en: 'Project type' },
  wbs_add:            { he: '+ קטגוריה', en: '+ Category' },
  wbs_name_he:        { he: 'שם (עברית)', en: 'Name (Hebrew)' },
  wbs_name_en:        { he: 'שם (אנגלית)', en: 'Name (English)' },
  wbs_hint:           { he: 'השם חייב להיות זהה מילה במילה לפעילות הסיכום בגאנט', en: 'Must match the Gantt summary task name word for word' },

  settings_title:     { he: 'ספי הרמזור', en: 'Traffic-light thresholds' },
  settings_saved:     { he: 'הספים נשמרו', en: 'Thresholds saved' },
  s_time_amber_days:  { he: 'זמן: ירוק עד (ימים אחרי חוזי)', en: 'Time: green up to (days after contract)' },
  s_time_red_days:    { he: 'זמן: כתום עד (ימים)', en: 'Time: amber up to (days)' },
  s_lookahead_days:   { he: 'חלון lookahead (ימים)', en: 'Lookahead window (days)' },
  s_supply_red_window_days: { he: 'הספקות: לא הוזמן — אדום בתוך (ימים)', en: 'Supplies: not ordered — red within (days)' },
  s_supply_eta_margin_days: { he: 'הספקות: מרווח ETA לירוק (ימים)', en: 'Supplies: ETA margin for green (days)' },
  s_crew_green_pct:   { he: 'כוח אדם: ירוק מ-(%)', en: 'Crew: green from (%)' },
  s_crew_red_pct:     { he: 'כוח אדם: אדום מתחת ל-(%)', en: 'Crew: red below (%)' },
  s_crew_window_days: { he: 'כוח אדם: חלון ממוצע (ימים)', en: 'Crew: averaging window (days)' },
  s_issue_open_days:  { he: 'בלת"מ: פתוח מעל (ימים)', en: 'Issues: open more than (days)' },
  s_issue_block_resolve_days: { he: 'בלת"מ: פתרון לחסם בתוך (ימים)', en: 'Issues: blocker fix within (days)' },
  s_gray_missing_workdays: { he: 'אפור: ימי עבודה ללא יומן', en: 'Gray: work days without a diary' },
  s_gray_gantt_days:  { he: 'אפור: גאנט לא עודכן (ימים)', en: 'Gray: schedule not updated (days)' },

  tasks_source_tl:    { he: 'רמזור', en: 'Traffic light' },
  tasks_close_pmo:    { he: 'סגירה על ידי PMO בלבד', en: 'Closed by the PMO only' },
  tasks_by_assignee:  { he: 'לפי אחראי', en: 'By assignee' },

  save:               { he: 'שמירה', en: 'Save' },
  cancel:             { he: 'ביטול', en: 'Cancel' },
  delete:             { he: 'מחיקה', en: 'Delete' },
  loading:            { he: 'טוען…', en: 'Loading…' },
  error_forbidden:    { he: 'אין הרשאה לדוח הרמזור', en: 'No permission for the traffic-light report' },
} as const

export type TLKey = keyof typeof TL
export const tl = (lang: Lang, k: TLKey): string => TL[k]?.[lang] ?? String(k)
export const axisLabel = (lang: Lang, a: 'time' | 'supply' | 'client' | 'crew' | 'issues' | 'gray') => tl(lang, `axis_${a}` as TLKey)
export const ownerLabel = (lang: Lang, k: string) => tl(lang, `owner_${k}` as TLKey)
export const deliveryStatusLabel = (lang: Lang, s: string) => tl(lang, `sup_status_${s}` as TLKey)
```

- [ ] **Step 3: Create `src/traffic/api.ts`**

```ts
// Supabase access for the traffic-light module. Every write goes through RLS
// (migration 0064); traffic_light() is the only aggregate and it checks the area itself.
import { supabase } from '../lib/supabase'
import type { AxisKey, ProjectLight, Settings } from './model'
import type { WbsTemplate } from './wbs'

export async function fetchTrafficLight(projectId?: string): Promise<ProjectLight[]> {
  const { data, error } = await supabase.rpc('traffic_light', { p_project: projectId ?? null })
  if (error) throw error
  return (data ?? []) as ProjectLight[]
}

export interface SnapshotMeta { id: string; taken_at: string }
export async function fetchSnapshots(limit = 12): Promise<SnapshotMeta[]> {
  const { data, error } = await supabase.from('traffic_light_snapshots')
    .select('id,taken_at').order('taken_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SnapshotMeta[]
}
export async function fetchSnapshot(id: string): Promise<SnapshotMeta & { payload: ProjectLight[] }> {
  const { data, error } = await supabase.from('traffic_light_snapshots').select('id,taken_at,payload').eq('id', id).single()
  if (error) throw error
  return data as SnapshotMeta & { payload: ProjectLight[] }
}

// ---------- settings ----------
export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('traffic_light_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data as Settings
}
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase.from('traffic_light_settings')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) throw error
}

// ---------- WBS templates ----------
export async function fetchTemplates(): Promise<WbsTemplate[]> {
  const { data, error } = await supabase.from('wbs_templates').select('*').order('project_type').order('sort_order')
  if (error) throw error
  return (data ?? []) as WbsTemplate[]
}
export async function upsertTemplate(t: Partial<WbsTemplate> & { project_type: string; name_he: string; name_en: string; sort_order: number }): Promise<void> {
  const { error } = await supabase.from('wbs_templates').upsert(t, { onConflict: 'id' })
  if (error) throw error
}
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('wbs_templates').delete().eq('id', id)
  if (error) throw error
}

// ---------- contractors ----------
export interface Contractor { id: string; project_id: string; name: string; agreed_workers: number; critical: boolean; active: boolean }
export async function fetchContractors(projectId: string): Promise<Contractor[]> {
  const { data, error } = await supabase.from('project_contractors').select('*')
    .eq('project_id', projectId).order('critical', { ascending: false }).order('name')
  if (error) throw error
  return (data ?? []) as Contractor[]
}
export async function upsertContractor(c: Partial<Contractor> & { project_id: string; name: string }): Promise<Contractor> {
  const { data, error } = await supabase.from('project_contractors').upsert(c, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  return data as Contractor
}
export async function deleteContractor(id: string): Promise<void> {
  const { error } = await supabase.from('project_contractors').delete().eq('id', id)
  if (error) throw error
}

// ---------- deliveries ----------
export type DeliveryStatus = 'not_ordered' | 'ordered' | 'shipped' | 'on_site'
export const DELIVERY_STATUSES: DeliveryStatus[] = ['not_ordered', 'ordered', 'shipped', 'on_site']
export interface Delivery {
  id: string; project_id: string; item: string; wbs_template_id: string | null
  need_date: string; status: DeliveryStatus; eta: string | null
  owner_email: string | null; notes: string | null; updated_at: string; updated_by: string | null
}
export async function fetchDeliveries(projectId: string): Promise<Delivery[]> {
  const { data, error } = await supabase.from('project_deliveries').select('*').eq('project_id', projectId).order('need_date')
  if (error) throw error
  return (data ?? []) as Delivery[]
}
export async function upsertDelivery(d: Partial<Delivery> & { project_id: string; item: string; need_date: string }, by: string): Promise<Delivery> {
  const { data, error } = await supabase.from('project_deliveries')
    .upsert({ ...d, updated_by: by.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  return data as Delivery
}
export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from('project_deliveries').delete().eq('id', id)
  if (error) throw error
}

// ---------- issues ----------
export type OwnerKind = 'engineering' | 'purchasing' | 'customer' | 'contractor' | 'weather' | 'other'
export const OWNER_KINDS: OwnerKind[] = ['engineering', 'purchasing', 'customer', 'contractor', 'weather', 'other']
export interface Issue {
  id: string; project_id: string; seq: number; entry_id: string | null; opened_on: string
  description: string; owner_kind: OwnerKind; owner_email: string | null; due_date: string | null
  blocking: boolean; wbs_template_id: string | null; systemic: boolean
  closed_on: string | null; closure_note: string | null; created_by: string | null
}
export async function fetchIssues(projectId: string, open: boolean): Promise<Issue[]> {
  let q = supabase.from('issues').select('*').eq('project_id', projectId).order('seq', { ascending: false })
  q = open ? q.is('closed_on', null) : q.not('closed_on', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Issue[]
}
export async function updateIssue(id: string, patch: Partial<Issue>): Promise<void> {
  const { data, error } = await supabase.from('issues').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה לערוך פריט זה')
}
export async function createIssue(i: { project_id: string; description: string; owner_kind: OwnerKind; blocking: boolean; opened_on?: string }): Promise<Issue> {
  const { data, error } = await supabase.from('issues').insert(i).select('*').single()
  if (error) throw error
  return data as Issue
}

// ---------- tasks born from the board ----------
export async function createTrafficTask(
  projectId: string, axis: AxisKey | 'gray', title: string, createdBy: string,
  assignee: string | null = null, due: string | null = null,
): Promise<void> {
  const { error } = await supabase.from('work_tasks').insert({
    title, project_id: projectId, source: 'traffic_light', axis,
    assignee_email: assignee?.toLowerCase() ?? null, due_date: due, created_by: createdBy.toLowerCase(),
  })
  if (error) throw error
}
```

- [ ] **Step 4: Tests + lint**

Run: `npx vitest run src/i18n.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/traffic/api.ts src/traffic/i18n.ts src/i18n.test.ts
git commit -m "feat(traffic): api layer and bilingual strings"
```

---

### Task 7: Malfunction departments, template-driven diary rows, store loads templates

**Files:**
- Modify: `src/data.ts` (`MALFUNCTION_DEPTS`, `deptIdOf`)
- Modify: `src/data.test.ts`
- Modify: `src/lib/reportTables.ts` (`DEFAULT_TASKS`, `defaultProgressRows`, `defaultCoop`, `taskLabel`)
- Modify: `src/lib/reportTables.test.ts`
- Modify: `src/store.tsx` (`wbsTemplates`, `templateFor(projectType)`)

**Interfaces:**
- `MALFUNCTION_DEPTS` ids become `none | engineering | purchasing | customer | contractor | weather | other`; `deptIdOf` still resolves legacy ids/labels (`logistics_warehouse`→`purchasing`, `contractors`→`contractor`, `customers`→`customer`, `finance`→`other`, old Hebrew/English labels likewise).
- `defaultProgressRows(lang, template?: WbsTemplate[])`, `defaultCoop(lang, n = 1, template?: WbsTemplate[])`; `DEFAULT_TASKS` now equals `COOP_TEMPLATE` names (10 rows). `taskLabel` also resolves legacy names to the new category label.
- Store: `wbsTemplates: WbsTemplate[]`, `templateFor(type: string | null | undefined): WbsTemplate[]` (active rows of that type, falling back to `COOP_TEMPLATE` when the table is empty), `reloadTemplates()`.

- [ ] **Step 1: Failing tests — departments**

Append to `src/data.test.ts`:

```ts
import { MALFUNCTION_DEPTS, deptIdOf, deptLabel } from './data'

describe('malfunction departments (spec owner list)', () => {
  it('exposes the closed owner list with none first', () => {
    expect(MALFUNCTION_DEPTS.map((d) => d.id)).toEqual(['none', 'engineering', 'purchasing', 'customer', 'contractor', 'weather', 'other'])
    expect(deptLabel('purchasing', 'he')).toBe('רכש-הספקות')
  })
  it('maps legacy ids and labels onto the new list', () => {
    expect(deptIdOf('logistics_warehouse')).toBe('purchasing')
    expect(deptIdOf('לוגיסטיקה ומחסן')).toBe('purchasing')
    expect(deptIdOf('רכש')).toBe('purchasing')
    expect(deptIdOf('קבלנים')).toBe('contractor')
    expect(deptIdOf('Customers')).toBe('customer')
    expect(deptIdOf('כספים')).toBe('other')
    expect(deptIdOf('finance')).toBe('other')
    expect(deptIdOf('הנדסה')).toBe('engineering')
    expect(deptIdOf('')).toBe('none')
    expect(deptIdOf('אין')).toBe('none')
  })
})
```

- [ ] **Step 2: Failing tests — template rows**

In `src/lib/reportTables.test.ts` replace the first `parseProgress` assertion block with:

```ts
import { COOP_TEMPLATE } from '../traffic/wbs'

describe('parseProgress', () => {
  it('seeds the coop template when the key is absent', () => {
    const rows = parseProgress(undefined, 'he')
    expect(rows).toHaveLength(10)
    expect(rows[0]).toEqual({ task: 'עבודות עפר ובטון', pct: 0, remarks: '' })
    expect(parseProgress(undefined, 'en')[2].task).toBe('Concrete beams')
    expect(DEFAULT_TASKS.map((t) => t.he)).toEqual(COOP_TEMPLATE.map((t) => t.name_he))
  })
```

and add:

```ts
describe('taskLabel with legacy names', () => {
  it('shows an old fixed row under its new category label', () => {
    expect(taskLabel('גמר קורות בטון', 'he')).toBe('קורות בטון')
    expect(taskLabel('Ceiling covering', 'he')).toBe('כיסוי תקרה וחיפוי קירות')
    expect(taskLabel('ציוד פנים', 'en')).toBe('Interior equipment')
    expect(taskLabel('משהו מותאם', 'he')).toBe('משהו מותאם')
  })
  it('defaultCoop takes a DB template when given', () => {
    const tpl = [{ id: 'x', project_type: 'hatchery', sort_order: 1, name_he: 'מדגרה א', name_en: 'Hatchery A', critical: false, active: true }]
    expect(defaultCoop('he', 1, tpl).rows.map((r) => r.task)).toEqual(['מדגרה א'])
  })
})
```

(import `taskLabel` from `./reportTables`.) Update the remaining test expectations that mention the old 9-row names (`'Concrete beams finish'`, `DEFAULT_TASKS.length`) to the new list.

Run: `npx vitest run src/data.test.ts src/lib/reportTables.test.ts` → FAIL.

- [ ] **Step 3: Update `src/data.ts`**

```ts
export const MALFUNCTION_DEPTS: MalfunctionDept[] = [
  { id: 'none',        he: 'אין',          en: 'None' },
  { id: 'engineering', he: 'הנדסה',        en: 'Engineering' },
  { id: 'purchasing',  he: 'רכש-הספקות',   en: 'Purchasing & supply' },
  { id: 'customer',    he: 'לקוח',         en: 'Customer' },
  { id: 'contractor',  he: 'קבלן',         en: 'Contractor' },
  { id: 'weather',     he: 'מזג אוויר',    en: 'Weather' },
  { id: 'other',       he: 'אחר',          en: 'Other' },
]

/** Departments the form offered before 2026-09 (migration 0064 replaced the options). */
const LEGACY_DEPTS: { match: string[]; id: string }[] = [
  { match: ['logistics_warehouse', 'לוגיסטיקה ומחסן', 'logistics & warehouse', 'רכש', 'purchasing'], id: 'purchasing' },
  { match: ['contractors', 'קבלנים'], id: 'contractor' },
  { match: ['customers', 'לקוחות'], id: 'customer' },
  { match: ['finance', 'כספים'], id: 'other' },
]

export function deptIdOf(value: string | undefined | null): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return 'none'
  const hit = MALFUNCTION_DEPTS.find(
    (d) => d.id === v || d.he.toLowerCase() === v || d.en.toLowerCase() === v,
  )
  if (hit) return hit.id
  const legacy = LEGACY_DEPTS.find((l) => l.match.some((m) => m.toLowerCase() === v))
  return legacy ? legacy.id : 'none'
}
```

- [ ] **Step 4: Update `src/lib/reportTables.ts`**

Replace `DEFAULT_TASKS` and the seeding helpers:

```ts
import { COOP_TEMPLATE, LEGACY_TASK_MAP, normName, type WbsTemplate } from '../traffic/wbs'

// Standard coop categories (spec 5.1) — the DB template wbs_templates is the live list;
// this is the seed and the offline fallback.
export const DEFAULT_TASKS: { he: string; en: string }[] = COOP_TEMPLATE.map((t) => ({ he: t.name_he, en: t.name_en }))

const templateRows = (template?: WbsTemplate[]) =>
  template && template.length ? template.filter((t) => t.active !== false).sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ he: t.name_he, en: t.name_en })) : DEFAULT_TASKS

export const defaultProgressRows = (lang: Lang, template?: WbsTemplate[]): ProgressRow[] =>
  templateRows(template).map((t) => ({ task: t[lang], pct: 0, remarks: '' }))

export const defaultCoop = (lang: Lang, n = 1, template?: WbsTemplate[]): CoopReport =>
  ({ name: coopName(lang, n), pct: 0, rows: defaultProgressRows(lang, template), bd: defaultBdRows(lang) })
```

and `taskLabel`:

```ts
export function taskLabel(task: string, lang: Lang): string {
  const s = String(task ?? '').trim()
  const hit = DEFAULT_TASKS.find((t) => t.he === s || t.en === s)
    ?? BD_TASKS.find((t) => t.he === s || t.en === s)
  if (hit) return hit[lang]
  const legacy = LEGACY_TASK_MAP.find((m) => normName(m.legacy) === normName(s))
  if (legacy) {
    const row = COOP_TEMPLATE.find((t) => t.sort_order === legacy.sort)
    if (row) return lang === 'he' ? row.name_he : row.name_en
  }
  return task
}
```

`parseProgress` keeps its signature (seeds `DEFAULT_TASKS`). `CoopReports` in `src/components/ReportTables.tsx` calls `defaultCoop(lang, n)` when adding a coop — add an optional `template?: WbsTemplate[]` prop and pass it through: `defaultCoop(lang, coops.length + 1, template)`.

- [ ] **Step 5: Store**

`src/store.tsx`: import `fetchTemplates` from `./traffic/api` and `COOP_TEMPLATE, type WbsTemplate` from `./traffic/wbs`. Add to `Store`:

```ts
  wbsTemplates: WbsTemplate[]
  templateFor: (type: string | null | undefined) => WbsTemplate[]
  reloadTemplates: () => Promise<void>
```

State + loading (inside the `Promise.all`, tolerant of failure so an old DB does not block login):

```ts
  const [wbsTemplates, setWbsTemplates] = useState<WbsTemplate[]>([])
  const reloadTemplates = useCallback(async () => setWbsTemplates(await fetchTemplates().catch(() => [])), [])
  // in the effect:
  const [p, f, u, pri, asg, tpl] = await Promise.all([fetchProjects(), fetchFieldDefs(), fetchUserMap(), fetchMyPriorities(), fetchAssignments(), fetchTemplates().catch(() => [] as WbsTemplate[])])
  … setWbsTemplates(tpl)
  const templateFor = useCallback((type: string | null | undefined) => {
    const rows = wbsTemplates.filter((t) => t.project_type === (type || 'coop') && t.active)
    return rows.length ? rows : COOP_TEMPLATE.map((t, i) => ({ ...t, id: `seed-${i}`, active: true }))
  }, [wbsTemplates])
```

Expose all three in the provider value.

- [ ] **Step 6: Tests + lint**

Run: `npm test && npm run lint`
Expected: PASS. (`src/report.test.ts` may reference old task names — update those fixtures to the new labels if they assert on them.)

- [ ] **Step 7: Commit**

```bash
git add src/data.ts src/data.test.ts src/lib/reportTables.ts src/lib/reportTables.test.ts src/components/ReportTables.tsx src/store.tsx
git commit -m "feat(traffic): spec owner list for issues, template-driven diary categories"
```

---

### Task 8: Diary form — crew rows, blocking flag, arrived items; report + detail rendering

**Files:**
- Create: `src/lib/crewRows.ts`, `src/lib/crewRows.test.ts`
- Create: `src/components/CrewTable.tsx`
- Modify: `src/screens/EntryForm.tsx`
- Modify: `src/report.ts`, `src/report.test.ts`
- Modify: `src/screens/EntryDetail.tsx`
- Modify: `src/styles/components.css` (reuse `.rtable` grid; add `.rtable__row--crew`)

**Interfaces:**
- `src/lib/crewRows.ts`: `CREW_KEY = 'crew_rows'`, `ISSUE_BLOCKING_KEY = 'issue_blocking'`, `ARRIVED_KEY = 'arrived_items'`, `interface CrewRow { contractor: string; workers: number; hours: number }`, `parseCrew(raw: string | undefined): CrewRow[]`, `filledCrew(rows): CrewRow[]` (drops rows with empty contractor and 0 workers), `parseArrived(raw): string[]`.
- `CrewTable({ rows, onChange, contractors })` — `contractors: string[]` for the select; last option "אחר…" turns the cell into free text.

- [ ] **Step 1: Failing tests**

`src/lib/crewRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filledCrew, parseArrived, parseCrew } from './crewRows'

describe('crew rows', () => {
  it('parses stored JSON and normalizes numbers', () => {
    expect(parseCrew(JSON.stringify([{ contractor: 'שמחה', workers: '12', hours: 9 }])))
      .toEqual([{ contractor: 'שמחה', workers: 12, hours: 9 }])
    expect(parseCrew(undefined)).toEqual([])
    expect(parseCrew('garbage')).toEqual([])
    expect(parseCrew(JSON.stringify([{ contractor: 'x', workers: -3 }]))[0].workers).toBe(0)
  })
  it('filledCrew drops blank rows', () => {
    expect(filledCrew([{ contractor: '', workers: 0, hours: 0 }, { contractor: 'חמד', workers: 5, hours: 8 }]))
      .toEqual([{ contractor: 'חמד', workers: 5, hours: 8 }])
  })
  it('parseArrived keeps only uuid-looking ids', () => {
    expect(parseArrived(JSON.stringify(['6f1e2c3a-1111-4222-8333-444455556666', 'nope']))).toEqual(['6f1e2c3a-1111-4222-8333-444455556666'])
    expect(parseArrived(undefined)).toEqual([])
  })
})
```

Run: `npx vitest run src/lib/crewRows.test.ts` → FAIL.

- [ ] **Step 2: Implement `src/lib/crewRows.ts`**

```ts
// Structured crew / blocking / arrivals keys inside entries.values. Stored as JSON strings
// like progress_coops so drafts, the offline queue and the report pick them up unchanged.
export const CREW_KEY = 'crew_rows'
export const ISSUE_BLOCKING_KEY = 'issue_blocking'
export const ARRIVED_KEY = 'arrived_items'

export interface CrewRow { contractor: string; workers: number; hours: number }

const num = (v: unknown, max = 999) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)))

export function parseCrew(raw: string | undefined): CrewRow[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    if (!Array.isArray(a)) return []
    return a.map((r) => ({ contractor: String(r?.contractor ?? ''), workers: num(r?.workers), hours: num(r?.hours, 24) }))
  } catch { return [] }
}

export const filledCrew = (rows: CrewRow[]): CrewRow[] =>
  rows.filter((r) => r.contractor.trim() !== '' || r.workers > 0)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseArrived(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? a.map(String).filter((s) => UUID.test(s)) : []
  } catch { return [] }
}
```

- [ ] **Step 3: `src/components/CrewTable.tsx`**

```tsx
import { Button } from './ui'
import { useI18n } from '../i18n'
import { tl } from '../traffic/i18n'
import type { CrewRow } from '../lib/crewRows'

const OTHER = '__other__'

export function CrewTable({ rows, onChange, contractors }: {
  rows: CrewRow[]; onChange: (r: CrewRow[]) => void; contractors: string[]
}) {
  const { lang } = useI18n()
  const upd = (i: number, patch: Partial<CrewRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="rtable">
      <div className="rtable__head rtable__row--crew">
        <span>{tl(lang, 'form_crew_contractor')}</span><span>{tl(lang, 'form_crew_workers')}</span><span>{tl(lang, 'form_crew_hours')}</span><span />
      </div>
      {rows.map((r, i) => {
        const known = contractors.includes(r.contractor)
        const free = !known && r.contractor !== ''
        return (
          <div key={i} className="rtable__row rtable__row--crew">
            {contractors.length > 0 && !free ? (
              <select className="input" value={known ? r.contractor : ''}
                onChange={(e) => upd(i, { contractor: e.target.value === OTHER ? ' ' : e.target.value })}>
                <option value="">—</option>
                {contractors.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={OTHER}>{tl(lang, 'form_crew_free')}</option>
              </select>
            ) : (
              <input className="input" value={r.contractor.trim()} placeholder={tl(lang, 'form_crew_contractor')}
                onChange={(e) => upd(i, { contractor: e.target.value })} />
            )}
            <input className="input" type="number" inputMode="numeric" min={0} value={r.workers}
              onChange={(e) => upd(i, { workers: Math.max(0, Number(e.target.value) || 0) })} />
            <input className="input" type="number" inputMode="numeric" min={0} max={24} value={r.hours}
              onChange={(e) => upd(i, { hours: Math.max(0, Number(e.target.value) || 0) })} />
            <button type="button" className="rtable__del" onClick={() => onChange(rows.filter((_, k) => k !== i))}>✕</button>
          </div>
        )
      })}
      <div className="rtable__foot">
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, { contractor: '', workers: 0, hours: 8 }])}>
          {tl(lang, 'form_crew_add')}
        </Button>
      </div>
    </div>
  )
}
```

CSS in `src/styles/components.css`, next to `.rtable__row--progress`:

```css
.rtable__row--crew { grid-template-columns: 2fr 1fr 1fr auto; }
```

- [ ] **Step 4: Wire the sections into `EntryForm.tsx`**

Imports:

```ts
import { ARRIVED_KEY, CREW_KEY, ISSUE_BLOCKING_KEY, parseArrived, parseCrew, type CrewRow } from '../lib/crewRows'
import { CrewTable } from '../components/CrewTable'
import { fetchContractors, fetchDeliveries, type Delivery } from '../traffic/api'
import { tl } from '../traffic/i18n'
```

State and project-scoped lists (after `const [incidentOpen…]`):

```ts
  const [contractorNames, setContractorNames] = useState<string[]>([])
  const [pendingDeliveries, setPendingDeliveries] = useState<Delivery[]>([])
  useEffect(() => {
    if (!project) { setContractorNames([]); setPendingDeliveries([]); return }
    let alive = true
    fetchContractors(project).then((c) => alive && setContractorNames(c.filter((x) => x.active).map((x) => x.name))).catch(() => {})
    fetchDeliveries(project).then((d) => alive && setPendingDeliveries(d.filter((x) => x.status !== 'on_site'))).catch(() => {})
    return () => { alive = false }
  }, [project])
```

Derived values next to `coops`/`missingRows`:

```ts
  const crewRows = parseCrew(values[CREW_KEY])
  const setCrew = (rows: CrewRow[]) => set(CREW_KEY, JSON.stringify(rows))
  const arrived = parseArrived(values[ARRIVED_KEY])
  const toggleArrived = (id: string) =>
    set(ARRIVED_KEY, JSON.stringify(arrived.includes(id) ? arrived.filter((x) => x !== id) : [...arrived, id]))
```

The template-driven coop seed: replace the two `defaultCoop(lang)` calls with `defaultCoop(lang, 1, templateFor(projects.find((p) => p.id === project)?.project_type))` (get `templateFor` from `useStore()`), and pass `template={templateFor(...)}` to `<CoopReports>`.

Render, directly after the `textDefs` grid and before the safety section:

```tsx
        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{tl(lang, 'form_crew_section')}</motion.div>
        <motion.div variants={riseIn}>
          <CrewTable rows={crewRows} onChange={setCrew} contractors={contractorNames} />
        </motion.div>

        {deptIdOf(values[MALFUNCTION_DEPT_KEY]) !== 'none' && (
          <motion.div variants={riseIn} className="form-grid" style={{ marginTop: 14 }}>
            <div>
              <Field label={tl(lang, 'form_blocking_q')} hint={<span className="req">{t('required_field')}</span>}>
                <select className="input" value={values[ISSUE_BLOCKING_KEY] ?? ''}
                  style={errors.includes(ISSUE_BLOCKING_KEY) ? { borderColor: 'var(--clay)' } : undefined}
                  onChange={(e) => set(ISSUE_BLOCKING_KEY, e.target.value)}>
                  <option value="">—</option>
                  <option value={tl(lang, 'form_yes')}>{tl(lang, 'form_yes')}</option>
                  <option value={tl(lang, 'form_no')}>{tl(lang, 'form_no')}</option>
                </select>
              </Field>
            </div>
          </motion.div>
        )}

        {pendingDeliveries.length > 0 && (
          <>
            <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{tl(lang, 'form_arrived_section')}</motion.div>
            <motion.div variants={riseIn} className="arrived">
              <div className="hint">{tl(lang, 'form_arrived_hint')}</div>
              {pendingDeliveries.map((d) => (
                <label key={d.id} className="arrived__item">
                  <input type="checkbox" checked={arrived.includes(d.id)} onChange={() => toggleArrived(d.id)} />
                  <span>{d.item}</span>
                  <span className="mono">{d.need_date}</span>
                </label>
              ))}
            </motion.div>
          </>
        )}
```

Validation in `save()` after the malfunction check:

```ts
    if (deptIdOf(values[MALFUNCTION_DEPT_KEY]) !== 'none' && !(values[ISSUE_BLOCKING_KEY] ?? '').trim()) {
      errs.push(ISSUE_BLOCKING_KEY)
    }
```

CSS (`components.css`):

```css
.arrived { display: grid; gap: 6px; }
.arrived__item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r); background: var(--panel); }
.arrived__item .mono { margin-inline-start: auto; color: var(--ink-faint); font-size: 12px; }
```

- [ ] **Step 5: Report + detail**

`src/report.test.ts` — add:

```ts
  it('renders crew rows and the blocking flag, skips them when empty', () => {
    const html = buildReportHtml(entryWith({ crew_rows: JSON.stringify([{ contractor: 'שמחה', workers: 12, hours: 9 }]), malfunction_dept: 'הנדסה', malfunction: 'x', issue_blocking: 'כן' }), fields, project)
    expect(html).toContain('כוח אדם באתר')
    expect(html).toContain('שמחה')
    expect(html).toContain('חוסם עבודה')
    expect(buildReportHtml(entryWith({}), fields, project)).not.toContain('כוח אדם באתר')
  })
```

(`entryWith`/`fields`/`project` are whatever fixtures the file already uses — reuse them.)

`src/report.ts` — after `missingHtml`:

```ts
  const crew = filledCrew(parseCrew(v[CREW_KEY]))
  const crewHtml = crew.length ? `
    <div style="font-size:18px;font-weight:800;color:${I};margin:26px 0 6px">כוח אדם באתר</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
      <tr>${th('קבלן')}${th('עובדים', 'width:20%')}${th('שעות', 'width:20%')}</tr>
      ${crew.map((r, i) => `<tr style="background:${i % 2 ? '#f6f8f4' : '#ffffff'}">${td(esc(r.contractor))}${td(String(r.workers))}${td(String(r.hours))}</tr>`).join('')}
    </table>` : ''
```

and in the malfunction row (where `malfunction` is rendered when dept ≠ none) append ` · <b>חוסם עבודה</b>` when `deptIdOf(v.malfunction_dept) !== 'none' && /^(כן|yes|true)$/i.test((v[ISSUE_BLOCKING_KEY] ?? '').trim())`. Insert `crewHtml` right after the progress block in both the HTML and the plain-text builder (text: `כוח אדם באתר:\n${crew.map((r) => `- ${r.contractor}: ${r.workers} עובדים, ${r.hours} שעות`).join('\n')}`).

`src/screens/EntryDetail.tsx` — under the progress block, read-only crew list:

```tsx
      {filledCrew(parseCrew(entry.values[CREW_KEY])).length > 0 && (
        <Section id="crew" icon="👷" title={tl(lang, 'form_crew_section')}>
          <table className="table m-cards"><thead><tr><th>{tl(lang, 'form_crew_contractor')}</th><th>{tl(lang, 'form_crew_workers')}</th><th>{tl(lang, 'form_crew_hours')}</th></tr></thead>
            <tbody>{filledCrew(parseCrew(entry.values[CREW_KEY])).map((r, i) => <tr key={i}><td>{r.contractor}</td><td>{r.workers}</td><td>{r.hours}</td></tr>)}</tbody></table>
        </Section>
      )}
```

(`Section` is `src/components/Section.tsx`: props `id`, `icon`, `title`, children.)

- [ ] **Step 6: Tests, lint, commit**

Run: `npm test && npm run lint` → PASS.

```bash
git add src/lib/crewRows.ts src/lib/crewRows.test.ts src/components/CrewTable.tsx src/screens/EntryForm.tsx src/report.ts src/report.test.ts src/screens/EntryDetail.tsx src/styles/components.css
git commit -m "feat(diary): structured crew rows, blocking flag, arrived-on-site picks"
```

---

### Task 9: Project admin — contract date, project type, contractors

**Files:**
- Modify: `src/screens/admin/Projects.tsx`
- Modify: `src/i18n.tsx` (keys `proj_contract_due`, `proj_type`, `proj_type_coop`)

**Interfaces:**
- Consumes `fetchContractors / upsertContractor / deleteContractor` (Task 6), `Project.contract_due_date / project_type` (Task 3), `tl()` (Task 6).

- [ ] **Step 1: i18n keys**

Add to `STRINGS` in `src/i18n.tsx`:

```ts
  proj_contract_due: { he: 'תאריך מסירה חוזי', en: 'Contract delivery date' },
  proj_type: { he: 'סוג פרויקט', en: 'Project type' },
  proj_type_coop: { he: 'לול', en: 'Coop' },
```

- [ ] **Step 2: Form fields**

In the project form (`Projects.tsx`, near `proj_end`), add:

```tsx
              <Field label={t('proj_contract_due')}><input className="input" type="date" value={form.contract_due_date ?? ''} onChange={(e) => set('contract_due_date', e.target.value)} /></Field>
              <Field label={t('proj_type')}>
                <select className="input" value={form.project_type ?? 'coop'} onChange={(e) => set('project_type', e.target.value)}>
                  {[...new Set(['coop', ...wbsTemplates.map((x) => x.project_type)])].map((ty) => (
                    <option key={ty} value={ty}>{ty === 'coop' ? t('proj_type_coop') : ty}</option>
                  ))}
                </select>
              </Field>
```

(`wbsTemplates` from `useStore()`.) Add `contract_due_date: null, project_type: 'coop'` to the `initial` default object.

- [ ] **Step 3: Contractors editor (edit mode only — needs a project id)**

Inside the same form, after the work-days field, when `!isNew`:

```tsx
            <Field label={tl(lang, 'proj_contractors')}>
              <ContractorsEditor projectId={(initial as Project).id} />
            </Field>
```

New component at the bottom of `Projects.tsx`:

```tsx
function ContractorsEditor({ projectId }: { projectId: string }) {
  const { lang } = useI18n()
  const [rows, setRows] = useState<Contractor[]>([])
  const [draft, setDraft] = useState({ name: '', agreed_workers: 0, critical: false })
  const reload = () => fetchContractors(projectId).then(setRows).catch(() => setRows([]))
  useEffect(() => { reload() }, [projectId])
  const save = async (c: Partial<Contractor> & { project_id: string; name: string }) => { await upsertContractor(c); reload() }
  return (
    <div className="rtable">
      <div className="rtable__head rtable__row--contractors">
        <span>{tl(lang, 'proj_contractor_name')}</span><span>{tl(lang, 'proj_agreed')}</span><span>{tl(lang, 'proj_critical')}</span><span />
      </div>
      {rows.map((c) => (
        <div key={c.id} className="rtable__row rtable__row--contractors">
          <input className="input" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && save({ ...c, name: e.target.value })} />
          <input className="input" type="number" min={0} defaultValue={c.agreed_workers} onBlur={(e) => save({ ...c, agreed_workers: Number(e.target.value) || 0 })} />
          <input type="checkbox" checked={c.critical} onChange={(e) => save({ ...c, critical: e.target.checked })} />
          <button type="button" className="rtable__del" onClick={() => deleteContractor(c.id).then(reload)}>✕</button>
        </div>
      ))}
      <div className="rtable__row rtable__row--contractors">
        <input className="input" placeholder={tl(lang, 'proj_contractor_name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="input" type="number" min={0} value={draft.agreed_workers} onChange={(e) => setDraft({ ...draft, agreed_workers: Number(e.target.value) || 0 })} />
        <input type="checkbox" checked={draft.critical} onChange={(e) => setDraft({ ...draft, critical: e.target.checked })} />
        <button type="button" className="btn btn--ghost" disabled={!draft.name.trim()}
          onClick={() => save({ project_id: projectId, ...draft, name: draft.name.trim() }).then(() => setDraft({ name: '', agreed_workers: 0, critical: false }))}>
          {tl(lang, 'proj_add_contractor')}
        </button>
      </div>
    </div>
  )
}
```

CSS: `.rtable__row--contractors { grid-template-columns: 2fr 1fr auto auto; align-items: center; }`

- [ ] **Step 4: Lint, build, commit**

Run: `npm run lint && npm test` → PASS.

```bash
git add src/screens/admin/Projects.tsx src/i18n.tsx src/styles/components.css
git commit -m "feat(projects): contract delivery date, project type, contractors with agreed headcount"
```

---

### Task 10: Routes, nav and the board screen (8.1)

**Files:**
- Modify: `src/App.tsx`, `src/components/Shell.tsx`
- Create: `src/screens/traffic/TrafficBoard.tsx`, `src/components/TrafficDot.tsx`, `src/styles/traffic.css`

**Interfaces:**
- Routes: `/traffic` (area `traffic_light`), `/traffic/:projectId`, `/traffic/:projectId/deliveries` (area `traffic_light` **or** `deliveries` — see gate below), `/traffic/:projectId/issues` (area `traffic_light`), `/admin/wbs` and `/admin/traffic-settings` (admin).
- `TrafficDot({ color, size = 'sm' | 'lg', label? })` renders the circle; `na` is a hollow ring; `gray` is a filled neutral disc. Colors: green `var(--green)`, amber `var(--amber)`, red `var(--clay)`, gray `var(--ink-faint)`.

**Design:** before writing the JSX, invoke `frontend-design:frontend-design` for the board and the project screen. Direction to give it: this is a 10-second scan screen for an executive — one dense row per project, the big project dot dominates, five small axis dots read as a strip, the action line is the only prose, the delivery delta is a monospace signed number. Reuse the app's tokens (`--paper`, `--panel`, `--ink*`, `--green`, `--amber`, `--clay`, fonts Heebo/Assistant/JetBrains Mono), RTL first, cards on phones (`.m-cards` pattern). No new colors beyond the tokens; `na` must be visibly different from gray.

- [ ] **Step 1: Gate helper and routes**

`src/App.tsx` — add a second gate that accepts either area (for purchasing users):

```tsx
function RequireAnyPerm({ areas, children }: { areas: PermArea[]; children: ReactElement }) {
  const { perm, permsReady } = usePerms()
  const { loading } = useAuth()
  if (loading || !permsReady) return <Loader full label="טוען…" />
  return areas.some((a) => perm(a) !== 'none') ? children : <Navigate to="/" replace />
}
```

Lazy imports:

```ts
const TrafficBoard = lazy(() => import('./screens/traffic/TrafficBoard'))
const TrafficProject = lazy(() => import('./screens/traffic/TrafficProject'))
const Deliveries = lazy(() => import('./screens/traffic/Deliveries'))
const Issues = lazy(() => import('./screens/traffic/Issues'))
const WbsTemplates = lazy(() => import('./screens/traffic/WbsTemplates'))
const TrafficSettings = lazy(() => import('./screens/traffic/TrafficSettings'))
```

Routes (inside the Shell route, next to `control`):

```tsx
        <Route path="traffic" element={<RequirePerm area="traffic_light"><TrafficBoard /></RequirePerm>} />
        <Route path="traffic/:projectId" element={<RequirePerm area="traffic_light"><TrafficProject /></RequirePerm>} />
        <Route path="traffic/:projectId/deliveries" element={<RequireAnyPerm areas={['traffic_light', 'deliveries']}><Deliveries /></RequireAnyPerm>} />
        <Route path="traffic/:projectId/issues" element={<RequirePerm area="traffic_light"><Issues /></RequirePerm>} />
        <Route path="admin/wbs" element={<RequireAdmin><WbsTemplates /></RequireAdmin>} />
        <Route path="admin/traffic-settings" element={<RequireAdmin><TrafficSettings /></RequireAdmin>} />
```

- [ ] **Step 2: Nav**

`src/components/Shell.tsx` — import `tl` from `../traffic/i18n`. In the "projects" group, first item:

```ts
                ...(can('traffic_light') ? [{ to: '/traffic', icon: '🚦', label: tl(lang, 'nav_traffic') }] : []),
```

Purchasing users (only `deliveries`) reach their list from the project picker on `/traffic` — but they cannot open `/traffic`. So add, in the "work" group:

```ts
                ...(!can('traffic_light') && can('deliveries') ? [{ to: '/traffic/pick/deliveries', icon: '📦', label: tl(lang, 'sup_title') }] : []),
```

and a route `traffic/pick/deliveries` → `<RequireAnyPerm areas={['deliveries','traffic_light']}><DeliveriesPick /></RequireAnyPerm>` where `DeliveriesPick` (inside `Deliveries.tsx`, exported) is a project list linking to `/traffic/:id/deliveries`.

Admin group:

```ts
                ...(isAdmin ? [{ to: '/admin/wbs', icon: '⊞', label: tl(lang, 'nav_wbs') }] : []),
                ...(isAdmin ? [{ to: '/admin/traffic-settings', icon: '🚦', label: tl(lang, 'nav_tl_settings') }] : []),
```

- [ ] **Step 3: `TrafficDot`**

`src/components/TrafficDot.tsx`:

```tsx
import type { Color } from '../traffic/model'

export function TrafficDot({ color, size = 'sm', title }: { color: Color; size?: 'sm' | 'lg'; title?: string }) {
  return <span className={`tdot tdot--${size} tdot--${color}`} title={title} aria-label={title} role="img" />
}
```

`src/styles/traffic.css` (imported by `TrafficBoard.tsx` and `TrafficProject.tsx`):

```css
/* Traffic-light module. Every color is a token; `na` is hollow so "not measured" can never
   be mistaken for "no report" (gray) or "fine" (green). */
.tdot { display: inline-block; border-radius: 50%; border: 2px solid transparent; box-sizing: border-box; vertical-align: middle; }
.tdot--sm { width: 14px; height: 14px; }
.tdot--lg { width: 34px; height: 34px; box-shadow: 0 0 0 4px var(--paper-2); }
.tdot--green { background: var(--green); border-color: var(--green); }
.tdot--amber { background: var(--amber); border-color: var(--amber); }
.tdot--red   { background: var(--clay);  border-color: var(--clay); }
.tdot--gray  { background: var(--ink-faint); border-color: var(--ink-faint); }
.tdot--na    { background: transparent; border-color: var(--line-strong); }

.tl-board { display: grid; gap: 8px; }
.tl-row {
  display: grid; grid-template-columns: 44px 1.6fr 120px 110px 2.2fr 96px; align-items: center; gap: 14px;
  padding: 12px 16px; background: var(--panel); border: 1px solid var(--panel-edge); border-radius: var(--r-lg);
  text-decoration: none; color: inherit; transition: box-shadow .15s var(--ease);
}
.tl-row:hover { box-shadow: var(--shadow-1); }
.tl-row--red { border-inline-start: 4px solid var(--clay); }
.tl-row--gray { border-inline-start: 4px solid var(--ink-faint); }
.tl-row--amber { border-inline-start: 4px solid var(--amber); }
.tl-row--green { border-inline-start: 4px solid var(--green); }
.tl-row__name { font-family: var(--font-display); font-weight: 800; font-size: 17px; }
.tl-row__manager { color: var(--ink-3); font-size: 12.5px; }
.tl-axes { display: flex; gap: 6px; align-items: center; }
.tl-axes span { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; color: var(--ink-faint); }
.tl-delta { font-family: var(--font-mono); font-weight: 700; font-size: 15px; direction: ltr; text-align: center; }
.tl-delta--bad { color: var(--clay); }
.tl-delta--none { color: var(--ink-faint); font-family: var(--font-body); font-weight: 500; font-size: 12px; }
.tl-action { font-size: 13.5px; line-height: 1.35; }
.tl-last { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-3); text-align: end; }
.tl-last--stale { color: var(--clay); }
.tl-head { display: grid; grid-template-columns: 44px 1.6fr 120px 110px 2.2fr 96px; gap: 14px; padding: 0 16px 4px; font-size: 11px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: .04em; }
.tl-mode { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

@media (max-width: 820px) {
  .tl-head { display: none; }
  .tl-row { grid-template-columns: 44px 1fr; grid-template-areas: "dot name" "dot axes" "delta action" "last last"; }
  .tl-row > :nth-child(1) { grid-area: dot; }
  .tl-row > :nth-child(2) { grid-area: name; }
  .tl-row > :nth-child(3) { grid-area: axes; }
  .tl-row > :nth-child(4) { grid-area: delta; text-align: start; }
  .tl-row > :nth-child(5) { grid-area: action; }
  .tl-row > :nth-child(6) { grid-area: last; text-align: start; }
}

/* project screen */
.tl-blocks { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
.tl-block { background: var(--panel); border: 1px solid var(--panel-edge); border-radius: var(--r-lg); padding: 14px 16px; display: grid; gap: 10px; min-width: 0; }
.tl-block__head { display: flex; align-items: center; gap: 10px; }
.tl-block__title { font-family: var(--font-display); font-weight: 800; font-size: 16px; flex: 1; }
.tl-block__reason { font-size: 13.5px; color: var(--ink-2); }
.tl-block--red { border-color: var(--clay); }
.tl-block--amber { border-color: var(--amber); }
.tl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tl-table th { text-align: start; color: var(--ink-faint); font-weight: 600; font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
.tl-table td { padding: 6px; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.tl-table tr.is-critical td:first-child { font-weight: 800; }
.tl-table .mono { font-family: var(--font-mono); font-size: 12px; direction: ltr; text-align: end; }
.tl-bars { display: flex; gap: 2px; align-items: flex-end; height: 34px; }
.tl-bars i { flex: 1; background: var(--green); border-radius: 2px 2px 0 0; min-height: 2px; }
.tl-bars i.zero { background: var(--clay); }
.tl-footer { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
```

- [ ] **Step 4: `TrafficBoard.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { TrafficDot } from '../../components/TrafficDot'
import { useI18n } from '../../i18n'
import { fetchSnapshot, fetchSnapshots, fetchTrafficLight, type SnapshotMeta } from '../../traffic/api'
import { AXES, sortForBoard, type ProjectLight } from '../../traffic/model'
import { axisLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

export default function TrafficBoard() {
  const { lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const snapId = params.get('snapshot')
  const [rows, setRows] = useState<ProjectLight[] | null>(null)
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([])
  const [takenAt, setTakenAt] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [liveFailed, setLiveFailed] = useState(false)

  useEffect(() => { fetchSnapshots().then(setSnaps).catch(() => setSnaps([])) }, [])

  useEffect(() => {
    let alive = true
    setRows(null); setErr(''); setLiveFailed(false)
    const load = async () => {
      if (snapId) {
        const s = await fetchSnapshot(snapId)
        if (alive) { setRows(s.payload); setTakenAt(s.taken_at) }
        return
      }
      try {
        const live = await fetchTrafficLight()
        if (alive) { setRows(live); setTakenAt(null) }
      } catch (e) {
        // fall back to the latest snapshot, flagged (spec: error handling)
        const latest = (await fetchSnapshots(1).catch(() => []))[0]
        if (!latest) throw e
        const s = await fetchSnapshot(latest.id)
        if (alive) { setRows(s.payload); setTakenAt(s.taken_at); setLiveFailed(true) }
      }
    }
    load().catch((e) => alive && setErr(String((e as Error).message ?? e)))
    return () => { alive = false }
  }, [snapId])

  const sorted = useMemo(() => (rows ?? []).slice().sort(sortForBoard), [rows])
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '—')
  const staleDays = (d: string | null) => (d ? Math.round((Date.now() - Date.parse(d)) / 86_400_000) : 99)

  if (err) return <div className="page"><div className="alert">⚠ {err.includes('forbidden') ? tl(lang, 'error_forbidden') : err}</div></div>
  if (!rows) return <Loader label={tl(lang, 'loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{tl(lang, 'board_kicker')}</div>
          <h1 className="page-title">🚦 {tl(lang, 'board_title')}</h1>
        </div>
        <div className="tl-mode">
          <button className={`btn ${snapId ? 'btn--ghost' : 'btn--primary'}`} onClick={() => setParams({})}>{tl(lang, 'board_live')}</button>
          <select className="input" value={snapId ?? ''} onChange={(e) => setParams(e.target.value ? { snapshot: e.target.value } : {})}>
            <option value="">{tl(lang, 'board_snapshot')}…</option>
            {snaps.map((s) => <option key={s.id} value={s.id}>{new Date(s.taken_at).toLocaleDateString('he-IL')}</option>)}
          </select>
        </div>
      </div>

      {liveFailed && <div className="alert">⚠ {tl(lang, 'board_live_failed')} {takenAt ? `(${new Date(takenAt).toLocaleDateString('he-IL')})` : ''}</div>}
      {takenAt && !liveFailed && <div className="hint">{tl(lang, 'board_snapshot_of')}{new Date(takenAt).toLocaleString('he-IL')}</div>}

      {sorted.length === 0 ? <div className="empty">{tl(lang, 'board_empty')}</div> : (
        <div className="tl-board">
          <div className="tl-head">
            <span /><span>{tl(lang, 'board_col_project')}</span><span>{AXES.map((a) => axisLabel(lang, a).slice(0, 4)).join(' · ')}</span>
            <span>{tl(lang, 'board_col_due')}</span><span>{tl(lang, 'board_col_action')}</span><span>{tl(lang, 'board_col_last')}</span>
          </div>
          {sorted.map((p) => {
            const delta = p.due.delta_days
            return (
              <Link key={p.project_id} to={`/traffic/${p.project_id}${snapId ? `?snapshot=${snapId}` : ''}`} className={`tl-row tl-row--${p.color}`}>
                <TrafficDot color={p.color} size="lg" title={tl(lang, `color_${p.color}` as never)} />
                <div>
                  <div className="tl-row__name">{p.name}</div>
                  <div className="tl-row__manager">{p.manager ?? '—'}</div>
                </div>
                <div className="tl-axes">
                  {AXES.map((a) => (
                    <span key={a}><TrafficDot color={p.axes[a].color} title={`${axisLabel(lang, a)}: ${p.axes[a].reason}`} />{axisLabel(lang, a).slice(0, 4)}</span>
                  ))}
                </div>
                {p.due.contract == null
                  ? <div className="tl-delta tl-delta--none">{tl(lang, 'board_no_contract')}</div>
                  : <div className={`tl-delta ${delta != null && delta > 0 ? 'tl-delta--bad' : ''}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</div>}
                <div className="tl-action">{p.action_line}</div>
                <div className={`tl-last ${p.color === 'gray' && staleDays(p.last_entry_on) > 2 ? 'tl-last--stale' : ''}`}>
                  {p.last_entry_on ? fmtDate(p.last_entry_on) : tl(lang, 'board_no_report')}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify in the browser**

Run `npm run dev`, sign in as an admin, open `/traffic`. Expected: one row per active project, sorted red → gray → amber → green; hovering an axis dot shows its reason; the snapshot picker is empty until the weekly job has run (run it once now via Supabase MCP `execute_sql`: `select traffic_light_weekly();` — it runs as postgres, so the guard passes — then reload and pick the snapshot).

- [ ] **Step 6: Lint, build, commit**

Run: `npm run lint && npm test && npm run build` → PASS.

```bash
git add src/App.tsx src/components/Shell.tsx src/components/TrafficDot.tsx src/screens/traffic/TrafficBoard.tsx src/styles/traffic.css
git commit -m "feat(traffic): board screen — one row per project, live or snapshot"
```

---

### Task 11: Project screen (8.2) with axis blocks and task dialog

**Files:**
- Create: `src/screens/traffic/TrafficProject.tsx`, `src/screens/traffic/TaskDialog.tsx`

**Interfaces:**
- Consumes `fetchTrafficLight(projectId)`, `fetchSnapshot`, `createTrafficTask`, `fetchTasks` (`src/lib/tasks.ts`), `fetchMemberDirectory` (`src/api.ts`), `useDialog` (`src/lib/useDialog.ts`).
- `TaskDialog({ projectId, axis, defaultTitle, onClose, onCreated })`.

- [ ] **Step 1: `TaskDialog.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button, Field } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { notifyUser } from '../../defects/api'
import { sendPush } from '../../lib/push'
import { useDialog } from '../../lib/useDialog'
import { createTrafficTask } from '../../traffic/api'
import type { AxisKey } from '../../traffic/model'
import { axisLabel, tl } from '../../traffic/i18n'

export function TaskDialog({ projectId, axis, defaultTitle, onClose, onCreated }: {
  projectId: string; axis: AxisKey | 'gray'; defaultTitle: string; onClose: () => void; onCreated: () => void
}) {
  const { lang } = useI18n()
  const { user } = useAuth()
  const [title, setTitle] = useState(defaultTitle)
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [busy, setBusy] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose, true)
  useEffect(() => { fetchMemberDirectory().then(setUsers).catch(() => setUsers([])) }, [])

  const save = async () => {
    if (!user || !title.trim()) return
    setBusy(true)
    try {
      await createTrafficTask(projectId, axis, title.trim(), user.email, assignee || null, due || null)
      if (assignee) {
        notifyUser(assignee, tl(lang, 'proj_task_title'), title.trim(), '/tasks')
        sendPush([assignee], tl(lang, 'proj_task_title'), title.trim(), '/tasks')
      }
      onCreated(); onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" ref={panel} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <h3>{tl(lang, 'proj_task_title')} · {axisLabel(lang, axis)}</h3>
        <Field label={tl(lang, 'proj_task_what')}><textarea className="input" rows={3} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={tl(lang, 'proj_task_who')}>
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">—</option>
            {users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
          </select>
        </Field>
        <Field label={tl(lang, 'proj_task_when')}><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Button variant="ghost" type="button" onClick={onClose}>{tl(lang, 'cancel')}</Button>
          <Button variant="primary" type="button" disabled={busy || !title.trim()} onClick={save}>{tl(lang, 'proj_task_save')}</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `TrafficProject.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { TrafficDot } from '../../components/TrafficDot'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { fetchTasks, type WorkTask } from '../../lib/tasks'
import { fetchSnapshot, fetchTrafficLight } from '../../traffic/api'
import { AXES, type AxisKey, type ProjectLight } from '../../traffic/model'
import { axisLabel, deliveryStatusLabel, ownerLabel, tl } from '../../traffic/i18n'
import { TaskDialog } from './TaskDialog'
import '../../styles/traffic.css'

type Cat = { name_he: string; name_en: string; critical: boolean; matched: boolean; start: string | null; finish: string | null; base_start: string | null; gantt_pct: number | null; diary_pct: number | null; blocked_issue: number | null; color: ProjectLight['color'] }
type Item = { id: string; item: string; need_date: string; status: string; eta: string | null; gap_days: number | null; critical: boolean; color: ProjectLight['color'] }
type Crew = { name: string; critical: boolean; agreed: number; actual: number; ratio: number; days: number; absences: number; series: { date: string; workers: number }[]; color: ProjectLight['color'] }
type Iss = { id: string; seq: number; description: string; owner_kind: string; owner_email: string | null; due_date: string | null; days_open: number; blocking: boolean; systemic: boolean; color: ProjectLight['color'] }

const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')

export default function TrafficProject() {
  const { projectId = '' } = useParams()
  const [params] = useSearchParams()
  const snapId = params.get('snapshot')
  const { lang } = useI18n()
  const { projectName } = useStore()
  const [p, setP] = useState<ProjectLight | null>(null)
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [err, setErr] = useState('')
  const [dialog, setDialog] = useState<{ axis: AxisKey | 'gray'; title: string } | null>(null)

  const reloadTasks = () => fetchTasks().then((all) => setTasks(all.filter((x) => x.project_id === projectId && x.status === 'open'))).catch(() => {})
  useEffect(() => {
    let alive = true
    const load = snapId
      ? fetchSnapshot(snapId).then((s) => s.payload.find((x) => x.project_id === projectId) ?? null)
      : fetchTrafficLight(projectId).then((r) => r[0] ?? null)
    load.then((r) => alive && setP(r)).catch((e) => alive && setErr(String((e as Error).message ?? e)))
    reloadTasks()
    return () => { alive = false }
  }, [projectId, snapId])

  if (err) return <div className="page"><div className="alert">⚠ {err}</div></div>
  if (!p) return <Loader label={tl(lang, 'loading')} />

  const Block = ({ axis, children }: { axis: AxisKey | 'gray'; children: React.ReactNode }) => {
    const a = axis === 'gray' ? { color: 'gray' as const, reason: p.gray_reason ?? '' } : p.axes[axis]
    return (
      <section className={`tl-block tl-block--${a.color}`}>
        <div className="tl-block__head">
          <TrafficDot color={a.color} size="lg" />
          <div className="tl-block__title">{axisLabel(lang, axis)}</div>
          <button className="btn btn--ghost" onClick={() => setDialog({ axis, title: a.reason })}>☑ {tl(lang, 'proj_task_btn')}</button>
        </div>
        <div className="tl-block__reason">{a.reason}</div>
        {children}
      </section>
    )
  }

  const cats = (p.axes.time.evidence?.categories ?? []) as Cat[]
  const unmatched = (p.axes.time.evidence?.unmatched ?? []) as string[]
  const items = (p.axes.supply.evidence?.items ?? []) as Item[]
  const crew = (p.axes.crew.evidence?.contractors ?? []) as Crew[]
  const iss = (p.axes.issues.evidence?.items ?? []) as Iss[]
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker"><Link to={snapId ? `/traffic?snapshot=${snapId}` : '/traffic'}>‹ {tl(lang, 'proj_back')}</Link></div>
          <h1 className="page-title"><TrafficDot color={p.color} size="lg" /> {projectName(projectId)}</h1>
          <div className="tl-row__manager">{p.manager ?? ''} · {tl(lang, 'board_col_due')}: {d(p.due.contract)} / {d(p.due.forecast)}
            {p.due.delta_days != null && <b className="mono"> ({p.due.delta_days > 0 ? '+' : ''}{p.due.delta_days})</b>}</div>
        </div>
      </div>
      {p.color === 'gray' && <Block axis="gray"><></></Block>}

      <div className="tl-blocks">
        <Block axis="time">
          {!p.axes.time.evidence?.has_chart && <div className="hint">{tl(lang, 'proj_no_chart')}</div>}
          <table className="tl-table m-cards">
            <thead><tr><th>{tl(lang, 'cat_col_name')}</th><th>{tl(lang, 'cat_col_planned')}</th><th>{tl(lang, 'cat_col_baseline')}</th><th>{tl(lang, 'cat_col_gantt_pct')}</th><th>{tl(lang, 'cat_col_diary_pct')}</th><th>{tl(lang, 'cat_col_color')}</th></tr></thead>
            <tbody>{cats.map((c) => (
              <tr key={c.name_he} className={c.critical ? 'is-critical' : ''}>
                <td>{lang === 'he' ? c.name_he : c.name_en}{c.critical ? ' ★' : ''}</td>
                <td className="mono">{c.matched ? `${d(c.start)}–${d(c.finish)}` : '—'}</td>
                <td className="mono">{d(c.base_start)}</td>
                <td className="mono">{c.gantt_pct ?? '—'}</td>
                <td className="mono">{c.diary_pct ?? '—'}</td>
                <td><TrafficDot color={c.matched ? c.color : 'na'} /></td>
              </tr>))}</tbody>
          </table>
          {unmatched.length > 0 && <div className="alert">⚠ {tl(lang, 'proj_unmatched')}: {unmatched.join(', ')}</div>}
        </Block>

        <Block axis="supply">
          <table className="tl-table m-cards">
            <thead><tr><th>{tl(lang, 'sup_col_item')}</th><th>{tl(lang, 'sup_col_need')}</th><th>{tl(lang, 'sup_col_status')}</th><th>{tl(lang, 'sup_col_eta')}</th><th>{tl(lang, 'sup_col_gap')}</th><th /></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id} className={i.critical ? 'is-critical' : ''}>
                <td>{i.item}</td><td className="mono">{d(i.need_date)}</td><td>{deliveryStatusLabel(lang, i.status)}</td>
                <td className="mono">{d(i.eta)}</td><td className="mono">{i.gap_days == null ? '—' : `${i.gap_days > 0 ? '+' : ''}${i.gap_days}`}</td><td><TrafficDot color={i.color} /></td>
              </tr>))}</tbody>
          </table>
          <Link className="btn btn--ghost" to={`/traffic/${projectId}/deliveries`}>{tl(lang, 'proj_deliveries_link')} ›</Link>
        </Block>

        <Block axis="client"><div className="hint">{tl(lang, 'proj_phase2')}</div></Block>

        <Block axis="crew">
          <table className="tl-table m-cards">
            <thead><tr><th>{tl(lang, 'crew_col_name')}</th><th>{tl(lang, 'crew_col_agreed')}</th><th>{tl(lang, 'crew_col_actual')}</th><th>{tl(lang, 'crew_col_ratio')}</th><th>{tl(lang, 'crew_col_absences')}</th><th>{tl(lang, 'crew_chart_title')}</th></tr></thead>
            <tbody>{crew.map((c) => (
              <tr key={c.name} className={c.critical ? 'is-critical' : ''}>
                <td>{c.name}{c.critical ? ' ★' : ''}</td><td className="mono">{c.agreed}</td><td className="mono">{c.actual}</td>
                <td className="mono">{Math.round(c.ratio * 100)}%</td><td className="mono">{c.absences}</td>
                <td><div className="tl-bars" title={c.series.map((s) => `${s.date}: ${s.workers}`).join('\n')}>
                  {c.series.map((s) => <i key={s.date} className={s.workers === 0 ? 'zero' : ''} style={{ height: `${Math.min(100, (s.workers / Math.max(1, c.agreed)) * 100)}%` }} />)}
                </div></td>
              </tr>))}</tbody>
          </table>
        </Block>

        <Block axis="issues">
          <table className="tl-table m-cards">
            <thead><tr><th>#</th><th>{tl(lang, 'iss_col_desc')}</th><th>{tl(lang, 'iss_col_owner')}</th><th>{tl(lang, 'iss_col_days')}</th><th>{tl(lang, 'iss_col_blocking')}</th><th /></tr></thead>
            <tbody>{iss.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.seq}</td><td>{i.description}{i.systemic ? ' · ⚠ ' + tl(lang, 'iss_col_systemic') : ''}</td>
                <td>{ownerLabel(lang, i.owner_kind)}{i.owner_email ? ` · ${i.owner_email}` : ''}</td>
                <td className="mono">{i.days_open}</td><td>{i.blocking ? '✓' : ''}</td><td><TrafficDot color={i.color} /></td>
              </tr>))}</tbody>
          </table>
          <Link className="btn btn--ghost" to={`/traffic/${projectId}/issues`}>{tl(lang, 'proj_issues_link')} ›</Link>
        </Block>

        <section className="tl-block">
          <div className="tl-block__head"><div className="tl-block__title">☑ {tl(lang, 'proj_tasks_title')}</div></div>
          {tasks.length === 0 ? <div className="hint">{tl(lang, 'proj_tasks_empty')}</div> : (
            <table className="tl-table m-cards">
              <thead><tr><th>{tl(lang, 'proj_task_what')}</th><th>{tl(lang, 'proj_task_who')}</th><th>{tl(lang, 'proj_task_when')}</th></tr></thead>
              <tbody>{tasks.map((x) => <tr key={x.id}><td>{x.title}</td><td>{x.assignee_email ?? '—'}</td><td className="mono">{d(x.due_date)}</td></tr>)}</tbody>
            </table>
          )}
          <Link className="btn btn--ghost" to="/tasks">☑ ›</Link>
        </section>
      </div>

      <div className="tl-footer">
        <Link className="btn btn--ghost" to={`/?project=${projectId}&from=${weekAgo}`}>📓 {tl(lang, 'proj_logbook_link')}</Link>
        <Link className="btn btn--ghost" to={`/gantt?project=${projectId}`}>▬ {tl(lang, 'proj_gantt_link')}</Link>
      </div>

      {dialog && <TaskDialog projectId={projectId} axis={dialog.axis} defaultTitle={dialog.title} onClose={() => setDialog(null)} onCreated={reloadTasks} />}
    </div>
  )
}
```

Check that `/?project=…&from=…` is a filter the logbook screen understands (`src/screens/Logbook.tsx` reads search params); if it does not, link to `/` plain — the footer link must not 404.

- [ ] **Step 3: Verify in the browser**

Open a red/amber project from the board: six blocks, the "משימה" button opens the dialog prefilled with the axis reason, saving adds the task to the block list and to `/tasks`.

- [ ] **Step 4: Lint, build, commit**

```bash
git add src/screens/traffic/TrafficProject.tsx src/screens/traffic/TaskDialog.tsx
git commit -m "feat(traffic): project drill-down with axis blocks and task dialog"
```

---

### Task 12: Deliveries and Issues register screens

**Files:**
- Create: `src/screens/traffic/Deliveries.tsx` (default export + named `DeliveriesPick`)
- Create: `src/screens/traffic/Issues.tsx`

**Interfaces:**
- Consumes Task 6 API (`fetchDeliveries/upsertDelivery/deleteDelivery`, `fetchIssues/updateIssue/createIssue`, `DELIVERY_STATUSES`, `OWNER_KINDS`), `useStore().templateFor`, `usePerms()`.

- [ ] **Step 1: `Deliveries.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { usePerms } from '../../lib/usePerms'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { DELIVERY_STATUSES, deleteDelivery, fetchDeliveries, upsertDelivery, type Delivery } from '../../traffic/api'
import { deliveryStatusLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

/** Landing list for purchasing users who hold only the `deliveries` area. */
export function DeliveriesPick() {
  const { projects } = useStore()
  const { lang } = useI18n()
  return (
    <div className="page">
      <h1 className="page-title">{tl(lang, 'sup_title')}</h1>
      <div className="tl-board">
        {projects.filter((p) => p.active).map((p) => (
          <Link key={p.id} className="tl-row" to={`/traffic/${p.id}/deliveries`}><span /><div className="tl-row__name">{p.name}</div></Link>
        ))}
      </div>
    </div>
  )
}

export default function Deliveries() {
  const { projectId = '' } = useParams()
  const { lang } = useI18n()
  const { user } = useAuth()
  const { canEdit } = usePerms()
  const { projectName, projects, templateFor } = useStore()
  const editable = canEdit('traffic_light') || canEdit('deliveries')
  const [rows, setRows] = useState<Delivery[] | null>(null)
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [windowOnly, setWindowOnly] = useState(true)
  const [err, setErr] = useState('')
  const project = projects.find((p) => p.id === projectId)
  const template = templateFor(project?.project_type)

  const reload = () => fetchDeliveries(projectId).then(setRows).catch((e) => setErr(String(e.message ?? e)))
  useEffect(() => { reload(); fetchMemberDirectory().then(setUsers).catch(() => {}) }, [projectId])

  const save = async (d: Partial<Delivery> & { project_id: string; item: string; need_date: string }) => {
    if (!user) return
    try { await upsertDelivery(d, user.email); reload() } catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const addRow = () => save({ project_id: projectId, item: '—', need_date: new Date().toISOString().slice(0, 10) })

  if (!rows) return <Loader label={tl(lang, 'loading')} />
  const horizon = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10)
  const shown = windowOnly ? rows.filter((r) => r.status !== 'on_site' && r.need_date <= horizon) : rows

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker"><Link to={`/traffic/${projectId}`}>‹ {projectName(projectId)}</Link></div>
          <h1 className="page-title">📦 {tl(lang, 'sup_title')}</h1>
        </div>
        <label className="task-mine"><input type="checkbox" checked={windowOnly} onChange={(e) => setWindowOnly(e.target.checked)} /> {tl(lang, 'sup_window_only')}</label>
      </div>
      {err && <div className="alert">{err}</div>}
      <table className="tl-table m-cards">
        <thead><tr>
          <th>{tl(lang, 'sup_col_item')}</th><th>{tl(lang, 'sup_col_cat')}</th><th>{tl(lang, 'sup_col_need')}</th>
          <th>{tl(lang, 'sup_col_status')}</th><th>{tl(lang, 'sup_col_eta')}</th><th>{tl(lang, 'sup_col_owner')}</th><th />
        </tr></thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id}>
            <td><input className="input" defaultValue={r.item} disabled={!editable} onBlur={(e) => e.target.value !== r.item && save({ ...r, item: e.target.value })} /></td>
            <td><select className="input" value={r.wbs_template_id ?? ''} disabled={!editable} onChange={(e) => save({ ...r, wbs_template_id: e.target.value || null })}>
              <option value="">—</option>{template.map((t) => <option key={t.id} value={t.id}>{lang === 'he' ? t.name_he : t.name_en}</option>)}</select></td>
            <td><input className="input" type="date" value={r.need_date} disabled={!editable} onChange={(e) => save({ ...r, need_date: e.target.value })} /></td>
            <td><select className="input" value={r.status} disabled={!editable} onChange={(e) => save({ ...r, status: e.target.value as Delivery['status'] })}>
              {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{deliveryStatusLabel(lang, s)}</option>)}</select></td>
            <td><input className="input" type="date" value={r.eta ?? ''} disabled={!editable} onChange={(e) => save({ ...r, eta: e.target.value || null })} /></td>
            <td><select className="input" value={r.owner_email ?? ''} disabled={!editable} onChange={(e) => save({ ...r, owner_email: e.target.value || null })}>
              <option value="">—</option>{users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}</select></td>
            <td>{editable && <button className="rtable__del" onClick={() => deleteDelivery(r.id).then(reload)}>✕</button>}</td>
          </tr>))}</tbody>
      </table>
      {editable && <Button variant="ghost" type="button" onClick={addRow} style={{ marginTop: 10 }}>{tl(lang, 'sup_add')}</Button>}
    </div>
  )
}
```

- [ ] **Step 2: `Issues.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { Button } from '../../components/ui'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { usePerms } from '../../lib/usePerms'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { OWNER_KINDS, createIssue, fetchIssues, updateIssue, type Issue, type OwnerKind } from '../../traffic/api'
import { ownerLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

export default function Issues() {
  const { projectId = '' } = useParams()
  const { lang } = useI18n()
  const { canEdit } = usePerms()
  const { projectName, projects, templateFor } = useStore()
  const editable = canEdit('traffic_light')
  const [open, setOpen] = useState(true)
  const [rows, setRows] = useState<Issue[] | null>(null)
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState({ description: '', owner_kind: 'other' as OwnerKind, blocking: false })
  const template = templateFor(projects.find((p) => p.id === projectId)?.project_type)
  const today = new Date().toISOString().slice(0, 10)

  const reload = () => fetchIssues(projectId, open).then(setRows).catch((e) => setErr(String(e.message ?? e)))
  useEffect(() => { setRows(null); reload(); fetchMemberDirectory().then(setUsers).catch(() => {}) }, [projectId, open])
  const patch = (id: string, p: Partial<Issue>) => updateIssue(id, p).then(reload).catch((e) => setErr(String(e.message ?? e)))

  if (!rows) return <Loader label={tl(lang, 'loading')} />
  const daysOpen = (i: Issue) => Math.round((Date.parse(i.closed_on ?? today) - Date.parse(i.opened_on)) / 86_400_000)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker"><Link to={`/traffic/${projectId}`}>‹ {projectName(projectId)}</Link></div>
          <h1 className="page-title">⚠ {tl(lang, 'iss_title')}</h1>
        </div>
        <div className="tl-mode">
          <button className={`btn ${open ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setOpen(true)}>{tl(lang, 'iss_open')}</button>
          <button className={`btn ${!open ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setOpen(false)}>{tl(lang, 'iss_closed')}</button>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <table className="tl-table m-cards">
        <thead><tr>
          <th>#</th><th>{tl(lang, 'iss_col_desc')}</th><th>{tl(lang, 'iss_col_owner')}</th><th>{tl(lang, 'iss_col_owner_email')}</th>
          <th>{tl(lang, 'iss_col_due')}</th><th>{tl(lang, 'iss_col_days')}</th><th>{tl(lang, 'iss_col_blocking')}</th>
          <th>{tl(lang, 'iss_col_category')}</th><th>{tl(lang, 'iss_col_systemic')}</th><th />
        </tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i.id} className={i.blocking || i.systemic ? 'is-critical' : ''}>
            <td className="mono">{i.seq}{i.entry_id && <Link to={`/entry/${i.entry_id}`} title={tl(lang, 'iss_from_entry')}> 📓</Link>}</td>
            <td><textarea className="input" rows={2} defaultValue={i.description} disabled={!editable} onBlur={(e) => e.target.value !== i.description && patch(i.id, { description: e.target.value })} /></td>
            <td><select className="input" value={i.owner_kind} disabled={!editable} onChange={(e) => patch(i.id, { owner_kind: e.target.value as OwnerKind })}>
              {OWNER_KINDS.map((k) => <option key={k} value={k}>{ownerLabel(lang, k)}</option>)}</select></td>
            <td><select className="input" value={i.owner_email ?? ''} disabled={!editable} onChange={(e) => patch(i.id, { owner_email: e.target.value || null })}>
              <option value="">—</option>{users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}</select></td>
            <td><input className="input" type="date" value={i.due_date ?? ''} disabled={!editable} onChange={(e) => patch(i.id, { due_date: e.target.value || null })} /></td>
            <td className="mono">{daysOpen(i)}</td>
            <td><input type="checkbox" checked={i.blocking} disabled={!editable} onChange={(e) => patch(i.id, { blocking: e.target.checked })} /></td>
            <td><select className="input" value={i.wbs_template_id ?? ''} disabled={!editable} onChange={(e) => patch(i.id, { wbs_template_id: e.target.value || null })}>
              <option value="">—</option>{template.map((t) => <option key={t.id} value={t.id}>{lang === 'he' ? t.name_he : t.name_en}</option>)}</select></td>
            <td><input type="checkbox" checked={i.systemic} disabled={!editable} onChange={(e) => patch(i.id, { systemic: e.target.checked })} /></td>
            <td>{editable && (open
              ? <button className="btn btn--ghost" onClick={() => { const note = window.prompt(tl(lang, 'iss_close_note')) ?? ''; patch(i.id, { closed_on: today, closure_note: note }) }}>{tl(lang, 'iss_close')}</button>
              : <button className="btn btn--ghost" onClick={() => patch(i.id, { closed_on: null, closure_note: null })}>{tl(lang, 'iss_reopen')}</button>)}</td>
          </tr>))}</tbody>
      </table>

      {editable && open && (
        <div className="task-new" style={{ marginTop: 14 }}>
          <input className="input" placeholder={tl(lang, 'iss_col_desc')} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <select className="input" value={draft.owner_kind} onChange={(e) => setDraft({ ...draft, owner_kind: e.target.value as OwnerKind })}>
            {OWNER_KINDS.map((k) => <option key={k} value={k}>{ownerLabel(lang, k)}</option>)}</select>
          <label className="task-mine"><input type="checkbox" checked={draft.blocking} onChange={(e) => setDraft({ ...draft, blocking: e.target.checked })} /> {tl(lang, 'iss_col_blocking')}</label>
          <Button variant="primary" type="button" disabled={!draft.description.trim()}
            onClick={() => createIssue({ project_id: projectId, ...draft, description: draft.description.trim() }).then(() => { setDraft({ description: '', owner_kind: 'other', blocking: false }); reload() })}>
            {tl(lang, 'iss_add')}
          </Button>
        </div>
      )}
    </div>
  )
}
```

Note: `window.prompt` is a blocking dialog — acceptable here (same pattern as `window.confirm` in `CoopReports`), but do not trigger it from automated browser checks.

- [ ] **Step 3: Verify**

As admin: add a delivery, change its status, tick it in a new diary entry under "הגיע לאתר היום" → after save the status reads "באתר". File a diary entry with a malfunction dept + "חוסם: כן" → it appears in the open issues list with `📓` linking back. As a member granted only `deliveries`: `/traffic/pick/deliveries` lists projects; the deliveries table is editable; `/traffic` redirects home.

- [ ] **Step 4: Lint, build, commit**

```bash
git add src/screens/traffic/Deliveries.tsx src/screens/traffic/Issues.tsx
git commit -m "feat(traffic): deliveries list and issues register screens"
```

---

### Task 13: Admin — WBS templates and thresholds

**Files:**
- Create: `src/screens/traffic/WbsTemplates.tsx`, `src/screens/traffic/TrafficSettings.tsx`

- [ ] **Step 1: `WbsTemplates.tsx`**

```tsx
import { useState } from 'react'
import { Button } from '../../components/ui'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { deleteTemplate, upsertTemplate } from '../../traffic/api'
import { tl } from '../../traffic/i18n'
import type { WbsTemplate } from '../../traffic/wbs'

export default function WbsTemplates() {
  const { lang } = useI18n()
  const { wbsTemplates, reloadTemplates } = useStore()
  const types = [...new Set(['coop', ...wbsTemplates.map((t) => t.project_type)])]
  const [type, setType] = useState('coop')
  const [newType, setNewType] = useState('')
  const [err, setErr] = useState('')
  const rows = wbsTemplates.filter((t) => t.project_type === type).sort((a, b) => a.sort_order - b.sort_order)
  const save = (t: Partial<WbsTemplate> & { project_type: string; name_he: string; name_en: string; sort_order: number }) =>
    upsertTemplate(t).then(reloadTemplates).catch((e) => setErr(String(e.message ?? e)))
  const move = (t: WbsTemplate, dir: -1 | 1) => {
    const other = rows.find((r) => r.sort_order === t.sort_order + dir)
    if (!other) return
    Promise.all([upsertTemplate({ ...t, sort_order: other.sort_order }), upsertTemplate({ ...other, sort_order: t.sort_order })]).then(reloadTemplates)
  }

  return (
    <div className="page">
      <div className="page__head"><div><div className="kicker">Admin</div><h1 className="page-title">{tl(lang, 'wbs_title')}</h1></div></div>
      <div className="hint">{tl(lang, 'wbs_hint')}</div>
      {err && <div className="alert">{err}</div>}
      <div className="tl-mode" style={{ margin: '12px 0' }}>
        {types.map((ty) => <button key={ty} className={`btn ${ty === type ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setType(ty)}>{ty}</button>)}
        <input className="input" placeholder={tl(lang, 'wbs_type')} value={newType} onChange={(e) => setNewType(e.target.value)} style={{ maxWidth: 160 }} />
        <Button variant="ghost" type="button" disabled={!newType.trim()} onClick={() => { setType(newType.trim()); setNewType('') }}>+</Button>
      </div>
      <div className="rtable">
        <div className="rtable__head rtable__row--wbs"><span>#</span><span>{tl(lang, 'wbs_name_he')}</span><span>{tl(lang, 'wbs_name_en')}</span><span>{tl(lang, 'cat_critical')}</span><span>{tl(lang, 'save')}</span><span /></div>
        {rows.map((t) => (
          <div key={t.id} className="rtable__row rtable__row--wbs">
            <span className="mono">{t.sort_order} <button className="btn btn--quiet" onClick={() => move(t, -1)}>▲</button><button className="btn btn--quiet" onClick={() => move(t, 1)}>▼</button></span>
            <input className="input" defaultValue={t.name_he} onBlur={(e) => e.target.value !== t.name_he && save({ ...t, name_he: e.target.value })} />
            <input className="input" defaultValue={t.name_en} onBlur={(e) => e.target.value !== t.name_en && save({ ...t, name_en: e.target.value })} />
            <input type="checkbox" checked={t.critical} onChange={(e) => save({ ...t, critical: e.target.checked })} />
            <input type="checkbox" checked={t.active} title="active" onChange={(e) => save({ ...t, active: e.target.checked })} />
            <button className="rtable__del" onClick={() => deleteTemplate(t.id).then(reloadTemplates)}>✕</button>
          </div>
        ))}
      </div>
      <Button variant="ghost" type="button" style={{ marginTop: 10 }}
        onClick={() => save({ project_type: type, sort_order: (rows.at(-1)?.sort_order ?? 0) + 1, name_he: 'קטגוריה חדשה', name_en: 'New category', critical: false })}>
        {tl(lang, 'wbs_add')}
      </Button>
    </div>
  )
}
```

CSS: `.rtable__row--wbs { grid-template-columns: 110px 2fr 2fr auto auto auto; align-items: center; }`

- [ ] **Step 2: `TrafficSettings.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Field } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { fetchSettings, updateSettings } from '../../traffic/api'
import type { Settings } from '../../traffic/model'
import { tl, type TLKey } from '../../traffic/i18n'

const KEYS: (keyof Settings)[] = ['time_amber_days', 'time_red_days', 'lookahead_days', 'supply_red_window_days', 'supply_eta_margin_days',
  'crew_green_pct', 'crew_red_pct', 'crew_window_days', 'issue_open_days', 'issue_block_resolve_days', 'gray_missing_workdays', 'gray_gantt_days']

export default function TrafficSettings() {
  const { lang } = useI18n()
  const [s, setS] = useState<Settings | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { fetchSettings().then(setS).catch((e) => setMsg(String(e.message ?? e))) }, [])
  if (!s) return <Loader label={tl(lang, 'loading')} />
  return (
    <div className="page">
      <div className="page__head"><div><div className="kicker">Admin</div><h1 className="page-title">🚦 {tl(lang, 'settings_title')}</h1></div></div>
      {msg && <div className="alert">{msg}</div>}
      <div className="form-grid">
        {KEYS.map((k) => (
          <Field key={k} label={tl(lang, `s_${k}` as TLKey)}>
            <input className="input" type="number" min={0} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) || 0 })} />
          </Field>
        ))}
      </div>
      <Button variant="primary" type="button" style={{ marginTop: 14 }}
        onClick={() => updateSettings(s).then(() => setMsg(tl(lang, 'settings_saved'))).catch((e) => setMsg(String(e.message ?? e)))}>
        {tl(lang, 'save')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Verify, lint, commit**

Change `time_amber_days` to 0, reload `/traffic` — a project with delta 3 turns amber. Restore 7.

```bash
git add src/screens/traffic/WbsTemplates.tsx src/screens/traffic/TrafficSettings.tsx src/styles/components.css
git commit -m "feat(traffic): admin screens for WBS templates and thresholds"
```

---

### Task 14: Tasks screen — traffic-light source, PMO-only closing

**Files:**
- Modify: `src/screens/Tasks.tsx`
- Modify: `src/lib/tasks.ts` (`WorkTask` gains `source`, `axis`, `closed_by`)

- [ ] **Step 1: Type**

`src/lib/tasks.ts`:

```ts
  source: 'manual' | 'traffic_light'
  axis: 'time' | 'supply' | 'client' | 'crew' | 'issues' | 'gray' | null
  closed_by: string | null
```

- [ ] **Step 2: Screen**

In `Tasks.tsx`:
- Add to `T`: `only_tl: { he: 'רק רמזור', en: 'Traffic light only' }`, `by_assignee: { he: 'לפי אחראי', en: 'By assignee' }`, `pmo_only: { he: 'סגירה על ידי PMO בלבד', en: 'PMO closes this' }`.
- State `const [tlOnly, setTlOnly] = useState(false)`; filter `if (tlOnly) list = list.filter((x) => x.source === 'traffic_light')`; sort `list = [...list].sort((a, b) => (a.assignee_email ?? '~').localeCompare(b.assignee_email ?? '~') || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))` when `tlOnly`.
- Checkbox in the head next to `mine_only`: `<label className="task-mine"><input type="checkbox" checked={tlOnly} onChange={(e) => setTlOnly(e.target.checked)} /> {t('only_tl')}</label>`.
- `const { canEdit } = usePerms()`; `const canClose = (x: WorkTask) => x.source !== 'traffic_light' || canEdit('traffic_light')`.
- The status checkbox: `disabled={!canClose(x)}` with `title={!canClose(x) ? t('pmo_only') : undefined}`; `toggle` passes `closed_by: status === 'done' ? me : null`.
- Row tags: when `x.source === 'traffic_light'` render `<span className="tag tag--amber">🚦 {axisLabel(lang, x.axis ?? 'gray')}</span>` and a link to `/traffic/${x.project_id}` on the project tag.

- [ ] **Step 3: Verify, lint, commit**

As a member with `traffic_light` none: the checkbox on a 🚦 task is disabled. As admin: closing works and `closed_by` is set (check in the table).

```bash
git add src/screens/Tasks.tsx src/lib/tasks.ts
git commit -m "feat(tasks): traffic-light tasks — filter, axis tag, PMO-only closing"
```

---

### Task 15: End-to-end check, README, memory

**Files:**
- Modify: `README.md` (Features + Data model rows)

- [ ] **Step 1: Pilot data**

Through the UI, for the pilot project (כפר יובל): set contract date and type, add contractors (e.g. שמחה, agreed 15, critical), add three deliveries (one not ordered inside 3 weeks), make sure a Gantt is imported and at least one summary task name equals a template row. File a diary entry with crew rows and a blocking issue.

- [ ] **Step 2: Expected colors**

`/traffic` → the pilot project is red (blocking issue), time axis colored from the Gantt, supply red (not ordered within 3 weeks), crew computed from the entry, client hollow. Run `select traffic_light_weekly();` via Supabase MCP → snapshot appears in the picker, tasks appear in `/tasks` with 🚦, running it a second time creates no duplicates (`select count(*) from work_tasks where source='traffic_light' and status='open'` unchanged).

- [ ] **Step 3: README**

Add a Features bullet:

```
- **Traffic-light report (רמזור)** — managers/admins: one row per project, color = worst of
  time / supplies / crew / issues (thresholds admin-editable), gray when the site stops
  reporting; project drill-down with the evidence; weekly snapshot that opens tasks.
```

and Data model rows for `wbs_templates`, `project_contractors`, `project_deliveries`, `issues`, `traffic_light_settings`, `traffic_light_snapshots`.

- [ ] **Step 4: Full verification and commit**

Run: `npm test && npm run lint && npm run build` → all PASS.

```bash
git add README.md
git commit -m "docs: traffic-light report"
```

Then follow `superpowers:finishing-a-development-branch`. Deploy note (memory `vercel-deploy-author-block`): commits must be authored by the repo owner or the Vercel build blocks.

---

## Self-review against the spec

- Data model §: Tasks 1–3 cover every table/column, including `wbs_legacy_names` (added in the plan as the SQL mirror of `LEGACY_TASK_MAP`).
- Computation §: Task 5 implements gray, time (project + category, unmatched list), supply, crew (with 28-day series), issues (blocking/systemic/amber), client `na`, output shape, weekly job with dedup and notifications.
- Screens §: 8.1 Task 10, 8.2 Task 11, 8.3 Task 14, PMO screens Tasks 9/12/13.
- Diary changes: Task 8 (crew rows, blocking, arrivals), Task 7 (departments, template rows).
- Error handling: board falls back to the last snapshot (Task 10); triggers swallow errors (Task 3).
- Testing: rules (Task 4), wbs parity (Task 2), fn shape (Task 5), perms (Task 1), crew parsing (Task 8), report (Task 8), i18n completeness (Task 6), manual SQL smoke (Tasks 5, 15).
- Known simplification: `tl_time` compares `start_ts` to `base_start_ts` for the "start slipped" rule; MS Project files without a saved baseline give `base_start_ts = null` and the rule stays silent — matches spec chapter 6 (baseline is a PMO obligation).
