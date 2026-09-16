# טופס מסירה (Handover form) — design

**Date:** 2026-09-16
**Source documents:** `טופס מסירת פרויקט POULTRY טופס 70` (blank, rev 1, 30.12.2022) and a filled
scanned example (`מסירה מעלה גמלא`).

## Purpose

A project handover (מסירה) is the moment Agrotop hands a finished poultry project to the
customer. Today it is a paper form 70: someone prints it, walks the site, ticks each system
תקין / לא תקין, collects the receiver's signature, and the paper is scanned back into the
office. The app already replaced the same paper loop for the safety briefing; this does it for
the handover, so the signed form exists as data, is searchable per project, and can be printed
or mailed without a scanner.

## Scope

One handover per project (the paper form's header is client / site / project nature), created
in a new "מסירה" navigation section. Out of scope: per-coop handovers, multi-party signatures,
approval workflow, and reminders.

## Decisions taken with the user

| Question | Decision |
|---|---|
| Systems list | Seeded with form 70's 14 rows, admin-editable afterwards (like `safety_topics`) |
| Signatures | Receiver only (שם מקבל הפרויקט + תפקיד + חתימה), as on the paper |
| Scope | Per project |
| Output | On-screen report in the paper's layout, print/PDF, and mail |
| Required fields | Every system marked, header complete, at least one attendee, receiver signed |
| Header fields | Prefilled from the project record, still editable |
| Default permission | Same as safety — members and managers get `edit` |
| Editing after signing | Admin only |

The "admin only" lock has a consequence worth stating plainly: because a form cannot be saved
without a signature, every stored row is a signed row, so the author can never correct their
own mistake — they must ask an admin. The user chose this deliberately over an unsigned-draft
state.

## Data model

New module `src/handover/`, mirroring `src/safety/`.

```ts
export interface HandoverAttendee { name: string; role: string }
export type SystemStatus = 'ok' | 'bad'
export interface HandoverSystemCheck { label: string; status: SystemStatus | null; note: string }

export interface HandoverSystem { id: string; label: string; sort_order: number; active: boolean }

export interface HandoverRec {
  id: string
  project_id: string
  handover_date: string        // date
  client_name: string          // שם הלקוח
  site_location: string        // מיקום האתר
  project_nature: string       // מהות הפרויקט
  attendees: HandoverAttendee[]   // נוכחים במעמד המסירה: שם + תפקיד
  systems: HandoverSystemCheck[]  // one entry per active system, label copied at save time
  notes: string                   // הערות (free text block)
  receiver_name: string           // שם מקבל הפרויקט
  receiver_role: string           // תפקיד
  receiver_signature: Sig         // vector strokes, reused from safety
  signed_at: string
  created_by: string
  created_at: string
  updated_at: string
}
export type HandoverInput = Omit<HandoverRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>
```

System labels are **copied into the row** at save time, exactly as `safety_forms.topics` copies
topic labels. A handover is a signed record of what was inspected; renaming a system in the
admin screen next year must not rewrite what the customer signed.

`Sig` and the signature pad come from `src/safety/signature.ts` and
`src/safety/SignaturePad.tsx` unchanged — vector strokes, ~1–3 KB, stored in the row, crisp in
print and mail. No storage bucket.

## Validation

`validateHandover(input): string[]` in `model.ts`, returning i18n keys of what is missing, so
the form screen and any future caller agree on the rule:

- `client_name`, `site_location`, `project_nature`, `handover_date` non-empty
- at least one attendee with both name and role
- every system entry has `status !== null`
- `receiver_name`, `receiver_role` non-empty and `receiver_signature` present

Per-system `note` stays optional, including for `bad` — the paper leaves it optional and the
person on site is standing in a coop.

## Database — `supabase/migrations/0077_handover_forms.sql`

```
handover_systems (id, label unique, sort_order, active, created_at)
  seeded with form 70's 14 rows, in the paper's order:
  אוורור · מערכת צינון · חימום · מערכת חשמל + מפיל וילון · מערכת מים · המטרה ·
  מיכלי תערובת · מערכת האבסה · מערכת שתייה · מערכת תלייה וכננות · מערכת תאים ·
  תאורה · מערכת זבל · מבנה/תשתית
  RLS: select is_member(); all is_admin()

handover_forms (columns per the model above)
  index (project_id, handover_date desc)
  RLS:
    select using (can_view('handover') or (is_member() and created_by = auth.uid()))
    insert with check (can_edit('handover') and created_by = auth.uid())
    update / delete using (is_admin())        -- signed documents are admin-only

perm_defaults: ('member','handover','edit'), ('manager','handover','edit')
```

`update`/`delete` deliberately do **not** mention `can_edit('handover')`: the lock is the
point, and an admin always has edit everywhere anyway.

## Screens and routes

| Route | Screen | Gate |
|---|---|---|
| `/handover` | `HandoverList` — project filter, date range, receiver-name search | `RequirePerm area="handover"` |
| `/handover/new` | `HandoverFormScreen` | `RequirePerm area="handover" edit` |
| `/handover/:id` | `HandoverView` — paper layout, print, mail, admin-only edit/delete | `RequirePerm area="handover"` |
| `/handover/:id/edit` | `HandoverFormScreen` | `RequireAdmin` |
| `/admin/handover-systems` | `HandoverSystemsAdmin` | `RequireAdmin` |

All lazy-loaded in `App.tsx` like the safety screens. `Shell.tsx` gets a new nav section
`מסירה` with the handover entry, and the admin section gets `ניהול מערכות מסירה`.

`HandoverFormScreen` prefills `client_name` and `project_nature` from the project name and
`site_location` from `projects.location` (there is no customer column on `projects`), all three
editable. It keeps an unsaved draft in `idb-keyval` and restores it, the way the safety form
does — a form filled in a coop with no signal must not be lost. There is no offline write
queue: a handover is signed in person and saved once, and a queued signed document that
silently lands later is worse than an error the user sees.

`HandoverView` reuses `printPage()` and `SendMailDialog`, and renders the same HTML that the
mail body carries, so screen, print and mail cannot drift.

## Report layout

`handoverFormHtml(rec, projectName, lang)` produces the paper's structure: title
`מסירת פרויקט`, a header row of לקוח / מיקום / מהות / תאריך, the attendees table
(נוכחים במעמד המסירה · תפקיד), the systems table (מערכת · תקין / לא תקין · הערות), the free
notes block, the line `* הפרויקט תחת שנת אחריות אחת מיום המסירה`, and the signature block
(שם מקבל הפרויקט · תפקיד · חתימה) rendered by `sigSvg`.

RTL is carried by inline styles and `dir="rtl"`, never by `align`/`dir` attributes that
Chromium's clipboard sanitizer strips — the constraint the existing report code already lives
under.

## Permissions

`PermArea` gains `'handover'`; `PERM_AREAS` gains
`{ key: 'handover', label: 'טופסי מסירה', label_en: 'Handover forms' }`; `MEMBER_DEFAULTS` and
`MANAGER_DEFAULTS` both get `handover: 'edit'`. `perms.sql.test.ts` already compares those to
`perm_defaults`, so the migration's insert and the client constants are held together by the
existing test.

## Testing

- `src/handover/model.test.ts` — `validateHandover` rejects each missing-field case and accepts
  a complete form. This is the test that keeps an unsigned or half-ticked handover out of the
  database, which is the whole value of the record.
- `src/handover/report.test.ts` — the HTML contains every system row with its status, the
  attendees, and a signature path; escaping holds for a customer name containing `<`.
- `src/handover/handover.sql.test.ts` — the 14 seeded labels in the migration match the
  client-side fallback constant, following `gateItems.sql.test.ts`.
- `src/lib/perms.sql.test.ts` — unchanged, now also covering the new area.

## Risks

- **No unsigned state.** A site visit interrupted before the signature produces no row, only an
  IndexedDB draft on that device. Accepted; the draft restore is what covers it.
- **Prefill guesswork.** `projects` has no customer column, so `client_name` is prefilled from
  the project name and is often wrong until edited. Cheaper than adding a customer column now;
  if handovers show the field always being retyped, a `projects.client_name` column is the
  follow-up.
