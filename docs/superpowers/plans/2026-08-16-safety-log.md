# Safety Log (Toolbox Sign-Off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily safety-briefing (toolbox talk) forms: a foreman opens a form per project+date, workers sign on the foreman's device, signatures stored as compact vector strokes, forms searchable by project/date/worker, printable and mailable — not shown in the control centre.

**Architecture:** New `safety_forms` + `safety_topics` tables (RLS via existing `can_view`/`can_edit` with new perm area `safety`). New `src/safety/` module mirroring `src/defects/`: own i18n dict, pure model helpers, API layer, screens. Signatures are normalized, RDP-simplified polylines stored as JSONB (~1–3KB each) and rendered as SVG — no storage bucket involved.

**Tech Stack:** React + TypeScript + Vite, react-router, Supabase (Postgres/RLS), vitest. **No new npm dependencies** — the signature pad is a hand-rolled canvas component.

**Spec:** `docs/superpowers/specs/2026-08-16-safety-log-design.md`

## Global Constraints

- UI is Hebrew-first RTL with English second (`{ he, en }` string maps); follow existing `src/defects/i18n.ts` pattern.
- Migrations are append-only, next number is `0061`.
- Commit author must be `sgreis7-png` (Vercel blocks deploys otherwise).
- `perm_defaults` in SQL and `ROLE_DEFAULTS` in `src/lib/perms.ts` must agree; `src/lib/perms.sql.test.ts` enforces this — extend it, never weaken it.
- Safety log must NOT appear in ControlCenter/Dashboard/Digest — no changes to those screens.
- Tests: `npx vitest run` ; typecheck/build: `npx tsc -b && npx vite build`.

---

### Task 1: Permission area `safety` + DB migration 0061

**Files:**
- Create: `supabase/migrations/0061_safety_forms.sql`
- Modify: `src/lib/perms.ts`
- Modify: `src/lib/perms.sql.test.ts`

**Interfaces:**
- Produces: perm area `'safety'` usable by `RequirePerm area="safety"`, tables `safety_forms`, `safety_topics`.

- [ ] **Step 1: Extend the SQL-sync test (failing first)**

In `src/lib/perms.sql.test.ts`, the seeded-defaults reader only parses `0045`. Add the 0061 seeds (role-keyed tuples) so the drift test covers the new area. Replace the `seededDefaults` function and add the file read:

```ts
const SQL = readFileSync('supabase/migrations/0045_enforce_perm_areas.sql', 'utf8')
const SQL61 = readFileSync('supabase/migrations/0061_safety_forms.sql', 'utf8')

/** The seeded rows for an ordinary member: the 0045 block plus later role-keyed seeds. */
function seededDefaults(): Record<string, PermLevel> {
  const block = SQL.slice(
    SQL.indexOf('insert into perm_defaults'),
    SQL.indexOf('on conflict (area)'),
  )
  const out: Record<string, PermLevel> = {}
  for (const [, area, level] of block.matchAll(/\('(\w+)',\s*'(none|view|edit)'\)/g)) {
    out[area] = level as PermLevel
  }
  // migrations after 0050 seed with (role, area, level); take the member rows
  for (const [, area, level] of SQL61.matchAll(/\('member',\s*'(\w+)',\s*'(none|view|edit)'\)/g)) {
    out[area] = level as PermLevel
  }
  return out
}
```

Also add a manager check inside the existing describe blocks:

```ts
  it('seeds a manager row for safety that matches MANAGER_DEFAULTS', () => {
    const m = [...SQL61.matchAll(/\('manager',\s*'safety',\s*'(none|view|edit)'\)/g)]
    expect(m.length).toBe(1)
    expect(m[0][1]).toBe(resolvePerm('manager', {}, 'safety'))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/perms.sql.test.ts`
Expected: FAIL — `ENOENT ... 0061_safety_forms.sql` (file does not exist yet).

- [ ] **Step 3: Add `safety` to client perms**

In `src/lib/perms.ts`:

```ts
export type PermArea =
  | 'dashboard' | 'logbook' | 'calendar' | 'search' | 'projects' | 'export'
  | 'defects' | 'form_builder' | 'coops_manage' | 'alert_rules' | 'gantt' | 'control_center'
  | 'safety'
```

Append to `PERM_AREAS` (after the `defects` entry):

```ts
  { key: 'safety', label: 'יומן בטיחות', label_en: 'Safety log' },
```

Add to BOTH defaults maps (`MEMBER_DEFAULTS` and `MANAGER_DEFAULTS`):

```ts
  safety: 'edit', // טופסי הדרכת בטיחות — מנהלי עבודה בשטח יוצרים אותם
```

- [ ] **Step 4: Write migration `supabase/migrations/0061_safety_forms.sql`**

