# Claude Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only claude.ai connector (remote MCP server) that lets admins and enabled managers query Work Diary data with their own login.

**Architecture:** A Supabase Edge Function `mcp` speaks MCP over streamable HTTP. claude.ai authenticates through Supabase Auth's OAuth 2.1 server; the token is the person's own Supabase session, so every read goes through PostgREST under RLS. The tool logic, the column allowlist and the rate limiter are plain TypeScript modules with no Deno imports, so vitest tests them; `index.ts` is the thin Deno entry.

**Tech Stack:** Deno edge function, `npm:mcp-lite` + `npm:hono` (Supabase's documented MCP stack), `npm:@supabase/supabase-js@2`, zod for tool input schemas; React 18 + supabase-js 2.108 (`supabase.auth.oauth.*`) for the consent screen; vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-claude-connector-design.md`

## Global Constraints

- Read only: tools call `select` on allowlisted tables/columns and the two read functions `traffic_light`, `dashboard_stats`. No generic query tool, no RPC passthrough.
- The function never reads `SUPABASE_SERVICE_ROLE_KEY`. It builds its client with the anon key + the caller's `Authorization` header.
- Eligible: role in (`admin`, `manager`) **and** `can_view('claude')`. Admins are always on (perm_level gives admin `edit`).
- What a tool returns = what the person sees in the app. A tool whose area the caller cannot view returns `{ "denied": "<area>" }`, never `[]`.
- People: `id`, `name`, `role` only.
- Never selected: columns matching `email`, `phone`, `*_email`, `*signature*`, `storage_path`, `endpoint`, `code`, `avatar_path` (signer/receiver **names** are fine). Never read tables: `user_messages, message_acks, chat_groups, chat_group_members, notifications, push_subscriptions, user_prefill, user_prefill_locations, registration_codes, allowed_emails, user_permissions, perm_defaults, audit_log, rate_events, feedback_reports, distribution_lists, list_recipients, report_mail_log, overdue_notices, alert_rules, alert_rule_tasks, alert_rule_fired, coop_signatures`.
- Signed state is reported as `signed: boolean`, `signed_at`, receiver/signer name. Photos as counts.
- List tools: `limit` default 200, max 1000; result `{ rows, truncated }`.
- Migrations are write-once; the new one is `0081_claude_connector.sql`. Strings in `STRINGS` with he + en; logical CSS properties.
- CI: `npm run lint`, `npm run build`, `npm test` on Node 22.

## Review Focus

1. A manager enabled for `claude` but without `defects`/`deliveries`/`traffic_light` asks for that area → explicit `denied`, not an empty answer that reads as "no issues". (Task 3 test `denied area is explicit`.)
2. A dashboard polling every few seconds → 429-style tool error after the bucket empties, not DB load. (Task 4 test.)
3. Access turned off mid-session → the very next call refuses, though the token is still valid. (Task 5 gate test via `gate()`.)
4. A diary entry whose `values` holds a key with no field definition (deleted field) → returned under its raw key, not dropped. (Task 3 test `unknown field keys survive`.)
5. More than `limit` rows → `truncated: true`, so a monthly report never under-counts silently. (Task 3 test.)

---

### Task 1: Permission area `claude`

**Files:**
- Create: `supabase/migrations/0081_claude_connector.sql`
- Modify: `src/lib/perms.ts` (PermArea union, PERM_AREAS, MEMBER_DEFAULTS, MANAGER_DEFAULTS)
- Modify: `src/lib/perms.sql.test.ts` (read SQL81 like SQL77)

**Interfaces:**
- Produces: area key `'claude'`, label `'חיבור Claude'` / `'Claude connector'`; DB function `can_view('claude')` works through existing `perm_level`.

- [ ] **Step 1:** In `perms.sql.test.ts` add `const SQL81 = readFileSync('supabase/migrations/0081_claude_connector.sql', 'utf8')`, feed it to the member and manager seed readers the same way as SQL77. Add the area to `perms.ts` with defaults member `none`, manager `none`.
- [ ] **Step 2:** Run `npx vitest run src/lib/perms.sql.test.ts` — expect FAIL (file missing / no seed row).
- [ ] **Step 3:** Write the migration with the create-migration skill: `insert into perm_defaults (role, area, level) values ('member','claude','none'), ('manager','claude','none') on conflict do nothing;` plus a Hebrew header comment on why (admin turns it on per person).
- [ ] **Step 4:** Run `npx vitest run src/lib/perms.sql.test.ts` — PASS. Run `npm run build`.
- [ ] **Step 5:** Commit `feat(perms): add claude connector permission area`.

### Task 2: Column allowlist and privacy guard

**Files:**
- Create: `supabase/functions/mcp/allowlist.ts`
- Test: `supabase/functions/mcp/allowlist.test.ts`

**Interfaces:**
- Produces: `export const READ: Record<string, { area: PermArea | null; columns: string[] }>` — one entry per readable table from the spec's "may read" table (area `null` = readable by any member, e.g. `projects`, `profiles`); `export const DENIED_TABLES: string[]`; `export const DENIED_COLUMN = /(^|_)(email|phone|signature|storage_path|endpoint|avatar_path)($|_)|^code$/`; `export function cols(table: string): string` → comma-joined select list, throws for a table not in `READ`.
- Column names come from the migrations (`grep -n "create table <t>" -A40 supabase/migrations/*.sql` plus later `alter table … add column`). `profiles` is exactly `id,name,role`. `handover_forms` omits `receiver_signature`; `entry_photos` is not in `READ` (counted via `entries` embed `entry_photos(count)`).

- [ ] **Step 1: failing tests**
  - `it('never selects a private column')`: for every table in READ, every column `!DENIED_COLUMN.test(c)`.
  - `it('never reads a denied table')`: no key of READ is in DENIED_TABLES; DENIED_TABLES equals the Global Constraints list.
  - `it('people are names and roles only')`: `READ.profiles.columns` equals `['id','name','role']`.
  - `it('cols rejects unknown tables')`: `expect(() => cols('user_messages')).toThrow()`.
  - Prose comment: a leaked phone number or chat line reaches a third-party model and cannot be recalled.
- [ ] **Step 2:** `npx vitest run supabase/functions/mcp/allowlist.test.ts` — FAIL.
- [ ] **Step 3:** Implement `allowlist.ts` (no imports except the `PermArea` type, copied as a string union to keep the file Deno-safe).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(mcp): read allowlist with privacy guard`.

### Task 3: Tool logic

**Files:**
- Create: `supabase/functions/mcp/tools.ts`
- Test: `supabase/functions/mcp/tools.test.ts` (uses `src/test/fakeSupabase.ts`; extend it only if `.in()/.gte()/.lte()/.ilike()/.limit()` are missing)

**Interfaces:**
- Consumes: `READ`, `cols` from Task 2.
- Produces:
  - `export interface ToolCtx { db: SupabaseLike; canView(area: string): Promise<boolean> }` where `SupabaseLike` is the subset of the supabase-js client the tools use (`from`, `rpc`).
  - `export interface ToolDef { name: string; description: string; input: ZodObject; run(ctx: ToolCtx, args): Promise<unknown> }`
  - `export const TOOLS: ToolDef[]` with exactly these names: `list_projects, get_project, search_diary, list_issues, list_defects, list_safety_forms, get_schedule, list_deliveries, traffic_light, list_handovers, stats, list_people`.
  - `export function page<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean }` — tools fetch `limit + 1` rows and pass them here.
- Area per tool: diary → `logbook`, issues → the area the `issues` select policy checks (read it from the migrations), defects → `defects`, safety → `safety`, schedule → `gantt`, deliveries → `deliveries`, traffic_light → `traffic_light`, handovers → `handover`, stats → `dashboard`; projects/people → none. A tool checks `canView(area)` first and returns `{ denied: area }` when false.
- `search_diary` maps `entries.values` keys to `field_definitions` labels (`{ label: value }`); keys with no definition keep the raw key. Author shown as name via a single `profiles` lookup.
- `list_handovers` returns systems as `{ label, status: 'ok'|'bad'|'na'|null, note }` and `signed: receiver_signature != null` computed server-side by selecting `signed_at` only.
- Each `description` states arguments, the shape returned, and that dates are `YYYY-MM-DD`.

- [ ] **Step 1: failing tests**
  - `TOOLS names match the spec` — sorted names equal the list above.
  - `denied area is explicit` — `canView` false for `defects` → `list_defects.run` resolves `{ denied: 'defects' }` and makes no `from('coop_defects')` call.
  - `truncated when over limit` — fake returns 3 rows, `limit: 2` → `{ rows: [2 items], truncated: true }`.
  - `limit is capped at 1000` — input `limit: 5000` fails zod parse.
  - `unknown field keys survive` — entry `values: { f1: 'x', gone: 'y' }`, definitions only for `f1` labelled `'עבודה'` → `{ 'עבודה': 'x', gone: 'y' }`.
  - `handover carries na and no signature` — fake row with systems status `na` → output has `status: 'na'`, `signed: true`, no `receiver_signature` key.
  - Prose comments per the repo style (why the bug is expensive).
- [ ] **Step 2:** `npx vitest run supabase/functions/mcp/tools.test.ts` — FAIL.
- [ ] **Step 3:** Implement tools. Filters: `project_id` → `.eq`, `from/to` → `.gte/.lte` on the table's date column, `text` → `.ilike` on the name/description column. `traffic_light` and `stats` call `db.rpc('traffic_light')` / `db.rpc('dashboard_stats', …)` with the existing argument names (read them from the migrations).
- [ ] **Step 4:** Run — PASS. `npm test` whole suite green.
- [ ] **Step 5:** Commit `feat(mcp): read-only tools`.

### Task 4: Per-user rate limit

**Files:**
- Create: `supabase/functions/mcp/ratelimit.ts`
- Test: `supabase/functions/mcp/ratelimit.test.ts`

**Interfaces:**
- Produces: `export function makeLimiter(opts: { capacity: number; refillPerSec: number; now?: () => number }): (key: string) => boolean` (true = allowed). Defaults used by index.ts: capacity 60, refill 1/sec.

- [ ] **Step 1: failing tests** — `allows capacity then refuses`; `refills over time` (inject `now`); `keys are independent`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement a token bucket in a `Map`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(mcp): per-user rate limiter`.

