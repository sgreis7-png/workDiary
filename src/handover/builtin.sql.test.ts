// The 14 systems of paper form 70 must stay undeletable — that is the promise the
// "anyone can add fields" feature is built on. Two things enforce it: migration 0079 marks
// exactly those labels `builtin = true`, and its delete policy refuses a builtin row.
//
// If the marking list and HANDOVER_SYSTEM_SEED ever drift, a system nobody marked becomes
// deletable and a handover silently stops matching the paper it replaces — so the drift
// fails CI here instead.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HANDOVER_SYSTEM_SEED } from './systems'

const SQL = readFileSync('supabase/migrations/0079_handover_custom_fields.sql', 'utf8')

/** The labels 0079 marks as built-in, from its `update handover_systems set builtin = true` list. */
function builtinLabels(): string[] {
  const start = SQL.indexOf('update handover_systems set builtin = true')
  expect(start).toBeGreaterThan(-1)
  const block = SQL.slice(start, SQL.indexOf(';', start))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('migration 0079 protects the built-in systems', () => {
  it('marks exactly the seeded labels as builtin', () => {
    expect(builtinLabels().sort()).toEqual([...HANDOVER_SYSTEM_SEED].sort())
  })
  it('refuses to delete a builtin row in both catalogues', () => {
    const deletes = [...SQL.matchAll(/create policy delete_handover_(systems|extra_fields)[\s\S]*?;/g)]
    expect(deletes).toHaveLength(2)
    for (const [policy] of deletes) expect(policy).toContain('builtin = false')
  })
  it('lets a non-admin author insert into both catalogues', () => {
    const inserts = [...SQL.matchAll(/create policy insert_handover_(systems|extra_fields)[\s\S]*?;/g)]
    expect(inserts).toHaveLength(2)
    for (const [policy] of inserts) {
      expect(policy).toContain("can_edit('handover')")
      expect(policy).toContain('created_by = auth.uid()')
    }
  })
})
