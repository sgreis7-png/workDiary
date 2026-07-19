# Defect Management (תפיסת סיום שלב) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second app mode "ניהול ליקויים" reproducing the Agrotop stage-gate QC workbook 1:1 (11 sheets → 11 tabs per coop), with full rule enforcement, under existing projects.

**Architecture:** New `src/defects/` domain folder (constants + rules + api) and `src/screens/defects/` UI. One Supabase migration adds 6 tables with entries-style RLS. Mode chooser screen after login; existing app untouched otherwise.

**Tech Stack:** React 18 + react-router 6, Supabase (postgres + storage + RLS), vitest. No new deps (signature pad = hand-rolled canvas).

**Spec:** `docs/superpowers/specs/2026-07-19-defect-management-design.md`
**Verbatim Hebrew content source:** scratchpad `excel-dump.txt` (full cell dump of the workbook). All item texts, headers, ⚠ notes, and dropdown option strings are copied from there character-for-character (incl. emoji).

## Global Constraints

- UI strings shown to users = exact Excel strings: statuses `בוצע / לא בוצע / לא רלוונטי`, severities `🔴 קריטי / 🟠 מז'ורי / 🟡 מינורי`, defect status `פתוח / נסגר`, coop types `פטם / מטילות / רבייה`, yes/no `יש / אין`, responsibility `Agrotop / לקוח / גורם חיצוני`.
- DB stores canonical ids (`done|not_done|na`, `critical|major|minor`, `open|closed`, `agrotop|customer|external`), rendered via constants.
- Gates keyed `pre_pour, gate1..gate6`; item counts 7/10/10/9/10/19/18.
- RTL Hebrew-first, matching existing screens' style (`src/styles`).
- New module online-only; no offline queue.

---

### Task 1: Domain constants — `src/defects/model.ts`

**Files:** Create `src/defects/model.ts`; Test `src/defects/model.test.ts`

**Produces:**
- `type GateKey = 'pre_pour'|'gate1'|...|'gate6'`; `GATE_ORDER: GateKey[]`
- `type ItemStatus = 'done'|'not_done'|'na'`; `type Severity = 'critical'|'major'|'minor'`
- `STATUS_LABELS`, `SEVERITY_LABELS`, `DEFECT_STATUS_LABELS`, `COOP_TYPE_LABELS`, `YES_NO_LABELS`, `RESPONSIBLE_LABELS` (id→Hebrew exact strings)
- `interface GateDef { key: GateKey; title: string; subtitle?: string; icon: string; items: {no: number; text: string}[]; footnotes: string[] }`
- `GATES: Record<GateKey, GateDef>` — all 83 items verbatim from dump
- `GUIDELINES: {title: string; blocks: {heading?: string; text: string}[]}` — הנחיות sheet
- `RESP_DOMAINS: {key: string; label: string}[]` — 7 matrix rows
- `PROJECT_OPEN_FOOTNOTES`, `DEFECT_LOG_GOLDEN_RULE`, `STATUS_SUMMARY_FOOTNOTE` strings

Steps: write test asserting gate item counts (7,10,10,9,10,19,18), exact first/last item text per gate, exact option label sets → fail → implement → pass → commit.

### Task 2: Rules engine — `src/defects/rules.ts`

**Files:** Create `src/defects/rules.ts`; Test `src/defects/rules.test.ts`

