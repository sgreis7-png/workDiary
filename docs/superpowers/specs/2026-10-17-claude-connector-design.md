# Claude connector for Work Diary — design

Date: 2026-10-17 · Status: ready for approval

## Intent

Admins and managers want to ask questions of the app's data in plain language — "report on
Kfar Yuval for last month", "analyze all open issues across projects", "which projects are
behind schedule", "build me a live dashboard of safety forms per site" — and get reports,
analyses and dashboards back, without building each screen in the app.

The way to do that is a **claude.ai connector** (a remote MCP server). A person the admin has
enabled adds the connector once in claude.ai (web, desktop app or phone), logs in with their
Work Diary account, and Claude can then read the app's data through a fixed set of read-only
tools. Claude writes the report or dashboard on its side (chat answer, document, or a
claude.ai artifact). A dashboard artifact can call the same connector tools itself and refresh
on its own, which is what makes "live dashboards" possible.

## Goals

1. Read-only access to the app's business data for people the admin enabled.
2. Login with the person's own Work Diary account; no shared keys, no service key in the path.
3. Admin turns access on and off per person, inside the app.
4. A screen in the app that explains how to connect, step by step, in Hebrew (and English).
5. Tools return structured JSON that a dashboard artifact can poll and render.

## Non-goals

- No local / Claude Desktop install (user decision: connector only).
- No writes of any kind: Claude never creates, changes or deletes anything in the app. Reports
  and dashboards live in claude.ai, not in the app.
- No in-app dashboard builder. Dashboards are claude.ai artifacts.
- No AI features inside the app itself.

## Anti-goals (would be a failure even if it works)

- Any path that lets a member, or a manager the admin did not enable, read data through the
  connector.
- Any private data reaching Claude (list below).
- The service key, or any RLS bypass, being reachable from a tool call.
- A tool that can be talked into writing (generic SQL, RPC passthrough, etc.).

## Who can use it

- Eligible roles: **admin and manager only**. A member can never be enabled.
- Access is a new permission area `claude` (Hebrew label: "חיבור Claude"), level `view`.
  Defaults: member `none`, manager `none`. Admin turns it on per person through the existing
  user-permissions screen (an explicit `user_permissions` row).
- Admins are always on (my call): `perm_level()` and `resolvePerm` already give admins `edit`
  in every area, and special-casing one area is not worth it. The screen says so.
- Every tool call re-checks on the server: caller's role in (admin, manager) **and** the
  resolved level for `claude` (`can_view('claude')` / `perm_level`, not an exact-row
  `has_perm` match). Turning access off takes effect on the next call.
- Must follow the repo rule: `MEMBER_DEFAULTS`/`MANAGER_DEFAULTS` in `src/lib/perms.ts` and the
  `perm_defaults` rows in the new migration agree, held by `perms.sql.test.ts`.

## What Claude may read

**Same as in the app (user decision).** The function runs as the person, so RLS and the
existing area permissions (`can_view('defects')`, `can_view('deliveries')`, …) decide what each
tool returns. Where the person lacks an area, the tool returns an explicit
`{ "denied": "<area>" }` result, never an empty list that reads as "nothing there". To show
more, the admin grants that area as well.

Within that, all business data, through the tools below:

| Area | Tables / functions |
|---|---|
| Projects | projects, project_assignments (as names), project_contractors, project_priorities |
| Diary | entries (values mapped to field labels via field_definitions), entry_photos (count/list only), work_tasks |
| Issues & defects | issues, coop_defects, defect_item_overrides, coops, coop_checklist_items, coop_concessions, coop_responsibilities |
| Safety | safety_forms, safety_topics |
| Schedules | gantt_charts, gantt_tasks, gantt_links, wbs_templates, wbs_gantt_aliases |
| Supplies & gates | project_deliveries, gate_items, gate_approval_notices |
| Traffic light | `traffic_light()` function, traffic_light_snapshots, traffic_light_settings, customer_commitments |
| Handover | handover_forms (without signature), handover_systems, handover_extra_fields |
| Stats | `dashboard_stats()` function |

## What Claude must never read

- People: only **display name and role**. No email, no phone, no auth data.
- Messages between users and chats: user_messages, message_acks, chat_groups,
  chat_group_members.
- notifications, push_subscriptions, user_prefill, user_prefill_locations.
- Secrets and account admin: registration_codes, allowed_emails, user_permissions,
  perm_defaults, audit_log, rate_events, feedback_reports.
- Mail plumbing: distribution_lists, list_recipients, report_mail_log, overdue_notices.
- Alert rules: alert_rules, alert_rule_tasks, alert_rule_fired (personal settings).
- Signature images (handover receiver_signature, coop_signatures, safety signatures). The
  tools may say "signed: yes, at <time>, by <name>", never the strokes.
- Photo files. Photos are listed (count, date) but not sent as images.

