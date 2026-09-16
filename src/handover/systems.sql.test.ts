// handover_systems is seeded from the paper form, and the same 14 labels exist in
// TypeScript so a fresh install and the hosted database agree on what a handover checks.
//
// Drift here is silent and expensive: a label spelled differently in SQL adds a system that
// no form ever ticks, and since a handover cannot be saved until every system is marked, a
// stray row makes the save button unreachable in the field with a customer waiting.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HANDOVER_SYSTEM_SEED } from './systems'

const SQL = readFileSync('supabase/migrations/0077_handover_forms.sql', 'utf8')

/** The ('label', 10) pairs seeded into handover_systems. */
function seededLabels(): string[] {
  const block = SQL.slice(SQL.indexOf('insert into handover_systems'))
  const end = block.indexOf('on conflict')
  return [...block.slice(0, end).matchAll(/\('([^']+)',\s*\d+\)/g)].map((m) => m[1])
}

describe('handover_systems seed mirrors HANDOVER_SYSTEM_SEED', () => {
  it('seeds exactly the labels the client knows, in the same order', () => {
    expect(seededLabels()).toEqual([...HANDOVER_SYSTEM_SEED])
  })
  it('seeds ascending sort_order so the form matches the paper', () => {
    const orders = [...SQL.matchAll(/\('[^']+',\s*(\d+)\)/g)].map((m) => Number(m[1]))
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})
