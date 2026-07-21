# Prefill, Coop Management, Clean Export, and Alerts — Design

Date: 2026-07-21
Status: approved (user, this date)

Five features across the work-diary and defects modules. All reuse existing patterns: `user_permissions` areas, `notifications` + `push_subscriptions` + `send-push`, pg_cron SQL functions, and the dynamic `field_definitions` entry form.

## 1. "שמור נתונים" prefill checkbox (work diary)

**Goal:** returning workers stop re-typing name/phone/location on every new entry.

- New table `user_prefill (email text primary key, name text, phone text, updated_at timestamptz)`. RLS: a user selects/upserts only their own row (`auth.jwt()->>'email' = email`).
- `EntryForm` (new-entry mode only):
  - Checkbox "שמור נתונים לפעם הבאה" rendered near the save button. Checked by default when a `user_prefill` row already exists for the user; unchecked otherwise.
  - On successful save with the checkbox checked: upsert `user_prefill` with the entry's `manager_name` and `phone` values. Unchecked: do nothing (existing saved row is kept, not deleted).
  - On mount (new entry, no draft restored): fetch the user's `user_prefill` row and pre-fill `manager_name` and `phone` if those fields are empty.
  - On project selection: pre-fill `site_location` from `lastEntryForProject(project).values.site_location`, only if the field is currently empty. Changing project when the user already typed a location does not overwrite it.
  - Draft restore (IndexedDB) takes precedence: if a draft exists, prefill is skipped entirely.
- Offline: prefill fetch is best-effort (wrapped, silent failure); the form works as today when offline.

## 2. Coop delete/edit with grantable permission (defects)

**Goal:** admins/managers can delete or edit coops; workers only if granted.

- New `PermArea` `'coops_manage'` (label "ניהול לולים — עריכה ומחיקה") added to `PERM_AREAS` in `src/lib/perms.ts`. `MEMBER_DEFAULTS.coops_manage = 'none'`; admins resolve to `'edit'` automatically (existing `resolvePerm`). The existing `PermissionsDialog` in admin Users screen picks it up with zero UI changes (it loops `PERM_AREAS`).
- `Coops.tsx` list: delete button (🗑) per coop, visible only when `canEdit('coops_manage')`. Confirmation dialog text: "למחוק את הלול? כל הליקויים, הצ'קליסטים והחתימות שלו יימחקו." Calls existing `deleteCoop` (`src/defects/api.ts:91`) then removes from local state (optimistic, same pattern as `removeDefect`).
- `CoopView.tsx`: coop metadata editing (the fields saved via `updateCoop`) re-gated from `canEdit('defects')` to `canEdit('coops_manage')`. Defect reporting, checklist statuses, photos, and signatures remain gated by `canEdit('defects')` as today. A delete button also appears in CoopView header under the same permission + confirmation.
- DB: verify child tables (`coop_defects`, `coop_checklist_items`, `coop_responsibilities`, `coop_signatures`, `coop_concessions`, `defect_photos`) cascade on coop delete; add a migration with `on delete cascade` FK fixes if any is missing.

## 3. Report export — only filled content

**Goal:** exported defect report (print/copy/email — all use `buildCoopReportHtml`/`buildCoopReportText`) contains only filled data. Everything empty is dropped.

In `src/defects/report.ts`:
- Meta rows: drop any row whose value is null/empty (currently rendered as `—`).
- Responsibility matrix: drop rows where responsibility, external, and notes are all empty; drop the whole section (including heading) if no rows remain.
- Gate summary table: drop rows for gates with zero answered items; drop section if empty.
- Per-gate detail sections: drop items with no status, no note, no severity, and no external-by (i.e. untouched "טרם" items). Drop an entire gate section when it has no filled items AND no signatures. Unsigned signature blocks ("— טרם נחתם —") are dropped; a gate keeps only actual signatures.
- Defect log: unchanged (already collapses to "אין ליקויים רשומים." — keep that message).
- Empty free-text cells inside kept rows stay as blank cells (a kept row keeps its column structure).
- `buildCoopReportText` follows the same rules.

## 4. New-record notifications (both modules)

**Goal:** the moment a worker submits a record, admins + everyone linked to that project know.

- No new edge function needed: `notifications` insert is open to authenticated users (`insert_notifs_authed`, 0025:128) and push goes through the existing deployed `send-push` function. Fan-out runs client-side in a new helper `notifyNewRecord(kind, projectId, title, body, link)` (in `src/lib/` or `src/api.ts`):
  - Recipients = `admin_emails()` RPC (new tiny security-definer SQL function reading `allowed_emails where role='admin' and active`, exposed to authenticated — same pattern as `is_admin()`) + `useStore().assignments[projectId]` + owners of `alert_rules` kind `filled` matching the project (feature 5, readable via a second RPC `filled_rule_emails(project_id)`), minus the author; deduplicated.
  - Inserts `notifications` rows and calls existing `sendPush(emails, ...)`.