### Task 5: Edge function entry, auth and gate

**Files:**
- Create: `supabase/functions/mcp/index.ts`, `supabase/functions/mcp/gate.ts`, `supabase/functions/mcp/gate.test.ts`, `supabase/functions/mcp/deno.json` (npm import map)
- Modify: `supabase/config.toml` — `[functions.mcp] verify_jwt = false` (the metadata route must be public; the function verifies tokens itself)

**Interfaces:**
- Consumes: `TOOLS`, `makeLimiter`.
- Produces: `export async function gate(db: SupabaseLike): Promise<{ ok: true; userId: string } | { ok: false; reason: 'unauthenticated' | 'role' | 'not_enabled' }>` — `auth.getUser()`, then `rpc('my_role')` in (admin, manager), then `rpc('can_view', { p_area: 'claude' })`.
- Routes (Hono):
  - `GET /.well-known/oauth-protected-resource` → `{ resource: <function URL>, authorization_servers: ['<SUPABASE_URL>/auth/v1'] }`.
  - `POST|GET /` → MCP (mcp-lite StreamableHttpTransport). No/invalid token → 401 with `WWW-Authenticate: Bearer resource_metadata="<function URL>/.well-known/oauth-protected-resource"`.
  - Per request: `gate()` → refusals as MCP tool errors with Hebrew + English text (`not_enabled`: "חיבור Claude לא הופעל עבורך. פנה למנהל המערכת." / "Claude connector is not enabled for you. Ask your administrator."); limiter keyed by userId → error "rate_limited".
  - Server name `agrotop-work-diary`, instructions string telling Claude dates are ISO and that `denied` means no permission in the app.

