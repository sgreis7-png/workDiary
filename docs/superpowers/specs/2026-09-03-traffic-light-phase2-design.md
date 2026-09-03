# דוח רמזור — שלב ב׳: ציר לקוח + דוח שבועי אוטומטי

Date: 2026-09-03
Status: approved (user, this date)
Follows: `2026-09-03-traffic-light-design.md` (phase 1, live in production since this date)

## Purpose

Phase 1 shipped four measured axes and a gray "not reporting" state. Two things the
original specification asked for were deliberately deferred, and this spec covers both:

1. **The customer axis** — the fifth circle on the board, currently drawn hollow
   ("not measured"). Customer commitments (site infrastructure, permits, access,
   drawing approvals, payment milestones) are the delays a contractor cannot fix by
   working harder, and they are the ones that must be documented in writing to protect
   an extension-of-time claim.
2. **The weekly report by mail** — Sunday morning, automatically, replacing the manual
   email the VP's office sends today.

Out of scope, as in phase 1: the finance and quality axes (they need input from the
finance department and the quality-gate tool), and the MS Project file rules of the
original chapter 6, which are an organisational obligation rather than software.

## Decisions taken during brainstorming

- The weekly report is a **fully automatic HTML email**, not a semi-manual send. The
  app's per-entry reports go out from the sender's own Outlook mailbox, which needs a
  browser and a login popup — a cron job cannot use it. Resend already runs server-side
  for password resets on a verified domain, so the weekly report uses that path. Anyone
  who wants a PDF prints the mail.
- **The PMO enters customer commitments; the project manager updates them.** A work
  manager on site is the person who knows the customer finished the electrical
  infrastructure, so write access includes `is_project_manager(project_id)`, which
  migration 0050 already defines.
- **The written notice to the customer is tracked as data**, not left to a task anyone
  can close. Two fields on the commitment record when the notice went out and under what
  reference. This is the contractual protection the original specification calls for, so
  it is enforced by the data rather than by a checkbox.
- Scope is these two features only.

## Part A — the customer axis

### Data model

Migration `0071_customer_commitments.sql`.

`customer_commitments`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `project_id` | uuid not null → projects on delete cascade | |
| `item` | text not null | e.g. "תשתיות חשמל לאתר" |
| `kind` | text not null default 'other' | check in `infrastructure`, `permit`, `access`, `plan_approval`, `payment_milestone`, `other` |
| `due_date` | date not null | the date agreed with the customer |
| `status` | text not null default 'open' | check in `open`, `confirmed`, `done`. `confirmed` means the customer confirmed **in writing** that it is coming; `done` means it happened |
| `confirmation_ref` | text | the reference for that confirmation (mail subject, letter number) |
| `blocking` | boolean not null default false | does our work stop without it |
| `notice_sent_on` | date | when we sent the customer the written delay notice |
| `notice_ref` | text | its reference |
| `notes` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `updated_by` | text | |

Index on `(project_id, due_date)`.

RLS, following the module's existing shape:

- select: `is_member()` — the drill-down and the diary context need it, and the data is
  no more sensitive than the deliveries list.
- insert / update: `is_admin() or can_edit('traffic_light') or is_project_manager(project_id)`.
- delete: `is_admin() or can_edit('traffic_light')` — a project manager corrects a
  commitment, the PMO removes one.

New threshold in `traffic_light_settings`: `client_window_days int not null default 14`,
the look-ahead for this axis. It appears in the thresholds admin screen with the others.

### Colour rules

Evaluated in `tl_client(p projects, s traffic_light_settings, today date)`, replacing the
phase-1 stub that returns `na`.

| colour | condition |
|---|---|
| green | no `open` commitment due within `client_window_days`, or every one of them is `confirmed`/`done` |
| amber | an `open` commitment due within the window with no written confirmation |
| red | `due_date` passed, status is not `done`, and `blocking` is true |

Worst wins, as everywhere else. A project with no commitments recorded returns `na` with
`missing_data: true`, so the weekly job raises "להשלים נתונים: התחייבויות לקוח" exactly
as it does for contractors and deliveries.

**The written-notice rule.** When the axis is red, the reason names the blocking item and
states whether the notice went out: if no red item has a `notice_sent_on` within the last
7 days, the reason is "נדרשת הודעה כתובה ללקוח" and that becomes the weekly task's title.
Once the notice is recorded the axis stays red — the work is still blocked — but the
reason changes to name the notice and its date. The colour tracks reality; the reason
tracks what the VP still has to do.

