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
const SQL_0080 = readFileSync('supabase/migrations/0080_handover_builtin_guard.sql', 'utf8')

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

// 0079's update policy checked bare is_admin() in `with check`, so an admin (or, past 0080,
// anyone) could `update handover_systems set builtin = false where label = 'אוורור'` and
// then delete or rename the row the readOnly input in the UI was only ever hiding a button
// for. A handover missing a form-70 system is worth less than the paper it replaced, so the
// promise has to live in a trigger the client cannot route around — this asserts 0080 puts
// one on both catalogues and that it actually catches both ways builtin
// used to be defeated (flipping the flag, renaming the label).
describe('migration 0080 closes the builtin bypass', () => {
  it('adds a before-update guard trigger on both catalogues', () => {
    expect(SQL_0080).toMatch(/create trigger handover_systems_builtin_guard_trg\s+before update on handover_systems/)
    expect(SQL_0080).toMatch(/create trigger handover_extra_fields_builtin_guard_trg\s+before update on handover_extra_fields/)
  })

  it('the guard function refuses both a builtin flip and a label change', () => {
    const fnStart = SQL_0080.indexOf('create or replace function handover_catalogue_builtin_guard')
    const fnEnd = SQL_0080.indexOf('$$;', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = SQL_0080.slice(fnStart, fnEnd)
    expect(fnBody).toContain('old.builtin')
    expect(fnBody).toContain('new.builtin is distinct from old.builtin')
    expect(fnBody).toContain('new.label is distinct from old.label')
  })

  // Finding 4: a user demoted to view-only, or removed from the org while their JWT still
  // lives, must lose write access to rows everyone's handover form reads — is_member() and
  // can_edit('handover') close that, matching every other table in this repo.
  it('recreates the author update/delete policies with is_member() and can_edit(handover)', () => {
    const rewritten = [...SQL_0080.matchAll(/create policy (update|delete)_handover_(systems|extra_fields)[\s\S]*?;/g)]
    expect(rewritten).toHaveLength(4)
    for (const [policy] of rewritten) {
      expect(policy).toContain('is_member()')
      expect(policy).toContain("can_edit('handover')")
      expect(policy).toContain('builtin = false')
    }
  })
})
