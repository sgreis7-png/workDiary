/**
 * Who may be offered "Approve" on the Claude-connector consent page: admins and managers,
 * and only with the per-person `claude` grant (role defaults give it to nobody). The server
 * refuses everyone else anyway; this exists so a member sees a friendly "ask your admin"
 * instead of approving a connection that would then fail with an opaque error.
 */
export function canConnectClaude(role: string | undefined, claudeLevel: string): boolean {
  return (role === 'admin' || role === 'manager') && claudeLevel !== 'none'
}
