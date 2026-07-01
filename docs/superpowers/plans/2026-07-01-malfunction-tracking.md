# Malfunction (בלת"מ) Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unplanned-event ("בלת"מ" / malfunction) field to daily reports — free-text description + department dropdown (default "none") — and surface it in search, report/export, dashboard, and a dedicated stats view with charts.

**Architecture:** Malfunction is two rows in the existing dynamic `field_definitions` table, so the entry form, entry detail, and report/export render them automatically. Canonical he/en normalization helpers in `data.ts` drive counting/filtering. A new `/malfunctions` view aggregates client-side over `searchEntries`; the dashboard gets one extra count from the `dashboard_stats()` RPC.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom v6, framer-motion, Supabase (Postgres + edge functions/Deno), Vitest. No new dependencies.

## Global Constraints

- App is Hebrew-first, RTL; every user-facing string has `he` + `en` in `src/i18n.tsx`.
- Dynamic form fields store the **localized label** as their value (e.g. `weather` stores `שמש`/`Sunny`). Malfunction dept follows this; always normalize reads through `deptIdOf`.
- The browser report (`src/report.ts`) and the Deno email twin (`supabase/functions/send-entry/index.ts`) render near-identical templates and MUST stay in sync.
- Canonical department ids and labels (verbatim):
  `none`=אין/None · `logistics_warehouse`=לוגיסטיקה ומחסן/Logistics & warehouse · `contractors`=קבלנים/Contractors · `customers`=לקוחות/Customers · `engineering`=הנדסה/Engineering · `purchasing`=רכש/Purchasing · `finance`=כספים/Finance · `other`=אחר/Other
- Field keys: dept = `malfunction_dept` (select, required, sort_order 86), text = `malfunction` (long_text, not DB-required, sort_order 87). Dept label_he `מחלקת בלת"מ`; text label_he `בלת"מ`.
- Test runner: `npm test` (vitest run). Commit after every green task.

---

### Task 1: Canonical helpers + filter type in `data.ts`

**Files:**
- Modify: `src/data.ts` (add constants/helpers; extend `SearchFilters`)
- Test: `src/data.test.ts` (append cases)

**Interfaces:**
- Produces:
  - `MALFUNCTION_DEPT_KEY = 'malfunction_dept'`, `MALFUNCTION_TEXT_KEY = 'malfunction'`
  - `interface MalfunctionDept { id: string; he: string; en: string }`
  - `MALFUNCTION_DEPTS: MalfunctionDept[]` (none first)
  - `deptIdOf(value: string | undefined | null): string` — he/en/id, case-insensitive, blank/unknown → `'none'`
  - `hasMalfunction(values: Record<string,string>): boolean`
  - `deptLabel(id: string, lang: 'he'|'en'): string`
  - `SearchFilters.malfunction?: string` — `'' | 'any' | 'none' | <dept id>`

- [ ] **Step 1: Write the failing tests** — append to `src/data.test.ts`:

```ts
import { deptIdOf, hasMalfunction, deptLabel, MALFUNCTION_DEPT_KEY } from './data'

describe('malfunction helpers', () => {
  it('deptIdOf maps he, en, id, blank, unknown', () => {
    expect(deptIdOf('הנדסה')).toBe('engineering')
    expect(deptIdOf('Engineering')).toBe('engineering')
    expect(deptIdOf('engineering')).toBe('engineering')
    expect(deptIdOf('  RECHESH? ')).toBe('none') // unknown → none
    expect(deptIdOf('רכש')).toBe('purchasing')
    expect(deptIdOf('')).toBe('none')
    expect(deptIdOf(undefined)).toBe('none')
    expect(deptIdOf('אין')).toBe('none')
  })
  it('hasMalfunction is true only for a real dept', () => {
    expect(hasMalfunction({ [MALFUNCTION_DEPT_KEY]: 'אין' })).toBe(false)
    expect(hasMalfunction({})).toBe(false)
    expect(hasMalfunction({ [MALFUNCTION_DEPT_KEY]: 'קבלנים' })).toBe(true)
  })
  it('deptLabel returns localized label', () => {
    expect(deptLabel('finance', 'he')).toBe('כספים')
    expect(deptLabel('finance', 'en')).toBe('Finance')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/data.test.ts`
