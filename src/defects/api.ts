// Supabase data access for the defect-management (stage-gate) module.
// Mirrors src/api.ts conventions: thin async wrappers, throw on error.
import { supabase } from '../lib/supabase'
import type { GateKey, ItemStatus, Severity, DefectStatus, CoopType, Responsible, SignatureRole } from './model'

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
  const { data, error } = await supabase.from('coops').select(COOP_COLS).order('created_at')
  if (error) throw error
  return data as Coop[]
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
  const { error } = await supabase.from('coops').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCoop(id: string): Promise<void> {
  const { error } = await supabase.from('coops').delete().eq('id', id)
  if (error) throw error
}

// ---------- full bundle ----------

export async function fetchCoopBundle(coopId: string): Promise<CoopBundle> {
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
  const paths = sigs.map((s) => s.signature_path).filter(Boolean)
  if (!paths.length) return sigs
  const { data } = await supabase.storage.from('photos').createSignedUrls(paths, 3600)
  const m: Record<string, string> = {}
  for (const s of data ?? []) if (s.signedUrl && s.path) m[s.path] = s.signedUrl
  return sigs.map((s) => ({ ...s, signature_url: m[s.signature_path] }))
}

// ---------- responsibilities / checklist ----------

export async function saveResponsibility(row: CoopResponsibility): Promise<void> {
  const { error } = await supabase.from('coop_responsibilities')
    .upsert(row, { onConflict: 'coop_id,domain_key' })
  if (error) throw error
}

export async function upsertChecklistItem(row: Omit<ChecklistItem, 'auto_na_reason'> & { auto_na_reason?: string | null }): Promise<void> {
  const { error } = await supabase.from('coop_checklist_items')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'coop_id,gate,item_no' })
  if (error) throw error
}

// ---------- defects ----------

export async function createDefect(coopId: string, init: Partial<Defect>): Promise<Defect> {
  const { data: maxRow, error: maxErr } = await supabase.from('coop_defects')
    .select('seq').eq('coop_id', coopId).order('seq', { ascending: false }).limit(1).maybeSingle()
  if (maxErr) throw maxErr
  const seq = (maxRow?.seq ?? 0) + 1
  const { data, error } = await supabase.from('coop_defects')
    .insert({ coop_id: coopId, seq, gate: init.gate, item_no: init.item_no ?? null, description: init.description ?? null, severity: init.severity ?? null, assignee: init.assignee ?? null, due_date: init.due_date ?? null, status: init.status ?? 'open', closed_on: init.closed_on ?? null, closure_note: init.closure_note ?? null })
    .select('*').single()
  if (error) throw error
  return data as Defect
}

export async function updateDefect(id: string, patch: Partial<Defect>): Promise<void> {
  const { error } = await supabase.from('coop_defects').update(patch).eq('id', id)
  if (error) throw error
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
