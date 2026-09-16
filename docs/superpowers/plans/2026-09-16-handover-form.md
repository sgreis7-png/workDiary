# טופס מסירה (Handover form) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paper form 70 (מסירת פרויקט POULTRY) with an in-app "מסירה" tab: a per-project handover form with a required system-by-system תקין/לא תקין check, attendees, a finger signature from the receiver, and a printable/mailable report in the paper's layout.

**Architecture:** A new `src/handover/` module that mirrors `src/safety/` file-for-file (model → api → report → screens), one new migration (`0077_handover_forms.sql`) holding an admin-editable `handover_systems` catalogue and a `handover_forms` table, and a new `handover` permission area. Signature capture and rendering are imported from `src/safety/` unchanged.

**Tech Stack:** Vite 5 + React 18 + TypeScript (strict, `noUnusedLocals`), React Router 7, framer-motion, Supabase (anon-key browser client, all authorization in RLS), vitest (node env).

**Design doc:** `docs/superpowers/specs/2026-09-16-handover-form-design.md`

## Global Constraints

- Every user-visible string lives in a `S` map with **both** `he` and `en`. No literal user-facing strings in components (the module's own map is `src/handover/i18n.ts`, read through `ht(lang, key)`).
- Logical CSS only: `margin-inline-start`, `inset-inline-end`, `text-align: start`. Never `left`/`right`/`margin-left`.
- `overflow: clip`, never `overflow: hidden`, on containers holding inputs.
- Migrations are write-once. `supabase/migrations/0077_handover_forms.sql` is created with `Write`, fully filled in, and **never edited afterwards** — a PreToolUse hook blocks it. Do **not** apply it; report the file and let the user apply it.
- Every table gets `alter table ... enable row level security`, every `create policy` is preceded by `drop policy if exists`, every `for all` policy carries `with check`.
- A new permission area must agree in four places: `src/lib/perms.ts` (`PermArea`, `PERM_AREAS`, `MEMBER_DEFAULTS`, `MANAGER_DEFAULTS`), the migration's `perm_defaults` insert, `src/lib/perms.sql.test.ts` (a new `readFileSync` folded into `seededDefaults()`), and the RLS policies.
- Report HTML must carry RTL through inline `style` and `dir="rtl"` on the wrapper only — Chromium's clipboard sanitizer strips `align`/`dir` attributes elsewhere.
- Node 22. `npm test` and `npm run lint` must pass before each commit; `npm run build` runs `tsc`, so unused locals/params fail CI.
- The 14 seeded system labels, verbatim from form 70, in this order:
  `אוורור`, `מערכת צינון`, `חימום`, `מערכת חשמל + מפיל וילון`, `מערכת מים`, `המטרה`, `מיכלי תערובת`, `מערכת האבסה`, `מערכת שתייה`, `מערכת תלייה וכננות`, `מערכת תאים`, `תאורה`, `מערכת זבל`, `מבנה/תשתית`.

---

### Task 1: Migration, permission area, and the tests that pin them together

**Files:**
- Create: `supabase/migrations/0077_handover_forms.sql`
- Create: `src/handover/systems.ts`
- Create: `src/handover/systems.sql.test.ts`
- Modify: `src/lib/perms.ts` (`PermArea` union, `PERM_AREAS`, `MEMBER_DEFAULTS`, `MANAGER_DEFAULTS`)
- Modify: `src/lib/perms.sql.test.ts` (add `SQL77`, fold into `seededDefaults()`)

**Interfaces:**
- Consumes: nothing.
- Produces: `HANDOVER_SYSTEM_SEED: readonly string[]` from `src/handover/systems.ts`; the `handover` `PermArea`; tables `handover_systems(id,label,sort_order,active,created_at)` and `handover_forms(id,project_id,handover_date,client_name,site_location,project_nature,attendees,systems,notes,receiver_name,receiver_role,receiver_signature,signed_at,created_by,created_at,updated_at)`.

- [ ] **Step 1: Get the migration number**

Run: `powershell -NoProfile -File .claude/skills/create-migration/scripts/next-migration.ps1 handover_forms`

Expected: prints `0077` (if it prints a different number, use that number everywhere below).

- [ ] **Step 2: Write the seed constant the client and the migration will share**

Create `src/handover/systems.ts`:

```ts
// The systems checked at a project handover, verbatim from paper form 70 (rev 1, 30.12.2022).
// The live list is admin-editable in handover_systems; this constant is what migration 0077
// seeds that table with, and systems.sql.test.ts holds the two in agreement — a label typed
// differently in SQL would silently produce a fifteenth system nobody ticks.
export const HANDOVER_SYSTEM_SEED = [
  'אוורור',
  'מערכת צינון',
  'חימום',
  'מערכת חשמל + מפיל וילון',
  'מערכת מים',
  'המטרה',
  'מיכלי תערובת',
  'מערכת האבסה',
  'מערכת שתייה',
  'מערכת תלייה וכננות',
  'מערכת תאים',
  'תאורה',
  'מערכת זבל',
  'מבנה/תשתית',
] as const
```

- [ ] **Step 3: Write the failing tests**

Create `src/handover/systems.sql.test.ts`:

```ts
// handover_systems is seeded from the paper form, and the same 14 labels exist in
// TypeScript so a fresh install and the hosted database agree on what a handover checks.
//
// Drift here is silent and expensive: a label spelled differently in SQL adds a system that
// no form ever ticks, and since a handover cannot be saved until every system is marked, a
// stray row makes the save button unreachable in the field with a customer waiting.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HANDOVER_SYSTEM_SEED } from './systems'

const SQL = readFileSync('supabase/migrations/0077_handover_forms.sql', 'utf8')

/** The ('label', 10) pairs seeded into handover_systems. */
function seededLabels(): string[] {
  const block = SQL.slice(SQL.indexOf('insert into handover_systems'))
  const end = block.indexOf('on conflict')
  return [...block.slice(0, end).matchAll(/\('([^']+)',\s*\d+\)/g)].map((m) => m[1])
}

describe('handover_systems seed mirrors HANDOVER_SYSTEM_SEED', () => {
  it('seeds exactly the labels the client knows, in the same order', () => {
    expect(seededLabels()).toEqual([...HANDOVER_SYSTEM_SEED])
  })
  it('seeds ascending sort_order so the form matches the paper', () => {
    const orders = [...SQL.matchAll(/\('[^']+',\s*(\d+)\)/g)].map((m) => Number(m[1]))
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})
```

Then modify `src/lib/perms.sql.test.ts` — add the migration read next to `SQL64`:

```ts
const SQL77 = readFileSync('supabase/migrations/0077_handover_forms.sql', 'utf8')
```

and inside `seededDefaults()`, after the `SQL64` loop:

```ts
  for (const [, area, level] of SQL77.matchAll(/\('member',\s*'(\w+)',\s*'(none|view|edit)'\)/g)) {
    out[area] = level as PermLevel
  }
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- src/handover src/lib/perms.sql.test.ts`
Expected: FAIL — `ENOENT ... 0077_handover_forms.sql`.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/0077_handover_forms.sql`:

```sql
-- טופס מסירת פרויקט (טופס 70) — המסמך שבו הלקוח מאשר שכל מערכות הפרויקט נבדקו ונמסרו.
-- מקביל למודול src/handover/ בצד הלקוח: systems.ts מחזיק את אותם 14 שמות שנזרעים כאן,
-- ו-src/handover/systems.sql.test.ts שומר על ההתאמה.
--
-- החתימה נשמרת כווקטור (JSONB) בתוך השורה, בדיוק כמו ב-safety_forms (0061): 1-3KB, נטענת
-- עם הרשומה, ומודפסת חד בכל גודל — בלי bucket ובלי signed URLs.
--
-- מסירה נשמרת רק כשהיא חתומה (הוולידציה בצד הלקוח דורשת חתימת מקבל), ולכן כל שורה קיימת
-- היא מסמך חתום: update/delete מוגבלים לאדמין בלבד ולא ליוצר.

-- ---- רשימת המערכות, ניתנת לעריכה באדמין, נזרעת מטופס 70 ----
create table if not exists handover_systems (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table handover_systems enable row level security;

drop policy if exists read_handover_systems on handover_systems;
create policy read_handover_systems on handover_systems for select using (is_member());
drop policy if exists admin_handover_systems on handover_systems;
create policy admin_handover_systems on handover_systems for all
  using (is_admin()) with check (is_admin());

insert into handover_systems (label, sort_order) values
  ('אוורור',                    10),
  ('מערכת צינון',               20),
  ('חימום',                     30),
  ('מערכת חשמל + מפיל וילון',   40),
  ('מערכת מים',                 50),
  ('המטרה',                     60),
  ('מיכלי תערובת',              70),
  ('מערכת האבסה',               80),
  ('מערכת שתייה',               90),
  ('מערכת תלייה וכננות',       100),
  ('מערכת תאים',               110),
  ('תאורה',                    120),
  ('מערכת זבל',                130),
  ('מבנה/תשתית',               140)
on conflict (label) do nothing;

-- ---- טופסי המסירה ----
create table if not exists handover_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  handover_date date not null default current_date,
  client_name text not null default '',      -- שם הלקוח
  site_location text not null default '',    -- מיקום האתר
  project_nature text not null default '',   -- מהות הפרויקט
  attendees jsonb not null default '[]',     -- [{name,role}] — נוכחים במעמד המסירה
  systems jsonb not null default '[]',       -- [{label,status:'ok'|'bad',note}]
  notes text not null default '',
  receiver_name text not null default '',    -- שם מקבל הפרויקט
  receiver_role text not null default '',
  receiver_signature jsonb,
  signed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists handover_forms_project_date
  on handover_forms (project_id, handover_date desc);
alter table handover_forms enable row level security;

-- קריאה: מי שיש לו הרשאת צפייה, ותמיד היוצר עצמו (כמו safety_forms ב-0061).
drop policy if exists read_handover_forms on handover_forms;
create policy read_handover_forms on handover_forms for select
  using (can_view('handover') or (is_member() and created_by = auth.uid()));
drop policy if exists insert_handover_forms on handover_forms;
create policy insert_handover_forms on handover_forms for insert
  with check (can_edit('handover') and created_by = auth.uid());

-- מסמך חתום לא משנים: תיקון של מסירה שנחתמה עובר דרך אדמין בלבד. אין כאן can_edit()
-- בכוונה — לאדמין ממילא יש edit בכל אזור, וההגבלה היא כל הנקודה.
drop policy if exists update_handover_forms on handover_forms;
create policy update_handover_forms on handover_forms for update
  using (is_admin()) with check (is_admin());
drop policy if exists delete_handover_forms on handover_forms;
create policy delete_handover_forms on handover_forms for delete
  using (is_admin());

-- ---- ברירות מחדל לאזור ההרשאה החדש (role-keyed מאז 0050) ----
insert into perm_defaults (role, area, level) values
  ('member',  'handover', 'edit'),
  ('manager', 'handover', 'edit')
on conflict (role, area) do update set level = excluded.level;
```

- [ ] **Step 6: Add the permission area to the client**

In `src/lib/perms.ts`:

- add `| 'handover'` to the `PermArea` union (after `'safety'`),
- add to `PERM_AREAS`, right after the `safety` row:

```ts
  { key: 'handover', label: 'טופסי מסירה', label_en: 'Handover forms' },
```

- add to **both** `MEMBER_DEFAULTS` and `MANAGER_DEFAULTS`, after the `safety` line:

```ts
  handover: 'edit', // טופסי מסירת פרויקט — מנהלי עבודה בשטח מחתימים את הלקוח
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/handover src/lib/perms.sql.test.ts`
Expected: PASS (seed matches, ascending order, `perm_defaults` covers `handover`).

- [ ] **Step 8: Lint and commit**

```bash
npm run lint
git add supabase/migrations/0077_handover_forms.sql src/handover/systems.ts src/handover/systems.sql.test.ts src/lib/perms.ts src/lib/perms.sql.test.ts
git commit -m "feat(handover): schema, system catalogue and permission area"
```

---

### Task 2: Model, validation and module strings

**Files:**
- Create: `src/handover/model.ts`
- Create: `src/handover/model.test.ts`
- Create: `src/handover/i18n.ts`
- Modify: `src/i18n.test.ts` (add the module's dictionary to the `dicts` list)

**Interfaces:**
- Consumes: `HANDOVER_SYSTEM_SEED` (Task 1); `Sig` from `../safety/signature`.
- Produces: `HandoverAttendee`, `SystemStatus`, `HandoverSystemCheck`, `HandoverSystem`, `HandoverRec`, `HandoverInput`, `HandoverDraft`, `HandoverError`, `validateHandover(d: HandoverDraft): HandoverError[]`, `handoverMatchesText(rec: HandoverRec, text: string): boolean`, `blankAttendee()`, `systemChecksFor(systems: HandoverSystem[], saved: HandoverSystemCheck[]): HandoverSystemCheck[]`; the string map `S` and `ht(lang, key)` from `i18n.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/handover/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  blankAttendee, handoverMatchesText, systemChecksFor, validateHandover,
  type HandoverDraft, type HandoverRec, type HandoverSystem,
} from './model'

const sig = { v: 1 as const, strokes: [[[0, 0], [9, 9]]] }

const full = (): HandoverDraft => ({
  project_id: 'p1',
  handover_date: '2026-09-16',
  client_name: 'קיבוץ מעלה גמלא',
  site_location: 'רמת הגולן',
  project_nature: 'לול פיטום',
  attendees: [{ name: 'אבי', role: 'מנהל פרויקט' }],
  systems: [{ label: 'אוורור', status: 'ok', note: '' }],
  receiver_name: 'מיכאל',
  receiver_role: 'מנהל הלול',
  receiver_signature: sig,
})

describe('validateHandover', () => {
  it('accepts a complete form', () => {
    expect(validateHandover(full())).toEqual([])
  })
  it('rejects a missing project', () => {
    expect(validateHandover({ ...full(), project_id: '' })).toContain('project')
  })
  it('rejects an incomplete header', () => {
    expect(validateHandover({ ...full(), site_location: '  ' })).toContain('header')
  })
  it('rejects a form with no complete attendee', () => {
    expect(validateHandover({ ...full(), attendees: [{ name: 'אבי', role: '' }] })).toContain('attendee')
  })
  // The whole value of the record is that every system was actually looked at. An unmarked
  // row means the paper equivalent was handed over with a blank box — which is what this
  // screen exists to stop.
  it('rejects an unmarked system', () => {
    const d = { ...full(), systems: [{ label: 'אוורור', status: null, note: '' }] }
    expect(validateHandover(d)).toContain('systems')
  })
  it('rejects a form with no systems at all', () => {
    expect(validateHandover({ ...full(), systems: [] })).toContain('systems')
  })
  it('rejects a missing receiver name, role or signature', () => {
    expect(validateHandover({ ...full(), receiver_name: '' })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_role: '' })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_signature: null })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_signature: { v: 1, strokes: [] } })).toContain('receiver')
  })
})