Expected: FAIL — `deptIdOf is not a function` (or import error).

- [ ] **Step 3: Implement** — append to `src/data.ts` (after the existing exports):

```ts
// ---------- malfunction (בלת"מ) ----------
export const MALFUNCTION_DEPT_KEY = 'malfunction_dept'
export const MALFUNCTION_TEXT_KEY = 'malfunction'

export interface MalfunctionDept { id: string; he: string; en: string }
export const MALFUNCTION_DEPTS: MalfunctionDept[] = [
  { id: 'none',                he: 'אין',              en: 'None' },
  { id: 'logistics_warehouse', he: 'לוגיסטיקה ומחסן', en: 'Logistics & warehouse' },
  { id: 'contractors',         he: 'קבלנים',           en: 'Contractors' },
  { id: 'customers',           he: 'לקוחות',           en: 'Customers' },
  { id: 'engineering',         he: 'הנדסה',            en: 'Engineering' },
  { id: 'purchasing',          he: 'רכש',              en: 'Purchasing' },
  { id: 'finance',             he: 'כספים',            en: 'Finance' },
  { id: 'other',               he: 'אחר',              en: 'Other' },
]

/** Map a stored dept value (he OR en OR canonical id, any case; blank) to a canonical id.
 *  Unknown / blank → 'none' (fail-safe: never counts as a malfunction unless clearly one). */
export function deptIdOf(value: string | undefined | null): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return 'none'
  const hit = MALFUNCTION_DEPTS.find(
    (d) => d.id === v || d.he.toLowerCase() === v || d.en.toLowerCase() === v,
  )
  return hit ? hit.id : 'none'
}

/** True when the entry records a real malfunction (dept id ≠ 'none'). */
export function hasMalfunction(values: Record<string, string>): boolean {
  return deptIdOf(values?.[MALFUNCTION_DEPT_KEY]) !== 'none'
}

/** Localized label for a canonical dept id. */
export function deptLabel(id: string, lang: 'he' | 'en'): string {
  const d = MALFUNCTION_DEPTS.find((x) => x.id === id)
  return d ? d[lang] : id
}
```

  Also extend the existing `SearchFilters` interface — change its line to:

```ts
export interface SearchFilters { projectId?: string; userId?: string; from?: string; to?: string; text?: string; malfunction?: string }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/data.test.ts`
Expected: PASS (all malfunction cases + existing cases green).

- [ ] **Step 5: Commit**

```bash
git add src/data.ts src/data.test.ts
git commit -m "feat(malfunction): canonical dept helpers + search filter type"
```

---

### Task 2: Seed the two field definitions (DB migration)

**Files:**
- Create: `supabase/migrations/0016_malfunction_fields.sql`

**Interfaces:**
- Consumes: canonical labels/keys from Global Constraints.
- Produces: two `field_definitions` rows that the form/report read at runtime.

- [ ] **Step 1: Create the migration**

`supabase/migrations/0016_malfunction_fields.sql`:

```sql
-- Malfunction (בלת"מ): a department selector (default "none" = no malfunction) and a
-- free-text description. Rendered by the dynamic form / report like any other field.
insert into field_definitions (key,label_he,label_en,type,required,options,sort_order) values
('malfunction_dept','מחלקת בלת"מ','Malfunction dept.','select',true,
  '[{"he":"אין","en":"None"},{"he":"לוגיסטיקה ומחסן","en":"Logistics & warehouse"},{"he":"קבלנים","en":"Contractors"},{"he":"לקוחות","en":"Customers"},{"he":"הנדסה","en":"Engineering"},{"he":"רכש","en":"Purchasing"},{"he":"כספים","en":"Finance"},{"he":"אחר","en":"Other"}]',86),
('malfunction','בלת"מ','Malfunction','long_text',false,'[]',87)
on conflict (key) do nothing;
```

