import { describe, it, expect } from 'vitest'
import { canConnectClaude } from './claudeAccess'

// If a member could reach Approve, they would complete an OAuth grant the server then rejects
// on every call — a connected-looking Claude that silently returns nothing. Keep the gate tight.
describe('canConnectClaude', () => {
  it('needs both an eligible role and the claude grant', () => {
    expect(canConnectClaude('admin', 'view')).toBe(true)
    expect(canConnectClaude('manager', 'view')).toBe(true)
    expect(canConnectClaude('manager', 'none')).toBe(false)
    expect(canConnectClaude('admin', 'none')).toBe(false)
  })
  it('never offers approve to members or unknown users', () => {
    expect(canConnectClaude('member', 'edit')).toBe(false)
    expect(canConnectClaude(undefined, 'view')).toBe(false)
  })
})
