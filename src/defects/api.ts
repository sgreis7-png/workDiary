// Supabase data access for the defect-management (stage-gate) module.
// Mirrors src/api.ts conventions: thin async wrappers, throw on error.
import { supabase } from '../lib/supabase'
import { signPaths } from '../lib/storagePaths'
import type { GateKey, ItemStatus, Severity, DefectStatus, CoopType, Responsible, SignatureRole } from './model'
import { cachePut, cacheGet, queueOp, isNetworkError, replayOutbox, type DefectOp } from './offline'
import { notifyNewDefect } from '../lib/notifyNewRecord'

export interface Coop {
  id: string; project_id: string; name: string
  coop_type: CoopType | null; farm_coop_count: number | null; equipment_supplier: string | null
  has_heating: boolean; has_cooling_pads: boolean; has_tunnel_shutter: boolean
  execution_manager: string | null; field_supervisor: string | null; opened_on: string | null
  created_by: string | null; created_at: string
}
export interface CoopResponsibility {
  coop_id: string; domain_key: string
  responsible: Responsible | null; external_who: string | null; notes: string | null
}
export interface ChecklistItem {
  coop_id: string; gate: GateKey; item_no: number
  status: ItemStatus | null; severity: Severity | null
  note: string | null; external_by: string | null; auto_na_reason: string | null
}
export interface Defect {
  id: string; coop_id: string; seq: number; gate: GateKey; item_no: number | null
  description: string | null; severity: Severity | null; assignee: string | null
  assignee_email: string | null
  due_date: string | null; status: DefectStatus; closed_on: string | null; closure_note: string | null
}
export interface GateSignature {
  coop_id: string; gate: GateKey; role: SignatureRole
  signer_name: string; signature_path: string; signed_at: string; signature_url?: string
}
export interface Concession {
  id: string; coop_id: string; gate: GateKey; defect_id: string; reason: string | null
  manager_name: string; manager_signature_path: string
  supervisor_name: string; supervisor_signature_path: string; signed_at: string
}

export interface CoopBundle {
  coop: Coop
  responsibilities: CoopResponsibility[]
  items: ChecklistItem[]
  defects: Defect[]
  signatures: GateSignature[]
  concessions: Concession[]
}

// ---------- coops ----------

const COOP_COLS = 'id,project_id,name,coop_type,farm_coop_count,equipment_supplier,has_heating,has_cooling_pads,has_tunnel_shutter,execution_manager,field_supervisor,opened_on,created_by,created_at'

export async function fetchCoops(projectId: string): Promise<Coop[]> {
  const { data, error } = await supabase.from('coops').select(COOP_COLS)
    .eq('project_id', projectId).order('created_at')
  if (error) throw error
  return data as Coop[]
}

export async function fetchAllCoops(): Promise<Coop[]> {
  try {
    const { data, error } = await supabase.from('coops').select(COOP_COLS).order('created_at')
    if (error) throw error
    cachePut('coops', data)
    return data as Coop[]
  } catch (e) {
    const cached = await cacheGet<Coop[]>('coops')
    if (cached && isNetworkError(e)) return cached
    throw e
  }
}

export async function createCoop(projectId: string, name: string): Promise<Coop> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('coops')
    .insert({ project_id: projectId, name, created_by: userData.user?.id })
    .select(COOP_COLS).single()
  if (error) throw error
  return data as Coop
}

export async function updateCoop(id: string, patch: Partial<Omit<Coop, 'id' | 'created_at' | 'created_by'>>): Promise<void> {
  try {
    const { error } = await supabase.from('coops').update(patch).eq('id', id)
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) { await queueOp({ kind: 'coop_patch', id, patch: patch as Record<string, unknown> }); return }
    throw e
  }
}

export async function deleteCoop(id: string): Promise<void> {
  const { error } = await supabase.from('coops').delete().eq('id', id)
  if (error) throw error
}

// ---------- full bundle ----------

export async function fetchCoopBundle(coopId: string): Promise<CoopBundle> {
  try {
    const bundle = await fetchCoopBundleRemote(coopId)
    cachePut(`bundle:${coopId}`, bundle)
    return bundle
  } catch (e) {
    const cached = await cacheGet<CoopBundle>(`bundle:${coopId}`)
    if (cached && isNetworkError(e)) return cached
    throw e
  }
}

async function fetchCoopBundleRemote(coopId: string): Promise<CoopBundle> {
  const [coopQ, respQ, itemsQ, defectsQ, sigQ, concQ] = await Promise.all([
    supabase.from('coops').select(COOP_COLS).eq('id', coopId).single(),
    supabase.from('coop_responsibilities').select('*').eq('coop_id', coopId),
    supabase.from('coop_checklist_items').select('*').eq('coop_id', coopId),
    supabase.from('coop_defects').select('*').eq('coop_id', coopId).order('seq'),
    supabase.from('coop_signatures').select('*').eq('coop_id', coopId),
    supabase.from('coop_concessions').select('*').eq('coop_id', coopId),
  ])
  for (const q of [coopQ, respQ, itemsQ, defectsQ, sigQ, concQ]) if (q.error) throw q.error
  const signatures = await hydrateSignatureUrls(sigQ.data as GateSignature[])
  return {
    coop: coopQ.data as Coop,
    responsibilities: respQ.data as CoopResponsibility[],
    items: itemsQ.data as ChecklistItem[],
    defects: defectsQ.data as Defect[],
    signatures,
    concessions: concQ.data as Concession[],
  }
}