- [ ] **Step 2: Sanity-check SQL syntax locally (no DB yet)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/0016_malfunction_fields.sql','utf8'); JSON.parse(s.match(/'(\[.*\])'/)[1]); console.log('options JSON valid')"`
Expected: prints `options JSON valid` (confirms the embedded options JSON parses).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_malfunction_fields.sql
git commit -m "feat(malfunction): seed dept + description field definitions"
```

> DB push happens in Task 9 (`supabase db push`) alongside deploy.

---

### Task 3: Entry form — default "none" + conditional-required text

**Files:**
- Modify: `src/screens/EntryForm.tsx`

**Interfaces:**
- Consumes: `MALFUNCTION_DEPT_KEY`, `MALFUNCTION_TEXT_KEY`, `deptIdOf`, `deptLabel` (Task 1).

- [ ] **Step 1: Import the helpers** — extend the existing `data` import at line 13:

```ts
import { MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY, deptIdOf, deptLabel } from '../data'
import type { FieldDef } from '../data'
```

- [ ] **Step 2: Seed default "none" for new entries** — replace line 27:

```ts
  const [values, setValues] = useState<Record<string, string>>(
    editing ? {} : { [MALFUNCTION_DEPT_KEY]: deptLabel('none', lang) },
  )
```

(Editing still overwrites `values` from the loaded entry in the existing effect — unchanged.)

- [ ] **Step 3: Add conditional-required validation** — in `save()`, immediately after the `for (const f of defs)` required loop (right before `setErrors(errs)`), insert:

```ts
    // Malfunction description is required only when a real department is selected.
    if (deptIdOf(values[MALFUNCTION_DEPT_KEY]) !== 'none' && !(values[MALFUNCTION_TEXT_KEY] ?? '').trim()) {
      errs.push(MALFUNCTION_TEXT_KEY)
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/EntryForm.tsx
git commit -m "feat(malfunction): default dept to none, require text when dept set"
```

---

### Task 4: Report renderers skip "none" malfunction

**Files:**
- Modify: `src/report.ts`
- Test: `src/report.test.ts`

**Interfaces:**
- Consumes: `deptIdOf`, `MALFUNCTION_DEPT_KEY`, `MALFUNCTION_TEXT_KEY` (Task 1).

- [ ] **Step 1: Write failing tests** — append to `src/report.test.ts`:

```ts
describe('malfunction rendering', () => {
  const mfDefs: FieldDef[] = [
    ...defs,
    { id: '4', key: 'malfunction_dept', label_he: 'מחלקת בלת"מ', label_en: 'Malfunction dept.', type: 'select', required: true, options: [], sort_order: 86, active: true },
    { id: '5', key: 'malfunction', label_he: 'בלת"מ', label_en: 'Malfunction', type: 'long_text', required: false, options: [], sort_order: 87, active: true },
  ]
  it('hides both malfunction fields when dept is none', () => {
    const e: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'אין', malfunction: '' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: mfDefs }, 'https://logo.png')
    expect(html).not.toContain('מחלקת בלת"מ')
    expect(html).not.toContain('בלת"מ')
  })
  it('shows malfunction block when a real dept is set', () => {
    const e: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'הנדסה', malfunction: 'צינור נשבר' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: mfDefs }, 'https://logo.png')
    expect(html).toContain('מחלקת בלת"מ')
    expect(html).toContain('צינור נשבר')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/report.test.ts`
Expected: FAIL — the "none" case renders `מחלקת בלת"מ` (value `אין` is non-empty so currently shown).

- [ ] **Step 3: Implement skip rule** — in `src/report.ts`:

  Add import at top (after line 4):

```ts
import { deptIdOf, MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY } from './data'
```

  In `buildReportHtml`, right after `const v = o.entry.values`, add:

```ts
  const skipMalf = (key: string) =>
    deptIdOf(v[MALFUNCTION_DEPT_KEY]) === 'none' && (key === MALFUNCTION_DEPT_KEY || key === MALFUNCTION_TEXT_KEY)
```

  Change the rows filter to also exclude skipped malfunction fields:

```ts
    .filter((f) => f.type !== 'photo' && String(v[f.key] ?? '').trim() && !skipMalf(f.key))
```

  In `buildReportText`, after `const v = o.entry.values`, add the same `skipMalf` const, then inside the `for (const f of o.defs)` loop add after the `photo` continue:

```ts
    if (skipMalf(f.key)) continue
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/report.test.ts`
Expected: PASS (both new cases + existing cases green).

- [ ] **Step 5: Commit**

```bash
git add src/report.ts src/report.test.ts
git commit -m "feat(malfunction): omit malfunction rows from report when dept is none"
```

---

### Task 5: Email edge function twin — same skip rule

**Files:**
- Modify: `supabase/functions/send-entry/index.ts`

**Interfaces:**
- Consumes: nothing importable (Deno boundary) — inline the none-set check.

- [ ] **Step 1: Add none-detection + skip in `renderHtml`** — in `renderHtml`, right before the `const rows = o.defs` block, insert:

```ts
  const NONE_DEPT = new Set(['', 'none', 'אין'])
  const noMalf = NONE_DEPT.has(String(o.values['malfunction_dept'] ?? '').trim().toLowerCase())
  const skipMalf = (key: string) => noMalf && (key === 'malfunction_dept' || key === 'malfunction')
```

  Change the rows filter line to:

```ts
    .filter((f) => f.type !== 'photo' && String(o.values[f.key] ?? '').trim() && !skipMalf(f.key))
```

- [ ] **Step 2: Typecheck the function compiles (deno check if available, else skip)**

Run: `npx tsc -b`
Expected: no errors in the app build (the edge fn is Deno; app tsc ignores it — this step just confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-entry/index.ts
git commit -m "feat(malfunction): omit malfunction from emailed report when dept is none"
```

> Edge function deploy is out of scope for this change (email template only); it redeploys via `supabase functions deploy send-entry` if/when the team ships email changes. Note in Task 9 handoff.

---

### Task 6: Search — malfunction filter + result badge

**Files:**
- Modify: `src/api.ts` (`searchEntries`)
- Modify: `src/screens/Search.tsx`

**Interfaces:**
- Consumes: `hasMalfunction`, `deptIdOf`, `MALFUNCTION_DEPT_KEY`, `MALFUNCTION_DEPTS`, `deptLabel` (Task 1); `SearchFilters.malfunction`.

- [ ] **Step 1: Filter in `searchEntries`** — in `src/api.ts`, extend the import from `./data` (line 4):

```ts
import { entryMatchesText, hasMalfunction, deptIdOf, MALFUNCTION_DEPT_KEY } from './data'
```

  In `searchEntries`, after the existing `if (f.text) { ... }` line and before `return entries`, add:

```ts
  if (f.malfunction) {
    if (f.malfunction === 'any') entries = entries.filter((e) => hasMalfunction(e.values))
    else if (f.malfunction === 'none') entries = entries.filter((e) => !hasMalfunction(e.values))
    else entries = entries.filter((e) => deptIdOf(e.values[MALFUNCTION_DEPT_KEY]) === f.malfunction)
  }
```

- [ ] **Step 2: Add the filter control + badge in `Search.tsx`**

  Extend imports:

```ts
import { MALFUNCTION_DEPTS, MALFUNCTION_DEPT_KEY, deptIdOf, deptLabel, hasMalfunction } from '../data'
```

  Add state (after `const [text, setText] = useState('')`):

```ts
  const [malfunction, setMalfunction] = useState('')
```

  Update the live-search effect: include malfunction in `hasCriteria` and pass it, and add it to the deps array:

```ts
    const hasCriteria = Boolean(text.trim() || projectId || from || to || malfunction)
    ...
      searchEntries({ projectId: projectId || undefined, from: from || undefined, to: to || undefined, text: text || undefined, malfunction: malfunction || undefined })
    ...
  }, [projectId, from, to, text, malfunction])
