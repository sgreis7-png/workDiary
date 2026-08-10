// `revoke all on function ... from public` reads like it locks a function down. It does not:
// Supabase's default privileges grant EXECUTE to `anon` and `authenticated` as *named* roles, and
// revoking from PUBLIC leaves those in place.
//
// That caught me three times in one migration set — log_report_send, gantt_overrun_notify and
// gate_approval_notify were all callable by anyone holding the publishable key, including an audit
// logger that the audited party could have written to. So this asserts the source says what it
// means: a function meant for the service role has to name the roles it revokes from.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase', 'migrations')

/** Functions that must never be callable by a client, and why. */
const SERVICE_ONLY: Record<string, string> = {
  log_report_send: 'an audit log its subject could write is not an audit log',
  gantt_overrun_notify: 'inserts notifications and checks no membership of its own',
  gate_approval_notify: 'inserts notifications and checks no membership of its own',
}

function allSql(): string {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(DIR, f), 'utf8'))
    .join('\n')
}

describe('function grants', () => {
  const sql = allSql()

  it('reads the migrations', () => {
    expect(sql.length).toBeGreaterThan(10_000)
  })

  it.each(Object.entries(SERVICE_ONLY))(
    'revokes %s from the client roles by name (%s)',
    (fn) => {
      // The revoke has to name anon and authenticated. "from public" alone is the bug.
      const named = new RegExp(
        String.raw`revoke\s+execute\s+on\s+function\s+${fn}\s*\([^)]*\)\s+from\s+[^;]*\banon\b[^;]*;`,
        'i',
      )
      const andAuthed = new RegExp(
        String.raw`revoke\s+execute\s+on\s+function\s+${fn}\s*\([^)]*\)\s+from\s+[^;]*\bauthenticated\b[^;]*;`,
        'i',
      )
      expect(named.test(sql)).toBe(true)
      expect(andAuthed.test(sql)).toBe(true)
    },
  )

  it('never grants a service-only function to authenticated', () => {
    const offenders = Object.keys(SERVICE_ONLY).filter((fn) =>
      new RegExp(String.raw`grant\s+execute\s+on\s+function\s+${fn}\s*\([^)]*\)\s+to\s+[^;]*authenticated`, 'i')
        .test(sql))
    expect(offenders).toEqual([])
  })
})
