import { describe, it, expect } from 'vitest'
import { READ, DENIED_TABLES, DENIED_COLUMN, cols, scrubEntryValues, scrubDeep } from './allowlist'

// A leaked phone number, e-mail address, signature or chat line reaches a third-party model and
// cannot be recalled, so these tests guard the allowlist rather than any one tool.
describe('claude connector read allowlist', () => {
  it('never selects a private column', () => {
    for (const [table, { columns }] of Object.entries(READ)) {
      for (const c of columns) {
        expect(DENIED_COLUMN.test(c), `${table}.${c}`).toBe(false)
      }
    }
  })

  it('never reads a denied table', () => {
    for (const t of Object.keys(READ)) expect(DENIED_TABLES).not.toContain(t)
    expect(DENIED_TABLES).toEqual([
      'user_messages', 'message_acks', 'chat_groups', 'chat_group_members', 'notifications',
      'push_subscriptions', 'user_prefill', 'user_prefill_locations', 'registration_codes',
      'allowed_emails', 'user_permissions', 'perm_defaults', 'audit_log', 'rate_events',
      'feedback_reports', 'distribution_lists', 'list_recipients', 'report_mail_log', 'overdue_notices',
      'alert_rules', 'alert_rule_tasks', 'alert_rule_fired', 'coop_signatures',
    ])
  })

  it('people are names and roles only', () => {
    expect(READ.profiles.columns).toEqual(['id', 'name', 'role'])
  })

  it('keeps signed state but not the signature strokes', () => {
    const h = READ.handover_forms.columns
    expect(h).toContain('signed_at')
    expect(h).toContain('receiver_name')
    expect(h).not.toContain('receiver_signature')
    expect(READ.safety_forms.columns).not.toContain('workers')
  })

  it('does not list photos as a table', () => {
    expect(READ.entry_photos).toBeUndefined()
  })

  it('cols joins the allowlisted columns', () => {
    expect(cols('profiles')).toBe('id,name,role')
  })

  it('cols rejects unknown tables', () => {
    expect(() => cols('user_messages')).toThrow()
    expect(() => cols('constructor')).toThrow()
  })

  it('scrubEntryValues drops phone-typed and denied-name keys, keeps the rest', () => {
    const out = scrubEntryValues(
      { site_phone: '050', mobile: '052', photo1: 'p.jpg', note: 'ok', contact_phone: '1', odd: 2 },
      { mobile: 'phone', photo1: 'photo', note: 'text' },
    )
    expect(out).toEqual({ note: 'ok', odd: 2 })
  })

  it('DENIED_COLUMN also matches plural emails', () => {
    expect(DENIED_COLUMN.test('extra_report_emails')).toBe(true)
    expect(DENIED_COLUMN.test('email')).toBe(true)
  })

  it('scrubDeep removes denied keys at any depth, including inside arrays', () => {
    const out = scrubDeep({ a: 1, issues: [{ id: 1, owner_email: 'x@y' }], n: { phone: '1', ok: 2 } })
    expect(out).toEqual({ a: 1, issues: [{ id: 1 }], n: { ok: 2 } })
  })

  it('issues area defers to RLS', () => {
    expect(READ.issues.area).toBeNull()
  })
})
