// Who is signed in, for code that must not import the auth context.
//
// The offline queues live in IndexedDB, which is per-device, not per-account. Without an
// owner recorded on each queued row, a foreman who reports offline and hands the phone to
// a colleague has his report uploaded under the colleague's name the moment they sign in —
// a site record with the wrong person on it, and nobody knows.
//
// AuthProvider is the only writer. The queues read it at queue time and at replay time.

/** Accounts that have ever been signed in on this device. */
const SEEN_KEY = 'wd_owners_seen'

let current: string | null = null

/** Lower-cased email of the signed-in user, or null when signed out. */
export function getOwner(): string | null {
  return current
}

function seen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] } // private mode, or something else wrote nonsense there
}

export function setOwner(email: string | null | undefined): void {
  current = email ? email.trim().toLowerCase() : null
  if (!current) return
  // Remembered so ownerless rows can be judged: see ownedByCurrentUser. Survives sign-out on
  // purpose — the question it answers is "has anyone else ever used this device", and signing
  // out must not erase the answer. purgeLocalData() leaves it alone for the same reason.
  const list = seen()
  if (!list.includes(current)) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...list, current])) } catch { /* ignore */ }
  }
}

/**
 * True when a queued row belongs to whoever is signed in now.
 *
 * Rows written before this field existed have no owner, and the two ways of handling that are
 * both wrong on their own: treating them as the current user's risks filing one worker's report
 * under another's name, and refusing them strands real unsynced work with no way to ever send
 * it.
 *
 * So they are claimed only while this device has never seen a second account. On a phone one
 * person uses, an ownerless row is unambiguously theirs and replays as it always did. On a
 * shared phone it is ambiguous, and nothing ambiguous gets sent under somebody's name.
 */
export function ownedByCurrentUser(owner: string | null | undefined): boolean {
  if (current === null) return false
  if (!owner) return seen().filter((e) => e !== current).length === 0
  return owner === current
}

/** Whether an ownerless queued row can still be sent from this device. Exposed for the
 *  tests and for anything that wants to explain to the user why work is sitting there. */
export function deviceHasOneAccount(): boolean {
  return seen().filter((e) => e !== current).length === 0
}
