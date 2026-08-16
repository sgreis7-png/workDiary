import type { Sig } from './signature'

export interface SafetyWorker {
  name: string
  id_number: string
  signature: Sig | null
  signed_at: string | null
}
export interface SafetyTopic { id: string; label: string; sort_order: number; active: boolean }

export interface SafetyFormRec {
  id: string
  project_id: string
  training_date: string
  topics: string[]
  workers: SafetyWorker[]
  instructor_name: string
  instructor_qualification: string
  instructor_signature: Sig | null
  created_by: string
  created_at: string
  updated_at: string
}
export type SafetyFormInput = Omit<SafetyFormRec, 'id' | 'created_by' | 'created_at' | 'updated_at'>

/** Name+id suggestions from previous forms, latest first, unique by id_number (or name). */
export function dedupeWorkers(forms: { workers: SafetyWorker[] }[]): { name: string; id_number: string }[] {
  const seen = new Set<string>()
  const out: { name: string; id_number: string }[] = []
  for (const f of forms) for (const wk of f.workers ?? []) {
    const name = (wk.name ?? '').trim()
    if (!name) continue
    const key = (wk.id_number ?? '').trim() || name
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, id_number: (wk.id_number ?? '').trim() })
  }
  return out
}

/** Free-text filter over a form's workers (name or id number). */
export function formMatchesWorker(f: SafetyFormRec, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return (f.workers ?? []).some((wk) =>
    (wk.name ?? '').toLowerCase().includes(q) || (wk.id_number ?? '').includes(q))
}