describe('systemChecksFor', () => {
  const cat: HandoverSystem[] = [
    { id: '1', label: 'אוורור', sort_order: 10, active: true },
    { id: '2', label: 'חימום', sort_order: 20, active: false },
  ]
  it('lists the active catalogue, unmarked, for a new form', () => {
    expect(systemChecksFor(cat, [])).toEqual([{ label: 'אוורור', status: null, note: '' }])
  })
  // A system retired after the customer signed must still appear on that form, or the
  // reopened document no longer matches the paper the customer holds.
  it('keeps a saved check whose system has since been deactivated, and its answer', () => {
    const saved = [{ label: 'חימום', status: 'bad' as const, note: 'דוד דולף' }]
    expect(systemChecksFor(cat, saved)).toEqual([
      { label: 'אוורור', status: null, note: '' },
      { label: 'חימום', status: 'bad', note: 'דוד דולף' },
    ])
  })
  it('reuses saved answers for systems still in the catalogue', () => {
    const saved = [{ label: 'אוורור', status: 'ok' as const, note: 'תקין' }]
    expect(systemChecksFor(cat, saved)).toEqual([{ label: 'אוורור', status: 'ok', note: 'תקין' }])
  })
})

describe('handoverMatchesText', () => {
  const rec = { client_name: 'מעלה גמלא', receiver_name: 'מיכאל', site_location: 'הגולן' } as HandoverRec
  it('matches client, receiver or site, and matches everything on an empty query', () => {
    expect(handoverMatchesText(rec, 'גמלא')).toBe(true)
    expect(handoverMatchesText(rec, 'מיכאל')).toBe(true)
    expect(handoverMatchesText(rec, 'הגולן')).toBe(true)
    expect(handoverMatchesText(rec, 'תל אביב')).toBe(false)
    expect(handoverMatchesText(rec, '')).toBe(true)
  })
})

