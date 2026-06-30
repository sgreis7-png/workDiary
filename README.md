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
- **Email delivery** — send an entry to distribution lists and/or ad-hoc addresses
  via Resend, sent *from the logged-in user's own address* when on the verified
  domain.
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

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript, Vite 5, React Router 6 |
| Animation | Framer Motion |
| Styling | Hand-authored CSS (design tokens), no UI framework |
| Offline | `idb-keyval` (IndexedDB write queue) + `vite-plugin-pwa` (Workbox) |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions (Deno) |
| Email | Resend (via edge function) |
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
- `send-entry` — renders the branded email and sends via Resend; rate-limited.
- `delete-user` — admin removes a user (auth + profile).

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
- **Private photo storage.** The `photos` bucket is **not public**; emails embed
  **time-limited signed URLs** (7-day expiry) generated server-side.
- **HTML escaping.** All user-supplied values are escaped before being placed into
  report/email HTML.
- **Verified-sender email.** Mail is sent as the user only when their address is on
  the Resend-verified domain; otherwise a safe fallback sender is used, with the
  user set as reply-to.

## Privacy

- **What is stored:** diary field values (free text the user enters), project
  metadata, work dates, the authoring user's id, and site photos. No analytics or
  third-party trackers are bundled.
- **Who can see it:** authenticated app users (per RLS). Reports/emails are only
  shared with the recipients the sender explicitly chooses.
- **Photos** live in a private bucket and are exposed only through short-lived
  signed URLs when a report is emailed — links expire after 7 days.
- **Outbound data:** email content (the rendered report + signed photo links) is
  sent to Resend for delivery to the chosen recipients. That is the only egress of
  user content to a third party. Anything sent outward is delivered to the
  addresses the sender selects.
- **Deletion:** admins can delete entries (cascades to photos) and users.
- **Offline cache:** queued entries and last-seen data sit in the device's
  IndexedDB / service-worker cache until synced; clearing site data removes them.

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
  lib/                supabase client, offline queue, useOfflineSync, geo
  styles/             tokens.css, global.css, components.css

supabase/
  migrations/         Ordered SQL (schema, RLS, features). 0001 = schema/RLS.
  functions/          Edge functions: register, invite, send-entry, delete-user
```

### Local development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  (production build)
npm test           # vitest
```

Required client env (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

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