- [ ] **Step 1: failing tests** in `gate.test.ts`: `no user → unauthenticated`; `member role → role`; `manager without claude → not_enabled`; `manager with claude → ok`; `admin → ok` (fake rpc rows).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `gate.ts`, then `index.ts`.
- [ ] **Step 4:** `npx vitest run supabase/functions/mcp` PASS; `deno check supabase/functions/mcp/index.ts` clean (install Deno if missing, or rely on `supabase functions serve`).
- [ ] **Step 5:** Local smoke: `supabase functions serve mcp`, `curl -i http://localhost:54321/functions/v1/mcp/` → 401 with `WWW-Authenticate`; `curl …/.well-known/oauth-protected-resource` → JSON.
- [ ] **Step 6:** Commit `feat(mcp): edge function entry with auth gate`.

### Task 6: OAuth consent screen

**Files:**
- Create: `src/screens/OAuthConsent.tsx`
- Modify: `src/App.tsx` (route `/oauth/consent` inside `RequireAuth`, outside `Shell`), `src/i18n.tsx` (strings `oauth_*`)

**Interfaces:**
- Consumes: `supabase.auth.oauth.getAuthorizationDetails(id)`, `approveAuthorization(id)`, `denyAuthorization(id)` (supabase-js 2.108); query param `authorization_id`.
- Behaviour: not logged in → existing login then back here. Shows client name, the scopes, and "Claude will be able to read the data you can see in the app. It cannot change anything." Approve → follow returned `redirect_url`. Deny → follow its redirect. A member, or a manager without `claude`, sees "not enabled, ask your admin" and only a Deny button (the server gate refuses anyway; this is the friendly path).

