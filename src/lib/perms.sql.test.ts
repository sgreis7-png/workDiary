// The permission defaults now exist twice: MEMBER_DEFAULTS here, and the perm_defaults
// table that 0045 seeds so RLS can resolve the same answer. Two sources of truth for an
// authorization rule is exactly how a policy quietly stops matching the UI — either the
// database denies a member the screen they can see, or it allows one they cannot.
//
// This test reads the migration and holds the two in agreement, so the drift shows up in
// CI rather than in production.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { PERM_AREAS, resolvePerm, type PermArea, type PermLevel } from './perms'

const SQL = readFileSync('supabase/migrations/0045_enforce_perm_areas.sql', 'utf8')

/** The seeded rows, read straight out of the insert. */
function seededDefaults(): Record<string, PermLevel> {
  const block = SQL.slice(
    SQL.indexOf('insert into perm_defaults'),
    SQL.indexOf('on conflict (area)'),
  )
  const out: Record<string, PermLevel> = {}
  for (const [, area, level] of block.matchAll(/\('(\w+)',\s*'(none|view|edit)'\)/g)) {
    out[area] = level as PermLevel
  }
  return out
}

describe('perm_defaults mirrors MEMBER_DEFAULTS', () => {
  const seeded = seededDefaults()

  it('seeds a row for every area the client knows about', () => {
    const areas = PERM_AREAS.map((a) => a.key).sort()
    expect(Object.keys(seeded).sort()).toEqual(areas)
  })

  it('agrees with resolvePerm for an ordinary member on every area', () => {
    // a member with no explicit grant is the case a naive has_perm() policy would have
    // denied, so this is the comparison that matters
    for (const { key } of PERM_AREAS) {
      expect(seeded[key], `default for ${key}`).toBe(resolvePerm('member', {}, key))
    }
  })

  it('keeps the areas that must stay closed to members closed', () => {
    for (const area of ['dashboard', 'control_center', 'gantt', 'form_builder', 'coops_manage', 'alert_rules'] as PermArea[]) {
      expect(seeded[area], area).toBe('none')
    }
  })

  it('keeps the areas field staff depend on open', () => {
    expect(seeded.logbook).toBe('edit')
    expect(seeded.defects).toBe('edit')
  })
})

describe('0045 policy shape', () => {
  it('gives an author an unconditional read of their own entries', () => {
    // the one lockout with no recovery path
    expect(SQL).toMatch(/create policy read_entries on entries for select\s+using \(can_view\('logbook'\) or \(is_member\(\) and created_by = auth\.uid\(\)\)\)/)
  })

  it('checks created_by directly on delete rather than leaning on the read policy', () => {
    const del = SQL.slice(SQL.indexOf('create policy delete_entries'))
    expect(del.slice(0, 200)).toContain('created_by = auth.uid()')
  })

  it('resolves gantt visibility through the shared resolver', () => {
    expect(SQL).toContain('select can_view(\'gantt\')')
  })

  it('drops every policy before creating it, so the migration can be re-run', () => {
    const created = [...SQL.matchAll(/^create policy (\w+) on ([\w.]+)/gm)].map((m) => `${m[1]} on ${m[2]}`)
    expect(created.length).toBeGreaterThan(20)
    for (const c of created) {
      expect(SQL, c).toContain(`drop policy if exists ${c};`)
    }
  })
})
