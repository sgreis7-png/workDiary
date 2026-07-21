# Prefill + Coop Management + Clean Export + Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five approved features: prefill checkbox, coop delete/edit permission, filled-only report export, new-record notifications, personal alert rules — then deploy.

**Architecture:** One SQL migration (`0026`) carries all schema (user_prefill, alert_rules, RPCs, hourly pg_cron). Client work is per-feature: pure-function change in `report.ts` (TDD), small lib helpers (`prefill.ts`, `notifyNewRecord`), perm-area additions in `perms.ts`, UI wiring in `EntryForm.tsx` / `Coops.tsx` / `CoopView.tsx`, one new screen `AlertRules.tsx`.

**Tech Stack:** React 18 + Vite, Supabase JS v2, vitest, existing `usePerms` / `notifications` / `send-push` / pg_cron infra.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-prefill-coops-export-alerts-design.md`
- Hebrew-first UI; app has two i18n systems: `src/i18n.ts` (`t()`) for main app, `src/defects/i18n.ts` (`dt()`) for defects — add every new string to both languages in the right system.
- Never block a save on a notification failure (fire-and-forget + catch).
- Perm areas: `coops_manage` (member default `none`), `alert_rules` (member default `none`); admins auto-`edit` via existing `resolvePerm`.
- All commits on `main`, Co-Authored-By Claude footer, deploy = push (Vercel) + apply migration to Supabase.

---

### Task 1: Migration 0026 — schema, RPCs, cron

**Files:**
- Create: `supabase/migrations/0026_prefill_alert_rules.sql`

**Interfaces:**
- Produces tables `user_prefill(email,name,phone,updated_at)`, `alert_rules(id,email,project_id,kind,frequency,alert_hour,weekday,month_day,active,last_fired_at,created_at)`; RPCs `admin_emails() returns setof text`, `filled_rule_emails(pid uuid) returns setof text`; function `check_alert_rules()` + hourly cron job `check-alert-rules`.

- [ ] **Step 1: Write the migration** exactly:

```sql
-- user_prefill: "שמור נתונים" — per-user saved name/phone for the entry form.
-- alert_rules: personal monitoring rules (missing-entry / new-record subscriptions).

create table if not exists user_prefill (
  email      text primary key,
  name       text,
  phone      text,
  updated_at timestamptz not null default now()
);
alter table user_prefill enable row level security;
create policy own_prefill on user_prefill for all
  using (lower(auth.jwt()->>'email') = email)
  with check (lower(auth.jwt()->>'email') = email);

