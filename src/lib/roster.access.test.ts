// `allowed_emails` is admin-only (migration 0046). RLS answers a member with zero rows rather
// than an error, so a screen that reads the table from a non-admin context does not fail — it
// quietly shows an empty list. That is exactly how the conversation list and the task assignee
// dropdown came to be empty for every member while looking perfect to an admin.
//
// This walks the source instead of the runtime, because there is no member session to test with
// and the mistake is a static one: importing the wrong function.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCREENS = join(process.cwd(), 'src', 'screens')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return name.endsWith('.tsx') || name.endsWith('.ts') ? [full] : []
  })
}

/** Screens that may read the roster table itself: the ones only an admin can open. */
const ADMIN_ONLY = ['screens/admin/Users.tsx', 'screens/admin/Projects.tsx']

const rel = (f: string) => f.slice(f.indexOf('src') + 4).replaceAll('\\', '/')

describe('roster access', () => {
  const files = walk(SCREENS)

  it('finds the screens to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('only admin screens read allowed_emails through fetchUsers', () => {
    const offenders = files
      .filter((f) => /\bfetchUsers\b/.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((r) => !ADMIN_ONLY.includes(r))
    // A screen a member can open must use fetchMemberDirectory() — names and addresses, from a
    // definer function — not the roster table with everyone's role and account state in it.
    expect(offenders).toEqual([])
  })

  it('no screen queries the roster table directly', () => {
    const offenders = files.filter((f) => /from\(['"]allowed_emails['"]\)/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })
})
