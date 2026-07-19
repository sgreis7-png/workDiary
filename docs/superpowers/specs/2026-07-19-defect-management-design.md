# ניהול ליקויים — תפיסת סיום שלב (Agrotop) — Design

Source of truth: `כלי תפיסת סיום שלב - Agrotop - גרסה 3 (1).xlsx` (11 sheets). The app
reproduces it 1:1 — every sheet is a tab, every dropdown keeps the exact Excel options,
every ⚠ rule is enforced.

## Mode selection

- After login the user lands on `/mode`: two cards — **ניהול עבודה** (existing app,
  unchanged) and **ניהול ליקויים** (new module).
- Choice persisted in `localStorage`; a switcher button in the Shell header swaps modes.
- New module routes live under `/defects/*` inside the existing authed Shell.

## Hierarchy

Project (existing `projects` table) → **לול (coop)** → tabs. The Excel is "one file per
coop"; a coop row in the app is one Excel file instance.

Screens:
- `/defects` — pick project (active projects list), then coops of that project + "לול חדש".
- `/defects/coop/:id` — the coop workspace with a scrollable RTL tab strip:
  `הנחיות | פתיחת פרויקט | ריכוז סטטוס | טרום יציקה | שער 1 | שער 2 | שער 3 | שער 4 | שער 5 | שער 6 | יומן ליקויים`

## Tabs — 1:1 with the workbook

### הנחיות
Static content of the sheet (what the tool is, how to fill, gate-passage rules with
🟡/🟠/🔴, pre-pour mandatory stop, per-coop principle, reference documents, master-file
note). Read-only.

### פתיחת פרויקט
Filled once per coop:
- פרויקט / אתר (from parent project), מספר לולים בחווה (number), לול מספר (text),
  סוג לול (`פטם | מטילות | רבייה`), ספק ציוד גידול (text),
  חימום / מזרוני צינון / תריס מאוורר מנהרה (`יש | אין` each),
  מנהל ביצוע, מפקח שטח (text), תאריך פתיחה (date).
- מטריצת אחריות — 7 fixed rows: גז — חיבור, הרצה ואישור · גנרטור חירום ו-ATS ·
  קו מים ראשי עד ראש המערכת · חשמל — הזנה עד הלוח הראשי · בודק חשמל מוסמך ·
  ציוד גידול — הרצה ואישור ספק · אחר: ____.
  Columns: אחריות (`Agrotop | לקוח | גורם חיצוני`), גורם חיצוני (מי?), הערות.
- Sheet footnotes (⚠) displayed under the form.

### טרום יציקה + שערים 1–6 (checklist gates)
Item texts, numbering, emoji (🛡️🔧🎨📄📝🔍✅✍️), headers and ⚠ footnotes copied verbatim
from the workbook into a code constant (`src/defects/checklist.ts`) — 7 gates:
pre_pour (7 items), gate1 (10), gate2 (10), gate3 (9), gate4 (10), gate5 (19), gate6 (18).

Per item columns (exact Excel dropdowns):
- סטטוס: `בוצע | לא בוצע | לא רלוונטי` (blank = טרם)
- חומרה (אם לא בוצע): `🔴 קריטי | 🟠 מז'ורי | 🟡 מינורי` — enabled only when סטטוס=לא בוצע
- הערה (free text)
- בוצע עם גורם חיצוני (free text)

Signature block per gate: מנהל ביצוע + מפקח — drawn signature (canvas → PNG in storage)
+ name + auto date.

### ריכוז סטטוס
Live-computed table, same formulas as the sheet: per gate — בוצע / לא בוצע / לא רלוונטי /
טרם counts, % הושלם = בוצע / (total − לא רלוונטי) (1 when denominator 0), and the list of
item numbers marked "לא בוצע" ("—" when none). Footer ⚠ note shown.

### יומן ליקויים
Table, columns exactly: מס' | שער (`טרום יציקה | שער 1..6`) | סעיף (dropdown filtered by
the chosen gate — the INDIRECT trick) | תיאור הליקוי | חומרה (🔴/🟠/🟡) | אחראי לתיקון |
תאריך יעד לתיקון | סטטוס (`פתוח | נסגר`) | נסגר בתאריך | הערות / אסמכתא לסגירה.
Golden-rule footer (⚠ כלל זהב) shown.

## Rules (full enforcement)

1. סטטוס = "לא בוצע" ⇒ חומרה becomes required, and a defect row is auto-opened in
   יומן ליקויים pre-filled with the gate + item (user completes description/assignee/due).
2. **טרום יציקה is a hard stop**: gate cannot be signed until all 7 items are "בוצע" —
   no concessions, no override. (Marking items לא רלוונטי does not satisfy it.)
3. Gate signing is blocked while the gate has an open 🔴 defect. An open 🟠 defect
   requires a **טופס ויתור (Concession)** — double drawn signature (מנהל ביצוע + מפקח) +
   reason — before the gate can be signed. 🟡 passes with documentation + due date.
4. **שער 6** is locked (read-only banner) until gates 1–5 each have both signatures and
   there is no open 🔴/🟠 defect anywhere.
5. Configuration-driven "לא רלוונטי" (auto-set with an explanatory note, user may override):
   - אין חימום → שער 5 סעיף 11
   - אין תריס מאוורר מנהרה → שער 4 סעיף 5
   - אין מזרוני צינון → שער 4 סעיף 6, שער 5 סעיף 13
   - סוג לול = פטם → שער 5 סעיף 6 (מערכת הטלה)
   - מטריצת אחריות: גנרטור = לקוח/חיצוני → שער 6 סעיף 9; בודק חשמל = לקוח/חיצוני →
     שער 6 סעיף 15 — with "ר' מטריצת אחריות" note.
6. Signing a gate freezes its checklist (edits require removing signatures, allowed only
   while שער 6 is unsigned).

## Data model (Supabase migration `0020_defect_management.sql`)

- `coops` — id, project_id FK, name, coop_type, farm_coop_count, equipment_supplier,
  has_heating, has_cooling_pads, has_tunnel_shutter (bool), execution_manager,
  field_supervisor, opened_on, created_by, created_at.
- `coop_responsibilities` — coop_id, domain_key (7 fixed), responsible
  (`agrotop|customer|external`), external_who, notes.
- `coop_checklist_items` — coop_id, gate, item_no, status, severity, note, external_by;
  unique (coop_id, gate, item_no). Item texts are NOT stored — they live in code.
- `coop_defects` — coop_id, seq, gate, item_no, description, severity, assignee,
  due_date, status (`open|closed`), closed_on, closure_note.
- `coop_signatures` — coop_id, gate, role (`manager|supervisor`), signer_name,
  signature_path (storage `photos` bucket, `signatures/` prefix), signed_at.
- `coop_concessions` — coop_id, gate, defect_id, reason, manager/supervisor name +
  signature_path + signed_at.

RLS mirrors `entries`: coop rows visible/editable to users assigned to the parent
project (same policy pattern as migration 0010) and admins.

Hebrew display values (בוצע, 🔴 קריטי, פתוח…) are stored as canonical ids in the DB and
rendered via the constants file, so the UI shows the exact Excel strings.

## Out of scope (v1)

Offline sync for the new module (online-only, like admin screens), PDF/VP Go-No-Go
export, email reports.
