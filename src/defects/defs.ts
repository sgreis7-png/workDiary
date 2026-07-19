// Runtime gate definitions: built-in workbook items (model.ts) merged with
// admin overrides from defect_item_overrides (text changes, hidden items,
// custom additions). Cached per session; call loadGateDefs() and pass the
// result down — everything falls back to the static GATES until loaded.
import { supabase } from '../lib/supabase'
import { GATES, GATE_ORDER, type GateDef, type GateKey } from './model'

export interface ItemOverride {
  gate: GateKey; item_no: number
  text: string | null; active: boolean; is_custom: boolean
}

export type GateDefs = Record<GateKey, GateDef>

export async function fetchItemOverrides(): Promise<ItemOverride[]> {
  const { data, error } = await supabase.from('defect_item_overrides').select('*').order('item_no')
  if (error) throw error
  return data as ItemOverride[]
}

export function mergeGateDefs(overrides: ItemOverride[]): GateDefs {
  const out = {} as GateDefs
  for (const g of GATE_ORDER) {
    const base = GATES[g]
    const mine = overrides.filter((o) => o.gate === g)
    const byNo = new Map(mine.map((o) => [o.item_no, o]))
    const items = base.items
      .filter((it) => byNo.get(it.no)?.active !== false)
      .map((it) => {
        const o = byNo.get(it.no)
        return o?.text?.trim() ? { no: it.no, text: o.text } : it
      })
    const customs = mine
      .filter((o) => o.is_custom && o.active && o.text?.trim())
      .map((o) => ({ no: o.item_no, text: o.text! }))
    out[g] = { ...base, items: [...items, ...customs].sort((a, b) => a.no - b.no) }
  }
  return out
}

let cache: GateDefs | null = null

/** Merged defs, cached for the session. Falls back to built-ins on error. */
export async function loadGateDefs(force = false): Promise<GateDefs> {
  if (cache && !force) return cache
  try {
    cache = mergeGateDefs(await fetchItemOverrides())
  } catch {
    cache = GATES
  }
  return cache
}

export function invalidateGateDefs(): void { cache = null }

export async function saveItemOverride(o: ItemOverride): Promise<void> {
  const { error } = await supabase.from('defect_item_overrides')
    .upsert({ ...o, updated_at: new Date().toISOString() }, { onConflict: 'gate,item_no' })
  if (error) throw error
  invalidateGateDefs()
}

export async function deleteItemOverride(gate: GateKey, itemNo: number): Promise<void> {
  const { error } = await supabase.from('defect_item_overrides')
    .delete().eq('gate', gate).eq('item_no', itemNo)
  if (error) throw error
  invalidateGateDefs()
}

/** Item label helper against merged defs. */
export function itemLabel(defs: GateDefs, gate: GateKey, itemNo: number): string {
  const item = defs[gate].items.find((i) => i.no === itemNo)
  if (!item) return String(itemNo)
  return `${item.no}. ${item.text.split(' — ')[0]}`
}