async function hydrateSignatureUrls(sigs: GateSignature[]): Promise<GateSignature[]> {
  const m = await signPaths(sigs.map((s) => s.signature_path))
  return sigs.map((s) => ({ ...s, signature_url: m[s.signature_path] }))
}

// ---------- responsibilities / checklist ----------

export async function saveResponsibility(row: CoopResponsibility): Promise<void> {
  try {
    const { error } = await supabase.from('coop_responsibilities')
      .upsert(row, { onConflict: 'coop_id,domain_key' })
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) { await queueOp({ kind: 'resp', row: row as unknown as Record<string, unknown> }); return }
    throw e
  }
}

export async function upsertChecklistItem(row: Omit<ChecklistItem, 'auto_na_reason'> & { auto_na_reason?: string | null }): Promise<void> {
  const payload = { ...row, updated_at: new Date().toISOString() }
  try {
    const { error } = await supabase.from('coop_checklist_items')
      .upsert(payload, { onConflict: 'coop_id,gate,item_no' })
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) { await queueOp({ kind: 'item', row: payload }); return }
    throw e
  }
}

// ---------- defects ----------

export async function createDefect(coopId: string, init: Partial<Defect>): Promise<Defect> {
  const base = {
    coop_id: coopId, gate: init.gate, item_no: init.item_no ?? null, description: init.description ?? null,
    severity: init.severity ?? null, assignee: init.assignee ?? null, assignee_email: init.assignee_email ?? null,
    due_date: init.due_date ?? null, status: init.status ?? 'open', closed_on: init.closed_on ?? null,
    closure_note: init.closure_note ?? null,
  }
  try {
    const { data: maxRow, error: maxErr } = await supabase.from('coop_defects')
      .select('seq').eq('coop_id', coopId).order('seq', { ascending: false }).limit(1).maybeSingle()
    if (maxErr) throw maxErr
    const seq = (maxRow?.seq ?? 0) + 1
    const { data, error } = await supabase.from('coop_defects')
      .insert({ ...base, seq }).select('*').single()
    if (error) throw error
    notifyNewDefect(coopId, base.description)
    return data as Defect
  } catch (e) {
    if (isNetworkError(e)) {
      const row = { ...base, id: crypto.randomUUID(), seq: Math.floor(Date.now() / 1000) % 100000 }
      await queueOp({ kind: 'defect_create', row })
      return { ...row, created_at: new Date().toISOString() } as unknown as Defect
    }
    throw e
  }
}

export async function updateDefect(id: string, patch: Partial<Defect>): Promise<void> {
  try {
    const { error } = await supabase.from('coop_defects').update(patch).eq('id', id)
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) { await queueOp({ kind: 'defect_patch', id, patch: patch as Record<string, unknown> }); return }
    throw e
  }
}

export async function deleteDefect(id: string): Promise<void> {
  const { error } = await supabase.from('coop_defects').delete().eq('id', id)
  if (error) throw error
}

// ---------- signatures / concessions ----------

async function uploadSignature(path: string, png: Blob): Promise<void> {
  const { error } = await supabase.storage.from('photos').upload(path, png, { contentType: 'image/png', upsert: true })
  if (error) throw error
}

export async function signGate(coopId: string, gate: GateKey, role: SignatureRole, signerName: string, png: Blob): Promise<void> {
  const path = `signatures/${coopId}/${gate}-${role}-${Date.now()}.png`
  await uploadSignature(path, png)
  const { error } = await supabase.from('coop_signatures')
    .upsert({ coop_id: coopId, gate, role, signer_name: signerName, signature_path: path, signed_at: new Date().toISOString() }, { onConflict: 'coop_id,gate,role' })
  if (error) throw error
}

export async function removeGateSignatures(coopId: string, gate: GateKey): Promise<void> {
  const { error } = await supabase.from('coop_signatures').delete().eq('coop_id', coopId).eq('gate', gate)
  if (error) throw error
}

export async function createConcession(
  coopId: string, gate: GateKey, defectId: string, reason: string,
  manager: { name: string; png: Blob }, supervisor: { name: string; png: Blob },
): Promise<void> {
  const base = `signatures/${coopId}/concession-${defectId}`
  const mPath = `${base}-manager-${Date.now()}.png`
  const sPath = `${base}-supervisor-${Date.now()}.png`
  await Promise.all([uploadSignature(mPath, manager.png), uploadSignature(sPath, supervisor.png)])
  const { error } = await supabase.from('coop_concessions').insert({
    coop_id: coopId, gate, defect_id: defectId, reason,
    manager_name: manager.name, manager_signature_path: mPath,
    supervisor_name: supervisor.name, supervisor_signature_path: sPath,
  })
  if (error) throw error
}

