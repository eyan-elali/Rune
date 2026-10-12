'use client'

import { useEffect, useRef } from 'react'
import { isReallyOnline } from '@/lib/offline/connectivity'
import { requestPersistentStorage } from '@/lib/offline/db'
import { useNetworkStore } from '@/store/networkStore'
import { flushPendingQueue, SERVER_REACHABLE_EVENT } from '@/lib/offline/syncEngine'
import { useToastStore } from '@/store/toastStore'

// Decides whether Sutura treats the server as reachable (useNetworkStore).
// "Offline" changes behaviour, not just a label: the editor stops sending
// saves and keeps the writing on this device. So it is decided on evidence:
//
//   * the browser saying it is offline — believed at once;
//   * a confirmed save — proof the server is reachable, at once;
//   * the ping (/api/ping) — one slow or failed ping is not proof of
//     anything (a cold start can take seconds), so it takes two failures in
//     a row, the second a quick re-check, before the writer sees "Offline".
//
// While offline (or unsure) the ping re-checks every few seconds rather than
// every thirty, so writing starts reaching the server soon after the
// connection returns.

const ONLINE_CHECK_MS = 30_000
const RECHECK_MS = 5_000
const FAILURES_BEFORE_OFFLINE = 2

export default function NetworkProvider() {
  const setOnline = useNetworkStore((s) => s.setOnline)
  const showToast = useToastStore((s) => s.showToast)
  // Whether the writer has seen "offline": only a return from it is announced.
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    void requestPersistentStorage()

    let disposed = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function flushSilently() {
      await flushPendingQueue()
      window.dispatchEvent(new CustomEvent('rune-sync-queue-updated'))
    }

    async function syncAndNotify() {
      const { synced, failed, conflicts } = await flushPendingQueue()
      window.dispatchEvent(new CustomEvent('rune-sync-queue-updated'))

      if (conflicts > 0) {
        showToast('A scene was changed elsewhere. Open it to choose which version to keep.', 'info')
      } else if (failed > 0) {
        showToast('Some writing is still only on this device. Sutura will keep trying.', 'info')
      } else if (synced > 0) {
        showToast('Back online. Your writing is saved.', 'success')
      }
    }

    function markOnline() {
      failures = 0
      setOnline(true)
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        void syncAndNotify()
        return true
      }
      return false
    }

    function markOffline() {
      wasOfflineRef.current = true
      setOnline(false)
    }

    function schedule(ms: number) {
      clearTimeout(timer)
      if (!disposed) timer = setTimeout(() => void check(), ms)
    }

    async function check() {
      const reachable = await isReallyOnline()
      if (disposed) return
      if (reachable) {
        // A return from offline flushes and tells the writer; otherwise the
        // routine check flushes anything left behind, silently.
        if (!markOnline()) void flushSilently()
        schedule(ONLINE_CHECK_MS)
        return
      }
      failures += 1
      if (!navigator.onLine || failures >= FAILURES_BEFORE_OFFLINE) markOffline()
      schedule(RECHECK_MS)
    }

    function handleOnline() {
      void check()
    }

    function handleOffline() {
      failures = FAILURES_BEFORE_OFFLINE
      markOffline()
      schedule(RECHECK_MS)
    }

    // A save just reached the server: whatever the last ping said, it is reachable.
    function handleReachable() {
      if (useNetworkStore.getState().isOnline && failures === 0) return
      markOnline()
      schedule(ONLINE_CHECK_MS)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(SERVER_REACHABLE_EVENT, handleReachable)

    // Initial check — sets state only; the first routine check flushes.
    void isReallyOnline().then((reachable) => {
      if (disposed) return
      if (reachable) {
        setOnline(true)
        schedule(ONLINE_CHECK_MS)
      } else {
        failures = 1
        if (!navigator.onLine) markOffline()
        schedule(RECHECK_MS)
      }
    })

    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(SERVER_REACHABLE_EVENT, handleReachable)
    }
  }, [setOnline, showToast])

  return null
}
