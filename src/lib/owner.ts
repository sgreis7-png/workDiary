// Who is signed in, for code that must not import the auth context.
//
// The offline queues live in IndexedDB, which is per-device, not per-account. Without an
// owner recorded on each queued row, a foreman who reports offline and hands the phone to
// a colleague has his report uploaded under the colleague's name the moment they sign in —
// a site record with the wrong person on it, and nobody knows.
//
// AuthProvider is the only writer. The queues read it at queue time and at replay time.

let current: string | null = null

/** Lower-cased email of the signed-in user, or null when signed out. */
export function getOwner(): string | null {
  return current
}

export function setOwner(email: string | null | undefined): void {
  current = email ? email.trim().toLowerCase() : null
}

/**
 * True when a queued row belongs to whoever is signed in now.
 *
 * Rows written before this field existed have no owner. They are treated as the current
 * user's: they predate the shared-device problem, and refusing them would strand real
 * unsynced work on the device with no way to ever send it.
 */
export function ownedByCurrentUser(owner: string | null | undefined): boolean {
  if (!owner) return true
  return current !== null && owner === current
}