// Coop reports are emailed from the browser via the user's own Outlook mailbox
// (SendMailDialog → src/lib/outlookSend.ts). The former Resend relay accepted
// client-supplied HTML and sent it as company mail to any address, so it was
// removed together with its edge function.

// ---------- search ----------

export interface DefectSearchRow extends Defect { coop_name: string; project_id: string }

/** Defects joined with their coop, for the search screen. Text filtering is client-side
 *  (Hebrew substring across description/assignee/notes/item text). */
export async function fetchDefectsForSearch(): Promise<DefectSearchRow[]> {
  const { data, error } = await supabase
    .from('coop_defects')
    .select('*, coops!inner(name, project_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as (Defect & { coops: { name: string; project_id: string } })[]).map((d) => ({
    ...d, coop_name: d.coops.name, project_id: d.coops.project_id,
  }))
}

// ---------- photos ----------

export interface DefectPhoto { id: string; defect_id: string; storage_path: string; url?: string }

export async function fetchDefectPhotos(coopId: string): Promise<DefectPhoto[]> {
  const { data, error } = await supabase.from('defect_photos')
    .select('id,defect_id,storage_path, coop_defects!inner(coop_id)')
    .eq('coop_defects.coop_id', coopId)
  if (error) throw error
  const rows = (data as (DefectPhoto & { coop_defects: unknown })[]).map(({ id, defect_id, storage_path }) => ({ id, defect_id, storage_path }))
  return hydratePhotoUrls(rows)
}

async function hydratePhotoUrls<T extends { storage_path: string; url?: string }>(rows: T[]): Promise<T[]> {
  const m = await signPaths(rows.map((r) => r.storage_path))
  return rows.map((r) => ({ ...r, url: m[r.storage_path] }))
}

export async function addDefectPhoto(defectId: string, file: Blob, uploadedBy: string): Promise<DefectPhoto> {
  const path = `defects/${defectId}/${Date.now()}.jpg`
  const { error: upErr } = await supabase.storage.from('photos').upload(path, file, { contentType: 'image/jpeg', upsert: true })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('defect_photos')
    .insert({ defect_id: defectId, storage_path: path, uploaded_by: uploadedBy })
    .select('id,defect_id,storage_path').single()
  if (error) throw error
  const [row] = await hydratePhotoUrls([data as DefectPhoto])
  return row
}

export async function deleteDefectPhoto(id: string): Promise<void> {
  const { error } = await supabase.from('defect_photos').delete().eq('id', id)
  if (error) throw error
}

// ---------- audit ----------

export async function logAudit(actorEmail: string, action: string, entity: string, entityId: string, details?: Record<string, unknown>): Promise<void> {
  await supabase.from('audit_log').insert({
    actor_email: actorEmail.toLowerCase(), action, entity, entity_id: entityId, details: details ?? null,
  }).then(() => {})
}

export interface AuditRow { id: string; actor_email: string; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> | null; created_at: string }

export async function fetchAuditLog(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await supabase.from('audit_log')
    .select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data as AuditRow[]
}

// ---------- notify helper (in-app bell for assignment) ----------

export async function notifyUser(recipientEmail: string, title: string, body: string, link: string): Promise<void> {
  // insert may be blocked by RLS for non-admins — best-effort
  await supabase.from('notifications')
    .insert({ recipient_email: recipientEmail.toLowerCase(), title, body, link })
    .then(() => {})
}


// ---------- offline outbox replay ----------

async function applyOp(op: DefectOp): Promise<void> {
  if (op.kind === 'item') {
    const { error } = await supabase.from('coop_checklist_items').upsert(op.row, { onConflict: 'coop_id,gate,item_no' })
    if (error) throw error
  } else if (op.kind === 'resp') {
    const { error } = await supabase.from('coop_responsibilities').upsert(op.row, { onConflict: 'coop_id,domain_key' })
    if (error) throw error
  } else if (op.kind === 'coop_patch') {
    const { error } = await supabase.from('coops').update(op.patch).eq('id', op.id)
    if (error) throw error
  } else if (op.kind === 'defect_patch') {
    const { error } = await supabase.from('coop_defects').update(op.patch).eq('id', op.id)
    if (error) throw error
  } else if (op.kind === 'defect_create') {
    // seq may collide with rows created meanwhile - bump until it fits
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('coop_defects').insert({ ...op.row, seq: Number(op.row.seq) + attempt })
      if (!error) return
      if (!String(error.message).includes('duplicate')) throw error
    }
    throw new Error('defect_create seq conflict')
  }
}

/** Replays defect-module writes queued while offline. Returns replayed count. */
export function syncDefectsOutbox(): Promise<number> {
  return replayOutbox(applyOp)
}
