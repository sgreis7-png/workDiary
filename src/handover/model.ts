import { sigIsEmpty, type Sig } from '../safety/signature'

export interface HandoverAttendee { name: string; role: string }
export type SystemStatus = 'ok' | 'bad'
export interface HandoverSystemCheck { label: string; status: SystemStatus | null; note: string }
export interface HandoverSystem {
  id: string; label: string; sort_order: number; active: boolean
  builtin: boolean; created_by: string | null
}
export interface HandoverExtraField { label: string; value: string }
/** A row of the shared header-field catalogue (handover_extra_fields). */
export interface HandoverExtraFieldDef {
  id: string; label: string; sort_order: number; active: boolean
  builtin: boolean; created_by: string | null
}

export interface HandoverRec {
  id: string
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  notes: string
  extra_fields: HandoverExtraField[]
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
  signed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
export type HandoverInput = Omit<HandoverRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>

/** What the form screen holds while it is being filled — the subset validation judges. */
export interface HandoverDraft {
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  extra_fields: HandoverExtraField[]
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
}

export type HandoverError = 'project' | 'header' | 'attendee' | 'systems' | 'receiver'

export const blankAttendee = (): HandoverAttendee => ({ name: '', role: '' })

/**
 * Everything the paper form leaves no room to skip. A handover is the customer's receipt:
 * a row saved with an unticked system or no signature is worth less than the paper it
 * replaced, so this is the single gate both the screen and any later caller go through.
 */
export function validateHandover(d: HandoverDraft): HandoverError[] {
  const errs: HandoverError[] = []
  if (!d.project_id) errs.push('project')
  if (!d.handover_date || !d.client_name.trim() || !d.site_location.trim() || !d.project_nature.trim()) {
    errs.push('header')
  }
  if (!d.attendees.some((a) => a.name.trim() && a.role.trim())) errs.push('attendee')
  if (d.systems.length === 0 || d.systems.some((s) => s.status == null)) errs.push('systems')
  if (!d.receiver_name.trim() || !d.receiver_role.trim() || sigIsEmpty(d.receiver_signature)) {
    errs.push('receiver')
  }
  return errs
}

/**
 * The rows the form shows: every active system, plus any system the saved record carries
 * that is no longer active. Answers already given are preserved by label.
 */
export function systemChecksFor(
  catalogue: HandoverSystem[], saved: HandoverSystemCheck[],
): HandoverSystemCheck[] {
  const byLabel = new Map(saved.map((s) => [s.label, s]))
  const active = catalogue.filter((s) => s.active)
  const rows = active.map((s) => byLabel.get(s.label) ?? { label: s.label, status: null, note: '' })
  const activeLabels = new Set(active.map((s) => s.label))
  const retired = saved.filter((s) => !activeLabels.has(s.label))
  return [...rows, ...retired]
}

/** Save shaping: a row without a label is not a field. Values may legitimately be blank. */
export function cleanExtraFields(rows: HandoverExtraField[]): HandoverExtraField[] {
  return rows
    .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
    .filter((r) => r.label !== '')
}

/**
 * The header rows the form shows: every active catalogue field, plus any field the saved
 * record carries that is no longer active. Values already entered are preserved by label.
 * Same rule as systemChecksFor — a signed document keeps what it was signed with.
 */
export function extraFieldsFor(
  catalogue: HandoverExtraFieldDef[], saved: HandoverExtraField[],
): HandoverExtraField[] {
  const byLabel = new Map(saved.map((f) => [f.label, f]))
  const active = catalogue.filter((f) => f.active)
  const rows = active.map((f) => byLabel.get(f.label) ?? { label: f.label, value: '' })
  const activeLabels = new Set(active.map((f) => f.label))
  return [...rows, ...saved.filter((f) => !activeLabels.has(f.label))]
}

/**
 * May this viewer rename or delete a catalogue row? Mirrors 0079's policies: never a builtin
 * row, otherwise its author or an admin. Kept here so the screens and the database agree.
 */
export function canManageCatalogueRow(
  row: { builtin: boolean; created_by: string | null },
  userId: string | undefined, isAdmin: boolean,
): boolean {
  if (row.builtin) return false
  return isAdmin || (!!userId && row.created_by === userId)
}

/** Free-text filter for the list screen: customer, receiver or site. */
export function handoverMatchesText(rec: HandoverRec, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return [rec.client_name, rec.receiver_name, rec.site_location]
    .some((v) => (v ?? '').toLowerCase().includes(q))
}
