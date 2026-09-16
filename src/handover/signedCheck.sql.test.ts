// 0077 hands update/delete on handover_forms to admins only, on the stated assumption that
// every stored row is already a signed document. That assumption held only in
// validateHandover in this file's sibling model.ts until 0078 added a matching table
// constraint — before that, any member with edit permission could POST an unsigned,
// unticked handover straight to PostgREST, and only an admin could ever delete it.
//
// The expensive failure mode is silent drift: someone tightens validateHandover (a new
// required field, a stricter check) without touching the SQL, and the two rules quietly
// stop agreeing — the UI blocks a save the database would have accepted anyway. This test
// reads 0078's text and checks the constraint still names every field validateHandover
// requires, so that drift fails CI instead of showing up as an unsigned row in production.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync('supabase/migrations/0078_handover_signed_check.sql', 'utf8')

describe('handover_forms_signed_check mirrors validateHandover', () => {
  it('adds the constraint on handover_forms, guarded to be re-runnable', () => {
    expect(SQL).toMatch(/drop constraint if exists handover_forms_signed_check/)
    expect(SQL).toMatch(/add constraint handover_forms_signed_check check/)
  })

  it('requires a receiver signature and a signing timestamp', () => {
    expect(SQL).toMatch(/receiver_signature is not null/)
    expect(SQL).toMatch(/signed_at is not null/)
  })

  it('requires at least one attendee and one system, matching the "no unmarked system" rule', () => {
    expect(SQL).toMatch(/jsonb_array_length\(attendees\)\s*>\s*0/)
    expect(SQL).toMatch(/jsonb_array_length\(systems\)\s*>\s*0/)
  })

  it('requires every text field validateHandover checks with .trim()', () => {
    for (const col of ['receiver_name', 'receiver_role', 'client_name', 'site_location', 'project_nature']) {
      expect(SQL).toMatch(new RegExp(String.raw`btrim\(${col}\)\s*<>\s*''`))
    }
  })
})
