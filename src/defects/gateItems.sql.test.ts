// gate_items in migration 0056 mirrors GATES here, because the database has to know how many
// checklist items a gate should have and that list lives in TypeScript.
//
// It has to, because coop_checklist_items only records items somebody answered — so "no unanswered
// row" is true of a gate nobody has touched. Reading absence as completion is what made the
// approval alert announce two gates that had 1 answered item out of 18 and 19.
//
// If the two ever drift, a gate is announced as finished before it is, or never announced at all.
// Both are silent failures, so this fails the build instead.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATES, GATE_ORDER } from './model'

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0056_fix_gate_completeness.sql'), 'utf8')

/** The `('gate1', 10)` pairs the migration seeds from. */
function seededCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of SQL.matchAll(/\('(pre_pour|gate\d)',\s*(\d+)\)/g)) out[m[1]] = Number(m[2])
  return out
}

/** The `('gate1', 'שער 1')` pairs. */
function seededLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of SQL.matchAll(/\('(pre_pour|gate\d)',\s*'([^']+)'\)/g)) out[m[1]] = m[2]
  return out
}

describe('gate_items mirrors the gate model', () => {
  const counts = seededCounts()
  const labels = seededLabels()

  it('found the seed data in the migration', () => {
    expect(Object.keys(counts).length).toBe(GATE_ORDER.length)
    expect(Object.keys(labels).length).toBe(GATE_ORDER.length)
  })

  it.each(GATE_ORDER)('%s has the same number of items in SQL as in the model', (gate) => {
    expect(counts[gate]).toBe(GATES[gate].items.length)
  })

  it.each(GATE_ORDER)('%s carries the same name in SQL as in the model', (gate) => {
    expect(labels[gate]).toBe(GATES[gate].shortName)
  })

  it('numbers items from 1 without gaps, which is what the seed assumes', () => {
    // The migration seeds generate_series(1, n), so a model that numbered items any other way
    // would produce expected items that do not exist and a gate that can never complete.
    for (const gate of GATE_ORDER) {
      const nos = GATES[gate].items.map((i) => i.no).sort((a, b) => a - b)
      expect(nos).toEqual(Array.from({ length: nos.length }, (_, i) => i + 1))
    }
  })
})