Evidence returned for the drill-down block: every commitment in the window plus every
overdue one, with item, kind, due date, status, days late, blocking, and the notice
fields.

### Screen

`/traffic/:projectId/customer`, built like `Deliveries.tsx` and `Issues.tsx` — an editable
table, inline saves on blur that skip a write when nothing changed, errors surfaced rather
than swallowed, `data-label` on every cell for the phone card layout. Reached from the
customer block in the project drill-down, which stops being a placeholder.

The client axis block in `TrafficProject.tsx` gains its evidence table, matching the other
four.

## Part B — the weekly report by mail

### Delivery path

Migration `0072_weekly_report_mail.sql` plus a new edge function `weekly-report`.

`traffic_light_weekly()` already runs on Sunday, writes the snapshot and opens the tasks.
It gains a final step: a `pg_net` POST to the edge function, carrying the snapshot id and
a shared secret read from `supabase_vault`. `pg_net` is available on the project and gets
enabled by the migration; `pg_cron` and `vault` are already installed.

The secret lives in the vault, never in the migration text or the repository. The edge
function rejects any request whose header does not match it, so the endpoint being public
is not a way in.

The function reads the snapshot with the service-role key, renders the HTML, and sends it
through Resend using the existing `RESEND_API_KEY` / `RESEND_FROM` environment variables.

### Recipients

Every active admin and manager from `allowed_emails`, plus `extra_report_emails text[]` on
`traffic_light_settings` for people who do not use the app — the VP, the CEO, the meeting's
attendees. Editable in the thresholds admin screen.

### Content

Hebrew, RTL, print-friendly, in the visual language of the existing entry report
(`src/report.ts`), which is table-based HTML with inline styles because mail clients ignore
stylesheets:

1. The board — a row per project, sorted red, gray, amber, green: name, manager, the
   project colour, the five axis colours, the delivery delta, and the action line.
2. A block per non-green project: each axis with its colour, its reason and the key rows
   of its evidence.
3. The open traffic-light tasks, grouped by assignee, with due dates.

The renderer is a pure function so it can be unit-tested from a fixed payload without a
mail server: given a report payload, the HTML contains this project, this reason, this
task. It lives in the edge function and is exercised by a vitest against the same fixture
shape `traffic_light()` returns.

### Failure visibility

`report_mail_log`: `id`, `snapshot_id`, `sent_at`, `recipient_count`, `http_status`,
`error`. `pg_net` is asynchronous, so the migration records the request id and a small
follow-up reads `net._http_response` into the log. The thresholds admin screen shows the
last line: when the report went out, to how many people, and the error if it failed.
Without it a silent send failure is only noticed when somebody asks why no mail arrived.

### Timing

The existing schedule stays: `0 4 * * 0`, which is 07:00 Israel in summer and 06:00 in
winter. Splitting it into two seasonal schedules is not worth the complexity for a report
people read over the morning coffee.

## Error handling

- A failed mail never affects the snapshot or the tasks: the POST is the last step of
  `traffic_light_weekly()`, and `pg_net` is fire-and-forget by design.
- The edge function returns a non-2xx on a bad secret, a missing snapshot or a Resend
  failure, and every case lands in `report_mail_log`.
- The customer screen behaves like its siblings when the fetch fails: the error shows and
  the screen stays usable.

## Testing

- vitest on the colour rules for the customer axis in `src/traffic/rules.ts`, with the
  boundaries pinned: a commitment due exactly on the window edge, an overdue non-blocking
  one (amber, not red), an overdue blocking one with and without a recent notice.
- vitest on the mail renderer: a payload with one red and one green project produces HTML
  naming the red project's reason and omitting nothing required; an empty task list does
  not render an empty section.
- SQL parity: the same TS/SQL boundary check the phase-1 rules got.
- Manual, against the live project once applied: enter one overdue blocking commitment on
  a pilot project and confirm the axis turns red and names the missing notice; record a
  notice and confirm the reason changes while the colour holds.

## What phase 1 taught, applied here

`traffic_light()` failed on first contact with real data for two plpgsql reasons that no
amount of reading caught: a local variable qualified with the function name, and a bare
string concatenated onto a `text[]`. Both were fixed in `0069`. The new `tl_client` must
avoid the same two shapes: name locals so they cannot collide with a column of any table
the function queries, and cast every literal appended to an array. Apply the migration to
the live project and run the function before calling the work finished.