```

  Add a dropdown in the `.search-bar` block, after the project `Field`:

```tsx
        <Field label={t('malf_filter')}>
          <select className="input" value={malfunction} onChange={(e) => setMalfunction(e.target.value)}>
            <option value="">{t('malf_all')}</option>
            <option value="any">{t('malf_any')}</option>
            <option value="none">{t('malf_none')}</option>
            {MALFUNCTION_DEPTS.filter((d) => d.id !== 'none').map((d) => (
              <option key={d.id} value={d.id}>{lang === 'he' ? d.he : d.en}</option>
            ))}
          </select>
        </Field>
```

  Add `const { t, lang } = useI18n()` — update the existing `const { t } = useI18n()` to include `lang`.

  In each result row, after the `<WeatherChip .../>`, add a malfunction badge:

```tsx
                {hasMalfunction(e.values) && (
                  <Tag tone="clay">בלת"מ · {deptLabel(deptIdOf(e.values[MALFUNCTION_DEPT_KEY]), lang)}</Tag>
                )}
```

- [ ] **Step 3: Add i18n keys** — in `src/i18n.tsx`, add to `STRINGS` (near the search keys ~line 84):

```ts
  malf_filter:    { he: 'בלת"מ', en: 'Malfunction' },
  malf_all:       { he: 'הכל', en: 'All' },
  malf_any:       { he: 'עם בלת"מ בלבד', en: 'Only malfunctions' },
  malf_none:      { he: 'ללא בלת"מ', en: 'No malfunction' },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/screens/Search.tsx src/i18n.tsx
