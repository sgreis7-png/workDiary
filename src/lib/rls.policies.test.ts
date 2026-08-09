// The bug this exists for: 0045 rewrote the row-level policies for fourteen tables so the
// per-area permissions would be enforced by the database. For coop_item_photos it dropped
// `rw_coop_item_photos` — a name that never existed — and `drop policy if exists` said nothing.
// Permissive policies are combined with OR, so the old `is_member()` grant kept standing beside
// the new ones and ORed away can_view('defects') for that table. Nothing failed; the gate was
// simply open.
//
// perms.sql.test.ts already checks that the permission defaults in SQL match the client. It
// could not catch this, because the defect is not in what a policy says — it is in which
// policies survive. So this replays every create/drop statement across every migration in the
// order Postgres saw them, and asserts that no pre-0045 policy is still standing on a table
// 0045 or later locked down.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase', 'migrations')

const STMT = new RegExp(
  String.raw`(?<op>create\s+policy|drop\s+policy(?:\s+if\s+exists)?)\s+` +
  String.raw`(?<name>"[^"]+"|[A-Za-z_][\w]*)\s+on\s+(?<table>[\w.]+)`,
  'gi',
)

/** The migration that locked each table down to the area permissions. Anything created before
 *  it and still standing is a hole, because it is OR'd with the new policies. */
const GATED_FROM: Record<string, string> = {
  entries: '0045', entry_photos: '0045',
  coops: '0045', coop_responsibilities: '0045', coop_checklist_items: '0045',
  coop_defects: '0045', coop_signatures: '0045', coop_concessions: '0045',
  defect_photos: '0045', coop_item_photos: '0045',
  allowed_emails: '0046',
}

/** Legacy policies that are allowed to survive, with the reason. */
const ALLOWED: Record<string, string> = {
  // admin-only either way, so it cannot widen what a member sees
  'allowed_emails:admin_rw_allowed': 'grants only is_admin()',
}

interface Live { name: string; from: string }

function replay(): Map<string, Live[]> {
  const live = new Map<string, Map<string, string>>()
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const version = file.slice(0, 4)
    const sql = readFileSync(join(DIR, file), 'utf8')
    for (const m of sql.matchAll(STMT)) {
      const { op = '', name = '', table = '' } = m.groups ?? {}
      const key = table.toLowerCase()
      const policy = name.replace(/^"|"$/g, '')
      if (!live.has(key)) live.set(key, new Map())
      if (/^create/i.test(op.trim())) live.get(key)!.set(policy, version)
      else live.get(key)!.delete(policy)
    }
  }
  return new Map([...live].map(([t, m]) => [t, [...m].map(([name, from]) => ({ name, from }))]))
}

describe('row-level policies', () => {
  const live = replay()

  it('reads the migrations', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.sql')).length).toBeGreaterThan(40)
    expect(live.get('entries')?.length).toBeGreaterThan(0)
  })

  it('leaves no pre-gate policy standing on a table the area permissions govern', () => {
    const holes: string[] = []
    for (const [table, gatedFrom] of Object.entries(GATED_FROM)) {
      for (const p of live.get(table) ?? []) {
        if (p.from >= gatedFrom) continue
        if (ALLOWED[`${table}:${p.name}`]) continue
        holes.push(`${table}.${p.name} (created in ${p.from}, gate is ${gatedFrom})`)
      }
    }
    // A survivor here is OR'd with the new policy, so the new one decides nothing.
    expect(holes).toEqual([])
  })

  it('gates every table it claims to gate', () => {
    // Guards the other direction: a table listed above but with no policy from its gate
    // migration would mean the rewrite never landed.
    const ungated = Object.entries(GATED_FROM)
      .filter(([t, from]) => !(live.get(t) ?? []).some((p) => p.from >= from))
      .map(([t]) => t)
    expect(ungated).toEqual([])
  })

  it('keeps the private photo bucket narrowed by a restrictive policy', () => {
    // The permissive 0030 policy still grants members the bucket; 0048's restrictive policy is
    // what actually limits an object to whoever may read the record that owns it. Restrictive
    // policies AND with everything, so removing it would silently reopen the bucket.
    const names = (live.get('storage.objects') ?? []).map((p) => p.name)
    expect(names).toContain('photos read owned')
  })
})
