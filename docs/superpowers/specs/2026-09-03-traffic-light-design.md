# דוח רמזור (Traffic Light) — Design

Date: 2026-09-03
Status: approved (user, this date)
Source: אפיון "דוח רמזור — בקרת פרויקטים" v0.1 (1.9.2026, אלון בלום). This spec covers
**Phase 1 (pilot)** of chapter 10: data foundations + screens 8.1–8.3 for the axes
time, supplies, crew, issues (בלת"מ) and the gray precondition. Customer axis and the
weekly PDF mail are Phase 2 and are out of scope here (the UI leaves room for them).

## Purpose

A weekly decision screen for the VP Operations: in 10 seconds which project needs
attention, in 30 seconds what the VP must do. Colors are derived from numeric
thresholds, never chosen by hand. Project color = worst axis. No report = gray, not
green. Every non-green color produces a task with an owner and a due date.

Audience: `admin` and `manager` roles only (new perm area `traffic_light`).

## Decisions taken during brainstorming

- Phase 1 only; customer axis shown as "not measured", PDF mail later.
- WBS categories come from a DB template table; the diary's fixed 9-task list is
  replaced by the template's 10 categories. Old entries keep their old names and are
  mapped for display and calculation.
- Crew: a new structured field (`crew_rows`) is added **next to** the existing free
  text `contractor` field; the old field stays.
- Issues (בלת"מ) register is fed **automatically** from diary entries.
- Supplies list is editable by holders of a new grantable perm area `deliveries`
  (purchasing / import staff who are neither managers nor admins).
- Tasks: weekly snapshot (Sunday 07:00) auto-creates tasks for non-green axes, plus a
  manual "task" button on every axis block. The screen itself is always live.
- Time axis reads the **existing** Gantt import (`gantt_charts` / `gantt_tasks`), no
  new importer.
- Forecast finish = a milestone whose name contains "מסירה סופית"; if none, the latest
  `finish_ts` in the active chart.
- All thresholds live in a settings table editable by admins (chapter 11 leaves them
  pending VP approval).
- Systemic (cross-project) issues are flagged manually by the PMO (`systemic` flag),
  not detected by text similarity.

## Data model — migration `0064_traffic_light.sql`

### `projects` (alter)

| column | type | notes |
|---|---|---|
| `contract_due_date` | date null | תאריך מסירה חוזי. Null ⇒ time axis red "אין תאריך חוזי". |
| `project_type` | text not null default 'coop' | Selects the WBS template. |

### `wbs_templates`

| column | type |
|---|---|
| `id` | uuid pk |
| `project_type` | text |
| `sort_order` | int |
| `name_he` | text |
| `name_en` | text |
| `critical` | bool default false |
| `active` | bool default true |

Unique (`project_type`, `name_he`). Seed for `coop` (spec 5.1), critical = rows 6–10:

| # | name_he | name_en | critical |
|---|---|---|---|
| 1 | עבודות עפר ובטון | Earthworks & concrete | |
| 2 | הקמת קונסטרוקציה (שלד) | Structure erection (frame) | |
| 3 | קורות בטון | Concrete beams | |
| 4 | כיסוי תקרה וחיפוי קירות | Ceiling & wall cladding | |
| 5 | כיסוי גג | Roof covering | |
| 6 | ציוד פנים | Interior equipment | ✓ |
| 7 | מערכות אקלים | Climate systems | ✓ |
| 8 | חשמל ובקרה | Electrical & controls | ✓ |
| 9 | מערכת זבל / ספק חוץ | Manure system / external supplier | ✓ |
| 10 | הרצה, גמרים ומסירה | Commissioning, finishes & handover | ✓ |

RLS: select for `is_member()`; write admin only.

Legacy diary task names map to template rows (used by `taskLabel`, the entry form
seed and the SQL function): הקמת קונס׳ (שלד)→2, גמר קורות בטון→3, כיסוי תקרה→4,
חיפוי קירות→4, כיסוי גג→5, ציוד פנים (אוכל, מים)→6, ציוד אקלים→7, חשמל ובקרה→8,
גמרים ומסירה→10 (English equivalents likewise). When two legacy rows map to one
category (4), the category pct is their mean. The map lives in `src/traffic/wbs.ts`
and is mirrored as a `case` list inside the SQL function; a vitest asserts both lists
agree (same pattern as `perms.sql.test.ts`).

### `project_contractors`

| column | type |
|---|---|
| `id` | uuid pk |
| `project_id` | uuid fk projects on delete cascade |
| `name` | text |
| `agreed_workers` | int check >= 0 |
| `critical` | bool default false |
| `active` | bool default true |

RLS: select `is_member()`; write admin or `can_edit('traffic_light')`.

### `project_deliveries`

| column | type |
|---|---|
| `id` | uuid pk |
| `project_id` | uuid fk cascade |
| `item` | text |
| `wbs_template_id` | uuid null fk wbs_templates |
| `need_date` | date |
| `status` | text check in ('not_ordered','ordered','shipped','on_site') default 'not_ordered' |
| `eta` | date null |
| `owner_email` | text null |
| `notes` | text null |
| `updated_at` | timestamptz |
| `updated_by` | text |

RLS: select `is_member()`; insert/update/delete admin or `can_edit('traffic_light')`
or `can_edit('deliveries')`.

### `issues` (מרשם בלת"מ)

| column | type |
|---|---|
| `id` | uuid pk |
| `project_id` | uuid fk cascade |
| `seq` | int — per-project running number, assigned by trigger |
| `entry_id` | uuid null fk entries on delete set null, unique |
| `opened_on` | date |
| `description` | text |
| `owner_kind` | text check in ('engineering','purchasing','customer','contractor','weather','other') |
| `owner_email` | text null |
| `due_date` | date null |
| `blocking` | bool default false |
| `wbs_template_id` | uuid null — category the issue blocks (PMO sets) |
| `systemic` | bool default false |
| `closed_on` | date null |
| `closure_note` | text null |
| `created_by` | text |
| `created_at` | timestamptz |

RLS: select `is_member()`; insert by any member (trigger path); update/close admin or
`can_edit('traffic_light')`; the entry author may edit `description`/`blocking` while
`closed_on is null` (same author-gate pattern as safety forms).

Trigger `entries_to_issue` (after insert/update on `entries`): when
`values->>'malfunction_dept'` is a real department, upsert one `issues` row keyed by
`entry_id` with `description = values->>'malfunction'`, `owner_kind` from the dept id,
`blocking = values->>'issue_blocking' in ('כן','yes','true')`, `opened_on = work_date`.
If the dept becomes "none" and the issue is still open and untouched by PMO
(`owner_email is null and due_date is null`), delete it.

Malfunction departments in `src/data.ts` change to the spec's closed list:
`engineering` הנדסה, `purchasing` רכש-הספקות, `customer` לקוח, `contractor` קבלן,
`weather` מזג אוויר, `other` אחר (plus `none`). `deptIdOf` keeps accepting the legacy
ids/labels and maps them: `logistics_warehouse`→`purchasing`, `contractors`→`contractor`,
`customers`→`customer`, `finance`→`other`. Migration updates the select's `options`
JSON on `field_definitions`.

### `work_tasks` (alter)

| column | type |
|---|---|
| `source` | text check in ('manual','traffic_light') default 'manual' |
| `axis` | text null check in ('time','supply','client','crew','issues','gray') |
| `closed_by` | text null |

Policy: closing (`status='done'`) a `traffic_light` task requires admin or
`can_edit('traffic_light')`; manual tasks keep today's rules.

### `traffic_light_settings` (single row, id = 1)

| column | default | spec |
|---|---|---|
| `time_amber_days` | 7 | forecast − contract ≤ 7 ⇒ green |
| `time_red_days` | 30 | > 30 ⇒ red |
| `lookahead_days` | 42 | 6-week window |
| `supply_red_window_days` | 21 | not ordered within 3 weeks ⇒ red |
| `supply_eta_margin_days` | 5 | ETA ≥ 5 days before need ⇒ green |
| `crew_green_pct` | 90 | |
| `crew_red_pct` | 70 | |
| `issue_open_days` | 7 | |
| `issue_block_resolve_days` | 14 | |
| `gray_missing_workdays` | 2 | |
| `gray_gantt_days` | 14 | |
| `crew_window_days` | 7 | rolling window for the crew average |

RLS: select `is_member()`; update admin only.

### `traffic_light_snapshots`

`id uuid, taken_at timestamptz, payload jsonb`. Written by the weekly job, readable
by `can_view('traffic_light')`.

### `entries` template (field_definitions)

| key | type | label_he | notes |
|---|---|---|---|
| `crew_rows` | json table (rendered like `progress_coops`) | כוח אדם | rows `{contractor, workers, hours}`; contractor picked from `project_contractors` of the entry's project; free text allowed when the project has no contractors. Sort 72 (after `contractor`). |
| `issue_blocking` | select כן/לא | הבלת"מ חוסם עבודה? | shown only when dept ≠ none; sort 88. |
| `arrived_items` | multi-select | הגיע לאתר | options = project deliveries whose status ≠ `on_site`; stored as JSON array of delivery ids. Sort 89. |

Trigger `entries_arrivals` (after insert/update): every id in `arrived_items` sets
`project_deliveries.status='on_site'`, `updated_by = entry author`.

`DEFAULT_TASKS` in `src/lib/reportTables.ts` is replaced by
`defaultProgressRows(lang, template)` reading `wbs_templates` for the project's type
(cached in the store like `field_definitions`). `taskLabel` resolves legacy names via
the map above.

### Permissions

`PERM_AREAS` gains `traffic_light` (label "דוח רמזור") and `deliveries` (label
"רשימת אספקות — עדכון סטטוס"). Defaults: `traffic_light` — admin edit, manager edit,
member none; `deliveries` — none for everyone (granted per user). `perm_defaults`
rows added in the migration; `perms.sql.test.ts` extended.

## Computation — SQL function `traffic_light(p_project uuid default null)`

`security definer`, executes as owner, callable by authenticated; returns
`jsonb` array, one element per active project (or the single project asked for).
Requires `can_view('traffic_light')` else raises. It is the single source of truth:
the live screen and the weekly job both call it.

Severity order: gray > red > amber > green > na. Project color = worst axis color;
gray overrides everything. `na` (not measured) never lowers a color.

### Gray (precondition)

- no `entries` row for the project on any of the last `gray_missing_workdays`
  work days (`is_work_day` logic on `projects.work_days`), **or**
- no active `gantt_charts` row, or its `imported_at` older than `gray_gantt_days`.

`gray_reason` says which.

### Time

- `contract = projects.contract_due_date`. Null ⇒ red, reason "אין תאריך חוזי במערכת".
- `forecast` = `finish_ts` of a milestone in the active chart whose name contains
  "מסירה סופית", else `max(finish_ts)` of the chart.
- `delta = forecast − contract` (days). ≤ `time_amber_days` green; ≤ `time_red_days`
  amber; else red. Contract date in the past and project not delivered ⇒ red.
- Categories: for each active `wbs_templates` row of the project's type, find a
  summary task (`is_summary`) in the chart whose normalized name equals the
  normalized `name_he` (trim, collapse spaces, strip Hebrew punctuation ׳״ and
  quotes). Category pct = mean of the matching rows across all coops of the
  **latest** entry (legacy names mapped). Rules:
  - planned finish passed and pct < 100 ⇒ amber;
  - critical category whose `start_ts` > `base_start_ts` ⇒ amber ("התחלה נדחתה");
  - critical category with an open blocking issue (`issues.wbs_template_id`) whose
    `due_date` is null or > today + `issue_block_resolve_days` ⇒ red;
  - categories not found in the chart are listed in `evidence.unmatched` (warning),
    no color.
- Axis color = worst of project-level and category-level. Evidence: the category
  table (planned start/finish, baseline, forecast, pct, color) + delta.

### Supply

Items with `need_date ≤ today + lookahead_days` and status ≠ `on_site`:
- `on_site`, or `eta ≤ need_date − supply_eta_margin_days` ⇒ green;
- `eta > need_date`, or no `eta` ⇒ amber;
- `need_date ≤ today + supply_red_window_days` and `not_ordered`, or `eta > need_date`
  on an item linked to a critical category ⇒ red.
No items in the window ⇒ green. No deliveries at all for the project ⇒ `na`.
Evidence: the window's items with gap = eta − need.

### Crew

Per active contractor, over the last `crew_window_days` calendar days, on work days
with an entry: `actual = mean(workers)` from `crew_rows` (rows matched by contractor
name, case/space-insensitive), `ratio = actual / agreed_workers`. A work day with an
entry and no row for the contractor counts as absence (0).
- every contractor ratio ≥ `crew_green_pct` ⇒ green;
- a contractor between red and green pct, or one absence day for a critical
  contractor ⇒ amber;
- critical contractor < `crew_red_pct`, or ≥ 2 absence days ⇒ red.
No contractors defined ⇒ `na`. Evidence: contractor, agreed, actual, ratio, absences,
plus the daily series for the last 28 days (for the 4-week chart).

### Issues

Open `issues` of the project:
- none open > `issue_open_days` and none blocking ⇒ green;
- open > `issue_open_days` with no `owner_email` **or** no `due_date` ⇒ amber;
- any `blocking`, or any `systemic` ⇒ red (systemic reason names the owner as
  "הנדסה — עדכון סטנדרט").
Evidence: seq, description, owner, days open, blocking, systemic.

### Client

Always `na` in Phase 1 with reason "שלב ב׳".

### Output per project

```json
{
  "project_id": "…", "name": "…", "manager": "…",
  "color": "red", "gray_reason": null,
  "axes": {
    "time":   { "color": "amber", "reason": "…", "evidence": { … } },
    "supply": { "color": "green", "reason": "…", "evidence": { … } },
    "client": { "color": "na",    "reason": "שלב ב׳" },
    "crew":   { "color": "na",    "reason": "לא הוגדרו קבלנים" },
    "issues": { "color": "red",   "reason": "…", "evidence": { … } }
  },
  "due": { "contract": "2026-11-30", "forecast": "2026-12-12", "delta_days": 12 },
  "last_entry_on": "2026-09-02", "gantt_imported_at": "2026-08-28T…",
  "action_line": "…"
}
```

`action_line` = the reason of the most severe axis (gray reason when gray; empty
when green). `manager` = the `manager_name` of the latest entry, falling back to
`projects.pmo`.

An `na` axis caused by missing setup data (no contractors, no deliveries) carries
`missing_data: true`; the weekly job turns it into a task on that axis titled
"להשלים נתונים: קבלנים" / "להשלים נתונים: אספקות" so the PMO sees the gap. The
`client` axis is `na` without `missing_data` and never yields a task in Phase 1.

### Weekly job

`traffic_light_weekly()` scheduled by pg_cron every Sunday 07:00 Asia/Jerusalem
(cron expression in UTC computed in the migration, same approach as
`0042_weekly_digest_cron.sql`):
1. `payload = traffic_light()`; insert into `traffic_light_snapshots`.
2. For each project and each axis whose color is not green (including gray and the
   `na`-with-missing-data case), if no open `work_tasks` row exists with the same
   `project_id`, `source='traffic_light'` and `axis` ⇒ insert one: `title = reason`,
   `assignee_email = null`, `due_date = null`, `created_by = 'system'`.
3. Insert a `notifications` row for every admin/manager: "דוח רמזור שבועי מוכן",
   link `/traffic?snapshot=<id>`.

## Screens

Route prefix `/traffic`, nav item "רמזור", visible when `can('traffic_light')`.
Visual design is produced with the frontend-design skill at implementation time; the
constraints below are functional.

### 8.1 Main screen `/traffic`

- One row per active project, sorted red → gray → amber → green (then by name).
- Row: project name + manager; big project circle; five small circles (time, supply,
  client, crew, issues; `na` = hollow circle); delivery delta as signed days
  (`+12`, `−23`, or "אין תאריך חוזי"); one action line (empty when green); last
  entry date (relative, red-tinted when it caused gray).
- Mobile: each row becomes a card with the same content.
- Header toggle: "חי" (default, calls `traffic_light()`) / snapshot picker listing
  `traffic_light_snapshots` by date. `?snapshot=<id>` deep link opens that snapshot.
- Click row ⇒ project screen.

### 8.2 Project screen `/traffic/:projectId`

Six blocks, each with its color, its reason sentence, and a "משימה" button that
opens the task dialog prefilled with project + axis:
1. זמן — category table: קטגוריה / מתוכנן (start–finish) / בייסליין / % ביומן / צבע.
   Critical rows emphasized. Unmatched categories listed as a warning. Delta line.
2. הספקות — 6-week window table: פריט / קטגוריה / תאריך צורך / סטטוס / ETA / פער.
3. לקוח — "שלב ב׳" placeholder.
4. כוח אדם — table קבלן / מוסכם / בפועל / יחס / היעדרויות + a 4-week daily bar
   chart per contractor (dataviz skill).
5. בלת"מ — open items: מספר / תיאור / אחראי / ימים פתוח / חוסם / מערכתי.
6. משימות — open `work_tasks` of the project: מה / מי / עד מתי.
Footer links: logbook filtered to this project and the last 7 days; the Gantt screen
for this project.

### 8.3 Tasks — extend `src/screens/Tasks.tsx`

- Filter chip "רמזור" (source), sort by assignee then due date, source badge and
  axis label on traffic-light tasks.
- Closing a traffic-light task requires `can_edit('traffic_light')`; the button is
  hidden otherwise. Closing records `closed_by`.

### PMO / admin screens

- Project edit (existing admin project form): contract due date, project type,
  contractors list (name, agreed workers, critical).
- Deliveries `/traffic/:projectId/deliveries`: table CRUD, editable for
  `traffic_light` edit or `deliveries` edit; others read-only. Status/ETA inline.
- Issues register `/traffic/:projectId/issues`: open/closed tabs; edit owner kind,
  owner email, due date, blocking, category, systemic; close with note.
- WBS templates (admin, under admin menu): per project type, reorder, rename,
  critical flag, activate/deactivate.
- Thresholds (admin): form over `traffic_light_settings`.

## Frontend structure

```
src/traffic/
  model.ts      types for the function output, severity order, worst()
  rules.ts      pure threshold→color rules (time, supply, crew, issues) in TS
  wbs.ts        legacy→template name map, name normalization
  api.ts        traffic_light RPC, snapshots, contractors, deliveries, issues, settings, templates
  i18n.ts       module strings
src/screens/traffic/
  TrafficBoard.tsx   8.1
  TrafficProject.tsx 8.2
  Deliveries.tsx, Issues.tsx, WbsTemplates.tsx, TrafficSettings.tsx
src/styles/traffic.css
```

`rules.ts` mirrors the SQL rules and is used to (a) unit-test the thresholds and
(b) recolor evidence rows client-side; it never replaces the RPC as the source of
color for the board.

## Error handling

- RPC failure ⇒ board shows the last snapshot (if any) with a banner "מציג סנאפשוט
  מ-DD.MM — החישוב החי נכשל"; otherwise the standard error state.
- Triggers on `entries` must never fail a save: wrapped in `exception when others`
  with `raise warning`.
- Offline: the traffic screens are online-only (managers on desktop); the entry form's
  new fields ride the existing IndexedDB draft/queue unchanged (they are plain
  `values` keys).

## Testing

- vitest `src/traffic/rules.test.ts`: every threshold row of chapter 4 as a case,
  boundary values (7/8, 30/31, 90/70, 5-day margin, 3/6-week windows).
- vitest `src/traffic/wbs.test.ts`: legacy→template mapping, normalization, and the
  SQL/TS list parity check (parses `0064_traffic_light.sql`).
- vitest `src/lib/perms.sql.test.ts`: new areas seeded with the right defaults.
- vitest `src/lib/reportTables.test.ts`: template-driven seeding, legacy label
  resolution.
- SQL, manual via Supabase MCP on a test project mirroring the spec's Kfar Yuval
  example (chapter 8.1): expect red overall, amber time, red issues, hollow client.
- Manual: member without the area cannot open `/traffic`; purchasing user with only
  `deliveries` can edit ETA and nothing else; weekly job run by hand creates tasks
  once and not twice.

## Out of scope (Phase 2+)

Customer commitments axis, weekly PDF mail, finance and quality axes, 16:00 reminder
(existing alert rules already cover missing entries), MS Project file rules of
chapter 6 (organizational, not software).
