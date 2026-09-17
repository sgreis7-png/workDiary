# מסירה — user-added fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone who can fill a handover add fields to it — extra system rows and extra header fields — either for that one handover or for every handover from then on, while the 14 built-in systems and the fixed header stay undeletable.

**Architecture:** One migration (`0079`) that opens `handover_systems` to non-admin authorship, marks the seeded 14 as `builtin`, adds the twin catalogue table `handover_extra_fields`, and adds an `extra_fields` JSONB column to `handover_forms`. The client side extends the existing `src/handover/` module: the record carries `extra_fields`, the form screen grows two "add" affordances with a "share with every handover" checkbox, and a second admin screen manages the header-field catalogue.

**Tech Stack:** Vite 5 + React 18 + TypeScript strict, React Router 7, framer-motion, Supabase (anon key; all authorization in RLS), vitest (node env).

**Design doc:** `docs/superpowers/specs/2026-09-17-handover-custom-fields-design.md`
**Prior module:** `docs/superpowers/specs/2026-09-16-handover-form-design.md` — the handover module is live; migrations 0077 and 0078 are already applied to the hosted project.

## Global Constraints

- Migrations are write-once. Create `supabase/migrations/0079_handover_custom_fields.sql` once, with `Write`, fully filled in; never edit 0077, 0078 or any earlier file (a PreToolUse hook blocks it). Do not apply the migration — the controller hands it to the user.
- Every table has RLS; every `create policy` is preceded by `drop policy if exists`; every `for all` policy carries `with check`. New columns on an existing table must not become client-settable provenance: `created_by` is constrained in the same policy that inserts it.
- Every user-visible string lives in `src/handover/i18n.ts` with both `he` and `en`, read through `ht(lang, key)`.
- Logical CSS only (`margin-inline-start`, `border-inline-start`, `text-align: start`); `overflow: clip`, never `hidden`, on containers holding inputs.
- TypeScript strict with `noUnusedLocals`/`noUnusedParameters`; `npm run build` runs tsc and dead code fails CI.
- Lint baseline: `npm run lint` reports 0 errors and 27 pre-existing warnings. Do not add warnings; a targeted `eslint-disable-next-line` with a rationale comment is acceptable where the handover screens already use that pattern.
- The 14 built-in system labels are exactly `HANDOVER_SYSTEM_SEED` in `src/handover/systems.ts`. They are `builtin = true` and must be undeletable by everyone, admins included.
- Never run `git stash` — an unrelated stash lives in this repo.

---

### Task 1: Migration 0079 and its mirror test

**Files:**
- Create: `supabase/migrations/0079_handover_custom_fields.sql`
- Create: `src/handover/builtin.sql.test.ts`

**Interfaces:**
- Consumes: `HANDOVER_SYSTEM_SEED` from `src/handover/systems.ts`; the tables from 0077.
- Produces: `handover_systems.builtin`, `handover_systems.created_by`, the table `handover_extra_fields(id,label,sort_order,active,builtin,created_by,created_at)`, and `handover_forms.extra_fields jsonb not null default '[]'`.

- [ ] **Step 1: Confirm the migration number**

Run: `powershell -NoProfile -File .claude/skills/create-migration/scripts/next-migration.ps1 handover_custom_fields`
Expected: prints `0079`. If it prints anything else, use that number everywhere below and report it.

- [ ] **Step 2: Write the failing test**

Create `src/handover/builtin.sql.test.ts`:

