'use client'

import { useEffect, useRef } from 'react'
import { isReallyOnline } from '@/lib/offline/connectivity'
import { requestPersistentStorage } from '@/lib/offline/db'
import { useNetworkStore } from '@/store/networkStore'
import { flushPendingQueue } from '@/lib/offline/syncEngine'
import { useToastStore } from '@/store/toastStore'

export default function NetworkProvider() {
  const setOnline = useNetworkStore((s) => s.setOnline)
  const showToast = useToastStore((s) => s.showToast)
  // Tracks whether we actually went offline so we only toast on genuine reconnects,
  // not on routine polling cycles where the user was online the whole time.
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    void requestPersistentStorage()

    async function flushSilently() {
      await flushPendingQueue()
      window.dispatchEvent(new CustomEvent('rune-sync-queue-updated'))
    }

    async function syncAndNotify() {
      const { synced, failed, conflicts } = await flushPendingQueue()
      window.dispatchEvent(new CustomEvent('rune-sync-queue-updated'))

      if (synced > 0) {
        showToast(synced === 1 ? '1 page synced' : `${synced} pages synced`, 'success')
      }
      if (conflicts > 0) {
        showToast('Some pages need sync review', 'info')
      } else if (failed > 0) {
        showToast('Some pages could not sync yet', 'info')
      }
    }

    async function handleOnline() {
      const online = await isReallyOnline()
      setOnline(online)
      if (online) {
        if (wasOfflineRef.current) {
          // Genuine reconnect after offline — flush and notify the user.
          wasOfflineRef.current = false
          void syncAndNotify()
        } else {
          // Already was online (e.g. network blip the browser noticed) — flush silently.
          void flushSilently()
        }
      }
    }

    async function handleOffline() {
      wasOfflineRef.current = true
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check — sets state only, does not flush
    void isReallyOnline().then(setOnline)

    // Poll every 30 seconds to catch captive portal situations.
    // Always flushes silently — the "X pages synced" toast only appears on
    // genuine reconnects (handled by handleOnline above), not on routine polls.
    const interval = setInterval(async () => {
      const online = await isReallyOnline()
      setOnline(online)
      if (online) {
        void flushSilently()
      }
    }, 30_000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [setOnline, showToast])

  return null
}