Enforced by an **allowlist in the server**, not by trusting Claude: each tool selects named
columns from named tables. A test reads the tool definitions and fails if any column on the
deny list (email, phone, signature, etc.) or any denied table appears.

## Tools (read-only)

All tools return JSON. Dates are ISO `YYYY-MM-DD`. Every list tool takes `limit` (default 200,
max 1000) and returns `truncated: true` when it cut the list, so a report never silently
under-counts. Hebrew text is returned as-is.

1. `list_projects(active?, text?)` — id, name, location, active, manager name(s), dates.
2. `get_project(project_id)` — project details + counts (entries, open issues, defects,
   safety forms, handovers) + current traffic-light color.
3. `search_diary(project_id?, from?, to?, text?, limit?)` — diary entries with field values
   keyed by **field label**, author name, photo count.
4. `list_issues(project_id?, status?, from?, to?, limit?)` — issues / unplanned events.
5. `list_defects(project_id?, coop_id?, status?, limit?)` — coop defects and checklist state.
6. `list_safety_forms(project_id?, from?, to?, limit?)` — topic, date, attendee count, signed.
7. `get_schedule(project_id)` — gantt tasks with planned/actual dates, progress, links,
   overdue flag.
8. `list_deliveries(project_id?, status?, limit?)` — supplies and gate items.
9. `traffic_light(project_id?)` — output of the existing `traffic_light()` function: color
   per axis and overall, per project.
10. `list_handovers(project_id?, from?, to?, limit?)` — header, attendees, system statuses
    (ok/bad/na), signed at, receiver name.
11. `stats(from?, to?, project_id?)` — output of `dashboard_stats()` plus simple counts.
12. `list_people()` — names and roles only (to resolve "who").

The exact argument names and the shape of each result are left to the builder, with one
constraint: shapes are stable and flat enough for a dashboard artifact to render without
guessing, and each tool's description says what it returns.

## How it works (decided parts)

- **Hosting:** a Supabase Edge Function `mcp` in this repo's `supabase/functions/`,
  speaking MCP over streamable HTTP. (Builder may choose Vercel instead if Supabase's OAuth
  flow makes the edge function awkward; record why.)
- **Auth:** OAuth 2.1 as claude.ai connectors require, backed by Supabase Auth so the token
  claude.ai holds is the person's own Supabase session. **User decision:** that token keeps the
  person's normal rights (it could write outside the tools, as their browser login can);
  accepted, with a short access-token lifetime. Read-only is enforced by the tools. The function calls PostgREST with
  that token, so **RLS applies to every read** in addition to the server allowlist. The
  function never uses the service key.
  - Preferred: Supabase Auth's built-in OAuth 2.1 server (supports dynamic client
    registration, made for MCP). The consent/login page is a new route in the app
    (`/oauth/consent`), Hebrew-first.
  - If that feature is not available on this project's plan, the builder stops and reports
    before building an own OAuth server.
- **Read-only by construction:** tools only call `select` on allowlisted tables/columns and
  the two existing read functions. No generic query tool.
- **Rate limit (my call):** an in-function per-user limit (token bucket keyed by user id).
  `rl_check()` is service-role only since 0034 and this function holds no service key, so it
  is not reused; a per-instance limit is accepted as weaker. Builder picks the numbers.

## In-app screen

New screen "חיבור Claude" (Claude connector), under settings, visible to admin and manager.

- If the viewer has access: connector URL with a copy button, numbered steps for claude.ai
  (Settings → Connectors → Add custom connector → paste URL → log in with app account),
  example prompts (monthly report, issues analysis, live dashboard), and the list of what
  Claude can and cannot read.
- If the viewer has no access: "ask your admin to turn on Claude connector for you".
- Admin: enabling a person is the existing permissions screen with the new `claude` area; the
  connector screen links there.
- All strings in `STRINGS` with he + en; RTL rules from project conventions.

## Constraints

- Migrations are write-once; next number after 0080. Use the create-migration skill.
- Edge functions bypass RLS only with the service key — this one must not hold it.
- CI: lint, build (tsc), tests. Node 22.
- Deploy: Vercel owner rule for the app; the edge function deploys via Supabase CLI/MCP.

## Left to the builder

- MCP library choice in Deno, argument names, result shapes (within the constraints above).
- Pagination details, rate-limit numbers, caching.
- Exact layout of the in-app screen.

## Open risks

- Supabase OAuth server availability on this project (blocks the preferred auth path). Local
  `supabase/config.toml` has `[auth.oauth_server] enabled = false`; the hosted setting is unknown.
- **User will fix my Supabase connector access**, after which I verify and enable the OAuth
  server (with dynamic client registration) on the hosted project. Until then:
- My Supabase connector currently lacks access to this project ("You do not have
  permission"), so applying the migration and deploying the function may need the user or a
  fixed connector.