```sql
-- Daily safety-briefing (toolbox talk) sign-off forms.
--
-- Signatures are vector strokes (JSONB), not images: a signature is ~1-3KB of points,
-- renders crisply at any size (screen, print, mail), and lives inside the form row —
-- no storage bucket, no signed URLs. Workers are free-text name + id_number captured
-- per form; suggestions come from the project's previous forms, not from a roster.

-- ---- editable topic list, seeded from the official paper form ----
create table if not exists safety_topics (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table safety_topics enable row level security;

drop policy if exists read_safety_topics on safety_topics;
create policy read_safety_topics on safety_topics for select using (is_member());
drop policy if exists admin_safety_topics on safety_topics;
create policy admin_safety_topics on safety_topics for all
  using (is_admin()) with check (is_admin());

insert into safety_topics (label, sort_order) values
  ('ציוד מגן אישי',                          10),
  ('הוראות בטיחות באתר והכרתו',              20),
  ('עבודה בגובה',                            30),
  ('חפירות — סיכונים ותקנות',                40),
  ('חשמל — סיכונים והוראות בטיחות',          50),
  ('כלי עבודה מיטלטלים',                     60),
  ('עבודה חמה',                              70),
  ('גיהות — אבק, רעש, מזג אוויר קיצוני',     80),
  ('ארגונומיה — משאות כבדים, עבודה במאמץ',   90),
  ('מצבי חירום — שריפה, ירי טילים',         100)
on conflict (label) do nothing;

-- ---- the forms ----
create table if not exists safety_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  training_date date not null default current_date,
  topics jsonb not null default '[]',   -- labels of the topics actually covered
  workers jsonb not null default '[]',  -- [{name,id_number,signature,signed_at}]
  instructor_name text not null default '',
  instructor_qualification text not null default '',
  instructor_signature jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists safety_forms_project_date
  on safety_forms (project_id, training_date desc);
alter table safety_forms enable row level security;

-- Same shape as the entries policies in 0045: viewers read, an author always
-- reads their own rows, editing stays with the author (or an admin).
drop policy if exists read_safety_forms on safety_forms;
create policy read_safety_forms on safety_forms for select
  using (can_view('safety') or (is_member() and created_by = auth.uid()));
drop policy if exists insert_safety_forms on safety_forms;
create policy insert_safety_forms on safety_forms for insert
  with check (can_edit('safety') and created_by = auth.uid());
drop policy if exists update_safety_forms on safety_forms;
create policy update_safety_forms on safety_forms for update
  using (can_edit('safety') and (created_by = auth.uid() or is_admin()))
  with check (can_edit('safety') and (created_by = auth.uid() or is_admin()));
drop policy if exists delete_safety_forms on safety_forms;
create policy delete_safety_forms on safety_forms for delete
  using (can_edit('safety') and (created_by = auth.uid() or is_admin()));

-- ---- defaults for the new area (role-keyed since 0050) ----
insert into perm_defaults (role, area, level) values
  ('member',  'safety', 'edit'),
  ('manager', 'safety', 'edit')
on conflict (role, area) do update set level = excluded.level;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/perms.sql.test.ts`
Expected: PASS (all, including the pre-existing area-count test which now finds `safety` in both PERM_AREAS and the merged seeds).

- [ ] **Step 6: Apply the migration to Supabase**

Use the Supabase MCP `apply_migration` tool against the WorkDiary project (name `0061_safety_forms`, content = the file above). Verify with `list_tables` that `safety_forms` and `safety_topics` exist and RLS is enabled.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0061_safety_forms.sql src/lib/perms.ts src/lib/perms.sql.test.ts
git commit -m "feat(safety): safety_forms + safety_topics tables, perm area 'safety'"
```

---

### Task 2: Signature model — capture, simplify, render

**Files:**
- Create: `src/safety/signature.ts`
- Test: `src/safety/signature.test.ts`

**Interfaces:**
- Produces:
  - `interface Sig { v: 1; strokes: number[][][] }` — strokes → points → `[x, y]` integers in a fixed `1000×500` viewBox.
  - `SIG_W = 1000`, `SIG_H = 500`
  - `simplify(pts: number[][], epsilon: number): number[][]` — Ramer-Douglas-Peucker.
  - `captureToSig(strokes: number[][][], w: number, h: number): Sig` — normalize raw canvas px to viewBox + simplify.
  - `sigIsEmpty(sig: Sig | null | undefined): boolean`
  - `sigToPath(sig: Sig): string` — SVG path `d`.
  - `sigSvg(sig: Sig | null, width?: number): string` — full inline `<svg>` markup (used on screen, in print and in mail HTML).

- [ ] **Step 1: Write the failing tests**

`src/safety/signature.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SIG_H, SIG_W, captureToSig, sigIsEmpty, sigSvg, sigToPath, simplify } from './signature'

describe('simplify (RDP)', () => {
  it('collapses collinear points to the two endpoints', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 10, 100])
    expect(simplify(line, 4)).toEqual([[0, 100], [490, 100]])
  })
  it('keeps a genuine corner', () => {
    const corner = [[0, 0], [100, 0], [100, 100]]
    expect(simplify(corner, 4)).toEqual(corner)
  })
  it('passes through 1- and 2-point inputs untouched', () => {
    expect(simplify([[5, 5]], 4)).toEqual([[5, 5]])
    expect(simplify([[5, 5], [9, 9]], 4)).toEqual([[5, 5], [9, 9]])
  })
})

describe('captureToSig', () => {
  it('normalizes canvas px into the fixed viewBox as integers', () => {
    const sig = captureToSig([[[0, 0], [300, 150]]], 300, 150)
    expect(sig).toEqual({ v: 1, strokes: [[[0, 0], [SIG_W, SIG_H]]] })
  })
  it('drops strokes with fewer than 2 points (stray taps)', () => {
    const sig = captureToSig([[[10, 10]], [[0, 0], [50, 50]]], 100, 100)
    expect(sig.strokes.length).toBe(1)
  })
  it('keeps a dense realistic scribble under 3KB of JSON', () => {
    // 8 wavy strokes of 200 points each — denser than a real signature
    const strokes = Array.from({ length: 8 }, (_, s) =>
      Array.from({ length: 200 }, (_, i) => [i * 1.5, 75 + Math.sin(i / 5 + s) * 40]))
    const sig = captureToSig(strokes, 300, 150)
    expect(JSON.stringify(sig).length).toBeLessThan(3000)
  })
})