git commit -m "feat(malfunction): search filter + result badge"
```

---

### Task 7: Dashboard card + `dashboard_stats` RPC

**Files:**
- Create: `supabase/migrations/0017_dashboard_malfunctions.sql`
- Modify: `src/api.ts` (`DashboardStats`)
- Modify: `src/screens/Dashboard.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Produces: `DashboardStats.malfunctions_this_month?: number`.

- [ ] **Step 1: Migration `0017_dashboard_malfunctions.sql`** (full `create or replace`, copied from 0015 + one new key):

```sql
-- Add "malfunctions this month" to the dashboard aggregation. A report counts as a
-- malfunction when its malfunction_dept is a real department (not blank / none / אין).
create or replace function dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', (select count(*) from entries),
    'this_week', (select count(*) from entries where work_date >= (current_date - 7)),
    'this_month', (select count(*) from entries where work_date >= date_trunc('month', current_date)::date),
    'total_photos', (select count(*) from entry_photos),
    'unsent', (select count(*) from entries where last_sent_at is null),
    'malfunctions_this_month', (select count(*) from entries
        where work_date >= date_trunc('month', current_date)::date
          and coalesce(lower(btrim(values->>'malfunction_dept')), '') not in ('', 'none', 'אין')),
    'by_project', (select coalesce(json_object_agg(project_id, c), '{}'::json)
                   from (select project_id, count(*) c from entries group by project_id) t),
    'latest_by_project', (select coalesce(json_object_agg(project_id, last), '{}'::json)
                   from (select project_id, max(work_date)::text last from entries group by project_id) t),
    'by_worker', (select coalesce(json_object_agg(created_by, c), '{}'::json)
                   from (select created_by, count(*) c from entries group by created_by) t),
    'by_weather', (select coalesce(json_object_agg(w, c), '{}'::json)
                   from (select values->>'weather' w, count(*) c from entries
                         where coalesce(values->>'weather', '') <> '' group by values->>'weather') t)
  );
$$;
grant execute on function dashboard_stats() to authenticated;
```

- [ ] **Step 2: Extend `DashboardStats`** — in `src/api.ts`, add to the interface (after `unsent?: number`):

```ts
  malfunctions_this_month?: number
```

- [ ] **Step 3: Dashboard card** — in `src/screens/Dashboard.tsx`:

  In the `stats` memo return object, add:

```ts
      malfunctionsMonth: raw.malfunctions_this_month ?? 0,
```

  In the stat-grid, add a card after the `dash_photos` card:

```tsx
          <Stat label={t('dash_malfunctions')} value={stats.malfunctionsMonth} tone={stats.malfunctionsMonth ? 'clay' : 'green'} clickable onClick={() => nav('/malfunctions')} />
```

- [ ] **Step 4: i18n key** — in `src/i18n.tsx`, add near the dash keys (~line 17):

```ts
  dash_malfunctions: { he: 'בלת"מ החודש', en: 'Malfunctions this month' },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_dashboard_malfunctions.sql src/api.ts src/screens/Dashboard.tsx src/i18n.tsx
git commit -m "feat(malfunction): dashboard 'this month' card + RPC count"
```

---

### Task 8: Dedicated Malfunctions stats view + wiring

**Files:**
- Create: `src/screens/Malfunctions.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/Shell.tsx` (nav item)
- Modify: `src/i18n.tsx` (keys)