```ts
// The 14 systems of paper form 70 must stay undeletable — that is the promise the
// "anyone can add fields" feature is built on. Two things enforce it: migration 0079 marks
// exactly those labels `builtin = true`, and its delete policy refuses a builtin row.
//
// If the marking list and HANDOVER_SYSTEM_SEED ever drift, a system nobody marked becomes
// deletable and a handover silently stops matching the paper it replaces — so the drift
// fails CI here instead.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HANDOVER_SYSTEM_SEED } from './systems'

const SQL = readFileSync('supabase/migrations/0079_handover_custom_fields.sql', 'utf8')

/** The labels 0079 marks as built-in, from its `update handover_systems set builtin = true` list. */
function builtinLabels(): string[] {
  const start = SQL.indexOf('update handover_systems set builtin = true')
  expect(start).toBeGreaterThan(-1)
  const block = SQL.slice(start, SQL.indexOf(';', start))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('migration 0079 protects the built-in systems', () => {
  it('marks exactly the seeded labels as builtin', () => {
    expect(builtinLabels().sort()).toEqual([...HANDOVER_SYSTEM_SEED].sort())
  })
  it('refuses to delete a builtin row in both catalogues', () => {
    const deletes = [...SQL.matchAll(/create policy delete_handover_(systems|extra_fields)[\s\S]*?;/g)]
    expect(deletes).toHaveLength(2)
    for (const [policy] of deletes) expect(policy).toContain('builtin = false')
  })
  it('lets a non-admin author insert into both catalogues', () => {
    const inserts = [...SQL.matchAll(/create policy insert_handover_(systems|extra_fields)[\s\S]*?;/g)]
    expect(inserts).toHaveLength(2)
    for (const [policy] of inserts) {
      expect(policy).toContain("can_edit('handover')")
      expect(policy).toContain('created_by = auth.uid()')
    }
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- src/handover/builtin.sql.test.ts`
Expected: FAIL — `ENOENT ... 0079_handover_custom_fields.sql`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0079_handover_custom_fields.sql`:

```sql
-- מסירה — שדות שמוסיפים בשטח.
--
-- 0077 נעל את קטלוג המערכות לאדמין. בפועל מנהל עבודה עומד בלול מול הלקוח עם מערכת שלא
-- מופיעה בטופס 70 (גנרטור, מנוע שער), וטלפון לאדמין הוא בדיוק הרגע שבו דף מודפס מנצח את
-- האפליקציה. כאן הקטלוגים נפתחים לכל מי שמורשה למלא מסירה, עם created_by, ומחיקה מוגבלת
-- ליוצר או לאדמין.
--
-- 14 השורות של טופס 70 מסומנות builtin ואינן ניתנות למחיקה לאף אחד, כולל אדמין: מסירה
-- בלי "אוורור" אינה טופס 70. להסתרה יש active.
--
-- מקביל ל-src/handover/ בצד הלקוח; src/handover/builtin.sql.test.ts שומר על ההתאמה בין
-- רשימת ה-builtin כאן ל-HANDOVER_SYSTEM_SEED.

-- ---- קטלוג המערכות: בעלות ונעילה של המובנות ----
alter table handover_systems add column if not exists builtin boolean not null default false;
alter table handover_systems add column if not exists created_by uuid;

update handover_systems set builtin = true where label in (
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
  'מבנה/תשתית'
);

-- 0077 נתן ל-handover_systems מדיניות admin אחת (for all). מחליפים אותה בארבע מפורשות.
drop policy if exists admin_handover_systems on handover_systems;
drop policy if exists read_handover_systems on handover_systems;
create policy read_handover_systems on handover_systems for select using (is_member());

drop policy if exists insert_handover_systems on handover_systems;
create policy insert_handover_systems on handover_systems for insert
  with check (can_edit('handover') and created_by = auth.uid() and builtin = false);

