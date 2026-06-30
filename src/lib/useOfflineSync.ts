import { useCallback, useEffect, useState } from 'react'
import { createEntry } from '../api'
import { pendingCount, syncQueue } from './offline'

// Tracks online status + pending offline entries, and flushes the queue when a
// connection returns (or on mount / when a new draft is queued).
export function useOfflineSync() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pending, setPending] = useState(0)

  const refresh = useCallback(async () => setPending(await pendingCount()), [])
  const sync = useCallback(async () => {
    if (navigator.onLine) await syncQueue(createEntry)
    await refresh()
  }, [refresh])

  useEffect(() => {
    const goOnline = () => { setOnline(true); sync() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('wd-queued', refresh)
    window.addEventListener('focus', sync)
    sync()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('wd-queued', refresh)
      window.removeEventListener('focus', sync)
    }
  }, [sync, refresh])

  return { online, pending }
}