- Client triggers (fire-and-forget, never blocks save):
  - After `createEntry` succeeds (`src/api.ts`): "רשומה חדשה ביומן עבודה — [project]" linking to the entry. Also fires when the offline queue flushes (queue path ends in the same `createEntry`).
  - After `createDefect` succeeds (`src/defects/api.ts`): "ליקוי חדש — [project] · [coop]" linking to the coop.

## 5. Personal alert rules (record tracking)

**Goal:** admins/managers define their own monitoring rules, e.g. "no work-diary entry for project X by 20:00 → alert me".

- New table `alert_rules`:
  `id uuid pk, email text, project_id uuid null (null = all projects), kind text check in ('missing','filled'), frequency text check in ('daily','weekly','monthly'), alert_hour int (0-23), weekday int null (0-6, weekly), month_day int null (1-31, monthly), active bool default true, last_fired_at timestamptz null, created_at`.
  RLS: owner-only select/insert/update/delete (`auth.jwt()->>'email' = email`).
- Semantics:
  - `missing` + daily: at `alert_hour` each day, alert if the project has no `entries` row with `work_date = today`.
  - `missing` + weekly: at `alert_hour` on `weekday`, alert if no entry in the last 7 days.
  - `missing` + monthly: at `alert_hour` on `month_day`, alert if no entry this calendar month.
  - `project_id null` = one alert per project that is missing (active projects only).
  - `filled`: no scheduled check — the rule subscribes its owner to feature 4's new-record fan-out for the chosen project(s).
- Engine: SQL function `check_alert_rules()` scheduled by pg_cron **hourly** (`0 * * * *`), same pattern as `notify_due_dates()` (0025). Fires rules whose `alert_hour` matches the current hour in Asia/Jerusalem and whose frequency/date matches; inserts `notifications` rows ("לא מולאה רשומת יומן עבודה — [project]", link to new-entry) and sets `last_fired_at` (guard against double-fire within the same hour). Web push for cron alerts: in-app `notifications` rows only, matching current due-date behavior (`notify_due_dates` also does not push). Users with the PWA/APK still see these as unread notifications in-app; adding pg_net push delivery is a possible later enhancement, out of scope now.
- UI: new screen `src/screens/AlertRules.tsx` ("כללי התראות"), reached from the user menu. Lists my rules; add-rule form: project (or "כל הפרויקטים"), kind (חסרה רשומה / כשממלאים), frequency, hour, weekday/month-day when relevant; delete + active toggle per rule. Access gated by: `isAdmin || can('alert_rules')` — new `PermArea` `'alert_rules'` (label "כללי התראות", member default `'none'`) so admins can grant it to specific workers via the existing dialog.

## Error handling

- All notification sends are fire-and-forget with caught errors — a failed push never fails a save.
- Prefill fetch/upsert failures are silent (console only).
- Coop delete shows the standard error toast on failure and does not remove the row locally.

## Testing

- Vitest: report builder — filled/empty filtering cases (meta rows dropped, untouched checklist items dropped, gate with no content dropped, defect log message kept). Prefill logic — helper functions (choose-prefill precedence: draft > saved > empty) as pure units.
- Manual: permission gating (member without/with `coops_manage`), coop delete cascade, alert-rule firing (SQL function invoked manually with a test rule), new-record push on second device.

## 6. Voice dictation everywhere (added mid-implementation by user)

Every free-text field gets the existing `MicButton` speech-to-text: all entry-form text/phone fields (name, phone, contractor, equipment, location — alongside its GPS button), defects checklist notes/external-by, defect log description/assignee/closure, project-open fields and responsibilities (shared `TextCell` component), concession dialog, signature names, coop create, defect search.

## 7. "דווח" feedback button (added mid-implementation by user)

Sidebar button opens a modal: kind (🐞 problem / 💡 request), free text (with mic), optional image/screenshot. Stored in new `feedback_reports` table (migration 0027; reporter email+profile name attached; screenshot in the private `photos` bucket under `feedback/`). All admins get an in-app notification + web push linking to a new admin screen `/admin/feedback` (list, view screenshot, mark done, delete). RLS: reporters insert/see their own, admins see/manage all.

## Out of scope

Digest/summary emails, per-defect-severity rules, quiet hours, iOS push.