**Consumes:** Task 1 types.
**Produces (pure functions, no IO):**
- `interface CoopConfig { coopType: 'broiler'|'layer'|'breeder'; hasHeating: boolean; hasCoolingPads: boolean; hasTunnelShutter: boolean; responsibilities: Record<string,'agrotop'|'customer'|'external'> }`
- `autoNaItems(cfg): {gate: GateKey; itemNo: number; reason: string}[]` — spec §rules-5 mapping (heating→gate5#11, shutter→gate4#5, pads→gate4#6+gate5#13, broiler→gate5#6, generator resp→gate6#9, electrician resp→gate6#15)
- `gateSummary(items): {done; notDone; na; pending; pct; notDoneNos: number[]}` — Excel formulas (pct = done/(total−na), 1 when denom 0)
- `canSignGate(gate, items, defects, concessions): {ok: boolean; reasons: string[]}` — pre_pour: all 7 done; others: no open critical defect for gate, open major needs concession for that defect
- `isGate6Unlocked(signatures, defects): {ok: boolean; reasons: string[]}` — gates1-5 have both roles signed + no open critical/major anywhere
- `severityRequired(status) = status==='not_done'`

TDD: table-driven tests for each rule incl. edge cases (na doesn't count toward pre_pour pass; closed defects don't block; pct rounding).

### Task 3: DB migration — `supabase/migrations/0020_defect_management.sql`

**Files:** Create migration. No unit test; verified by `supabase db push` + smoke query in Task 4.

Tables per spec §data-model (coops, coop_responsibilities, coop_checklist_items, coop_defects, coop_signatures, coop_concessions), all FK→coops on delete cascade, coops FK→projects. RLS: enable on all; policy = member assigned to parent project (reuse `project_assignments` pattern from 0010) or admin; insert/update/delete same. `coop_defects.seq` int per coop (max+1 client-side). Checklist unique `(coop_id, gate, item_no)` upserted.

### Task 4: Data api — `src/defects/api.ts`

**Files:** Create `src/defects/api.ts`; Test: typecheck only (thin Supabase wrappers, same as existing `src/api.ts` which is untested).

**Produces:**
- `interface Coop {…}` mirroring table + `fetchCoops(projectId)`, `createCoop(input)`, `updateCoop(id, patch)`
- `fetchCoopBundle(coopId)` → `{coop, responsibilities, items, defects, signatures, concessions}` (parallel selects)
- `saveResponsibility`, `upsertChecklistItem`, `createDefect`, `updateDefect`, `signGate(coopId, gate, role, name, pngBlob)` (upload to `photos` bucket `signatures/<coopId>/<gate>-<role>.png`, insert row), `removeGateSignatures`, `createConcession(…, two pngBlobs)`
- signed-URL hydration for signature display (reuse pattern from `src/api.ts signPaths`)

### Task 5: Mode chooser + routing + shell switcher

**Files:** Create `src/screens/ModeSelect.tsx`; Modify `src/App.tsx` (routes `/mode`, `/defects`, `/defects/coop/:id`; redirect index → stored mode), `src/components/Shell.tsx` (mode switch button + defects nav when in defects mode).

`localStorage.appMode = 'work'|'defects'`; login flow lands on `/mode` when unset. Two big RTL cards: ניהול עבודה / ניהול ליקויים.

### Task 6: Coops screen — `src/screens/defects/Coops.tsx`

Project picker (active projects via existing store) → coop cards (name, type, % overall from rules.gateSummary over fetched items) → create-coop dialog (name only; rest filled in פתיחת פרויקט tab). Navigate to `/defects/coop/:id`.

### Task 7: Coop workspace + tabs

**Files:** Create `src/screens/defects/CoopView.tsx` (tab strip + data bundle load + save plumbing), `GuidelinesTab.tsx`, `ProjectOpenTab.tsx`, `StatusSummaryTab.tsx`, `GateTab.tsx` (shared by pre_pour+gates, props: GateDef), `DefectLogTab.tsx`, `SignaturePad.tsx` (canvas draw → PNG blob), `ConcessionDialog.tsx`. Styles appended to `src/styles` per existing convention.

Behavior wired to rules:
- GateTab row: status select (3 options + empty=טרם), severity select enabled iff not_done, note, external inputs; autosave on change (upsert).
- Setting not_done → severity required inline + auto-create defect (gate,itemNo, severity synced) if none open for that item; toast linking to יומן ליקויים.
- Auto-NA chips from `autoNaItems` with reason tooltip; applied on config save, user-overridable.
- Signature blocks: disabled with reasons list from `canSignGate`; major-defect path opens ConcessionDialog (reason + two pads). Signed gate → inputs readonly + "הסר חתימות" (hidden once gate6 signed).
- Gate6 locked banner w/ reasons from `isGate6Unlocked`.
- StatusSummaryTab renders `gateSummary` per gate exactly like the sheet (incl. "—").
- DefectLogTab full-column table; סעיף dropdown options = `GATES[gate].items` of the row's chosen gate; closing a defect sets closed_on today default.

### Task 8: Verify + deploy

- `npm run test`, `npm run build` green.
- `/verify` skill: drive the flow (create coop → fill config → pre-pour block → gate flow → defect auto-open → concession → gate6 unlock) via dev server + playwright screenshots.
- `supabase db push` (linked project), commit, `git push origin main` (memory: classifier may misfire — retry; Vercel auto-deploys, verify via live-bundle grep per memory).
