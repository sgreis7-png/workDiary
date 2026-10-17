import { describe, it, expect } from 'vitest'
import { canConnectClaude, connectorUrl } from './claudeAccess'

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

// A double slash in the pasted URL makes claude.ai register a path the edge function never serves,
// and the failure shows up as a vague "could not connect" far from the cause.
describe('connectorUrl', () => {
  it('points at the mcp edge function whether or not the base has a trailing slash', () => {
    expect(connectorUrl('https://x.supabase.co')).toBe('https://x.supabase.co/functions/v1/mcp')
    expect(connectorUrl('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/mcp')
  })
})
