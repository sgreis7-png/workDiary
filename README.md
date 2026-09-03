# Agrotop Work Diary (יומן עבודה)

A Hebrew-first, mobile-first **field work-diary** PWA for Agrotop. Work managers
("מנהל עבודה") log a daily entry per project from the field — weather, site
location, crew, daily progress, equipment, notes, and site photos — directly from
their phone, even with no signal. Entries become clean, branded reports that can
be printed to PDF, copied, or emailed to clients and stakeholders. Admins manage
projects, the entry form template, workers, and distribution lists; a dashboard and
month calendar give managers an at-a-glance view of activity across all projects.

The product replaces paper/WhatsApp field reporting with a single auditable,
searchable record that looks professional when it reaches a client.

---

## Features

- **Daily entries** — per-project diary with a fully admin-configurable field
  template (text, long text, number, date, phone, select, photo). Voice dictation
  (mic) and one-tap GPS capture for site location.
- **Photos** — multiple site photos per entry, stored in a private bucket; full-
  screen lightbox viewer (zoom / swipe) in the app and in reports.
- **Reports** — print-optimized, branded report per entry: save as PDF (works on
  phones), copy (rich HTML + plain text), or email.
- **Email delivery** — send a report straight from the user's own Outlook mailbox
  (MSAL popup + Microsoft Graph `Mail.Send`), to mailing lists and/or addresses
  picked from the company directory. A copy lands in the sender's Sent Items.
- **Bulk export** — filter by project, worker, and date range (all combinable) and
  render every matching entry for client billing / handover.
- **Calendar** — month grid (Israeli Sun–Thu work week by default, Fri/Sat toggle),
  per-project color legend, server-scoped to the visible month.
- **Dashboard** — totals (all-time / month / week), active projects, field photos,
  unsent reports, stale-project alerts, entries per project, by-worker and by-
  weather breakdowns. Aggregated server-side (no full-table fetch).
- **Projects** — admin CRUD with priority, budget, location, dates; per-user
  personal priority ordering; worker assignment from the authorized-worker list.
- **In-app notifications** — workers are notified when assigned to a project;
  clicking the notification deep-links to that project.
- **Offline-first** — entries written offline are queued in IndexedDB and auto-sync
  on reconnect; last-seen data is viewable offline.
- **Bilingual** — Hebrew (RTL) and English (LTR), live toggle.
- **Installable PWA** — home-screen install, service-worker precache, auto-update.
- **Traffic-light report (רמזור)** — managers/admins: one row per project, color = worst of
  time / supplies / crew / issues (thresholds admin-editable), gray when the site stops
  reporting; project drill-down with the evidence; weekly snapshot that opens tasks.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript, Vite 5, React Router 6 |
| Animation | Framer Motion |
| Styling | Hand-authored CSS (design tokens), no UI framework |
| Offline | `idb-keyval` (IndexedDB write queue) + `vite-plugin-pwa` (Workbox) |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions (Deno) |
| Email | Microsoft Graph from the user's mailbox (reports); Resend (password reset) |
| Hosting | Vercel (static SPA) |

Fonts: Frank Ruhl Libre (display, Hebrew serif), Assistant (body), JetBrains Mono
(data/labels).

---

## Architecture

**Single-page app** served as static assets from Vercel. All data access goes
directly to Supabase from the browser using the **anon key**, with **Row-Level
Security (RLS)** enforcing every rule in the database — the client is never trusted.

Privileged operations that must not run with a user token are isolated in **Supabase
Edge Functions** (Deno) that hold the service-role key server-side:

- `register` — completes allowlist-gated signup.
- `invite` — admin invites / authorizes a worker email.
- `reset-password` — mails a recovery link; rate-limited, and answers identically
  for unknown addresses so it cannot be used to enumerate accounts.
- `send-push` — web-push fan-out.
- `delete-user` — admin removes a user (auth + profile).

Report email does **not** go through an edge function: the browser sends it via
Microsoft Graph using the signed-in user's own mailbox, so no server-side mail
credentials or second copy of the report template exist.

**Offline write path:** an entry saved without connectivity is serialized to an
IndexedDB queue; a sync hook drains the queue and replays the writes to Supabase
when the connection returns, then refreshes local state.

**Dashboard/calendar scaling:** aggregation runs in a Postgres function
(`dashboard_stats()`), and the calendar fetches only the visible month — the client
never downloads the full entries table.

### Data model (Postgres)