**Interfaces:**
- Consumes: `searchEntries` (Task 6 supports `malfunction: 'any'`), `MALFUNCTION_DEPTS`, `MALFUNCTION_DEPT_KEY`, `MALFUNCTION_TEXT_KEY`, `deptIdOf`, `deptLabel` (Task 1); store `projectName`/`projectColor`/`projects`.

- [ ] **Step 1: Create `src/screens/Malfunctions.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, Field, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { searchEntries } from '../api'
import { useStore } from '../store'
import {
  MALFUNCTION_DEPTS, MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY,
  deptIdOf, deptLabel,
} from '../data'
import type { Entry } from '../data'

export default function Malfunctions() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, projectColor } = useStore()
  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBusy(true)
    let alive = true
    const h = setTimeout(() => {
      searchEntries({ projectId: projectId || undefined, from: from || undefined, to: to || undefined, malfunction: 'any' })
        .then((r) => { if (alive) setEntries(r) })
        .catch(() => { if (alive) setEntries([]) })
        .finally(() => { if (alive) setBusy(false) })
    }, 300)
    return () => { alive = false; clearTimeout(h) }
  }, [projectId, from, to])

  const stats = useMemo(() => {
    const list = entries ?? []
    const byDept: Record<string, number> = {}
    const byProject: Record<string, number> = {}
    const byDate: Record<string, number> = {}
    for (const e of list) {
      byDept[deptIdOf(e.values[MALFUNCTION_DEPT_KEY])] = (byDept[deptIdOf(e.values[MALFUNCTION_DEPT_KEY])] ?? 0) + 1
      byProject[e.project_id] = (byProject[e.project_id] ?? 0) + 1
      const day = e.work_date || '—'
      byDate[day] = (byDate[day] ?? 0) + 1
    }
    const depts = MALFUNCTION_DEPTS.filter((d) => d.id !== 'none')
      .map((d) => [d.id, byDept[d.id] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    const projs = Object.entries(byProject).sort((a, b) => b[1] - a[1])
    const dates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      total: list.length, depts, projs, dates,
      maxDept: Math.max(1, ...depts.map(([, n]) => n)),
      maxProj: Math.max(1, ...projs.map(([, n]) => n)),
      maxDate: Math.max(1, ...dates.map(([, n]) => n)),
    }
  }, [entries])

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('app_sub')}</div>
          <h1 className="page-title">{t('nav_malfunctions')}</h1>
        </div>
        {busy ? <span className="count mono"><span className="spin" /></span>
          : <span className="count mono">{stats.total} {t('malf_count')}</span>}
      </div>

      <div className="search-bar">
        <Field label={t('project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t('from_date')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to_date')}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <motion.div variants={riseIn} className="stat-grid">
          <div className="panel stat"><div className="stat__value">{stats.total}</div><div className="stat__label">{t('malf_total')}</div></div>
        </motion.div>

        {/* by department */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_by_dept')}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stats.depts.length === 0 && <span className="count mono">—</span>}
            {stats.depts.map(([id, n]) => (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14 }}>{deptLabel(id, lang)}</span>
                <div style={{ background: 'var(--paper-2)', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${(n / stats.maxDept) * 100}%`, background: 'var(--clay)', height: '100%', borderRadius: 6 }} />
                </div>
                <span className="count mono" style={{ textAlign: 'end' }}>{n}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* by project */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_by_project')}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stats.projs.length === 0 && <span className="count mono">—</span>}
            {stats.projs.map(([pid, n]) => (
              <div key={pid} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName(pid)}</span>
                <div style={{ background: 'var(--paper-2)', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${(n / stats.maxProj) * 100}%`, background: projectColor(pid), height: '100%', borderRadius: 6 }} />
                </div>
                <span className="count mono" style={{ textAlign: 'end' }}>{n}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* over time */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_over_time')}</h3>
          {stats.dates.length === 0 ? <span className="count mono">—</span> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, overflowX: 'auto' }}>
              {stats.dates.map(([day, n]) => (
                <div key={day} title={`${day} · ${n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 26 }}>
                  <div style={{ width: 18, height: `${(n / stats.maxDate) * 90}px`, background: 'var(--clay)', borderRadius: 4 }} />
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* list */}
        <motion.div variants={riseIn} className="panel">
          <div className="row-list">
            {(entries ?? []).length === 0 && <div className="empty"><div className="big">{t('no_entries')}</div></div>}
            {(entries ?? []).map((e) => (
              <div key={e.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/entry/${e.id}`)}>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>{e.work_date}</span>
                <div className="grow">
                  <b>{projectName(e.project_id)}</b>{' '}
                  <Tag tone="clay">{deptLabel(deptIdOf(e.values[MALFUNCTION_DEPT_KEY]), lang)}</Tag>
                  <div style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 2 }}>{e.values[MALFUNCTION_TEXT_KEY]}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Add the route** — in `src/App.tsx`, add import near the other screen imports:

```ts
import Malfunctions from './screens/Malfunctions'
```

  Add the route inside the `Shell` route group (after the `export` route line 50):

```tsx
        <Route path="malfunctions" element={<Malfunctions />} />
```

- [ ] **Step 3: Add the nav item** — in `src/components/Shell.tsx`, after the `/dashboard` NavItem (line 58):

```tsx
        <NavItem to="/malfunctions" icon="⚠" label={t('nav_malfunctions')} />
```

- [ ] **Step 4: Add i18n keys** — in `src/i18n.tsx`, add near the nav keys:

```ts
  nav_malfunctions: { he: 'בלת"מ', en: 'Malfunctions' },
  malf_count:       { he: 'בלת"מ', en: 'malfunctions' },
  malf_total:       { he: 'סה״כ בלת"מ בטווח', en: 'Total in range' },
  malf_by_dept:     { he: 'בלת"מ לפי מחלקה', en: 'By department' },
  malf_by_project:  { he: 'בלת"מ לפי פרויקט', en: 'By project' },
  malf_over_time:   { he: 'בלת"מ לאורך זמן', en: 'Over time' },
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Malfunctions.tsx src/App.tsx src/components/Shell.tsx src/i18n.tsx
git commit -m "feat(malfunction): dedicated stats view with charts + nav/route"
```

---

### Task 9: Full test pass, build, deploy

**Files:** none (deploy only).

- [ ] **Step 1: Full test suite green**

Run: `npm test`
Expected: all suites PASS (includes `data.test.ts`, `report.test.ts`).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds; `dist/` emitted.

- [ ] **Step 3: Push DB migrations to Supabase**

Run: `supabase db push`
Expected: applies `0016_malfunction_fields.sql` and `0017_dashboard_malfunctions.sql`. Confirms the two field defs exist and `dashboard_stats()` is replaced.

- [ ] **Step 4: Verify commit author is the Vercel owner** (auto-deploy is blocked otherwise — see README "Hobby-plan commit-author rule")

Run: `git log -1 --format='%an <%ae>'`
Expected: authored as `sgreis7-png` (project owner). If not, re-author before pushing.

- [ ] **Step 5: Push to trigger Vercel production deploy**

Run: `git push origin main`
Expected: push accepted; Vercel starts a production build (not "Blocked").

- [ ] **Step 6: Verify the deploy actually shipped** (don't trust the browser — grep the live bundle, per README + project memory)

Run:
```bash
curl -s https://work-diary-phi.vercel.app/index.html | grep -o 'assets/index-[^"]*\.js' | head -1
# then, using that filename:
curl -s https://work-diary-phi.vercel.app/assets/index-XXXX.js | grep -c 'malfunction'
```
Expected: the bundle grep returns a non-zero count (the new `malfunction` code is live).

- [ ] **Step 7 (optional / team decision): redeploy the email edge function** if the malfunction-in-email skip should go live now:

Run: `supabase functions deploy send-entry`
Expected: function deployed. (Skip if the team batches edge-fn deploys separately.)

---

## Notes for the executor

- The dept select stores the **localized** label; never compare raw strings — always go through `deptIdOf`.
- Historical entries have no `malfunction_dept` → treated as `none` everywhere (correct).
- If `supabase db push` is not linked in this environment, run `supabase link` first (see README "Deploying"). The migrations are committed regardless; pushing can be done from any linked machine.
- Two open confirmations from brainstorming (safe defaults chosen, easy to change): none label `אין`, dept field label `מחלקת בלת"מ`.