-- אדמין מעדכן הכל (כולל כיבוי/הדלקה של שורה מובנית); מי שהוסיף שורה משלו מעדכן אותה,
-- ולא יכול להפוך אותה למובנית או להעביר בעלות.
drop policy if exists update_handover_systems on handover_systems;
create policy update_handover_systems on handover_systems for update
  using (is_admin() or (created_by = auth.uid() and builtin = false))
  with check (is_admin() or (created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_systems on handover_systems;
create policy delete_handover_systems on handover_systems for delete
  using (builtin = false and (is_admin() or created_by = auth.uid()));

-- ---- קטלוג שדות הכותרת הנוספים (תאום מלא ל-handover_systems) ----
create table if not exists handover_extra_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  builtin boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table handover_extra_fields enable row level security;

drop policy if exists read_handover_extra_fields on handover_extra_fields;
create policy read_handover_extra_fields on handover_extra_fields for select using (is_member());

drop policy if exists insert_handover_extra_fields on handover_extra_fields;
create policy insert_handover_extra_fields on handover_extra_fields for insert
  with check (can_edit('handover') and created_by = auth.uid() and builtin = false);

drop policy if exists update_handover_extra_fields on handover_extra_fields;
create policy update_handover_extra_fields on handover_extra_fields for update
  using (is_admin() or (created_by = auth.uid() and builtin = false))
  with check (is_admin() or (created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_extra_fields on handover_extra_fields;
create policy delete_handover_extra_fields on handover_extra_fields for delete
  using (builtin = false and (is_admin() or created_by = auth.uid()));

-- ---- השדות הנוספים בתוך הרשומה ----
-- [{label, value}] — מועתקים לתוך המסירה בשמירה, כמו שמות המערכות, כדי ששינוי בקטלוג
-- לא יכתוב מחדש מסמך שהלקוח חתם עליו. 0078 לא נוגע בעמודה הזו: שדה נוסף הוא רשות.
alter table handover_forms add column if not exists extra_fields jsonb not null default '[]';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -- src/handover/builtin.sql.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite, lint, commit**

```bash
npm test && npm run lint
git add supabase/migrations/0079_handover_custom_fields.sql src/handover/builtin.sql.test.ts
git commit -m "feat(handover): schema for user-added fields"
```

---

### Task 2: Model and strings

**Files:**
- Modify: `src/handover/model.ts`
- Modify: `src/handover/model.test.ts`
- Modify: `src/handover/i18n.ts`

**Interfaces:**
- Consumes: the schema from Task 1.
- Produces: `HandoverExtraField`, `HandoverExtraFieldDef`, `extra_fields` on `HandoverRec`/`HandoverInput`/`HandoverDraft`, `builtin`/`created_by` on `HandoverSystem`, `blankExtraField()`, `cleanExtraFields(rows)`, `extraFieldsFor(catalogue, saved)`, `canManageCatalogueRow(row, userId, isAdmin)`, and the new i18n keys.

- [ ] **Step 1: Write the failing tests**

Append to `src/handover/model.test.ts`:

```ts
describe('cleanExtraFields', () => {
  // A shared header field nobody filled in must not land in the signed document as an empty
  // row, and a row whose label was typed then cleared is not a field at all.
  it('drops rows with a blank label, trims label and value, keeps order', () => {
    const rows = [
      { label: '  מס׳ הזמנה  ', value: '  4711 ' },
      { label: '   ', value: 'ignored' },
      { label: 'קבלן', value: '' },
    ]
    expect(cleanExtraFields(rows)).toEqual([
      { label: 'מס׳ הזמנה', value: '4711' },
      { label: 'קבלן', value: '' },
    ])
  })
  it('returns an empty array for no rows', () => {
    expect(cleanExtraFields([])).toEqual([])
  })
})

describe('extraFieldsFor', () => {
  const cat: HandoverExtraFieldDef[] = [
    { id: '1', label: 'מס׳ הזמנה', sort_order: 10, active: true, builtin: false, created_by: 'u1' },
    { id: '2', label: 'קבלן', sort_order: 20, active: false, builtin: false, created_by: 'u1' },
  ]
  it('offers the active catalogue as empty rows on a new form', () => {
    expect(extraFieldsFor(cat, [])).toEqual([{ label: 'מס׳ הזמנה', value: '' }])
  })
  it('keeps a saved value whose field has since been deactivated', () => {
    expect(extraFieldsFor(cat, [{ label: 'קבלן', value: 'דוד' }])).toEqual([
      { label: 'מס׳ הזמנה', value: '' },
      { label: 'קבלן', value: 'דוד' },
    ])
  })
  it('reuses a saved value for a field still in the catalogue', () => {
    expect(extraFieldsFor(cat, [{ label: 'מס׳ הזמנה', value: '99' }]))
      .toEqual([{ label: 'מס׳ הזמנה', value: '99' }])
  })
})

describe('canManageCatalogueRow', () => {
  const row = (over: Partial<HandoverSystem>): HandoverSystem =>
    ({ id: 'x', label: 'l', sort_order: 10, active: true, builtin: false, created_by: 'u1', ...over })
  // The 14 rows of form 70 are the paper: nobody deletes them, an admin included.
  it('never allows a builtin row, even for an admin', () => {
    expect(canManageCatalogueRow(row({ builtin: true }), 'u1', true)).toBe(false)
  })
  it('allows the author and any admin on an added row', () => {
    expect(canManageCatalogueRow(row({}), 'u1', false)).toBe(true)
    expect(canManageCatalogueRow(row({ created_by: 'someone' }), 'u1', true)).toBe(true)
  })
  it('refuses a stranger', () => {
    expect(canManageCatalogueRow(row({ created_by: 'someone' }), 'u1', false)).toBe(false)
  })
})

describe('validateHandover with an added system row', () => {
  // An ad-hoc row is a system like any other: unmarked, it must block the save, or the
  // customer signs a form with a blank box exactly like the paper allowed.
  it('rejects an unmarked ad-hoc system', () => {
    const d = { ...full(), systems: [
      { label: 'אוורור', status: 'ok' as const, note: '' },
      { label: 'גנרטור', status: null, note: '' },
    ] }
    expect(validateHandover(d)).toContain('systems')
  })
})
```

Extend the existing import at the top of the file so it also pulls
`cleanExtraFields`, `extraFieldsFor`, `canManageCatalogueRow` and the type `HandoverExtraFieldDef`.

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- src/handover/model.test.ts`
Expected: FAIL — the four new helpers do not exist.

- [ ] **Step 3: Extend the model**

In `src/handover/model.ts`:

Add the types next to the existing ones:

```ts
export interface HandoverExtraField { label: string; value: string }
/** A row of the shared header-field catalogue (handover_extra_fields). */
export interface HandoverExtraFieldDef {
  id: string; label: string; sort_order: number; active: boolean
  builtin: boolean; created_by: string | null
}
```

Extend `HandoverSystem` with the two provenance columns 0079 adds:

```ts
export interface HandoverSystem {
  id: string; label: string; sort_order: number; active: boolean
  builtin: boolean; created_by: string | null
}
```

Add `extra_fields: HandoverExtraField[]` to `HandoverRec` (after `notes`) and to `HandoverDraft`
(after `systems`). `HandoverInput` is derived from `HandoverRec` and needs no change.

Then add the helpers:

```ts
export const blankExtraField = (): HandoverExtraField => ({ label: '', value: '' })

/** Save shaping: a row without a label is not a field. Values may legitimately be blank. */
export function cleanExtraFields(rows: HandoverExtraField[]): HandoverExtraField[] {
  return rows
    .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
    .filter((r) => r.label !== '')
}

/**
 * The header rows the form shows: every active catalogue field, plus any field the saved
 * record carries that is no longer active. Values already entered are preserved by label.
 * Same rule as systemChecksFor — a signed document keeps what it was signed with.
 */
export function extraFieldsFor(
  catalogue: HandoverExtraFieldDef[], saved: HandoverExtraField[],
): HandoverExtraField[] {
  const byLabel = new Map(saved.map((f) => [f.label, f]))
  const active = catalogue.filter((f) => f.active)
  const rows = active.map((f) => byLabel.get(f.label) ?? { label: f.label, value: '' })
  const activeLabels = new Set(active.map((f) => f.label))
  return [...rows, ...saved.filter((f) => !activeLabels.has(f.label))]
}

/**
 * May this viewer rename or delete a catalogue row? Mirrors 0079's policies: never a builtin
 * row, otherwise its author or an admin. Kept here so the screens and the database agree.
 */
export function canManageCatalogueRow(
  row: { builtin: boolean; created_by: string | null },
  userId: string | undefined, isAdmin: boolean,
): boolean {
  if (row.builtin) return false
  return isAdmin || (!!userId && row.created_by === userId)
}
```

- [ ] **Step 4: Add the strings**

In `src/handover/i18n.ts`, add to `S` (keep both languages on every key):

```ts
  form_extra:        { he: 'שדות נוספים', en: 'Extra fields' },
  form_extra_label:  { he: 'שם השדה', en: 'Field name' },
  form_extra_value:  { he: 'ערך', en: 'Value' },
  form_add_extra:    { he: '+ הוספת שדה', en: '+ Add field' },
  form_add_system:   { he: '+ הוספת מערכת', en: '+ Add system' },
  form_share:        { he: 'להוסיף לכל המסירות', en: 'Add to every handover' },
  form_share_hint:   { he: 'בלי סימון — השדה קיים במסירה הזו בלבד', en: 'Unchecked, the field exists in this handover only' },
  form_dup_label:    { he: 'השדה כבר קיים ברשימה', en: 'That field already exists' },
  form_builtin_lock: { he: 'שדה מובנה — אפשר לכבות, לא למחוק', en: 'Built-in field — can be switched off, not deleted' },
  form_no_delete:    { he: 'רק מי שהוסיף את השדה, או מנהל מערכת, יכול למחוק אותו', en: 'Only the field’s author or an administrator can delete it' },

  fields_title:  { he: 'ניהול שדות מסירה', en: 'Manage handover fields' },
  fields_add:    { he: '+ שדה חדש', en: '+ New field' },
  nav_handover_fields: { he: 'שדות כותרת במסירה', en: 'Handover header fields' },
  view_extra:    { he: 'שדות נוספים', en: 'Extra fields' },
```

- [ ] **Step 5: Run the tests, then build and lint**

Run: `npm test -- src/handover/model.test.ts` → PASS
Run: `npm run build && npm run lint` → PASS, warnings still 27.

Note: `npm run build` will now fail in `api.ts`/screens if they construct a `HandoverInput`
without `extra_fields`. That is expected — Task 3 and Task 4 close it. If the build fails for
that reason and only that reason, say so in your report and commit anyway.

- [ ] **Step 6: Commit**

```bash
git add src/handover/model.ts src/handover/model.test.ts src/handover/i18n.ts
git commit -m "feat(handover): model and strings for user-added fields"
```

---

### Task 3: Data access for the two catalogues

**Files:**
- Modify: `src/handover/api.ts`

**Interfaces:**
- Consumes: `HandoverExtraFieldDef`, `HandoverSystem` (Task 2).
- Produces: `extra_fields` in the record `COLS`; `builtin,created_by` in the systems select; `createHandoverSystem(label, sortOrder)` now writing `created_by`; `deleteHandoverSystem(id)`; `fetchHandoverExtraFields()`, `createHandoverExtraField(label, sortOrder)`, `updateHandoverExtraField(id, patch)`, `deleteHandoverExtraField(id)`, `reorderHandoverExtraFields(orderedIds)`; and the exported sentinel `DUPLICATE_LABEL`.

- [ ] **Step 1: Extend the module**

In `src/handover/api.ts`:

Add `extra_fields` to the `COLS` string (after `notes,`).

Change the systems select to carry the new columns:

```ts
const SYSTEM_COLS = 'id,label,sort_order,active,builtin,created_by'
```

and use it in `fetchHandoverSystems`.

Add the sentinel and its detection, next to the existing `forbidden` sentinel:

```ts
/** Both catalogues keep `label` unique; a second person adding the same field hits 23505.
 *  The screens turn this into "that field already exists" — a raw Postgres string in the
 *  middle of a handover is not something a foreman can act on. */
export const DUPLICATE_LABEL = 'duplicate_label'
const isDuplicate = (e: { code?: string }) => e?.code === '23505'
```

`createHandoverSystem` writes the author and maps the duplicate:

```ts
export async function createHandoverSystem(label: string, sortOrder: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('handover_systems')
    .insert({ label, sort_order: sortOrder, created_by: auth.user?.id })
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
}
```

Add the systems delete — RLS refuses a builtin row or a stranger's row, and a refusal matches
zero rows rather than erroring, so the zero-row check is what turns it into a real message:

```ts
export async function deleteHandoverSystem(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_systems').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}
```

Then the header-field catalogue, mirroring the systems block exactly:

```ts
// ---------- header-field catalogue ----------

const FIELD_COLS = 'id,label,sort_order,active,builtin,created_by'

export async function fetchHandoverExtraFields(): Promise<HandoverExtraFieldDef[]> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .select(FIELD_COLS).order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as HandoverExtraFieldDef[]
}

export async function createHandoverExtraField(label: string, sortOrder: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('handover_extra_fields')
    .insert({ label, sort_order: sortOrder, created_by: auth.user?.id })
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
}

export async function updateHandoverExtraField(
  id: string, patch: Partial<Pick<HandoverExtraFieldDef, 'label' | 'active'>>,
): Promise<void> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function deleteHandoverExtraField(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function reorderHandoverExtraFields(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('handover_extra_fields').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}
```

Also give the existing `updateHandoverSystem` the same zero-row check (0079 lets a non-admin
update only their own rows, so silence-on-refusal is now reachable there too):

```ts
export async function updateHandoverSystem(
  id: string, patch: Partial<Pick<HandoverSystem, 'label' | 'active'>>,
): Promise<void> {
  const { data, error } = await supabase.from('handover_systems')
    .update(patch).eq('id', id).select('id')
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
  if (!data || data.length === 0) throw new Error('forbidden')
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: the only remaining type errors, if any, are the screens not yet passing
`extra_fields` — Task 4 closes those. Report exactly which errors remain.

- [ ] **Step 3: Commit**

```bash
git add src/handover/api.ts
git commit -m "feat(handover): catalogue data access for user-added fields"
```

---

### Task 4: The form screen

**Files:**
- Modify: `src/handover/HandoverFormScreen.tsx`
- Modify: `src/styles/components.css`

**Interfaces:**
- Consumes: Tasks 2–3 (`extraFieldsFor`, `cleanExtraFields`, `blankExtraField`, `createHandoverSystem`, `createHandoverExtraField`, `fetchHandoverExtraFields`, `DUPLICATE_LABEL`).
- Produces: a form that saves `extra_fields` and can add a system row or a header field, ad-hoc or shared.

- [ ] **Step 1: Add the row style**

In `src/styles/components.css`, next to `.rtable__row--attendees`:

```css
.rtable__row--extra { display: grid; grid-template-columns: 1.1fr 1.6fr 34px; gap: 12px; align-items: center; padding: 10px 14px; }
.addrow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 14px; }
.addrow label { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
@media (max-width: 720px) { .rtable__row--extra { grid-template-columns: 1fr 34px; } }
```

- [ ] **Step 2: Hold the new state**

In `src/handover/HandoverFormScreen.tsx`:

- extend the imports from `./model` with `blankExtraField`, `cleanExtraFields`, `extraFieldsFor`, `type HandoverExtraField`, `type HandoverExtraFieldDef`, and from `./api` with `createHandoverExtraField`, `createHandoverSystem`, `fetchHandoverExtraFields`, `DUPLICATE_LABEL`;
- add `extra_fields: HandoverExtraField[]` to the local `Draft` interface;
- add state:

```tsx
  const [fieldCatalogue, setFieldCatalogue] = useState<HandoverExtraFieldDef[]>([])
  const [savedExtra, setSavedExtra] = useState<HandoverExtraField[]>([])
  const [extra, setExtra] = useState<HandoverExtraField[]>([])
  const [newSystem, setNewSystem] = useState('')
  const [newField, setNewField] = useState('')
  const [shareSystem, setShareSystem] = useState(false)
  const [shareField, setShareField] = useState(false)
  const [addErr, setAddErr] = useState('')
```

- fetch the field catalogue beside the systems fetch, with the same error handling the systems
  fetch uses (it must not be swallowed):

```tsx
  useEffect(() => {
    fetchHandoverExtraFields().then(setFieldCatalogue).catch(() => setSaveErr(ht(lang, 'err_catalogue')))
  }, [lang])
```

- in the record-load branch set `setSavedExtra(f.extra_fields ?? [])`; in the draft-restore
  branch set `setSavedExtra(d.extra_fields ?? [])`;
- derive the rows with the same shape as the systems effect — in edit mode the record's own
  fields only, never merged with the live catalogue:

```tsx
  // eslint-disable-next-line react-hooks/set-state-in-effect -- same settle-once derivation as the systems rows above
  useEffect(() => {
    if (!restored) return
    if (editing) { setExtra(savedExtra); return }
    setExtra((cur) => extraFieldsFor(fieldCatalogue, cur.length ? cur : savedExtra))
  }, [restored, editing, fieldCatalogue, savedExtra])
```

- include `extra` in the draft object and in the draft effect's dependency array.

- [ ] **Step 3: Add the two "add" handlers**

```tsx
  const addSystemRow = async () => {
    const label = newSystem.trim()
    if (!label) return
    if (systems.some((s) => s.label === label)) { setAddErr(ht(lang, 'form_dup_label')); return }
    if (shareSystem) {
      try { await createHandoverSystem(label, (catalogue.length + 1) * 10) }
      catch (e) {
        setAddErr((e as Error).message === DUPLICATE_LABEL ? ht(lang, 'form_dup_label') : String((e as Error).message))
        return
      }
    }
    setSystems((ss) => [...ss, { label, status: null, note: '' }])
    setNewSystem(''); setAddErr('')
  }

  const addExtraField = async () => {
    const label = newField.trim()
    if (!label) return
    if (extra.some((f) => f.label === label)) { setAddErr(ht(lang, 'form_dup_label')); return }
    if (shareField) {
      try { await createHandoverExtraField(label, (fieldCatalogue.length + 1) * 10) }
      catch (e) {
        setAddErr((e as Error).message === DUPLICATE_LABEL ? ht(lang, 'form_dup_label') : String((e as Error).message))
        return
      }
    }
    setExtra((fs) => [...fs, { label, value: '' }])
    setNewField(''); setAddErr('')
  }

  const setExtraValue = (i: number, value: string) =>
    setExtra((fs) => fs.map((f, k) => (k === i ? { ...f, value } : f)))
  const removeExtra = (i: number) => setExtra((fs) => fs.filter((_, k) => k !== i))
  const removeSystemRow = (i: number) => setSystems((ss) => ss.filter((_, k) => k !== i))
```

Removing a row from the form never touches the catalogue — say so in a comment above
`removeSystemRow`, because the ✕ next to a shared row otherwise looks like a delete.

- [ ] **Step 4: Render the two sections**

Under the systems table's closing `</div>`, inside the same `motion.div`, add the add-row:

```tsx
            <div className="addrow">
              <input className="input" value={newSystem} placeholder={ht(lang, 'form_system')}
                onChange={(e) => setNewSystem(e.target.value)} />
              <label>
                <input type="checkbox" checked={shareSystem} onChange={() => setShareSystem((v) => !v)} />
                {ht(lang, 'form_share')}
              </label>
              <Button variant="ghost" type="button" onClick={addSystemRow}>{ht(lang, 'form_add_system')}</Button>
            </div>
```

Give each system row a ✕ that calls `removeSystemRow(i)` — matching the attendees row's
`rtable__del` button — so a row added by mistake can go.

After the systems section, add the extra-fields section:

```tsx
        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_extra')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--extra">
              <span>{ht(lang, 'form_extra_label')}</span><span>{ht(lang, 'form_extra_value')}</span><span />
            </div>
            {extra.map((f, i) => (
              <div key={f.label} className="rtable__row rtable__row--extra">
                <strong>{f.label}</strong>
                <input className="input" value={f.value} placeholder={ht(lang, 'form_extra_value')}
                  onChange={(e) => setExtraValue(i, e.target.value)} />
                <button type="button" className="rtable__del" title={ht(lang, 'form_remove')} onClick={() => removeExtra(i)}>✕</button>
              </div>
            ))}
            <div className="addrow">
              <input className="input" value={newField} placeholder={ht(lang, 'form_extra_label')}
                onChange={(e) => setNewField(e.target.value)} />
              <label title={ht(lang, 'form_share_hint')}>
                <input type="checkbox" checked={shareField} onChange={() => setShareField((v) => !v)} />
                {ht(lang, 'form_share')}
              </label>
              <Button variant="ghost" type="button" onClick={addExtraField}>{ht(lang, 'form_add_extra')}</Button>
            </div>
          </div>
          {addErr && <div className="alert" style={{ marginTop: 10 }}>⚠ {addErr}</div>}
        </motion.div>
```

- [ ] **Step 5: Save the new data**

In `save`, add `extra_fields: cleanExtraFields(extra)` to the `input` object (the `draft` object
that `validateHandover` judges takes `extra_fields` too, since `HandoverDraft` now carries it).

- [ ] **Step 6: Verify**

Run: `npm run build && npm test && npm run lint`
Expected: PASS; lint warnings still 27.

- [ ] **Step 7: Commit**

```bash
git add src/handover/HandoverFormScreen.tsx src/styles/components.css
git commit -m "feat(handover): add systems and header fields from the form"
```

---

### Task 5: Report and view

**Files:**
- Modify: `src/handover/report.ts`
- Modify: `src/handover/report.test.ts`

**Interfaces:**
- Consumes: `HandoverRec.extra_fields` (Task 2), the `S` keys `view_extra` (Task 2).
- Produces: extra header fields rendered in the printed/mailed form.

- [ ] **Step 1: Write the failing test**

In `src/handover/report.test.ts`, add `extra_fields` to the fixture record:

```ts
  extra_fields: [{ label: 'מס׳ הזמנה', value: '4711' }],
```

and add the cases:

```ts
  it('renders extra header fields with their label and value', () => {
    expect(html).toContain('מס׳ הזמנה')
    expect(html).toContain('4711')
  })
  it('omits the extra-fields table when the record has none', () => {
    const bare = handoverFormHtml({ ...rec, extra_fields: [] }, 'p', 'he')
    expect(bare).not.toContain('שדות נוספים')
  })
  it('escapes an extra field label and value', () => {
    const evil = handoverFormHtml(
      { ...rec, extra_fields: [{ label: '<b>x</b>', value: '<img src=x>' }] }, 'p', 'he')
    expect(evil).not.toContain('<img src=x>')
    expect(evil).toContain('&lt;img src=x&gt;')
  })
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- src/handover/report.test.ts`
Expected: FAIL on the three new cases.

- [ ] **Step 3: Render the block**

In `src/handover/report.ts`, directly after the header table and before the attendees table:

```ts
  const extras = (f.extra_fields ?? []).length === 0 ? '' : `
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr><th style="${TD}" colspan="2">${S.view_extra[lang]}</th></tr>
      ${f.extra_fields.map((x) => `
      <tr>
        <td style="${TD};width:34%">${esc(x.label)}</td>
        <td style="${TD}">${esc(x.value)}</td>
      </tr>`).join('')}
    </table>`
```

and interpolate `${extras}` at that position in the returned template.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/handover/report.test.ts` → PASS
Run: `npm run build && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handover/report.ts src/handover/report.test.ts
git commit -m "feat(handover): print extra header fields on the form"
```

---

### Task 6: Admin screens, route and nav

**Files:**
- Modify: `src/handover/HandoverSystemsAdmin.tsx`
- Create: `src/handover/HandoverExtraFieldsAdmin.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Shell.tsx`

**Interfaces:**
- Consumes: `canManageCatalogueRow` (Task 2), the catalogue API of Task 3.
- Produces: delete on non-builtin rows in both catalogues, the route `/admin/handover-fields`, and its nav entry.

- [ ] **Step 1: Give the systems admin a guarded delete**

In `src/handover/HandoverSystemsAdmin.tsx`:

- import `useAuth` from `../auth`, `canManageCatalogueRow` from `./model`, `deleteHandoverSystem` from `./api`;
- read `const { user, isAdmin } = useAuth()`;
- add the handler:

```tsx
  const remove = async (s: HandoverSystem) => {
    if (!window.confirm(`${ht(lang, 'form_remove')}: ${s.label}?`)) return
    try { await deleteHandoverSystem(s.id); await load() }
    catch (e) {
      setErr((e as Error).message === 'forbidden' ? ht(lang, 'form_no_delete') : String((e as Error).message))
    }
  }
```

- render per row, after the ↑/↓ buttons:

```tsx
              {canManageCatalogueRow(s, user?.id, isAdmin) ? (
                <button type="button" className="rtable__del" title={ht(lang, 'form_remove')} onClick={() => remove(s)}>✕</button>
              ) : (
                <span className="rtable__del" title={ht(lang, 'form_builtin_lock')} aria-hidden="true">🔒</span>
              )}
```

The lock is not a disabled button on purpose: a built-in row is not "temporarily"
undeletable, and a greyed ✕ invites clicking it to find out why.

- [ ] **Step 2: Write the header-field admin screen**

Create `src/handover/HandoverExtraFieldsAdmin.tsx` as the twin of the systems admin: the same
list, rename-on-blur, active toggle, ↑/↓ reorder, guarded delete and add row, but calling
`fetchHandoverExtraFields` / `updateHandoverExtraField` / `reorderHandoverExtraFields` /
`createHandoverExtraField` / `deleteHandoverExtraField`, titled `ht(lang, 'fields_title')`
with the add button labelled `ht(lang, 'fields_add')` and the label placeholder
`ht(lang, 'form_extra_label')`. Map a thrown `DUPLICATE_LABEL` to `ht(lang, 'form_dup_label')`
and a thrown `'forbidden'` to `ht(lang, 'form_no_delete')` in every handler.

Read `src/handover/HandoverSystemsAdmin.tsx` as it stands after Step 1 and follow it
structurally — same class names, same error handling, same `load()`-after-write discipline
including in every `catch`.

- [ ] **Step 3: Route and nav**

In `src/App.tsx`, beside the other handover lazy imports:

```tsx
const HandoverExtraFieldsAdmin = lazy(() => import('./handover/HandoverExtraFieldsAdmin').then((m) => ({ default: m.HandoverExtraFieldsAdmin })))
```

and next to `admin/handover-systems`:

```tsx
        <Route path="admin/handover-fields" element={<RequireAdmin><HandoverExtraFieldsAdmin /></RequireAdmin>} />
```

In `src/components/Shell.tsx`, after the handover-systems admin item:

```tsx
                ...(isAdmin ? [{ to: '/admin/handover-fields', icon: '📋', label: ht(lang, 'nav_handover_fields') }] : []),
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm test && npm run lint`
Expected: PASS; lint warnings still 27.

- [ ] **Step 5: Commit**

```bash
git add src/handover/HandoverSystemsAdmin.tsx src/handover/HandoverExtraFieldsAdmin.tsx src/App.tsx src/components/Shell.tsx
git commit -m "feat(handover): manage both field catalogues from admin"
```

---

## Self-review notes

- Spec coverage: schema + built-in lock (Task 1), model/validation/strings (Task 2), data access (Task 3), the two add affordances with the share checkbox (Task 4), report (Task 5), admin catalogues and wiring (Task 6).
- The admin screens are reachable only by admins even though any editor may now add and delete their own catalogue rows from the form. Adding happens where the need appears — in the form; the admin screens are for tidying, and RLS, not the route, is what actually limits who may delete what.
- Type names used in later tasks (`HandoverExtraField`, `HandoverExtraFieldDef`, `canManageCatalogueRow`, `DUPLICATE_LABEL`) are all defined in Tasks 2–3 before first use.