describe('blankAttendee', () => {
  it('starts empty', () => {
    expect(blankAttendee()).toEqual({ name: '', role: '' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/handover/model.test.ts`
Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write the model**

Create `src/handover/model.ts`:

```ts
import { sigIsEmpty, type Sig } from '../safety/signature'

export interface HandoverAttendee { name: string; role: string }
export type SystemStatus = 'ok' | 'bad'
export interface HandoverSystemCheck { label: string; status: SystemStatus | null; note: string }
export interface HandoverSystem { id: string; label: string; sort_order: number; active: boolean }

export interface HandoverRec {
  id: string
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  notes: string
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
  signed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
export type HandoverInput = Omit<HandoverRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>

/** What the form screen holds while it is being filled — the subset validation judges. */
export interface HandoverDraft {
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
}

export type HandoverError = 'project' | 'header' | 'attendee' | 'systems' | 'receiver'

export const blankAttendee = (): HandoverAttendee => ({ name: '', role: '' })

/**
 * Everything the paper form leaves no room to skip. A handover is the customer's receipt:
 * a row saved with an unticked system or no signature is worth less than the paper it
 * replaced, so this is the single gate both the screen and any later caller go through.
 */
export function validateHandover(d: HandoverDraft): HandoverError[] {
  const errs: HandoverError[] = []
  if (!d.project_id) errs.push('project')
  if (!d.handover_date || !d.client_name.trim() || !d.site_location.trim() || !d.project_nature.trim()) {
    errs.push('header')
  }
  if (!d.attendees.some((a) => a.name.trim() && a.role.trim())) errs.push('attendee')
  if (d.systems.length === 0 || d.systems.some((s) => s.status == null)) errs.push('systems')
  if (!d.receiver_name.trim() || !d.receiver_role.trim() || sigIsEmpty(d.receiver_signature)) {
    errs.push('receiver')
  }
  return errs
}

/**
 * The rows the form shows: every active system, plus any system the saved record carries
 * that is no longer active. Answers already given are preserved by label.
 */
export function systemChecksFor(
  catalogue: HandoverSystem[], saved: HandoverSystemCheck[],
): HandoverSystemCheck[] {
  const byLabel = new Map(saved.map((s) => [s.label, s]))
  const active = catalogue.filter((s) => s.active)
  const rows = active.map((s) => byLabel.get(s.label) ?? { label: s.label, status: null, note: '' })
  const activeLabels = new Set(active.map((s) => s.label))
  const retired = saved.filter((s) => !activeLabels.has(s.label))
  return [...rows, ...retired]
}

/** Free-text filter for the list screen: customer, receiver or site. */
export function handoverMatchesText(rec: HandoverRec, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return [rec.client_name, rec.receiver_name, rec.site_location]
    .some((v) => (v ?? '').toLowerCase().includes(q))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/handover/model.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write the module's strings**

Create `src/handover/i18n.ts`:

```ts
// Bilingual strings for the handover (מסירה) module. System labels are NOT here —
// they are admin-editable content living in handover_systems.
import type { Lang } from '../i18n'

export const S = {
  nav_section_handover: { he: 'מסירה', en: 'Handover' },
  nav_handover:        { he: 'טופסי מסירה', en: 'Handover forms' },
  nav_handover_systems: { he: 'ניהול מערכות מסירה', en: 'Handover systems' },

  list_title:        { he: 'מסירת פרויקטים', en: 'Project handovers' },
  list_new:          { he: 'מסירה חדשה', en: 'New handover' },
  list_empty:        { he: 'אין עדיין טופסי מסירה', en: 'No handover forms yet' },
  list_all_projects: { he: 'כל הפרויקטים', en: 'All projects' },
  list_from:         { he: 'מתאריך', en: 'From' },
  list_to:           { he: 'עד תאריך', en: 'To' },
  list_search:       { he: 'חיפוש לקוח / מקבל / אתר', en: 'Search customer / receiver / site' },
  list_bad:          { he: 'לא תקין', en: 'faults' },

  form_title_new:  { he: 'טופס מסירת פרויקט', en: 'Project handover form' },
  form_title_edit: { he: 'עריכת טופס מסירה', en: 'Edit handover form' },
  form_project:    { he: 'פרויקט', en: 'Project' },
  form_date:       { he: 'תאריך המסירה', en: 'Handover date' },
  form_client:     { he: 'שם הלקוח', en: 'Customer name' },
  form_site:       { he: 'מיקום האתר', en: 'Site location' },
  form_nature:     { he: 'מהות הפרויקט', en: 'Project scope' },
  form_attendees:  { he: 'נוכחים במעמד המסירה', en: 'Present at the handover' },
  form_att_name:   { he: 'שם', en: 'Name' },
  form_att_role:   { he: 'תפקיד', en: 'Role' },
  form_add_att:    { he: '+ הוספת נוכח', en: '+ Add attendee' },
  form_systems:    { he: 'מערכות', en: 'Systems' },
  form_system:     { he: 'מערכת', en: 'System' },
  form_status:     { he: 'תקין / לא תקין', en: 'OK / faulty' },
  form_ok:         { he: 'תקין', en: 'OK' },
  form_bad:        { he: 'לא תקין', en: 'Faulty' },
  form_note:       { he: 'הערות', en: 'Notes' },
  form_notes:      { he: 'הערות כלליות', en: 'General notes' },
  form_receiver:   { he: 'מקבל הפרויקט', en: 'Project receiver' },
  form_rec_name:   { he: 'שם מקבל הפרויקט', en: 'Receiver name' },
  form_rec_role:   { he: 'תפקיד', en: 'Role' },
  form_sign:       { he: 'חתימה', en: 'Sign' },
  form_remove:     { he: 'הסרה', en: 'Remove' },
  form_draft_restored: { he: 'שוחזרה טיוטה שלא נשמרה', en: 'Unsaved draft restored' },
  form_locked_hint: { he: 'טופס מסירה חתום ניתן לעריכה על ידי מנהל מערכת בלבד', en: 'A signed handover can only be edited by an administrator' },

  err_project:  { he: 'יש לבחור פרויקט', en: 'Pick a project' },
  err_header:   { he: 'יש למלא שם לקוח, מיקום אתר, מהות הפרויקט ותאריך', en: 'Customer, site, project scope and date are required' },
  err_attendee: { he: 'נדרש לפחות נוכח אחד עם שם ותפקיד', en: 'At least one attendee with a name and a role is required' },
  err_systems:  { he: 'יש לסמן תקין או לא תקין לכל המערכות', en: 'Every system must be marked OK or faulty' },
  err_receiver: { he: 'יש למלא שם מקבל הפרויקט, תפקיד וחתימה', en: 'Receiver name, role and signature are required' },

  sign_title:   { he: 'חתימת מקבל הפרויקט', en: 'Receiver signature' },

  view_warranty: {
    he: '* הפרויקט תחת שנת אחריות אחת מיום המסירה',
    en: '* The project carries one year of warranty from the handover date',
  },
  view_title:   { he: 'מסירת פרויקט', en: 'Project handover' },
  view_send:    { he: 'שליחה במייל', en: 'Send by mail' },
  view_edit:    { he: 'עריכה', en: 'Edit' },
  view_delete_confirm: { he: 'למחוק את טופס המסירה?', en: 'Delete this handover form?' },

  systems_title:  { he: 'ניהול מערכות מסירה', en: 'Manage handover systems' },
  systems_add:    { he: '+ מערכת חדשה', en: '+ New system' },
  systems_active: { he: 'פעיל', en: 'Active' },
} as const

export type HKey = keyof typeof S
export const ht = (lang: Lang, k: HKey): string => S[k]?.[lang] ?? String(k)
```

- [ ] **Step 6: Put the new dictionary under the he/en invariant**

In `src/i18n.test.ts`, add the import next to the other module dictionaries:

```ts
import { S as HANDOVER_S } from './handover/i18n'
```

and add the entry to the `dicts` array:

```ts
  ['handover/i18n.ts', HANDOVER_S as unknown as Record<string, { he: string; en: string }>],
```

This is what catches a key that ships with a missing or still-Hebrew English value —
without it the new module sits outside the only test that checks the two languages agree.

- [ ] **Step 7: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS — including `i18n.test.ts`, now covering the handover strings.

- [ ] **Step 8: Commit**

```bash
git add src/handover/model.ts src/handover/model.test.ts src/handover/i18n.ts src/i18n.test.ts
git commit -m "feat(handover): record model, validation and strings"
```

---

### Task 3: Data access

**Files:**
- Create: `src/handover/api.ts`

**Interfaces:**
- Consumes: `HandoverInput`, `HandoverRec`, `HandoverSystem` (Task 2); `supabase` from `../lib/supabase`.
- Produces: `listHandovers(f?: HandoverFilters): Promise<HandoverRec[]>`, `getHandover(id: string): Promise<HandoverRec | null>`, `createHandover(input: HandoverInput): Promise<string>`, `updateHandover(id: string, input: HandoverInput): Promise<void>`, `deleteHandover(id: string): Promise<void>`, `fetchHandoverSystems(): Promise<HandoverSystem[]>`, `createHandoverSystem(label: string, sortOrder: number): Promise<void>`, `updateHandoverSystem(id, patch): Promise<void>`, `reorderHandoverSystems(orderedIds: string[]): Promise<void>`, `fetchProjectHeader(projectId: string): Promise<{ client_name: string; site_location: string; project_nature: string } | null>`, and the `HandoverFilters` interface.

- [ ] **Step 1: Write the module**

Create `src/handover/api.ts`:

```ts
import { supabase } from '../lib/supabase'
import type { HandoverInput, HandoverRec, HandoverSystem } from './model'

const COLS = 'id,project_id,handover_date,client_name,site_location,project_nature,'
  + 'attendees,systems,notes,receiver_name,receiver_role,receiver_signature,signed_at,'
  + 'created_by,created_at,updated_at'

export interface HandoverFilters { projectId?: string; from?: string; to?: string }

export async function listHandovers(f: HandoverFilters = {}): Promise<HandoverRec[]> {
  let q = supabase.from('handover_forms').select(COLS)
    .order('handover_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('handover_date', f.from)
  if (f.to) q = q.lte('handover_date', f.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as HandoverRec[]
}

export async function getHandover(id: string): Promise<HandoverRec | null> {
  const { data, error } = await supabase.from('handover_forms').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as HandoverRec | null
}

export async function createHandover(input: HandoverInput): Promise<string> {
  const { data, error } = await supabase.from('handover_forms').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

// RLS (migration 0077) allows update/delete to admins only — a signed handover is not
// rewritten by the person who filled it. A non-admin's update matches no row, and Postgres
// reports success with zero rows affected rather than an error; .select('id') is what tells
// the two apart, so the screen can say "you cannot" instead of "saved".
export async function updateHandover(id: string, input: HandoverInput): Promise<void> {
  const { data, error } = await supabase.from('handover_forms')
    .update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה לערוך טופס מסירה חתום')
}

export async function deleteHandover(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_forms').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה למחוק טופס מסירה חתום')
}

// ---------- system catalogue ----------

export async function fetchHandoverSystems(): Promise<HandoverSystem[]> {
  const { data, error } = await supabase.from('handover_systems')
    .select('id,label,sort_order,active').order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as HandoverSystem[]
}

export async function createHandoverSystem(label: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('handover_systems').insert({ label, sort_order: sortOrder })
  if (error) throw error
}

export async function updateHandoverSystem(
  id: string, patch: Partial<Pick<HandoverSystem, 'label' | 'active'>>,
): Promise<void> {
  const { error } = await supabase.from('handover_systems').update(patch).eq('id', id)
  if (error) throw error
}

export async function reorderHandoverSystems(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('handover_systems').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- header prefill ----------

/** Header values for a new form. `projects` has no customer column, so the project name is
 *  the best guess for both the customer and the scope — the form lets the user correct
 *  them, and typing over a wrong guess is still faster than typing into three blanks. */
export async function fetchProjectHeader(
  projectId: string,
): Promise<{ client_name: string; site_location: string; project_nature: string } | null> {
  const { data, error } = await supabase.from('projects')
    .select('name,location').eq('id', projectId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const p = data as unknown as { name: string; location: string | null }
  return { client_name: p.name ?? '', site_location: p.location ?? '', project_nature: p.name ?? '' }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: PASS — the build is where `tsc` runs, so a wrong column name in a generic or an unused import fails here.

- [ ] **Step 3: Commit**

```bash
git add src/handover/api.ts
git commit -m "feat(handover): supabase data access"
```

---

### Task 4: Report HTML

**Files:**
- Create: `src/handover/report.ts`
- Create: `src/handover/report.test.ts`

**Interfaces:**
- Consumes: `HandoverRec` (Task 2), `S` (Task 2), `sigSvg` from `../safety/signature`.
- Produces: `handoverFormHtml(rec: HandoverRec, projectName: string, lang: Lang): string`.

- [ ] **Step 1: Write the failing test**

Create `src/handover/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { HandoverRec } from './model'
import { handoverFormHtml } from './report'

const rec: HandoverRec = {
  id: 'x', project_id: 'p', handover_date: '2026-09-16',
  client_name: 'קיבוץ מעלה גמלא', site_location: 'רמת הגולן', project_nature: 'לול פיטום',
  attendees: [{ name: 'אבי', role: 'מנהל פרויקט' }, { name: 'דנה', role: 'מהנדסת' }],
  systems: [
    { label: 'אוורור', status: 'ok', note: '' },
    { label: 'מערכת מים', status: 'bad', note: 'דליפה בשעון' },
  ],
  notes: 'נמסר לאחר הרצה',
  receiver_name: 'מיכאל', receiver_role: 'מנהל הלול',
  receiver_signature: { v: 1, strokes: [[[1, 1], [5, 5]]] },
  signed_at: '2026-09-16T08:00:00Z',
  created_by: 'u', created_at: '', updated_at: '',
}

describe('handoverFormHtml', () => {
  const html = handoverFormHtml(rec, 'מעלה גמלא — לול 3', 'he')

  it('carries the paper header: customer, site, scope and date', () => {
    expect(html).toContain('מסירת פרויקט')
    expect(html).toContain('קיבוץ מעלה גמלא')
    expect(html).toContain('רמת הגולן')
    expect(html).toContain('לול פיטום')
    expect(html).toContain('2026-09-16')
  })
  it('lists every attendee with their role', () => {
    expect(html).toContain('אבי')
    expect(html).toContain('מנהל פרויקט')
    expect(html).toContain('דנה')
  })
  // The status marks are the document: a faulty system printed as blank is the failure that
  // would send Agrotop back to the site arguing about what was signed.
  it('renders a row per system with its mark and note', () => {
    expect(html).toContain('אוורור')
    expect(html).toContain('מערכת מים')
    expect(html).toContain('דליפה בשעון')
    expect(html).toContain('תקין')
    expect(html).toContain('לא תקין')
  })
  it('carries the warranty line, the notes and one signature', () => {
    expect(html).toContain('שנת אחריות')
    expect(html).toContain('נמסר לאחר הרצה')
    expect(html).toContain('מיכאל')
    expect((html.match(/<svg/g) ?? []).length).toBe(1)
  })
  it('escapes html in user-entered text', () => {
    const evil = { ...rec, client_name: '<img src=x>' }
    expect(handoverFormHtml(evil, 'p', 'he')).not.toContain('<img src=x>')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/handover/report.test.ts`
Expected: FAIL — `Failed to resolve import "./report"`.

- [ ] **Step 3: Write the report builder**

Create `src/handover/report.ts`:

```ts
import type { Lang } from '../i18n'
import { sigSvg } from '../safety/signature'
import { S } from './i18n'
import type { HandoverRec } from './model'

const esc = (s: string) => (s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const TD = 'border:1px solid #444;padding:6px'

/** The paper form 70 layout, used for the on-screen view, print and the mail body alike —
 *  one builder so the three cannot drift. RTL rides on the wrapper's inline direction,
 *  never on `align`/`dir` attributes: Chromium's clipboard sanitizer drops those on copy. */
export function handoverFormHtml(f: HandoverRec, projectName: string, lang: Lang): string {
  const attendees = (f.attendees ?? []).map((a) => `
    <tr>
      <td style="${TD}">${esc(a.name)}</td>
      <td style="${TD}">${esc(a.role)}</td>
    </tr>`).join('')
  const systems = (f.systems ?? []).map((s) => `
    <tr>
      <td style="${TD}">${esc(s.label)}</td>
      <td style="${TD};text-align:center;white-space:nowrap">${
        s.status === 'ok' ? `✔ ${S.form_ok[lang]}` : s.status === 'bad' ? `✘ ${S.form_bad[lang]}` : ''}</td>
      <td style="${TD}">${esc(s.note)}</td>
    </tr>`).join('')
  return `
  <div dir="rtl" style="direction:rtl;font-family:Arial,'Segoe UI',sans-serif;color:#111;max-width:760px;margin:0 auto">
    <h2 style="text-align:center;margin:8px 0">${S.view_title[lang]} — ${esc(projectName)}</h2>
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr>
        <th style="${TD}">${S.form_client[lang]}</th>
        <th style="${TD}">${S.form_site[lang]}</th>
        <th style="${TD}">${S.form_nature[lang]}</th>
        <th style="${TD}">${S.form_date[lang]}</th>
      </tr>
      <tr>
        <td style="${TD}">${esc(f.client_name)}</td>
        <td style="${TD}">${esc(f.site_location)}</td>
        <td style="${TD}">${esc(f.project_nature)}</td>
        <td style="${TD}"><span dir="ltr">${esc(f.handover_date)}</span></td>
      </tr>
    </table>
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr>
        <th style="${TD}">${S.form_attendees[lang]}</th>
        <th style="${TD};width:38%">${S.form_att_role[lang]}</th>
      </tr>${attendees}
    </table>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="${TD};width:28%">${S.form_system[lang]}</th>
        <th style="${TD};width:18%">${S.form_status[lang]}</th>
        <th style="${TD}">${S.form_note[lang]}</th>
      </tr>${systems}
    </table>
    ${f.notes?.trim() ? `<p style="margin:14px 0"><b>${S.form_notes[lang]}:</b><br/>${esc(f.notes).replace(/\n/g, '<br/>')}</p>` : ''}
    <p style="margin:18px 0;font-weight:700;text-decoration:underline">${S.view_warranty[lang]}</p>
    <table style="border-collapse:collapse;width:100%;margin-top:10px">
      <tr>
        <th style="${TD}">${S.form_rec_name[lang]}</th>
        <th style="${TD}">${S.form_rec_role[lang]}</th>
        <th style="${TD};width:200px">${S.form_sign[lang]}</th>
      </tr>
      <tr>
        <td style="${TD}">${esc(f.receiver_name)}</td>
        <td style="${TD}">${esc(f.receiver_role)}</td>
        <td style="${TD};text-align:center">${sigSvg(f.receiver_signature, 160)}</td>
      </tr>
    </table>
  </div>`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/handover/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/handover/report.ts src/handover/report.test.ts
git commit -m "feat(handover): form-70 report html"
```

---

### Task 5: The form screen

**Files:**
- Create: `src/handover/HandoverFormScreen.tsx`
- Modify: `src/styles/components.css` (add `.rtable__row--attendees` and `.rtable__row--handover`, near the other `.rtable__row--*` rules around line 197)

**Interfaces:**
- Consumes: everything from Tasks 2–3; `SignaturePad` from `../safety/SignaturePad`; `sigIsEmpty`, `sigSvg`, `Sig` from `../safety/signature`; `Button`, `Field`, `stagger`, `riseIn` from `../components/ui`; `Loader` from `../components/Loader`.
- Produces: `export function HandoverFormScreen()`, routed at `/handover/new` and `/handover/:id/edit`.

- [ ] **Step 1: Add the two grid rows to the stylesheet**

In `src/styles/components.css`, after the `.rtable__row--workers` line:

```css
.rtable__row--attendees { display: grid; grid-template-columns: 1.4fr 1fr 34px; gap: 12px; align-items: center; padding: 10px 14px; }
.rtable__row--handover { display: grid; grid-template-columns: 1.1fr 190px 1.4fr; gap: 12px; align-items: center; padding: 10px 14px; }
.handover-status { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.handover-status label { display: inline-flex; gap: 5px; align-items: center; white-space: nowrap; }
@media (max-width: 720px) {
  .rtable__row--attendees { grid-template-columns: 1fr 34px; }
  .rtable__row--handover { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Write the screen**

Create `src/handover/HandoverFormScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { SignaturePad } from '../safety/SignaturePad'
import { sigIsEmpty, sigSvg, type Sig } from '../safety/signature'
import {
  createHandover, fetchHandoverSystems, fetchProjectHeader, getHandover, updateHandover,
} from './api'
import {
  blankAttendee, systemChecksFor, validateHandover,
  type HandoverAttendee, type HandoverError, type HandoverInput, type HandoverSystem,
  type HandoverSystemCheck, type SystemStatus,
} from './model'
import { ht } from './i18n'

const DRAFT_KEY = 'handover_draft'
const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  notes: string
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
}

export function HandoverFormScreen() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const { projects } = useStore()
  const { isAdmin } = useAuth()

  const [loading, setLoading] = useState(editing)
  const [catalogue, setCatalogue] = useState<HandoverSystem[]>([])
  const [savedSystems, setSavedSystems] = useState<HandoverSystemCheck[]>([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(today())
  const [client, setClient] = useState('')
  const [site, setSite] = useState('')
  const [nature, setNature] = useState('')
  const [attendees, setAttendees] = useState<HandoverAttendee[]>([blankAttendee()])
  const [systems, setSystems] = useState<HandoverSystemCheck[]>([])
  const [notes, setNotes] = useState('')
  const [recName, setRecName] = useState('')
  const [recRole, setRecRole] = useState('')
  const [recSig, setRecSig] = useState<Sig | null>(null)
  const [signing, setSigning] = useState(false)
  const [errors, setErrors] = useState<HandoverError[]>([])
  const [saveErr, setSaveErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [draftNotice, setDraftNotice] = useState(false)

  useEffect(() => { fetchHandoverSystems().then(setCatalogue).catch(() => {}) }, [])

  // load the record (edit) or restore a pending draft (new)
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (editing && id) {
        const f = await getHandover(id)
        if (!alive) return
        if (!f) { nav('/handover'); return }
        // A signed handover is admin-only to update (migration 0077). Anyone else who lands
        // here goes to the read-only view instead of an editor that would fail on save.
        if (!isAdmin) { nav(`/handover/${id}`); return }
        setProjectId(f.project_id); setDate(f.handover_date)
        setClient(f.client_name); setSite(f.site_location); setNature(f.project_nature)
        setAttendees(f.attendees.length ? f.attendees : [blankAttendee()])
        setSavedSystems(f.systems)
        setNotes(f.notes)
        setRecName(f.receiver_name); setRecRole(f.receiver_role); setRecSig(f.receiver_signature)
        setLoading(false); setRestored(true)
      } else {
        try {
          const raw = localStorage.getItem(DRAFT_KEY)
          if (raw) {
            const d = JSON.parse(raw) as Draft
            setProjectId(d.project_id ?? ''); setDate(d.handover_date ?? today())
            setClient(d.client_name ?? ''); setSite(d.site_location ?? ''); setNature(d.project_nature ?? '')
            setAttendees(d.attendees?.length ? d.attendees : [blankAttendee()])
            setSavedSystems(d.systems ?? [])
            setNotes(d.notes ?? '')
            setRecName(d.receiver_name ?? ''); setRecRole(d.receiver_role ?? '')
            setRecSig(d.receiver_signature ?? null)
            setDraftNotice(true)
          }
        } catch { /* corrupt draft — start clean */ }
        setRestored(true)
      }
    })().catch(() => { if (alive) { setSaveErr('load failed'); setLoading(false); setRestored(true) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id, nav])

  // the rows to show: active catalogue + anything the record already carries
  useEffect(() => {
    if (!restored || catalogue.length === 0) return
    setSystems((cur) => systemChecksFor(catalogue, cur.length ? cur : savedSystems))
  }, [restored, catalogue, savedSystems])

  // header prefill from the project — only empty fields, never over a typed value
  useEffect(() => {
    if (editing || !restored || !projectId) return
    let alive = true
    fetchProjectHeader(projectId).then((h) => {
      if (!alive || !h) return
      setClient((c) => (c.trim() ? c : h.client_name))
      setSite((s) => (s.trim() ? s : h.site_location))
      setNature((n) => (n.trim() ? n : h.project_nature))
    }).catch(() => {})
    return () => { alive = false }
  }, [editing, restored, projectId])

  // draft persistence — new forms only; the signature rides along on purpose, because the
  // customer signs on site and the phone may not see the network until the drive home
  useEffect(() => {
    if (editing || !restored || busy) return
    const t = setTimeout(() => {
      const d: Draft = {
        project_id: projectId, handover_date: date, client_name: client, site_location: site,
        project_nature: nature, attendees, systems, notes,
        receiver_name: recName, receiver_role: recRole, receiver_signature: recSig,
      }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage full / private mode */ }
    }, 400)
    return () => clearTimeout(t)
  }, [editing, restored, busy, projectId, date, client, site, nature, attendees, systems, notes, recName, recRole, recSig])

  const updAttendee = (i: number, patch: Partial<HandoverAttendee>) =>
    setAttendees((as) => as.map((a, k) => (k === i ? { ...a, ...patch } : a)))
  const removeAttendee = (i: number) => setAttendees((as) => as.filter((_, k) => k !== i))
  const addAttendee = () => setAttendees((as) => [...as, blankAttendee()])

  const setStatus = (i: number, status: SystemStatus) =>
    setSystems((ss) => ss.map((s, k) => (k === i ? { ...s, status } : s)))
  const setNote = (i: number, note: string) =>
    setSystems((ss) => ss.map((s, k) => (k === i ? { ...s, note } : s)))

  const save = async () => {
    const draft = {
      project_id: projectId, handover_date: date, client_name: client, site_location: site,
      project_nature: nature, attendees, systems, receiver_name: recName,
      receiver_role: recRole, receiver_signature: recSig,
    }
    const errs = validateHandover(draft)
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    const input: HandoverInput = {
      ...draft,
      attendees: attendees.filter((a) => a.name.trim() || a.role.trim()),
      notes,
      signed_at: new Date().toISOString(),
    }
    try {
      if (editing && id) {
        await updateHandover(id, input)
        nav(`/handover/${id}`)
      } else {
        const newId = await createHandover(input)
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
        nav(`/handover/${newId}`)
      }
    } catch (e) {
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) return <Loader full />

  const errKey = { project: 'err_project', header: 'err_header', attendee: 'err_attendee', systems: 'err_systems', receiver: 'err_receiver' } as const

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {projects.find((p) => p.id === projectId)?.name ?? '—'}</div>
          <h1 className="page-title">{editing ? ht(lang, 'form_title_edit') : ht(lang, 'form_title_new')}</h1>
        </div>
      </div>

      <AnimatePresence>
        {draftNotice && (
          <motion.div className="alert alert--ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ↺ {ht(lang, 'form_draft_restored')}
          </motion.div>
        )}
        {errors.map((e) => (
          <motion.div key={e} className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {ht(lang, errKey[e])}
          </motion.div>
        ))}
        {saveErr && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {saveErr}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="form" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={ht(lang, 'form_project')}>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}
                style={errors.includes('project') ? { borderColor: 'var(--clay)' } : undefined}>
                <option value="">— {lang === 'he' ? 'בחירה' : 'Choose'} —</option>
                {[...projects].sort((a, b) => Number(b.active) - Number(a.active))
                  .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_date')}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_client')}>
              <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_site')}>
              <input className="input" value={site} onChange={(e) => setSite(e.target.value)} />
            </Field>
          </div>
          <div className="span-2">
            <Field label={ht(lang, 'form_nature')}>
              <input className="input" value={nature} onChange={(e) => setNature(e.target.value)} />
            </Field>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_attendees')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--attendees">
              <span>{ht(lang, 'form_att_name')}</span><span>{ht(lang, 'form_att_role')}</span><span />
            </div>
            {attendees.map((a, i) => (
              <div key={i} className="rtable__row rtable__row--attendees">
                <input className="input" value={a.name} placeholder={ht(lang, 'form_att_name')}
                  onChange={(e) => updAttendee(i, { name: e.target.value })} />
                <input className="input" value={a.role} placeholder={ht(lang, 'form_att_role')}
                  onChange={(e) => updAttendee(i, { role: e.target.value })} />
                <button type="button" className="rtable__del" title={ht(lang, 'form_remove')} onClick={() => removeAttendee(i)}>✕</button>
              </div>
            ))}
            <div className="rtable__foot">
              <Button variant="ghost" type="button" onClick={addAttendee}>{ht(lang, 'form_add_att')}</Button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_systems')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--handover">
              <span>{ht(lang, 'form_system')}</span><span>{ht(lang, 'form_status')}</span><span>{ht(lang, 'form_note')}</span>
            </div>
            {systems.map((s, i) => (
              <div key={s.label} className="rtable__row rtable__row--handover"
                style={s.status == null && errors.includes('systems') ? { borderInlineStart: '3px solid var(--clay)' } : undefined}>
                <strong>{s.label}</strong>
                <div className="handover-status">
                  <label>
                    <input type="radio" name={`st-${i}`} checked={s.status === 'ok'} onChange={() => setStatus(i, 'ok')} />
                    {ht(lang, 'form_ok')}
                  </label>
                  <label>
                    <input type="radio" name={`st-${i}`} checked={s.status === 'bad'} onChange={() => setStatus(i, 'bad')} />
                    {ht(lang, 'form_bad')}
                  </label>
                </div>
                <input className="input" value={s.note} placeholder={ht(lang, 'form_note')}
                  onChange={(e) => setNote(i, e.target.value)} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={riseIn} style={{ marginTop: 24 }}>
          <Field label={ht(lang, 'form_notes')}>
            <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_receiver')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={ht(lang, 'form_rec_name')}>
              <input className="input" value={recName} onChange={(e) => setRecName(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_rec_role')}>
              <input className="input" value={recRole} onChange={(e) => setRecRole(e.target.value)} />
            </Field>
          </div>
          <div className="span-2">
            {sigIsEmpty(recSig) ? (
              <Button variant="ghost" type="button" onClick={() => setSigning(true)}>✍ {ht(lang, 'form_sign')}</Button>
            ) : (
              <button type="button" className="sig-thumb" title={ht(lang, 'form_sign')}
                onClick={() => setSigning(true)} dangerouslySetInnerHTML={{ __html: sigSvg(recSig) }} />
            )}
          </div>
        </motion.div>

        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav('/handover')}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? <><span className="spin" />{lang === 'he' ? 'שומר…' : 'Saving…'}</> : (lang === 'he' ? 'שמירה' : 'Save')}
          </Button>
        </div>
      </motion.div>

      {signing && (
        <SignaturePad
          title={recName || ht(lang, 'sign_title')}
          onDone={(sig) => { setRecSig(sig); setSigning(false) }}
          onClose={() => setSigning(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck, test and lint**

Run: `npm run build && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/handover/HandoverFormScreen.tsx src/styles/components.css
git commit -m "feat(handover): handover form screen"
```

---

### Task 6: List and view screens

**Files:**
- Create: `src/handover/HandoverList.tsx`
- Create: `src/handover/HandoverView.tsx`

**Interfaces:**
- Consumes: `listHandovers`, `getHandover`, `deleteHandover` (Task 3); `handoverMatchesText`, `HandoverRec` (Task 2); `handoverFormHtml` (Task 4); `printPage` from `../lib/printPage`; `SendMailDialog` from `../components/SendMailDialog` (props: `subject`, `html`, `onClose`, `onSent?`).
- Produces: `export function HandoverList()` and `export function HandoverView()`.

- [ ] **Step 1: Write the list screen**

Create `src/handover/HandoverList.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, Field, stagger } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { listHandovers } from './api'
import { handoverMatchesText, type HandoverRec } from './model'
import { ht } from './i18n'

export function HandoverList() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName } = useStore()
  const { canEdit } = usePerms()

  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [forms, setForms] = useState<HandoverRec[] | null>(null)

  useEffect(() => {
    let alive = true
    setForms(null)
    listHandovers({ projectId: projectId || undefined, from: from || undefined, to: to || undefined })
      .then((r) => { if (alive) setForms(r) })
      .catch(() => { if (alive) setForms([]) })
    return () => { alive = false }
  }, [projectId, from, to])

  const shown = useMemo(
    () => (forms ?? []).filter((f) => handoverMatchesText(f, text)),
    [forms, text],
  )

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{ht(lang, 'list_title')}</h1>
        </div>
        {canEdit('handover') && (
          <Button variant="primary" onClick={() => nav('/handover/new')}>{ht(lang, 'list_new')}</Button>
        )}
      </div>

      <div className="form-grid" style={{ marginBottom: 18 }}>
        <Field label={ht(lang, 'form_project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{ht(lang, 'list_all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={ht(lang, 'list_from')}>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={ht(lang, 'list_to')}>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={ht(lang, 'list_search')}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>

      {forms === null ? <Loader /> : shown.length === 0 ? (
        <div className="empty"><div className="big">{ht(lang, 'list_empty')}</div></div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show">
          {shown.map((f) => {
            const bad = (f.systems ?? []).filter((s) => s.status === 'bad').length
            return (
              <div key={f.id} className="row-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => nav(`/handover/${f.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') nav(`/handover/${f.id}`) }}>
                <div>
                  <strong>{projectName(f.project_id)}</strong>
                  <div className="muted">{f.client_name} · {f.site_location}</div>
                </div>
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {bad > 0 && <Tag tone="clay">{bad} {ht(lang, 'list_bad')}</Tag>}
                  <span dir="ltr" className="muted">{f.handover_date}</span>
                </div>
              </div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the view screen**

Create `src/handover/HandoverView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { SendMailDialog } from '../components/SendMailDialog'
import { printPage } from '../lib/printPage'
import { deleteHandover, getHandover } from './api'
import { handoverFormHtml } from './report'
import { ht } from './i18n'
import type { HandoverRec } from './model'

// Same html builder feeds the on-screen paper, the print output and the mail body, so the
// three cannot drift. Mirrors SafetyView.tsx.
export function HandoverView() {
  const { id } = useParams()
  const { lang, t } = useI18n()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { isAdmin } = useAuth()
  const [form, setForm] = useState<HandoverRec | null | undefined>(undefined)
  const [sendOpen, setSendOpen] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    let alive = true
    getHandover(id ?? '').then((f) => { if (alive) setForm(f) }).catch(() => { if (alive) setForm(null) })
    return () => { alive = false }
  }, [id])

  if (form === undefined) return <Loader full />
  if (!form) return <div className="empty"><div className="big">404</div></div>

  const html = handoverFormHtml(form, projectName(form.project_id), lang)
  // A saved handover is always signed, and migration 0077 gives update/delete to admins
  // only — so the buttons exist for an admin and nobody else.
  const canManage = isAdmin

  const onDelete = async () => {
    if (!window.confirm(ht(lang, 'view_delete_confirm'))) return
    try { await deleteHandover(form.id); nav('/handover') }
    catch (e) { window.alert('⚠ ' + String((e as Error).message ?? e)) }
  }

  const print = () => {
    const outcome = printPage()
    if (outcome === 'opened') setCopyMsg(t('print_in_browser'))
    else if (outcome === 'blocked') setCopyMsg(t('print_blocked'))
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print">
        <button className="btn btn--ghost" onClick={() => nav('/handover')}>→ {t('back')}</button>
        <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn--ghost" onClick={() => nav(`/handover/${form.id}/edit`)}>{ht(lang, 'view_edit')}</button>
          )}
          {canManage && (
            <button className="btn btn--ghost" onClick={onDelete}>{t('delete')}</button>
          )}
          <button className="btn btn--ghost" onClick={() => setSendOpen(true)}>{ht(lang, 'view_send')}</button>
          <button className="btn btn--primary" onClick={print}>📄 {t('print_pdf')}</button>
        </div>
      </div>
      {!canManage && <div className="muted no-print" style={{ textAlign: 'center', marginBottom: 12 }}>{ht(lang, 'form_locked_hint')}</div>}
      {copyMsg && <div className="tag tag--green no-print" style={{ display: 'block', padding: '12px 16px', margin: '0 auto 16px', maxWidth: 680 }}>{copyMsg}</div>}
      {sendOpen && (
        <SendMailDialog
          subject={`מסירת פרויקט · ${projectName(form.project_id)} · ${form.handover_date}`}
          html={`<!doctype html><html dir="rtl" lang="he"><body dir="rtl">${html}</body></html>`}
          onClose={() => setSendOpen(false)}
          onSent={() => {}}
        />
      )}
      <div className="report-paper" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck, test and lint**

Run: `npm run build && npm test && npm run lint`
Expected: PASS. If `Tag`'s `tone` prop does not accept `"clay"`, check `src/components/ui.tsx` for the tones it does accept and use the closest warning tone.

- [ ] **Step 4: Commit**

```bash
git add src/handover/HandoverList.tsx src/handover/HandoverView.tsx
git commit -m "feat(handover): list and signed-form view"
```

---

### Task 7: Systems admin screen, routes and navigation

**Files:**
- Create: `src/handover/HandoverSystemsAdmin.tsx`
- Modify: `src/App.tsx` (lazy imports near the safety ones, five routes next to the safety routes)
- Modify: `src/components/Shell.tsx` (import `ht`, new nav group, new admin item)

**Interfaces:**
- Consumes: `fetchHandoverSystems`, `createHandoverSystem`, `updateHandoverSystem`, `reorderHandoverSystems` (Task 3); `HandoverFormScreen`, `HandoverList`, `HandoverView` (Tasks 5–6).
- Produces: routes `/handover`, `/handover/new`, `/handover/:id`, `/handover/:id/edit`, `/admin/handover-systems`; a "מסירה" nav section.

- [ ] **Step 1: Write the admin screen**

Create `src/handover/HandoverSystemsAdmin.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import {
  createHandoverSystem, fetchHandoverSystems, reorderHandoverSystems, updateHandoverSystem,
} from './api'
import type { HandoverSystem } from './model'
import { ht } from './i18n'

// Admin-editable catalogue behind the handover form. Labels are copied into each saved
// handover, so renaming a system here never rewrites a document a customer signed.
export function HandoverSystemsAdmin() {
  const { lang } = useI18n()
  const [rows, setRows] = useState<HandoverSystem[] | null>(null)
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')

  const load = () => fetchHandoverSystems().then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { load() }, [])

  if (rows === null) return <Loader full />

  const add = async () => {
    const l = label.trim()
    if (!l) return
    try {
      await createHandoverSystem(l, (rows.length + 1) * 10)
      setLabel(''); setErr(''); await load()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const rename = async (id: string, next: string) => {
    try { await updateHandoverSystem(id, { label: next }); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const toggle = async (s: HandoverSystem) => {
    try { await updateHandoverSystem(s.id, { active: !s.active }); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const move = async (i: number, dir: -1 | 1) => {
    const next = [...rows]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
    try { await reorderHandoverSystems(next.map((s) => s.id)); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{ht(lang, 'systems_title')}</h1>
        </div>
      </div>
      {err && <div className="alert">⚠ {err}</div>}
      <div className="rtable">
        {rows.map((s, i) => (
          <div key={s.id} className="rtable__row rtable__row--attendees">
            <input className="input" defaultValue={s.label} onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== s.label) rename(s.id, v)
            }} />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={s.active} onChange={() => toggle(s)} />
              {ht(lang, 'systems_active')}
            </label>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="rtable__del" title="↑" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="rtable__del" title="↓" onClick={() => move(i, 1)}>↓</button>
            </span>
          </div>
        ))}
        <div className="rtable__foot" style={{ display: 'flex', gap: 10 }}>
          <input className="input" value={label} placeholder={ht(lang, 'form_system')}
            onChange={(e) => setLabel(e.target.value)} />
          <Button variant="ghost" type="button" onClick={add}>{ht(lang, 'systems_add')}</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the routes**

In `src/App.tsx`, after the safety lazy imports:

```tsx
const HandoverFormScreen = lazy(() => import('./handover/HandoverFormScreen').then((m) => ({ default: m.HandoverFormScreen })))
const HandoverList = lazy(() => import('./handover/HandoverList').then((m) => ({ default: m.HandoverList })))
const HandoverView = lazy(() => import('./handover/HandoverView').then((m) => ({ default: m.HandoverView })))
const HandoverSystemsAdmin = lazy(() => import('./handover/HandoverSystemsAdmin').then((m) => ({ default: m.HandoverSystemsAdmin })))
```

and after the four `safety` routes:

```tsx
        <Route path="handover" element={<RequirePerm area="handover"><HandoverList /></RequirePerm>} />
        <Route path="handover/new" element={<RequirePerm area="handover" edit><HandoverFormScreen /></RequirePerm>} />
        {/* a saved handover is a signed document: editing it is admin-only, matching 0077's RLS */}
        <Route path="handover/:id/edit" element={<RequireAdmin><HandoverFormScreen /></RequireAdmin>} />
        <Route path="handover/:id" element={<RequirePerm area="handover"><HandoverView /></RequirePerm>} />
```

and next to `admin/safety-topics`:

```tsx
        <Route path="admin/handover-systems" element={<RequireAdmin><HandoverSystemsAdmin /></RequireAdmin>} />
```

Note the ordering: `handover/:id/edit` must come before `handover/:id` is irrelevant in React Router 7 (ranked matching), but keep the block in this order to match the safety block's shape.

- [ ] **Step 3: Add the navigation**

In `src/components/Shell.tsx`, next to the `st` import:

```tsx
import { ht } from '../handover/i18n'
```

and add a nav group right after the `safety` group:

```tsx
            {
              key: 'handover',
              label: ht(lang, 'nav_section_handover'),
              items: [
                ...(can('handover') ? [{ to: '/handover', icon: '📋', label: ht(lang, 'nav_handover') }] : []),
              ],
            },
```

and in the `admin` group, after the safety-topics item:

```tsx
                ...(isAdmin ? [{ to: '/admin/handover-systems', icon: '📋', label: ht(lang, 'nav_handover_systems') }] : []),
```

- [ ] **Step 4: Verify the whole thing builds, tests and lints**

Run: `npm run build && npm test && npm run lint`
Expected: PASS — `tsc` covers the new routes and nav wiring, and `i18n.test.ts` (extended in Task 2) covers the handover strings.

- [ ] **Step 5: Commit**

```bash
git add src/handover/HandoverSystemsAdmin.tsx src/App.tsx src/components/Shell.tsx
git commit -m "feat(handover): systems admin, routes and nav tab"
```

- [ ] **Step 6: Hand the migration to the user**

Tell the user: `supabase/migrations/0077_handover_forms.sql` is ready and **not applied**. They apply it (Supabase MCP `apply_migration`, or the dashboard). Until it is applied, the screens load but every query returns an error, because the tables do not exist yet.

---

## Self-review notes

- Spec coverage: schema + perms (Task 1), model/validation/strings (Task 2), data access (Task 3), report (Task 4), form screen with draft restore and prefill (Task 5), list + view with print and mail (Task 6), admin catalogue + routes + nav (Task 7). Every spec section maps to a task.
- The spec said the draft lives in `idb-keyval`; the implementation uses `localStorage` under `handover_draft`, which is what `SafetyFormScreen` actually does. Following the existing module beats following the spec's wording here.
- Type names used in later tasks (`HandoverRec`, `HandoverInput`, `HandoverSystemCheck`, `HandoverError`, `ht`) are all defined in Tasks 2–3 before first use.
