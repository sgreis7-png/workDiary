// Shared types + pure helpers. All data access lives in ./api (Supabase) and the
// reference-data cache in ./store. (This file used to hold the in-memory mock.)

export type Role = 'member' | 'admin'
export type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'phone' | 'select' | 'photo'
export interface Option { he: string; en: string }

export interface FieldDef {
  id: string; key: string; label_he: string; label_en: string
  type: FieldType; required: boolean; options: Option[]; sort_order: number; active: boolean
}
export interface Project { id: string; name: string; active: boolean }

/** A row of the allowlist, optionally joined with profile status. */
export interface AppUser {
  id: string; name: string; email: string; role: Role; active: boolean
  registered: boolean
}

export interface Entry {
  id: string; project_id: string; created_by: string; work_date: string
  created_at: string; last_sent_at: string | null; values: Record<string, string>
  photos: string[] // signed URLs for display
}

export interface DistList { id: string; name: string; recipients: Recipient[] }
export interface Recipient { id: string; email: string; display_name?: string | null }

export interface SearchFilters { projectId?: string; from?: string; to?: string; text?: string }

// stable color per project, by its position in the active list
export const PROJECT_COLORS = ['#3aaa35', '#c2541f', '#277d23', '#d8a01a', '#6c747a', '#1c5a1a', '#a8431a']
export function colorForIndex(i: number): string {
  return PROJECT_COLORS[(i < 0 ? 0 : i) % PROJECT_COLORS.length]
}

/** Case-insensitive substring match across all field values of an entry. */
export function entryMatchesText(values: Record<string, string>, text: string): boolean {
  if (!text) return true
  return Object.values(values).join(' ').toLowerCase().includes(text.toLowerCase())
}

/** Group entries (or anything with work_date) by their date string. */
export function groupByDate<T extends { work_date: string }>(items: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const it of items) (map[it.work_date] ||= []).push(it)
  return map
}
