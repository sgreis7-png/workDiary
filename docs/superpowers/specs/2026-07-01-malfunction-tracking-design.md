# Malfunction (בלת"מ) Tracking — Design

Date: 2026-07-01
Status: Approved design (pending spec review)

## Purpose

Let work-diary reports record an unplanned event ("בלת"מ" / malfunction): a free-text
description plus the department it relates to. Surface malfunctions in search, in the
exported/emailed report, on the dashboard, and in a dedicated stats view with charts
(counts by department, by project, over time).

## Core concept

- Every daily report carries a **department** field (`malfunction_dept`), a required
  dropdown that **defaults to "none"**. `none` means *no malfunction that day*.
- When a real department is chosen, a **free-text description** (`malfunction`) is
  **required**.
- A report "has a malfunction" ⟺ its department is not `none` (and not blank).
- The department dropdown is the single switch that drives counting everywhere.

## Data model

Reports already use a dynamic field system (`field_definitions` rows → `entries.values`
JSON). Malfunction is two new field definitions, so the entry form, entry detail, and PDF
export pick them up automatically.

New migration `supabase/migrations/0016_malfunction_fields.sql` seeds:

| key                | type      | label_he       | label_en          | required | sort_order |
|--------------------|-----------|----------------|-------------------|----------|------------|
| `malfunction_dept` | select    | `מחלקת בלת"מ`   | Malfunction dept. | true     | 86         |
| `malfunction`      | long_text | `בלת"מ`         | Malfunction       | false*   | 87         |

Placed just after `manager_notes` (85), before `site_photos` (90).

\* `malfunction` is not marked required in the DB; its requiredness is **conditional**
(only when a real department is selected) and enforced in the form (see below).

Department options (stored on the select def as `options` JSON, `{he,en}` pairs, in order):

| id (canonical)        | he                  | en                    |
|-----------------------|---------------------|-----------------------|
| `none`                | `אין`               | None                  |
| `logistics_warehouse` | `לוגיסטיקה ומחסן`   | Logistics & warehouse |
| `contractors`         | `קבלנים`            | Contractors           |
| `customers`           | `לקוחות`            | Customers             |
| `engineering`         | `הנדסה`             | Engineering           |
| `purchasing`          | `רכש`               | Purchasing            |
| `finance`             | `כספים`             | Finance               |
| `other`               | `אחר`               | Other                 |

### Localized-value normalization

Consistent with the existing `weather` field, the generic form stores the *localized
label* as the value (`o.he` for Hebrew UI, `o.en` for English). To keep counting/grouping
from splitting he/en buckets, add canonical helpers in `src/data.ts`:

```ts
export const MALFUNCTION_DEPT_KEY = 'malfunction_dept'
export const MALFUNCTION_TEXT_KEY = 'malfunction'

export interface MalfunctionDept { id: string; he: string; en: string }
export const MALFUNCTION_DEPTS: MalfunctionDept[] = [ /* table above, none first */ ]

/** Map a stored dept value (he OR en OR canonical id, any case; blank) to a canonical id.
 *  Unknown / blank → 'none'. */
export function deptIdOf(value: string | undefined): string

/** True when the entry records a real malfunction (dept id ≠ 'none'). */
export function hasMalfunction(values: Record<string, string>): boolean

/** Localized label for a canonical dept id, for the given lang. */
export function deptLabel(id: string, lang: 'he' | 'en'): string
```

`deptIdOf` matches case-insensitively against each dept's `he`, `en`, and `id`. Blank or
unmatched → `'none'` (fail-safe: a report never counts as a malfunction unless clearly one).

## Entry form (`src/screens/EntryForm.tsx`)

- **Default none:** when creating a new entry, initialize `values[malfunction_dept]` to the
  `none` label for the current language, so the dropdown shows "אין" selected by default.
  (Editing an existing entry uses its stored value unchanged.)
- The two fields render through the existing generic renderer (select + long_text). No
  special markup needed.
- **Conditional-required validation** in `save()`: after the existing required-field loop,
  add: if `deptIdOf(values[malfunction_dept]) !== 'none'` and `values[malfunction]` is
  blank → push `malfunction` into `errors`. This makes the description mandatory exactly
  when a real department is chosen, and never otherwise.

## Report / export (`src/report.ts`, `send-entry` edge fn, `report.test.ts`)

Reports already skip empty field values (`.trim()` filter in `buildReportHtml` /
`buildReportText`). Add one rule so a "none" report stays clean:

- When `deptIdOf(values.malfunction_dept) === 'none'`, skip **both** `malfunction_dept` and
  `malfunction` rows. So the בלת"מ block appears only when a malfunction exists.

Because the browser report (`src/report.ts`) and the Deno email twin
(`supabase/functions/send-entry/index.ts`) render near-identical templates and must stay in
sync, the same skip rule is applied in both. The edge function inlines the none-set check
(it can't import `src/data.ts` across the browser/Deno boundary).

`ExportView` (bulk date-range PDF) uses `buildReportHtml` and inherits this automatically.

`src/report.test.ts` gets cases: (a) dept `none` → neither field rendered; (b) real dept +
text → both rendered with the בלת"מ label.

## Search (`src/screens/Search.tsx`, `searchEntries` in `src/api.ts`)

- Add a **Malfunction** dropdown to the search bar with options:
  - All (no filter) · Only malfunctions · None · then one entry per real department.
- Extend `SearchFilters` in `src/data.ts` with `malfunction?: string` where the value is:
  `'' ` (all), `'any'` (any real malfunction), `'none'`, or a canonical dept id.
- Filtering is client-side in `searchEntries` (mirrors the existing free-text filter):
  - `any` → keep entries where `hasMalfunction(values)`
  - `none` → keep entries where `!hasMalfunction(values)`
  - a dept id → keep entries where `deptIdOf(values.malfunction_dept) === id`
- The existing free-text box already matches the malfunction description (it scans all
  values), so no change needed there.
- **Result rows** show a small בלת"מ badge with the department label when the entry has a
  malfunction.

## Dashboard card (`src/screens/Dashboard.tsx`, `dashboard_stats` RPC)

- Extend the `dashboard_stats()` SQL function (new migration
  `0017_dashboard_malfunctions.sql`, `create or replace`) to add:
  - `malfunctions_this_month` — count of entries this month whose `malfunction_dept` is a
    real department. Detection in SQL: `values->>'malfunction_dept'` is not null and, after
    lower/trim, not in the none-set `{'', 'none', 'אין'}`.
- Add `malfunctions_this_month?: number` to `DashboardStats` in `src/api.ts`.
- Add one stat card to the Dashboard ("בלת"מ החודש" / "Malfunctions this month"),
  `clickable` → navigates to `/malfunctions`. Tone `clay` when > 0.

## Malfunctions stats view (`src/screens/Malfunctions.tsx`)

New route `/malfunctions` (inside the authed `Shell`) + a nav item.

- **Filters:** project dropdown + from/to dates. Fetches via existing `searchEntries`
  (project + date range), then computes everything client-side over the returned entries —
  no extra RPC. Dataset is one company's daily reports; small enough for client aggregation.
- Only entries with `hasMalfunction(values)` are counted.
- **Charts** (reuse the existing hand-rolled CSS bar style from `Dashboard.tsx`; no chart
  library):
  1. **Total** malfunctions in range (stat number).
  2. **By department** — horizontal bars, grouped by `deptIdOf`, labelled per language.
  3. **By project** — horizontal bars, grouped by `project_id` (reuse `projectColor` /
     `projectName`).
  4. **Over time** — per-date vertical mini-bars (grouped by `work_date`), giving the
     "malfunctions per dates" timeline.
- A list of the matching malfunction entries (date · project · dept badge · description
  snippet), each row links to `/entry/:id`.

## Wiring

- `src/App.tsx`: add `<Route path="malfunctions" element={<Malfunctions />} />` and import.
- `src/components/Shell.tsx`: add `<NavItem to="/malfunctions" ... label={t('nav_malfunctions')} />`.
- `src/i18n.tsx`: add keys — `nav_malfunctions`, view title/labels, search filter label +
  option labels, dashboard card label. Both `he` and `en`.

## Out of scope

- No chart/graphing library (CSS bars only).
- No change to the entry list / calendar screens.
- Historical entries created before this change have no `malfunction_dept`; `deptIdOf`
  treats them as `none` (not a malfunction) — correct by default.

## Touch points summary

| File | Change |
|---|---|
| `supabase/migrations/0016_malfunction_fields.sql` | new — seed two field defs |
| `supabase/migrations/0017_dashboard_malfunctions.sql` | new — extend `dashboard_stats()` |
| `src/data.ts` | dept constants + helpers; extend `SearchFilters` |
| `src/screens/EntryForm.tsx` | default none; conditional-required validation |
| `src/report.ts` | skip malfunction fields when dept none |
| `supabase/functions/send-entry/index.ts` | same skip rule (Deno twin) |
| `src/report.test.ts` | tests for skip / render |
| `src/screens/Search.tsx` | malfunction filter dropdown + result badge |
| `src/api.ts` | `searchEntries` malfunction filter; `DashboardStats` field |
| `src/screens/Dashboard.tsx` | malfunction stat card |
| `src/screens/Malfunctions.tsx` | new — filters + charts + list |
| `src/App.tsx` | route |
| `src/components/Shell.tsx` | nav item |
| `src/i18n.tsx` | new strings (he/en) |

## Testing

- Unit: `deptIdOf` (he/en/id/blank/unknown → canonical), `hasMalfunction`, report
  skip/render (`report.test.ts`), search filter logic where feasible.
- Manual: create entry with each default/real dept; verify conditional-required text;
  verify report shows בלת"מ only when present; verify search filter + badge; verify
  dashboard card count and click-through; verify Malfunctions view charts across a date
  range and per project.
