# מסירה — שדות שמוסיפים בשטח (user-added fields)

**Date:** 2026-09-17
**Builds on:** `docs/superpowers/specs/2026-09-16-handover-form-design.md` (the handover module,
live since 2026-09-16, migrations 0077–0078).

## Purpose

The handover form ships with the 14 systems of paper form 70 and a fixed header. Real sites
carry things the paper never listed — a generator, a gate motor, an order number, a coop
number. Today only an admin can add a system, and there is nowhere at all to put an extra
header value. The field manager is standing in a coop with the customer; asking them to phone
an admin is how the app loses to a printed page and a pen.

So: anyone who can fill a handover can add fields to it. What exists today stays fixed.

## Decisions taken with the user

| Question | Decision |
|---|---|
| What kind of field | Both: extra rows in the systems table, and extra header fields |
| Who sees an added field | The person adding chooses: this handover only, or every handover from now on |
| Who may delete an added field | Its author and an admin |
| The existing 14 systems and the fixed header | Never deletable, by anyone |

## The two axes

A field added to a handover varies on two axes, and the product is four cases:

|  | **this form only** | **shared from now on** |
|---|---|---|
| **system row** | an entry in the record's `systems` array with no catalogue row behind it | a new row in `handover_systems` |
| **header field** | an entry in the record's new `extra_fields` array | a new row in the new `handover_extra_fields` table |

The screen presents this as one checkbox at the point of adding — "להוסיף לכל המסירות" — not as
two different features.

### Why ad-hoc needs no table

A record already copies its system labels at save time, precisely so a later catalogue rename
cannot rewrite a signed document. An ad-hoc row is simply a label that was never in the
catalogue: it saves, prints and mails identically. The same holds for `extra_fields`. No new
storage concept, no cleanup path, nothing to garbage-collect.

## Data model

New column on `handover_forms`:

```sql
extra_fields jsonb not null default '[]'   -- [{label, value}]
```

```ts
export interface HandoverExtraField { label: string; value: string }
```

New catalogue table, mirroring `handover_systems`:

```sql
handover_extra_fields (id, label unique, sort_order, active, builtin, created_by, created_at)
```

`handover_systems` gains the two columns that make authorship and the built-in lock explicit:

```sql
builtin boolean not null default false     -- true for the 14 seeded rows; never deletable
created_by uuid                            -- null for seeded rows
```

A header field is free text — label plus value. There are no field types (date, number,
checkbox). A form builder is a different feature with a different cost; someone who needs a
date types a date. If handovers show people fighting the text box, typed fields are the
follow-up.

## Permissions — migration 0079

`handover_systems` is admin-only today. It opens up:

```
insert  : can_edit('handover') and created_by = auth.uid() and builtin = false
update  : is_admin() or (created_by = auth.uid())          -- never a builtin row's label
delete  : (is_admin() or created_by = auth.uid()) and builtin = false
select  : is_member()                                       (unchanged)
```

`handover_extra_fields` gets the identical four policies. The `builtin = false` guard on
delete is what enforces "what exists today stays fixed" — an admin cannot delete one either,
which is deliberate: the 14 rows are the paper form, and a form 70 handover missing אוורור is
not a form 70 handover. Deactivating a built-in row stays possible (that is what `active` is
for) and is the reversible way to hide one.

Seeded rows are marked `builtin = true` by label in the same migration.

## Validation

- An added **system row** is a system: it must be marked תקין/לא תקין like the other fourteen.
  `validateHandover`'s existing `systems` rule already covers it — no change.
- An added **header field** is optional. A shared field that were required would let one person
  block everyone else's handovers until they filled it in, which is a worse failure than a
  blank value. Blank-labelled rows are dropped at save rather than stored.

The database constraint from 0078 is unaffected: `extra_fields` has no required shape.

## Screens

**`HandoverFormScreen`** — two "+ הוספה" affordances:

- under the systems table: a label input, an add button, and the "להוסיף לכל המסירות" checkbox.
  Adding appends an unmarked row to `systems`; with the checkbox, it also inserts into
  `handover_systems` first, so the row is in the catalogue before the form saves.
- under the header grid: the same three controls for a label, appending to `extra_fields`.

A row the user added in this session can be removed from the form with the same ✕ the
attendees table uses. Removing a row from the form never deletes a catalogue row — catalogue
deletion lives in the admin screens.

**`HandoverSystemsAdmin`** gains a ✕ on rows where `builtin` is false and the viewer is the
author or an admin; built-in rows show a lock affordance instead. A second, identical screen
`HandoverExtraFieldsAdmin` manages the header-field catalogue, reachable from the same admin
nav section.

**`HandoverView` / report** — extra header fields render as a two-column table directly under
the existing header table; extra system rows are already indistinguishable from the rest.

## Testing

- `validateHandover` unchanged; `model.test.ts` gains a case asserting an ad-hoc system row is
  held to the same marking rule, and that a blank-labelled extra field is dropped by the
  save-shaping helper.
- `extraFields` shaping helper (`cleanExtraFields`) gets its own tests: blank labels dropped,
  order preserved, values trimmed.
- `report.test.ts` gains a case for extra header fields appearing with their labels and values,
  escaped.
- A new `builtin.sql.test.ts` asserts migration 0079 marks exactly the 14 labels of
  `HANDOVER_SYSTEM_SEED` as built-in — the same mirror pattern as `systems.sql.test.ts`. If the
  two drift, a built-in row becomes deletable, which is the one thing this feature promises
  cannot happen.

## Risks

- **Catalogue sprawl.** Anyone can add a shared system, and nobody prunes. Mitigated by
  `active` and by authorship being visible in the admin screen; if it becomes noise, a future
  change can scope shared fields to a project.
- **Duplicate labels.** `label` stays unique, so a second person adding "גנרטור" gets a
  constraint error. The screen turns that into "השדה כבר קיים" rather than a raw Postgres
  message.