- [ ] **Step 1:** Implement screen + strings (he + en).
- [ ] **Step 2:** `npm run lint && npm run build` clean.
- [ ] **Step 3:** Ask the rtl-ui-reviewer agent to review the screen; fix findings.
- [ ] **Step 4:** Commit `feat(oauth): consent screen for claude connector`.

### Task 7: In-app connector screen

**Files:**
- Create: `src/screens/ClaudeConnector.tsx`
- Modify: `src/App.tsx` (route `claude` wrapped in a manager-or-admin guard), `src/components/Shell.tsx` (nav link under the settings/account group, shown to admin and manager), `src/i18n.tsx` (strings `claude_*`)

**Interfaces:**
- Consumes: `usePerms().canView('claude')`, role from `useAuth()`; connector URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`.
- Content (spec "In-app screen"): enabled → URL + copy button (`navigator.clipboard.writeText` with select-text fallback), numbered steps (claude.ai → Settings → Connectors → Add custom connector → paste URL → log in with the app account → approve), three example prompts (monthly project report, issues analysis across projects, live dashboard), can/cannot-read lists. Not enabled → ask-admin text. Admin → note "admins always have access" + link to `/admin/users` for enabling managers.

- [ ] **Step 1:** Implement screen, route, nav, strings.
- [ ] **Step 2:** `npm run lint && npm run build && npm test` clean.
- [ ] **Step 3:** rtl-ui-reviewer on the diff; fix findings. Check at phone width with `preview.html`.
- [ ] **Step 4:** Commit `feat(claude): connector setup screen`.

### Task 8: Hosted setup and end-to-end check

Needs the Supabase connector access the user is fixing. If still `You do not have permission`, stop and ask the user.

- [ ] **Step 1:** Run the rls-reviewer agent over the branch (migration + function); fix findings.
- [ ] **Step 2:** Enable on the hosted project: Auth → OAuth Server on, dynamic client registration on, authorization path `/oauth/consent`, site URL = the Vercel app URL; short access-token lifetime (spec: user accepted token keeps normal rights, mitigated by short lifetime). Record the settings in `docs/claude-connector.md`.
- [ ] **Step 3:** Apply `0081_claude_connector.sql` (Supabase MCP `apply_migration`); deploy function `mcp`.
- [ ] **Step 4:** Push to main (author `sgreis7-png`); verify the consent route is in the live bundle by grepping it.
- [ ] **Step 5:** End to end: add the connector in claude.ai with an admin account → list_projects returns projects; with a manager without the area → refusal text; enable → works. Ask the user to run the claude.ai part if it needs their login.
- [ ] **Step 6:** Live dashboard smoke: publish a small artifact declaring `mcp` with `list_projects` + `traffic_light`, `watchTool` with `refetchInterval`, and confirm it renders and refreshes.
- [ ] **Step 7:** Commit docs; update memory.