create table if not exists alert_rules (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  project_id    uuid references projects(id) on delete cascade,  -- null = all projects
  kind          text not null check (kind in ('missing','filled')),
  frequency     text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  alert_hour    int  not null default 20 check (alert_hour between 0 and 23),
  weekday       int  check (weekday between 0 and 6),      -- weekly: 0=Sunday
  month_day     int  check (month_day between 1 and 31),   -- monthly
  active        boolean not null default true,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table alert_rules enable row level security;
create policy own_alert_rules on alert_rules for all
  using (lower(auth.jwt()->>'email') = email)
  with check (lower(auth.jwt()->>'email') = email);

-- admin emails for client-side notification fan-out (pattern: is_admin(), 0003)
create or replace function admin_emails() returns setof text
language sql security definer set search_path = public as $$
  select email from allowed_emails where role = 'admin' and active
$$;
grant execute on function admin_emails() to authenticated;

-- owners of active 'filled' rules matching a project (null project_id = all)
create or replace function filled_rule_emails(pid uuid) returns setof text
language sql security definer set search_path = public as $$
  select distinct email from alert_rules
  where kind = 'filled' and active and (project_id is null or project_id = pid)
$$;
grant execute on function filled_rule_emails(uuid) to authenticated;

-- hourly rule checker (pattern: notify_due_dates(), 0025). Israel local time.
create or replace function check_alert_rules() returns void
language plpgsql security definer set search_path = public as $$
declare
  now_il timestamptz := now() at time zone 'Asia/Jerusalem';
  r record;
begin
  for r in
    select ar.* from alert_rules ar
    where ar.kind = 'missing' and ar.active
      and ar.alert_hour = extract(hour from now() at time zone 'Asia/Jerusalem')::int
      and (ar.last_fired_at is null or ar.last_fired_at < now() - interval '50 minutes')
      and (
        (ar.frequency = 'daily')
        or (ar.frequency = 'weekly'  and coalesce(ar.weekday, 0) = extract(dow from now() at time zone 'Asia/Jerusalem')::int)
        or (ar.frequency = 'monthly' and coalesce(ar.month_day, 1) = extract(day from now() at time zone 'Asia/Jerusalem')::int)
      )
  loop
    insert into notifications (recipient_email, title, body, link)
    select r.email,
           'לא מולאה רשומת יומן עבודה — ' || p.name,
           case r.frequency
             when 'daily'   then 'לא נמצאה רשומה להיום עד ' || r.alert_hour || ':00'
             when 'weekly'  then 'לא נמצאה רשומה בשבוע האחרון'
             else                'לא נמצאה רשומה החודש'
           end,
           '/new'
    from projects p
    where p.active
      and (r.project_id is null or p.id = r.project_id)
      and not exists (
        select 1 from entries e
        where e.project_id = p.id
          and case r.frequency
            when 'daily'   then e.work_date = (now() at time zone 'Asia/Jerusalem')::date
            when 'weekly'  then e.work_date >= (now() at time zone 'Asia/Jerusalem')::date - 6
            else                date_trunc('month', e.work_date) = date_trunc('month', (now() at time zone 'Asia/Jerusalem')::date)
          end
      );
    update alert_rules set last_fired_at = now() where id = r.id;
  end loop;
end; $$;

select cron.schedule('check-alert-rules', '0 * * * *', $$select check_alert_rules()$$)
where not exists (select 1 from cron.job where jobname = 'check-alert-rules');
```

- [ ] **Step 2: Sanity-check SQL** — `node -e` is useless for SQL; instead verify referenced objects exist in earlier migrations: `allowed_emails.role/active` (0003), `notifications(recipient_email,title,body,link)` (0013), `entries.work_date` (0001), `projects.active` (0001), `cron.schedule` (0025 created extension). Grep each once.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0026_prefill_alert_rules.sql
git commit -m "feat(db): user_prefill, alert_rules, admin_emails RPC, hourly rule cron"
```

(Migration is applied to the live DB in Task 7.)

---

### Task 2: Report export — only filled content (TDD)

**Files:**
- Test: `src/defects/report.filter.test.ts` (new)
- Modify: `src/defects/report.ts`

**Interfaces:**
- `buildCoopReportHtml` / `buildCoopReportText` signatures unchanged; output now omits empty content.

- [ ] **Step 1: Write failing tests** — `src/defects/report.filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCoopReportHtml, buildCoopReportText } from './report'
import type { CoopBundle } from './api'

const emptyCoop = {
  id: 'c1', project_id: 'p1', name: 'לול 1', coop_type: null, farm_coop_count: null,
  equipment_supplier: null, has_heating: false, has_cooling_pads: false, has_tunnel_shutter: false,
  execution_manager: null, field_supervisor: null, opened_on: null, created_by: null, created_at: '',
}
const emptyBundle = {
  coop: emptyCoop, responsibilities: [], items: [], defects: [], signatures: [], concessions: [],
} as unknown as CoopBundle

describe('report skips empty content', () => {
  it('drops empty meta rows, keeps filled ones', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פרויקט א')
    expect(html).toContain('פרויקט / אתר')          // filled
    expect(html).toContain('לול 1')
    expect(html).not.toContain('ספק ציוד גידול')     // empty -> dropped
    expect(html).not.toContain('מנהל ביצוע')
  })
  it('drops the responsibility section when nothing is filled', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פ')
    expect(html).not.toContain('מטריצת אחריות')
  })
  it('drops untouched gates entirely and unanswered summary rows', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פ')
    expect(html).not.toContain('ריכוז סטטוס')
    expect(html).not.toContain('— טרם —')
    expect(html).not.toContain('— טרם נחתם —')
  })
  it('keeps a gate that has one answered item, drops its unanswered items', () => {
    const b = {
      ...emptyBundle,
      items: [{ id: 'i1', coop_id: 'c1', gate: 'construction', item_no: 1, status: 'done', severity: null, note: null, external_by: null }],
    } as unknown as CoopBundle
    const html = buildCoopReportHtml(b, 'פ')
    expect(html).toContain('ריכוז סטטוס')
    expect(html).not.toContain('— טרם —')
  })
  it('keeps the empty-defects message', () => {
    expect(buildCoopReportHtml(emptyBundle, 'פ')).toContain('אין ליקויים רשומים.')
  })
  it('text report omits gates without answers', () => {
    const txt = buildCoopReportText(emptyBundle, 'פ')
    expect(txt).not.toMatch(/טרם 12/)
  })
})
```

(Adjust `gate: 'construction'` to a real first key from `GATE_ORDER` in `src/defects/model.ts` — check before writing.)

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/defects/report.filter.test.ts` → FAIL (meta rows/sections currently always render).

- [ ] **Step 3: Implement filtering in `report.ts`:**
  - Meta: build `metaRows` as before, then `const filledMeta = metaRows.filter(([, v]) => v && v !== '—')`; render `filledMeta`. Change fallbacks from `'—'` to `''` so the filter catches them (`fmtDate` gains a variant returning `''` for null in meta usage: `c.opened_on ? fmtDate(c.opened_on) : ''`). `yesNo` values stay (they're real booleans — keep all three equipment rows since false = "לא" is information; ONLY null-ish text/number/date rows drop).
  - Responsibilities: `const filledResp = RESP_DOMAINS.filter((d) => { const r = b.responsibilities.find((x) => x.domain_key === d.key); return r && (r.responsible || r.external_who || r.notes) })`; map rows only for `filledResp`, with `''` instead of `'—'` for missing cells; wrap section in `filledResp.length ? section(...) : ''`.
  - Summary: `const answeredGates = GATE_ORDER.filter((g) => b.items.some((i) => i.gate === g && i.status))`; summary rows over `answeredGates`; section omitted when `answeredGates.length === 0`.
  - Gates: iterate `answeredGates` only. Inside a gate: `def.items.filter((it) => { const row = b.items.find(...); return row && (row.status || row.note || row.severity || row.external_by) })`. Signatures: keep only signed (`b.signatures.find(...)` truthy); the "— טרם נחתם —" branch is removed; signature container div rendered only if any signature exists. Footnotes render only when the gate renders.
  - Defect log: unchanged.
  - `buildCoopReportText`: status lines only for `answeredGates`.

- [ ] **Step 4: Run tests** — `npx vitest run src/defects/report.filter.test.ts` → PASS; then full `npm test` → all pass (existing `report.test.ts` covers the entries report, unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/defects/report.ts src/defects/report.filter.test.ts
git commit -m "feat(defects): report export includes only filled content"
```

---

### Task 3: Prefill — "שמור נתונים" checkbox

**Files:**
- Create: `src/lib/prefill.ts`
- Test: `src/lib/prefill.test.ts`
- Modify: `src/screens/EntryForm.tsx`, `src/i18n.ts` (new strings)

**Interfaces:**
- Produces `fetchPrefill(): Promise<{name: string|null, phone: string|null} | null>`, `savePrefill(name: string, phone: string): Promise<void>`, pure `applyPrefill(values, prefill): Record<string,string>`.

- [ ] **Step 1: Failing test** — `src/lib/prefill.test.ts` for the pure merge:

```ts
import { describe, expect, it } from 'vitest'
import { applyPrefill } from './prefill'

describe('applyPrefill', () => {
  it('fills empty manager_name/phone', () => {
    expect(applyPrefill({}, { name: 'חיים', phone: '050' }))
      .toEqual({ manager_name: 'חיים', phone: '050' })
  })
  it('never overwrites user-typed values', () => {
    expect(applyPrefill({ manager_name: 'א', phone: '' }, { name: 'ב', phone: '1' }))
      .toEqual({ manager_name: 'א', phone: '1' })
  })
  it('ignores null prefill', () => {
    expect(applyPrefill({ x: '1' }, null)).toEqual({ x: '1' })
  })
})
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/lib/prefill.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/prefill.ts`:**

```ts
// "שמור נתונים" — server-saved name/phone prefill for the entry form.
import { supabase } from './supabase'

export interface Prefill { name: string | null; phone: string | null }

export function applyPrefill(values: Record<string, string>, p: Prefill | null): Record<string, string> {
  if (!p) return values
  const out = { ...values }
  if (!out.manager_name?.trim() && p.name) out.manager_name = p.name
  if (!out.phone?.trim() && p.phone) out.phone = p.phone
  return out
}

export async function fetchPrefill(email: string): Promise<Prefill | null> {
  const { data } = await supabase.from('user_prefill').select('name,phone').eq('email', email.toLowerCase()).maybeSingle()
  return (data as Prefill | null) ?? null
}

export async function savePrefill(email: string, name: string, phone: string): Promise<void> {
  await supabase.from('user_prefill')
    .upsert({ email: email.toLowerCase(), name: name || null, phone: phone || null, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 4: Wire `EntryForm.tsx`** (new-entry mode only):
  - State: `const [savePrefs, setSavePrefs] = useState(false)`.
  - In the draft-restore effect (`EntryForm.tsx:51-64`): after `loadDraft('new')` resolves with **no draft**, fetch prefill and apply: `const p = await fetchPrefill(user.email); setValues((v) => applyPrefill(v, p)); if (p) setSavePrefs(true)` (wrapped `.catch(() => {})`; user email via `useAuth().user?.email`). Draft present → skip prefill (draft wins).
  - Project-change location prefill: new effect — when `project` changes in new-entry mode and `values.site_location` is empty, call `lastEntryForProject(project)` and set `site_location` from its values if present (silent catch; guard with a `locPrefillBusy` ref to avoid races).
  - Checkbox UI in `form-actions` area (before buttons): `<label className="save-prefs"><input type="checkbox" checked={savePrefs} onChange={(e) => setSavePrefs(e.target.checked)} /> {t('save_my_details')}</label>` — rendered only when `!editing`.
  - In `save()` success paths (both online `createEntry` and offline `queueEntry` branches): `if (!editing && savePrefs) void savePrefill(user.email, values.manager_name ?? '', values.phone ?? '').catch(() => {})`.
  - i18n: add `save_my_details` to `src/i18n.ts` — he: `שמור נתונים לפעם הבאה`, en: `Save my details for next time` (find the two language maps by grepping an existing key, e.g. `copy_last`).

- [ ] **Step 5: Tests + typecheck** — `npx vitest run src/lib/prefill.test.ts` PASS; `npm run build` clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prefill.ts src/lib/prefill.test.ts src/screens/EntryForm.tsx src/i18n.ts
git commit -m "feat(diary): save-my-details prefill checkbox + per-project location prefill"
```

---

### Task 4: Coop delete/edit permission

**Files:**
- Modify: `src/lib/perms.ts`, `src/screens/defects/Coops.tsx`, `src/screens/defects/CoopView.tsx`, `src/defects/i18n.ts`

**Interfaces:**
- New `PermArea` `'coops_manage'`; UI honors `canEdit('coops_manage')`.

- [ ] **Step 1: perms.ts** — add to the union type, `PERM_AREAS` (after `defects`): `{ key: 'coops_manage', label: 'ניהול לולים — עריכה ומחיקה' }`, and `MEMBER_DEFAULTS.coops_manage: 'none'`. PermissionsDialog picks it up automatically.

- [ ] **Step 2: Coops.tsx delete button** — inside the coop card map, when `canEdit('coops_manage')`, render a small 🗑 button (stopPropagation — card itself navigates); handler:

```ts
async function onDelete(c: Coop) {
  if (!window.confirm(dt('coop_delete_confirm'))) return
  const prev = coops
  setCoops((cs) => (cs ?? []).filter((x) => x.id !== c.id))
  try { await deleteCoop(c.id) } catch (e) { setCoops(prev); setErr(String((e as Error).message ?? e)) }
}
```

Import `deleteCoop` from `../../defects/api`. Note: coop cards are `<button>` — a nested button is invalid HTML; render the 🗑 as a sibling `<span role="button">` positioned over the card corner, or restructure the card to a `<div>` with onClick. Use the span approach (minimal diff).

- [ ] **Step 3: CoopView.tsx** — grep for `canEdit('defects')` occurrences; the coop-metadata form (the `updateCoop` call region, ~line 69) switches to `canEdit('coops_manage')`; checklist/defect/photo/signature actions stay `canEdit('defects')`. Add delete button in the header when `canEdit('coops_manage')`: same confirm, then `await deleteCoop(coop.id); nav('/defects')`.

- [ ] **Step 4: defects/i18n.ts strings** — add keys (both langs): `coop_delete_confirm` he: `למחוק את הלול? כל הליקויים, הצ'קליסטים והחתימות שלו יימחקו.` en: `Delete this coop? All its defects, checklists and signatures will be deleted.`; `coop_delete` he: `מחיקת לול` en: `Delete coop`.

- [ ] **Step 5: Verify** — `npm run build` clean; manual reasoning check: member without grant sees no 🗑 and read-only metadata (MEMBER_DEFAULTS none); admin sees both (resolvePerm admin → edit).

- [ ] **Step 6: Commit**

```bash
git add src/lib/perms.ts src/screens/defects/Coops.tsx src/screens/defects/CoopView.tsx src/defects/i18n.ts
git commit -m "feat(defects): coop delete/edit gated by grantable coops_manage permission"
```

---

### Task 5: New-record notifications

**Files:**
- Create: `src/lib/notifyNewRecord.ts`
- Modify: `src/screens/EntryForm.tsx` (fire after save), `src/screens/defects/CoopView.tsx` (fire after defect create), `src/lib/offline.ts` (fire on queue flush)

**Interfaces:**
- Produces `notifyNewRecord(kind: 'entry'|'defect', projectId: string, opts: {projectName: string, coopName?: string, link: string}): Promise<void>` — fire-and-forget safe.

- [ ] **Step 1: Implement `src/lib/notifyNewRecord.ts`:**

```ts
// Fan-out for new-record alerts: admins + project staff + 'filled'-rule subscribers.
import { supabase } from './supabase'
import { sendPush } from './push'

export async function notifyNewRecord(
  kind: 'entry' | 'defect', projectId: string,
  opts: { projectName: string; coopName?: string; link: string },
): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser()
    const me = u.user?.email?.toLowerCase()
    const [admins, assigned, subscribed] = await Promise.all([
      supabase.rpc('admin_emails').then((r) => (r.data as string[] | null) ?? []),
      supabase.from('project_assignments').select('email').eq('project_id', projectId)
        .then((r) => ((r.data as { email: string }[] | null) ?? []).map((x) => x.email)),
      supabase.rpc('filled_rule_emails', { pid: projectId }).then((r) => (r.data as string[] | null) ?? []),
    ])
    const emails = [...new Set([...admins, ...assigned, ...subscribed].map((e) => e.toLowerCase()))]
      .filter((e) => e && e !== me)
    if (!emails.length) return
    const title = kind === 'entry'
      ? `רשומה חדשה ביומן עבודה — ${opts.projectName}`
      : `ליקוי חדש — ${opts.projectName}${opts.coopName ? ` · ${opts.coopName}` : ''}`
    await supabase.from('notifications').insert(
      emails.map((recipient_email) => ({ recipient_email, title, body: '', link: opts.link })),
    )
    sendPush(emails, title, '', opts.link)
  } catch { /* never block a save on notification failure */ }
}
```

(Check `sendPush` signature in `src/lib/push.ts:44` first and match it exactly.)

- [ ] **Step 2: Fire on entry save** — `EntryForm.tsx` online-create branch, after `await createEntry(...)`:
`void notifyNewRecord('entry', project, { projectName: projects.find((p) => p.id === project)?.name ?? '', link: '/' })` (entry id available if createEntry return captured — link to `/entry/${newId}`; capture it).

- [ ] **Step 3: Fire on offline flush** — in `src/lib/offline.ts`, locate the queue-flush function that calls `createEntry` (grep `createEntry` there); after a queued entry syncs successfully, call `notifyNewRecord('entry', item.project_id, { projectName: '', link: '/' })` — pass project name by looking it up via a lightweight `supabase.from('projects').select('name').eq('id', ...)` inside notify helper when `projectName` empty? NO — keep simple: extend `notifyNewRecord` to fetch the project name itself when `opts.projectName === ''`. Implement that fallback in the helper (single extra select, inside the try).

- [ ] **Step 4: Fire on defect create** — in `CoopView.tsx`, find the `createDefect` call; after success:
`void notifyNewRecord('defect', coop.project_id, { projectName: projects.find((p) => p.id === coop.project_id)?.name ?? '', coopName: coop.name, link: `/defects/coop/${coop.id}` })`.

- [ ] **Step 5: Verify** — `npm run build` clean; `npm test` green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifyNewRecord.ts src/screens/EntryForm.tsx src/screens/defects/CoopView.tsx src/lib/offline.ts
git commit -m "feat(notify): new-record alerts to admins, project staff, and subscribers"
```

---

### Task 6: Alert-rules screen

**Files:**
- Create: `src/screens/AlertRules.tsx`, `src/lib/alertRules.ts`
- Modify: `src/lib/perms.ts` (area `alert_rules`), router (grep `Routes`/`path=` in `src/App.tsx` or `src/main.tsx`), user menu (grep the component rendering the notifications/profile menu — find via `התנתק` or `UserMenu`), `src/i18n.ts`

**Interfaces:**
- `alertRules.ts`: `AlertRule` type mirroring the table; `fetchMyRules()`, `createRule(r)`, `deleteRule(id)`, `toggleRule(id, active)` — plain supabase CRUD on `alert_rules` (RLS scopes to owner).

- [ ] **Step 1: perms.ts** — add `'alert_rules'` to `PermArea` union, `PERM_AREAS` (`{ key: 'alert_rules', label: 'כללי התראות' }`), `MEMBER_DEFAULTS.alert_rules: 'none'`.

- [ ] **Step 2: `src/lib/alertRules.ts`:**

```ts
import { supabase } from './supabase'

export interface AlertRule {
  id: string; email: string; project_id: string | null
  kind: 'missing' | 'filled'; frequency: 'daily' | 'weekly' | 'monthly'
  alert_hour: number; weekday: number | null; month_day: number | null
  active: boolean; created_at: string
}

export async function fetchMyRules(): Promise<AlertRule[]> {
  const { data, error } = await supabase.from('alert_rules').select('*').order('created_at')
  if (error) throw error
  return data as AlertRule[]
}
export async function createRule(r: Omit<AlertRule, 'id' | 'email' | 'created_at' | 'active'>): Promise<AlertRule> {
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('alert_rules')
    .insert({ ...r, email: u.user?.email?.toLowerCase() }).select('*').single()
  if (error) throw error
  return data as AlertRule
}
export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('alert_rules').delete().eq('id', id)
  if (error) throw error
}
export async function toggleRule(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('alert_rules').update({ active }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 3: `src/screens/AlertRules.tsx`** — follow the page pattern of `Coops.tsx` (`page`, `page__head`, `kicker`, `input`, `btn btn--primary`, `alert`, `empty` classes). Content:
  - Guard: `const { isAdmin } = useAuth(); const { can } = usePerms(); if (!isAdmin && !can('alert_rules')) return <div className="empty">{t('no_access')}</div>` (check exact `usePerms` API — explorer says `can`/`canEdit`; `no_access` key: grep i18n for an existing "אין הרשאה" key and reuse, else add).
  - List my rules: table/cards showing project name (`useStore().projects` lookup, null → `כל הפרויקטים`), kind label, frequency + hour, active toggle, delete button.
  - Add form: selects for project (with "כל הפרויקטים" empty option → `project_id: null`), kind (`חסרה רשומה` / `כשממלאים רשומה`), frequency (`יומי`/`שבועי`/`חודשי`), hour (0-23 number input, default 20), weekday select shown when weekly (א׳-ש׳), month-day (1-31) when monthly. Kind `filled` hides frequency/hour controls (immediate).
  - All strings via `t()` — add keys to `src/i18n.ts` (both langs): `alert_rules_title` (כללי התראות / Alert rules), `rule_kind_missing` (התראה כשחסרה רשומה / Alert when a record is missing), `rule_kind_filled` (התראה כשממלאים רשומה / Alert when a record is filled), `rule_all_projects` (כל הפרויקטים / All projects), `rule_daily` (יומי / Daily), `rule_weekly` (שבועי / Weekly), `rule_monthly` (חודשי / Monthly), `rule_until_hour` (עד שעה / By hour), `rule_add` (הוספת כלל / Add rule), `rule_delete` (מחיקה / Delete).

- [ ] **Step 4: Route + menu** — add route `/alert-rules` next to existing screen routes; add a menu item "כללי התראות" (🔔 icon consistent with menu style) in the user menu, visible under the same guard (`isAdmin || can('alert_rules')`).

- [ ] **Step 5: Verify** — `npm run build` clean, `npm test` green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/AlertRules.tsx src/lib/alertRules.ts src/lib/perms.ts src/i18n.ts <router file> <menu file>
git commit -m "feat(alerts): personal alert-rules screen with grantable access"
```

---

### Task 7: Apply migration + deploy + verify

**Files:** none new.

- [ ] **Step 1: Apply migration 0026 to the live Supabase project.** Check link state: `npx supabase projects list` / presence of `supabase/.temp/project-ref`. If linked: `npx supabase db push` (applies pending migrations). If NOT linked/authenticated: print the SQL and ask the user to paste `supabase/migrations/0026_prefill_alert_rules.sql` into the Supabase SQL editor — hard stop until confirmed, features depend on it.

- [ ] **Step 2: Full test + build** — `npm test` (all green), `npm run build` (clean).

- [ ] **Step 3: Push** — `git push origin main` (Vercel auto-deploys; push-classifier caveat per memory).

- [ ] **Step 4: Verify live** — poll deploy: `curl -s https://work-diary-phi.vercel.app/index.html`, get new asset hash, grep the JS bundle for a new marker string (e.g. `coops_manage`). Confirm `/.well-known` unaffected.

- [ ] **Step 5: Report** — summarize to user: what shipped, what needs their manual check on phone (prefill flow, coop delete as admin, report print, push on second device, rule at chosen hour), mark plan checkboxes done, commit plan update.