describe('rendering', () => {
  const sig = { v: 1 as const, strokes: [[[0, 0], [10, 10]], [[20, 20], [30, 20]]] }
  it('sigIsEmpty', () => {
    expect(sigIsEmpty(null)).toBe(true)
    expect(sigIsEmpty({ v: 1, strokes: [] })).toBe(true)
    expect(sigIsEmpty(sig)).toBe(false)
  })
  it('one M-command per stroke', () => {
    expect(sigToPath(sig)).toBe('M0 0 L10 10 M20 20 L30 20')
  })
  it('sigSvg returns inline svg with the fixed viewBox, empty string for no signature', () => {
    expect(sigSvg(null)).toBe('')
    const svg = sigSvg(sig, 160)
    expect(svg).toContain(`viewBox="0 0 ${SIG_W} ${SIG_H}"`)
    expect(svg).toContain('width="160"')
    expect(svg).toContain('<path d="M0 0 L10 10 M20 20 L30 20"')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/safety/signature.test.ts`
Expected: FAIL — module `./signature` not found.

- [ ] **Step 3: Implement `src/safety/signature.ts`**

```ts
// Vector signatures: strokes of [x,y] integer points in a fixed viewBox. A signature
// serialized this way is ~1-3KB — small enough to live inside the form's JSONB row —
// and renders crisply as SVG on screen, in print CSS and in mail HTML.
export const SIG_W = 1000
export const SIG_H = 500

export interface Sig { v: 1; strokes: number[][][] }

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

/** Ramer-Douglas-Peucker: drop points closer than epsilon to the chord. */
export function simplify(pts: number[][], epsilon: number): number[][] {
  if (pts.length <= 2) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= epsilon) return [pts[0], pts[pts.length - 1]]
  return [
    ...simplify(pts.slice(0, idx + 1), epsilon).slice(0, -1),
    ...simplify(pts.slice(idx), epsilon),
  ]
}

/** Raw canvas strokes (device px) → normalized, simplified signature. */
export function captureToSig(strokes: number[][][], w: number, h: number): Sig {
  const sx = SIG_W / (w || 1), sy = SIG_H / (h || 1)
  const out = strokes
    .map((s) => simplify(s.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]), 4))
    .filter((s) => s.length > 1)
  return { v: 1, strokes: out }
}

export function sigIsEmpty(sig: Sig | null | undefined): boolean {
  return !sig || !Array.isArray(sig.strokes) || sig.strokes.length === 0
}

export function sigToPath(sig: Sig): string {
  return sig.strokes
    .map((s) => 'M' + s.map(([x, y]) => `${x} ${y}`).join(' L'))
    .join(' ')
}

/** Inline SVG markup for a signature; '' when empty. Safe for dangerouslySetInnerHTML
 *  and mail bodies: content is only numbers produced by captureToSig. */
export function sigSvg(sig: Sig | null | undefined, width = 160): string {
  if (sigIsEmpty(sig)) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIG_W} ${SIG_H}" width="${width}" `
    + `height="${Math.round(width * SIG_H / SIG_W)}" aria-label="signature">`
    + `<path d="${sigToPath(sig!)}" fill="none" stroke="#1b2733" stroke-width="8" `
    + `stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/safety/signature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/safety/signature.ts src/safety/signature.test.ts
git commit -m "feat(safety): vector signature model — RDP simplify, viewBox normalize, svg render"
```

---

### Task 3: Safety model, i18n and API layer

**Files:**
- Create: `src/safety/model.ts`
- Create: `src/safety/i18n.ts`
- Create: `src/safety/api.ts`
- Test: `src/safety/model.test.ts`

**Interfaces:**
- Consumes: `Sig` from `./signature` (Task 2), `supabase` from `../lib/supabase`.
- Produces (used by Tasks 4–8):
  - `interface SafetyWorker { name: string; id_number: string; signature: Sig | null; signed_at: string | null }`
  - `interface SafetyTopic { id: string; label: string; sort_order: number; active: boolean }`
  - `interface SafetyFormRec { id: string; project_id: string; training_date: string; topics: string[]; workers: SafetyWorker[]; instructor_name: string; instructor_qualification: string; instructor_signature: Sig | null; created_by: string; created_at: string; updated_at: string }`
  - `type SafetyFormInput = Omit<SafetyFormRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>`
  - `dedupeWorkers(forms: { workers: SafetyWorker[] }[]): { name: string; id_number: string }[]`
  - `formMatchesWorker(f: SafetyFormRec, text: string): boolean`
  - API: `listSafetyForms`, `getSafetyForm`, `createSafetyForm`, `updateSafetyForm`, `deleteSafetyForm`, `fetchSafetyTopics`, `createSafetyTopic`, `updateSafetyTopic`, `reorderSafetyTopics`, `fetchWorkerSuggestions`
  - i18n: `st(lang, key)` + the `S` dict (keys listed in Step 3).

- [ ] **Step 1: Write the failing tests**

`src/safety/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dedupeWorkers, formMatchesWorker, type SafetyFormRec, type SafetyWorker } from './model'

const w = (name: string, id_number = ''): SafetyWorker =>
  ({ name, id_number, signature: null, signed_at: null })

describe('dedupeWorkers', () => {
  it('keeps first (latest-form) occurrence, dedupes by id_number when present, else by name', () => {
    const forms = [
      { workers: [w('אחמד', '123'), w('יוסי')] },        // latest form
      { workers: [w('אחמד כהן', '123'), w('יוסי'), w('דני', '9')] },
    ]
    expect(dedupeWorkers(forms)).toEqual([
      { name: 'אחמד', id_number: '123' },
      { name: 'יוסי', id_number: '' },
      { name: 'דני', id_number: '9' },
    ])
  })
  it('skips blank names', () => {
    expect(dedupeWorkers([{ workers: [w(''), w('  ')] }])).toEqual([])
  })
})

describe('formMatchesWorker', () => {
  const f = { workers: [w('מוחמד עלי', '305...')] } as unknown as SafetyFormRec
  it('matches by name substring, case-insensitively for latin', () => {
    expect(formMatchesWorker(f, 'עלי')).toBe(true)
    expect(formMatchesWorker(f, 'שרה')).toBe(false)
  })
  it('matches by id_number substring', () => {
    expect(formMatchesWorker(f, '305')).toBe(true)
  })
  it('empty query matches everything', () => {
    expect(formMatchesWorker(f, '')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/safety/model.test.ts`
Expected: FAIL — module `./model` not found.

- [ ] **Step 3: Implement the three modules**

`src/safety/model.ts`:

```ts
import type { Sig } from './signature'

export interface SafetyWorker {
  name: string
  id_number: string
  signature: Sig | null
  signed_at: string | null
}
export interface SafetyTopic { id: string; label: string; sort_order: number; active: boolean }

export interface SafetyFormRec {
  id: string
  project_id: string
  training_date: string
  topics: string[]
  workers: SafetyWorker[]
  instructor_name: string
  instructor_qualification: string
  instructor_signature: Sig | null
  created_by: string
  created_at: string
  updated_at: string
}
export type SafetyFormInput = Omit<SafetyFormRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>

/** Name+id suggestions from previous forms, latest first, unique by id_number (or name). */
export function dedupeWorkers(forms: { workers: SafetyWorker[] }[]): { name: string; id_number: string }[] {
  const seen = new Set<string>()
  const out: { name: string; id_number: string }[] = []
  for (const f of forms) for (const wk of f.workers ?? []) {
    const name = (wk.name ?? '').trim()
    if (!name) continue
    const key = (wk.id_number ?? '').trim() || name
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, id_number: (wk.id_number ?? '').trim() })
  }
  return out
}

/** Free-text filter over a form's workers (name or id number). */
export function formMatchesWorker(f: SafetyFormRec, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return (f.workers ?? []).some((wk) =>
    (wk.name ?? '').toLowerCase().includes(q) || (wk.id_number ?? '').includes(q))
}
```

`src/safety/i18n.ts` — same shape as `src/defects/i18n.ts`:

```ts
// Bilingual strings for the safety-log module. Topic labels are NOT here —
// they are admin-editable workbook content living in safety_topics.
import type { Lang } from '../i18n'

export const S = {
  nav_section_safety: { he: 'בטיחות', en: 'Safety' },
  nav_safety:         { he: 'יומן בטיחות', en: 'Safety log' },
  nav_safety_topics:  { he: 'נושאי הדרכת בטיחות', en: 'Safety topics' },

  list_title:     { he: 'יומן בטיחות — טופסי הדרכה יומית', en: 'Safety log — daily briefings' },
  list_new:       { he: 'טופס הדרכה חדש', en: 'New briefing form' },
  list_empty:     { he: 'אין עדיין טפסי הדרכה', en: 'No briefing forms yet' },
  list_all_projects: { he: 'כל הפרויקטים', en: 'All projects' },
  list_from:      { he: 'מתאריך', en: 'From' },
  list_to:        { he: 'עד תאריך', en: 'To' },
  list_worker:    { he: 'חיפוש עובד (שם או ת״ז)', en: 'Worker search (name or ID)' },
  list_signed:    { he: 'חתומים', en: 'signed' },

  form_title_new:  { he: 'טופס הדרכה יומי (Toolbox)', en: 'Daily briefing form (Toolbox)' },
  form_title_edit: { he: 'עריכת טופס הדרכה', en: 'Edit briefing form' },
  form_project:    { he: 'פרויקט', en: 'Project' },
  form_date:       { he: 'תאריך ההדרכה', en: 'Training date' },
  form_topics:     { he: 'נושאי ההדרכה שהועברו', en: 'Topics covered' },
  form_workers:    { he: 'עובדים', en: 'Workers' },
  form_add_worker: { he: '+ הוספת עובד', en: '+ Add worker' },
  form_name:       { he: 'שם העובד', en: 'Worker name' },
  form_id:         { he: 'תעודת זהות', en: 'ID number' },
  form_sign:       { he: 'חתימה', en: 'Sign' },
  form_signed:     { he: '✓ חתום', en: '✓ Signed' },
  form_remove:     { he: 'הסרה', en: 'Remove' },
  form_instructor: { he: 'המדריך', en: 'Instructor' },
  form_instr_name: { he: 'שם המדריך', en: 'Instructor name' },
  form_instr_qual: { he: 'כשירות המדריך', en: 'Instructor qualification' },
  form_need_project: { he: 'יש לבחור פרויקט', en: 'Pick a project' },
  form_need_worker:  { he: 'יש להוסיף לפחות עובד אחד', en: 'Add at least one worker' },
  form_draft_restored: { he: 'שוחזרה טיוטה שלא נשמרה', en: 'Unsaved draft restored' },

  sign_title:   { he: 'חתימת העובד', en: 'Worker signature' },
  sign_hint:    { he: 'נא לחתום באצבע בתוך המסגרת', en: 'Sign with your finger inside the frame' },
  sign_clear:   { he: 'ניקוי', en: 'Clear' },
  sign_confirm: { he: 'אישור חתימה', en: 'Confirm signature' },

  view_declares: {
    he: 'הנני מצהיר בזאת שנושאי ההדרכה היו ברורים ומובנים לי. הנני מתחייב לעבוד על פי הנחיות הבטיחות שהודרכתי עליהן. הנני מתחייב להשתמש בציוד המגן שסופק לי.',
    en: 'I hereby declare the briefing topics were clear to me. I commit to work by the safety instructions given and to use the protective equipment supplied.',
  },
  view_send:    { he: 'שליחה במייל', en: 'Send by mail' },
  view_edit:    { he: 'עריכה', en: 'Edit' },
  view_delete_confirm: { he: 'למחוק את טופס ההדרכה?', en: 'Delete this briefing form?' },

  topics_title: { he: 'ניהול נושאי הדרכה', en: 'Manage briefing topics' },
  topics_add:   { he: '+ נושא חדש', en: '+ New topic' },
  topics_active: { he: 'פעיל', en: 'Active' },
} as const

export type SKey = keyof typeof S
export const st = (lang: Lang, k: SKey): string => S[k]?.[lang] ?? String(k)
```

`src/safety/api.ts`:

```ts
import { supabase } from '../lib/supabase'
import type { SafetyFormInput, SafetyFormRec, SafetyTopic, SafetyWorker } from './model'
import { dedupeWorkers } from './model'

const COLS = 'id,project_id,training_date,topics,workers,instructor_name,'
  + 'instructor_qualification,instructor_signature,created_by,created_at,updated_at'

export interface SafetyFilters { projectId?: string; from?: string; to?: string }

export async function listSafetyForms(f: SafetyFilters = {}): Promise<SafetyFormRec[]> {
  let q = supabase.from('safety_forms').select(COLS)
    .order('training_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('training_date', f.from)
  if (f.to) q = q.lte('training_date', f.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SafetyFormRec[]
}

export async function getSafetyForm(id: string): Promise<SafetyFormRec | null> {
  const { data, error } = await supabase.from('safety_forms').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as SafetyFormRec | null
}

export async function createSafetyForm(input: SafetyFormInput): Promise<string> {
  const { data, error } = await supabase.from('safety_forms').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateSafetyForm(id: string, input: SafetyFormInput): Promise<void> {
  const { error } = await supabase.from('safety_forms')
    .update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteSafetyForm(id: string): Promise<void> {
  const { error } = await supabase.from('safety_forms').delete().eq('id', id)
  if (error) throw error
}

// ---------- topics ----------

export async function fetchSafetyTopics(): Promise<SafetyTopic[]> {
  const { data, error } = await supabase.from('safety_topics')
    .select('id,label,sort_order,active').order('sort_order')
  if (error) throw error
  return (data ?? []) as SafetyTopic[]
}

export async function createSafetyTopic(label: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('safety_topics').insert({ label, sort_order: sortOrder })
  if (error) throw error
}

export async function updateSafetyTopic(
  id: string, patch: Partial<Pick<SafetyTopic, 'label' | 'active'>>,
): Promise<void> {
  const { error } = await supabase.from('safety_topics').update(patch).eq('id', id)
  if (error) throw error
}

export async function reorderSafetyTopics(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('safety_topics').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- worker suggestions ----------

/** Names+ids from the project's last 20 forms, for autocomplete. */
export async function fetchWorkerSuggestions(projectId: string): Promise<{ name: string; id_number: string }[]> {
  const { data, error } = await supabase.from('safety_forms')
    .select('workers').eq('project_id', projectId)
    .order('training_date', { ascending: false }).limit(20)
  if (error) throw error
  return dedupeWorkers((data ?? []) as { workers: SafetyWorker[] }[])
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/safety && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/safety/model.ts src/safety/model.test.ts src/safety/i18n.ts src/safety/api.ts
git commit -m "feat(safety): model helpers, i18n dict and supabase api layer"
```

---

### Task 4: SignaturePad component

**Files:**
- Create: `src/safety/SignaturePad.tsx`

**Interfaces:**
- Consumes: `captureToSig`, `sigIsEmpty`, `Sig` (Task 2); `st` (Task 3); `useI18n` from `../i18n`.
- Produces: `<SignaturePad title={string} onDone={(sig: Sig) => void} onClose={() => void} />` — fullscreen overlay; `onDone` fires only with a non-empty signature.

- [ ] **Step 1: Implement the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { st } from './i18n'
import { captureToSig, sigIsEmpty, type Sig } from './signature'

/** Fullscreen finger-signature pad. Collects pointer strokes on a canvas and
 *  returns them as a normalized vector Sig. Touch-action is disabled so the
 *  page does not scroll mid-signature. */
export function SignaturePad({ title, onDone, onClose }: {
  title: string
  onDone: (sig: Sig) => void
  onClose: () => void
}) {
  const { lang } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<number[][][]>([])
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // size the canvas to its CSS box × devicePixelRatio once mounted
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1b2733'
  }, [])

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    strokes.current.push([pt(e)])
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = pt(e)
    const s = strokes.current[strokes.current.length - 1]
    const prev = s[s.length - 1]
    s.push(p)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke()
    if (!hasInk) setHasInk(true)
  }
  const up = () => { drawing.current = false }

  const clear = () => {
    strokes.current = []
    setHasInk(false)
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
  }
  const confirm = () => {
    const r = canvasRef.current!.getBoundingClientRect()
    const sig = captureToSig(strokes.current, r.width, r.height)
    if (!sigIsEmpty(sig)) onDone(sig)
  }

  return (
    <div className="sigpad" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sigpad__head">
        <strong>{title}</strong>
        <span className="sigpad__hint">{st(lang, 'sign_hint')}</span>
      </div>
      <canvas
        ref={canvasRef} className="sigpad__canvas"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      />
      <div className="sigpad__bar">
        <button className="btn btn--ghost" onClick={onClose}>✕</button>
        <button className="btn btn--ghost" onClick={clear}>{st(lang, 'sign_clear')}</button>
        <button className="btn btn--primary" disabled={!hasInk} onClick={confirm}>
          {st(lang, 'sign_confirm')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add styles**

Find the styles entry point (`src/styles/` — put these with the other component blocks, matching the file organization found there):

```css
/* ---- signature pad (fullscreen overlay) ---- */
.sigpad {
  position: fixed; inset: 0; z-index: 200;
  display: flex; flex-direction: column;
  background: var(--bg, #fff);
}
.sigpad__head { padding: 14px 18px; display: flex; gap: 12px; align-items: baseline; }
.sigpad__hint { opacity: .65; font-size: .9em; }
.sigpad__canvas {
  flex: 1; margin: 0 14px; border: 2px dashed var(--line, #b9c2ca); border-radius: 12px;
  touch-action: none; background: #fff;
}
.sigpad__bar { display: flex; gap: 10px; padding: 14px 18px; justify-content: flex-end; }
/* signature thumbnails in tables/cards */
.sig-thumb svg { display: block; max-width: 140px; height: auto; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/safety/SignaturePad.tsx src/styles
git commit -m "feat(safety): fullscreen finger signature pad"
```

---

### Task 5: SafetyForm screen + routes + nav

**Files:**
- Create: `src/safety/SafetyFormScreen.tsx`
- Modify: `src/App.tsx` (routes)
- Modify: `src/components/Shell.tsx` (nav group)

**Interfaces:**
- Consumes: Tasks 2–4 exports; `useStore()` (`projects`), `useAuth()`-equivalent user from `../auth` (match how `EntryForm.tsx` gets `user`), `useI18n`.
- Produces: routes `/safety/new` and `/safety/:id/edit`; nav section "בטיחות".

- [ ] **Step 1: Implement the screen**

`src/safety/SafetyFormScreen.tsx` — behavior spec (follow `EntryForm.tsx` for structure, loading and error patterns):

- **Mode:** `useParams().id` present → edit (load via `getSafetyForm`); absent → new.
- **State:** `project_id`, `training_date` (default today `new Date().toISOString().slice(0,10)`), `topicChecks: Record<label, boolean>` (default: every active topic checked), `workers: SafetyWorker[]` (start with one blank row), `instructor_name` (default: current user's display name from `useStore().userMap[user.id]`, fallback `''`), `instructor_qualification`, `instructor_signature`.
- **Topics:** `fetchSafetyTopics()` on mount; render active topics as checkboxes. In edit mode also render (checked) any label stored on the form that no longer exists in the topic list — history must not lose topics after an admin edit.
- **Workers table:** each row = name input + id input + sign button + remove button. Name input uses a shared `<datalist>` filled from `fetchWorkerSuggestions(project_id)` (refetched when project changes); picking a suggestion whose `id_number` is known auto-fills the id field (match on exact name).
- **Signing:** the sign button opens `<SignaturePad title={worker name} …/>`; `onDone` stores `{ signature: sig, signed_at: new Date().toISOString() }` on that row and closes the pad. A signed row shows a `sigSvg` thumbnail (via `dangerouslySetInnerHTML`, class `sig-thumb`) instead of the button; tapping the thumbnail re-opens the pad to re-sign.
- **Instructor block:** name + qualification inputs + same SignaturePad flow for `instructor_signature`.
- **Draft:** persist `{ project_id, training_date, topicChecks, workers, instructor_* }` to `localStorage['safety_draft']` on every change (new mode only), restore on mount if present (show `form_draft_restored` notice), clear on successful save. Signatures are part of the draft — that is the point (browser killed mid-round must not lose collected signatures).
- **Validation on save:** project chosen (`form_need_project`), ≥1 worker with a non-blank name (`form_need_worker`); blank worker rows dropped.
- **Save:** build `SafetyFormInput` with `topics` = checked labels in topic-list order; `createSafetyForm` → navigate to `/safety/${id}`; edit mode `updateSafetyForm` → navigate back to `/safety/${id}`.

- [ ] **Step 2: Wire routes**

In `src/App.tsx`, import the three safety screens (view screen arrives in Task 7 — to keep this task shippable, add only the two form routes now and the view route in Task 7, OR create all files as stubs; **do the former**):

```tsx
import { SafetyFormScreen } from './safety/SafetyFormScreen'
```

```tsx
<Route path="safety/new" element={<RequirePerm area="safety" edit><SafetyFormScreen /></RequirePerm>} />
<Route path="safety/:id/edit" element={<RequirePerm area="safety" edit><SafetyFormScreen /></RequirePerm>} />
```

- [ ] **Step 3: Add the nav group**

In `src/components/Shell.tsx`, import `st` from `../safety/i18n` and add a group between `diary` and `quality` in the `NavGroups` array (list route lands in Task 6; the group with only a dead link is not acceptable — so add the group in **Task 6** instead if you prefer strict shippability; here add it guarded to `/safety/new`):

```tsx
{
  key: 'safety',
  label: st(lang, 'nav_section_safety'),
  items: [
    ...(can('safety') ? [{ to: '/safety', icon: '⛑', label: st(lang, 'nav_safety') }] : []),
  ],
},
```

(`lang` is already available in Shell via `useI18n`; match how `dt` is called there.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc -b && npx vite build`
Expected: clean. `/safety` itself 404-redirects until Task 6 — acceptable for one commit, the nav item only shows for permitted users and Task 6 lands next.

- [ ] **Step 5: Manual smoke (dev server)**

Run: `npm run dev` — open `/safety/new`: pick project, add worker, sign (mouse), save → lands on `/safety/:id` (blank until Task 7 — verify the row exists in Supabase instead: `select id, workers from safety_forms order by created_at desc limit 1`, signature JSON present and < 3KB).

- [ ] **Step 6: Commit**

```bash
git add src/safety/SafetyFormScreen.tsx src/App.tsx src/components/Shell.tsx
git commit -m "feat(safety): briefing form screen — topics, worker rows, on-device signing, draft"
```

---

### Task 6: SafetyList screen (browse + search)

**Files:**
- Create: `src/safety/SafetyList.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `listSafetyForms`, `formMatchesWorker` (Task 3), `useStore()` (`projects`, `projectName`, `projectColor`), `st`.
- Produces: route `/safety`.

- [ ] **Step 1: Implement the screen**

`src/safety/SafetyList.tsx` — behavior spec (follow `Logbook.tsx`/`Search.tsx` list conventions):

- Header: title `list_title` + primary button `list_new` → `/safety/new` (render only when `canEdit('safety')` — use the same `usePerms` hook the Shell uses).
- Filter bar: project `<select>` (all + active projects), `from`/`to` date inputs, worker text input (`list_worker`).
- Data: `listSafetyForms({ projectId, from, to })` refetched when server-side filters change; worker text filters client-side with `formMatchesWorker`.
- Rows grouped by project (skip grouping when a single project is selected): each card shows date, project chip (project color), worker count + how many signed (`X/Y {list_signed}`), instructor name. Click → `/safety/${id}`.
- Empty state: `list_empty`.

- [ ] **Step 2: Wire route**

```tsx
import { SafetyList } from './safety/SafetyList'
```
```tsx
<Route path="safety" element={<RequirePerm area="safety"><SafetyList /></RequirePerm>} />
```

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc -b`, then in dev server: `/safety` lists the form saved in Task 5; project filter, date range and worker-name filter all narrow the list; nav item works.

- [ ] **Step 4: Commit**

```bash
git add src/safety/SafetyList.tsx src/App.tsx
git commit -m "feat(safety): safety log list — filter by project, dates, worker"
```

---

### Task 7: SafetyView — official layout, print, mail

**Files:**
- Create: `src/safety/report.ts`
- Create: `src/safety/SafetyView.tsx`
- Modify: `src/App.tsx`
- Test: `src/safety/report.test.ts`

**Interfaces:**
- Consumes: `getSafetyForm`, `deleteSafetyForm` (Task 3), `sigSvg` (Task 2), `SendMailDialog` from `../components/SendMailDialog` (props: `subject`, `html`, `onClose`, `onSent`), `st`.
- Produces: `safetyFormHtml(form: SafetyFormRec, projectName: string, lang: Lang): string` — self-contained RTL HTML used for on-screen paper, print, and the mail body; route `/safety/:id`.

- [ ] **Step 1: Write the failing test**

`src/safety/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SafetyFormRec } from './model'
import { safetyFormHtml } from './report'

const form: SafetyFormRec = {
  id: 'x', project_id: 'p', training_date: '2026-08-16',
  topics: ['עבודה בגובה'],
  workers: [
    { name: 'אחמד', id_number: '123456789', signature: { v: 1, strokes: [[[0, 0], [9, 9]]] }, signed_at: '2026-08-16T06:00:00Z' },
    { name: 'יוסי', id_number: '', signature: null, signed_at: null },
  ],
  instructor_name: 'חיים', instructor_qualification: 'ממונה בטיחות',
  instructor_signature: { v: 1, strokes: [[[1, 1], [5, 5]]] },
  created_by: 'u', created_at: '', updated_at: '',
}

describe('safetyFormHtml', () => {
  const html = safetyFormHtml(form, 'לול רווחה — קיבוץ X', 'he')
  it('carries the official header, project, date and topics', () => {
    expect(html).toContain('טופס הדרכה יומי')
    expect(html).toContain('לול רווחה — קיבוץ X')
    expect(html).toContain('2026-08-16')
    expect(html).toContain('עבודה בגובה')
  })
  it('renders a worker row per worker, signature svg only where signed', () => {
    expect(html).toContain('אחמד')
    expect(html).toContain('123456789')
    expect((html.match(/<svg/g) ?? []).length).toBe(2) // one worker + instructor
  })
  it('escapes html in user-entered text', () => {
    const evil = { ...form, workers: [{ ...form.workers[0], name: '<img src=x>' }] }
    expect(safetyFormHtml(evil, 'p', 'he')).not.toContain('<img src=x>')
  })
  it('includes declarations and instructor block', () => {
    expect(html).toContain('הנני מצהיר')
    expect(html).toContain('ממונה בטיחות')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/safety/report.test.ts`
Expected: FAIL — `./report` not found.

- [ ] **Step 3: Implement `src/safety/report.ts`**

Structure mirrors the official paper form. Escape every user string with an `esc()` helper (`&<>"'` → entities). Layout: header title, project + date line, numbered topic list, worker table (`#`, name, id, signature cell with `sigSvg(sig, 120)`), declarations paragraph (`S.view_declares`), instructor block (name / qualification / `sigSvg`), inline styles only (mail clients ignore stylesheets) — table borders `1px solid #444`, `direction:rtl`, system font stack.

```ts
import type { Lang } from '../i18n'
import { S } from './i18n'
import type { SafetyFormRec } from './model'
import { sigSvg } from './signature'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function safetyFormHtml(f: SafetyFormRec, projectName: string, lang: Lang): string {
  const rows = f.workers.map((w, i) => `
    <tr>
      <td style="border:1px solid #444;padding:6px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #444;padding:6px">${esc(w.name)}</td>
      <td style="border:1px solid #444;padding:6px">${esc(w.id_number)}</td>
      <td style="border:1px solid #444;padding:4px;text-align:center">${sigSvg(w.signature, 120)}</td>
    </tr>`).join('')
  const topics = f.topics.map((t, i) => `<li>${i + 1}. ${esc(t)}</li>`).join('')
  return `
  <div dir="rtl" style="direction:rtl;font-family:Arial,'Segoe UI',sans-serif;color:#111;max-width:760px;margin:0 auto">
    <h2 style="text-align:center;margin:8px 0">טופס הדרכה יומי (Toolbox)</h2>
    <p><b>פרויקט:</b> ${esc(projectName)} &nbsp;&nbsp; <b>תאריך ההדרכה:</b> ${esc(f.training_date)}</p>
    <p style="margin-bottom:4px"><b>נושאי ההדרכה:</b></p>
    <ul style="list-style:none;padding:0;margin:0 0 14px;columns:2">${topics}</ul>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="border:1px solid #444;padding:6px;width:36px">מס'</th>
        <th style="border:1px solid #444;padding:6px">שם העובד</th>
        <th style="border:1px solid #444;padding:6px">תעודת זהות</th>
        <th style="border:1px solid #444;padding:6px;width:140px">חתימה</th>
      </tr>${rows}
    </table>
    <p style="margin:14px 0">${esc(S.view_declares[lang])}</p>
    <p>
      <b>שם המדריך:</b> ${esc(f.instructor_name)}<br/>
      <b>כשירות המדריך:</b> ${esc(f.instructor_qualification)}<br/>
      <b>חתימת המדריך:</b><br/>${sigSvg(f.instructor_signature, 160)}
    </p>
  </div>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/safety/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/safety/SafetyView.tsx`**

Follow `ReportView.tsx` exactly:

- Load form via `getSafetyForm(id)`; `projectName` from `useStore()`.
- Toolbar (`no-print`): back → `/safety`, edit (`canEdit('safety')`) → `/safety/${id}/edit`, delete (`canEdit('safety')`, `window.confirm(st(lang,'view_delete_confirm'))` → `deleteSafetyForm` → `/safety`), send (`view_send` → opens `SendMailDialog`), print (`window.print()`).
- Paper: `<div className="report-paper" dangerouslySetInnerHTML={{ __html: safetyFormHtml(form, projectName(form.project_id), lang) }} />`.
- Mail: `<SendMailDialog subject={`הדרכת בטיחות · ${projectName(form.project_id)} · ${form.training_date}`} html={`<!doctype html><html dir="rtl" lang="he"><body dir="rtl">${html}</body></html>`} onClose={…} onSent={() => {}} />`.

Wire route in `src/App.tsx`:

```tsx
import { SafetyView } from './safety/SafetyView'
```
```tsx
<Route path="safety/:id" element={<RequirePerm area="safety"><SafetyView /></RequirePerm>} />
```

- [ ] **Step 6: Typecheck + manual check**

`npx tsc -b`; dev server: open a saved form → official layout with signatures; print preview clean (toolbar hidden); send dialog opens.

- [ ] **Step 7: Commit**

```bash
git add src/safety/report.ts src/safety/report.test.ts src/safety/SafetyView.tsx src/App.tsx
git commit -m "feat(safety): form view in official layout with print and mail"
```

---

### Task 8: Admin topics screen

**Files:**
- Create: `src/safety/SafetyTopicsAdmin.tsx`
- Modify: `src/App.tsx`, `src/components/Shell.tsx`

**Interfaces:**
- Consumes: `fetchSafetyTopics`, `createSafetyTopic`, `updateSafetyTopic`, `reorderSafetyTopics` (Task 3).
- Produces: route `/admin/safety-topics` (admin-only).

- [ ] **Step 1: Implement the screen**

Follow the existing FormBuilder admin screens' conventions (`src/screens/admin/`): list of topics ordered by `sort_order`, each row: label (inline-editable text input, save on blur via `updateSafetyTopic`), active toggle, up/down arrows calling `reorderSafetyTopics` with the reordered id list. Bottom: `topics_add` input + button → `createSafetyTopic(label, (max sort_order) + 10)`. Deactivate rather than delete — old forms keep their labels regardless (topics are copied into `safety_forms.topics` at save time).

- [ ] **Step 2: Wire route + nav**

`src/App.tsx`:

```tsx
import { SafetyTopicsAdmin } from './safety/SafetyTopicsAdmin'
```
```tsx
<Route path="admin/safety-topics" element={<RequireAdmin><SafetyTopicsAdmin /></RequireAdmin>} />
```

`src/components/Shell.tsx`, admin group:

```tsx
...(isAdmin ? [{ to: '/admin/safety-topics', icon: '⛑', label: st(lang, 'nav_safety_topics') }] : []),
```

- [ ] **Step 3: Typecheck + manual check**

`npx tsc -b`; dev server as admin: rename a topic, toggle active, reorder, add one — new form screen reflects changes; an existing saved form still shows its original labels.

- [ ] **Step 4: Commit**

```bash
git add src/safety/SafetyTopicsAdmin.tsx src/App.tsx src/components/Shell.tsx
git commit -m "feat(safety): admin screen for briefing topics"
```

---

### Task 9: Verification pass + ship

**Files:** none new.

- [ ] **Step 1: Full test suite + build**

Run: `npx vitest run && npx tsc -b && npx vite build`
Expected: all green. Fix anything that is not.

- [ ] **Step 2: Permission sanity**

In dev server, verify with a non-admin member account (or by temporarily setting a `user_permissions` override `safety=none` for your own user, then deleting it): `safety=none` hides the nav item and `/safety` bounces; `edit` shows the new-form button. Also confirm ControlCenter/Dashboard/Digest are untouched by this feature (`git diff main --stat` shows no changes to those screens).

- [ ] **Step 3: Mobile manual check**

Use the phone-testing flow from `preview.html` (see memory: mobile layout lessons): signature pad — finger drawing works, page does not scroll during signing, rotate mid-signature does not crash, confirm disabled until ink exists.

- [ ] **Step 4: Push and verify deploy**

```bash
git push origin main
```

Commit author must be `sgreis7-png`. If the push classifier wrongly blocks, retry once; else hand to user ("run it"). Verify ship via live-bundle grep (memory: vercel-deploy-author-block), e.g. the string `sigpad__canvas` in the deployed JS/CSS bundle.