| Table | Purpose |
|---|---|
| `profiles` | user role (`member` / `admin`), 1:1 with `auth.users` |
| `projects` | project records (name, active, priority, budget, location, dates) |
| `field_definitions` | the configurable entry-form template |
| `entries` | one diary entry (`values` JSONB), indexed by date/project + GIN on values |
| `entry_photos` | photo storage paths per entry |
| `project_assignments` | which workers are assigned to which project |
| `project_priorities` | per-user personal priority ordering |
| `distribution_lists` / `list_recipients` | email recipient lists (owner-scoped) |
| `notifications` | in-app notifications (assignment, etc.) |
| allowlist + rate-limit tables | authorized signup emails; action rate limiting |
| `wbs_templates` | per-project-type WBS category rows (name, order, critical) for the time axis |
| `project_contractors` | contractors on a project with an agreed headcount, for the crew axis |
| `project_deliveries` | ordered items with a need date and status, for the supply axis |
| `issues` | issues register (מרשם בלת"מ) fed by diary malfunction fields |
| `traffic_light_settings` | admin-editable thresholds the `traffic_light()` function reads |
| `traffic_light_snapshots` | weekly snapshot payloads shown in the board's history picker |

> **Pending migrations.** `0064_traffic_light_schema.sql` and `0065_traffic_light_fn.sql`
> have not yet been applied to the Supabase project. Until they are, the traffic-light
> screens will show an error. Apply them from the Supabase **SQL Editor** (paste each
> file) or via `supabase db push`, in order.

---

## Security

- **RLS on every table.** Reads/writes are gated by Postgres policies, not the
  client. Admin-only writes go through the `is_admin()` security-definer function.
- **Allowlist-gated signup.** Only pre-authorized emails (added by an admin) can
  create an account; signup is finalized by the `register` edge function.
- **Least privilege in the browser.** The frontend only ever uses the anon key.
  The service-role key exists *only* inside edge functions (server-side env), never
  shipped to the client.
- **Scoped distribution lists.** Lists and recipients are readable/writable only by
  their owner or an admin (hardened in migration `0009`).
- **Rate limiting.** Sensitive actions (e.g. sending email) are throttled via an
  `rl_check` RPC (e.g. 30 sends/hour/user) enforced inside the edge function.
- **Membership is enforced in the database.** `is_member()` (allowlist + `active`)
  gates every broad policy, so an account that never passed `register` — or one an
  admin deactivated — cannot read or write company data even with a valid token.
- **Private photo storage, path-scoped.** The `photos` bucket is **not public**, and
  policies are scoped per prefix: users may delete only their own entries' photos
  and their own avatar, feedback screenshots are admin-only, and gate signatures
  cannot be deleted by members at all.
- **HTML escaping.** All user-supplied values are escaped before being placed into
  report/email HTML.
- **Report email leaves from the sender's own mailbox** via Microsoft Graph, so the
  app holds no mail credentials and the message is auditable in their Sent Items.

## Privacy

- **What is stored:** diary field values (free text the user enters), project
  metadata, work dates, the authoring user's id, site photos, chat messages,
  handwritten gate signatures, and avatars. No analytics or third-party trackers
  are bundled.
- **Who can see it:** active allowlisted users, to the extent their per-area
  permission allows. Since `0045` those areas are enforced by RLS and not only by the
  router, so removing someone's access to the diary or to defect management actually
  denies the data rather than hiding the tab. An author can always read their own
  entries. Reports and emails go only to recipients the sender explicitly chooses.
- **The staff roster** (`allowed_emails` — addresses, roles, account state) is
  readable by admins only. Screens that need to put colleagues in a picker get names
  and addresses from `member_directory()` instead.
- **Photos** live in a private bucket and are surfaced only through short-lived
  (1 hour) signed URLs.
- **Outbound data — the full list of third parties that can see user content:**
  Microsoft Graph (report emails, sent from the user's own mailbox), Resend
  (password-reset mails only — no diary content), the browser's push service
  (notification titles/bodies), OpenStreetMap Nominatim (GPS coordinates, sent for
  reverse geocoding when the user taps the location button), and the **MPXJ
  converter** in `services/mpp-converter` (receives a complete Microsoft Project
  schedule when an admin imports one — it verifies the caller's own Supabase token,
  holds no service-role key, converts in a temporary file and deletes it; it stores
  nothing, but the file passes through whatever host it is deployed on). Google Fonts
  is requested at page load and therefore sees the visitor's IP.
- **Deletion:** deleting an entry removes its photo rows *and* the stored image files;
  deleting a project does the same for every entry it holds. Until `0049` the project case
  only removed the database rows and left every image in the bucket — production had one
  such orphan when this was corrected. The row is always deleted before the files, so a
  failure leaves unreferenced bytes rather than a diary entry with missing images. Admins
  can also delete users.
- **On this device:** queued offline writes and cached rows live in IndexedDB and the
  service-worker cache. Each queued write records who made it and can only ever be
  sent by that person, so a shared phone cannot file one worker's report under
  another's name. Writes queued before that field existed carry no name; they are
  still sent on a phone only one account has ever signed in on, and held back on one
  where a second has, because there nothing identifies whose they are. Signing out clears the drafts, the QC cache and the cached
  authenticated responses; queued writes are kept, because deleting somebody's
  unsynced report to protect it from a colleague is the worse trade. Cached rows
  expire after 10 minutes.

---

## Code structure

```
src/
  api.ts              All Supabase data access (queries, RPCs, edge-fn calls)
  data.ts             Shared types + helpers (SearchFilters, groupByDate, colors)
  store.tsx           Reference-data cache (projects, field defs, user names)
  auth.tsx            Auth context (session, role, sign in/out)
  i18n.tsx            HE/EN strings + MONTHS/WEEKDAYS
  report.ts           Pure report HTML/text builder (shared shape with email fn)
  App.tsx             Routes
  components/         Shell (nav), ui (Button/Field/Tag...), Lightbox, Notifications,
                      MicButton, Loader, ErrorBoundary, Logo
  screens/            Logbook, EntryForm, EntryDetail, ReportView, ExportView,
                      Calendar, Dashboard, Search, Lists, Account, Login, SetPassword
  screens/admin/      Projects, Users, FormBuilder
  gantt/              Schedule module: model (dates, dependencies, roll-up), api, i18n
  lib/                supabase client, offline queue, useOfflineSync, geo
  styles/             tokens.css, global.css, components.css

supabase/
  migrations/         Ordered SQL (schema, RLS, features). 0001 = schema/RLS.
  functions/          Edge functions: register, invite, send-entry, delete-user

services/
  mpp-converter/      Microsoft Project (.mpp) -> JSON, MPXJ on a JVM. See its README.
```

### Local development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  (production build)
npm test           # vitest
```

Required client env (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Importing `.mpp` schedules also needs `VITE_MPP_CONVERTER_URL`, pointing at the
`/convert` endpoint of `services/mpp-converter`.

### Database migrations

SQL in `supabase/migrations/` is ordered and append-only. Apply a new migration via
the Supabase **SQL Editor** (paste the file) or the CLI:

```bash
supabase db push
```

Edge-function env (set in the Supabase dashboard): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `RESEND_FROM`,
`VERIFIED_FROM_DOMAIN`.

---

## Deploying a new version to Vercel (CLI)

Production is hosted on Vercel (`work-diary-phi.vercel.app`). A push to the `main`
branch of the connected GitHub repo (`sgreis7-png/workDiary`) **auto-deploys**.

> ⚠️ **Hobby-plan commit-author rule (private repo).** Vercel **blocks** any
> auto-deploy whose Git commit *author* is not the project owner. Commits in this
> repo must be authored as the owner, or the deployment shows status **"Blocked"**
> and production silently stays on the old build. This repo's git is configured for
> it:
> ```bash
> git config user.name  "sgreis7-png"
> git config user.email "297933896+sgreis7-png@users.noreply.github.com"
> ```
> Keep commits authored this way (or upgrade to Vercel Pro / make the repo public).

### Standard release (recommended)

```bash
# 1. build & sanity-check locally
npm run build

# 2. commit (authored as the owner — see note above) and push
git add -A
git commit -m "..."
git push origin main          # triggers the Vercel production deploy
```

### Force a deploy from the CLI (bypasses the GitHub trigger)

Use this when auto-deploy is blocked/misbehaving. A Vercel **token** authenticates
as the project owner, so the commit-author rule does not apply:

```bash
# one-time: create a token at vercel.com/account/tokens
npx vercel link --token <TOKEN>          # link to the existing "work-diary" project
npx vercel --prod --token <TOKEN> --yes  # ship current working tree to production
```

Or interactively (no token in shell history):

```bash
npx vercel login
npx vercel link        # pick the existing project
npx vercel --prod
```

### Verify a deploy actually shipped

The app is a PWA — the browser's service worker serves cached assets, so the UI can
look unchanged even after a successful deploy. Don't trust the browser; check the
live bundle:

```bash
# get the hashed asset names off the live index, then grep the bundle for new code
curl -s https://work-diary-phi.vercel.app/index.html
curl -s https://work-diary-phi.vercel.app/assets/index-XXXX.js | grep "some-new-string"
```

On devices, force the new version by fully closing the installed PWA and reopening,
or clearing site data once.
