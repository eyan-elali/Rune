'use client'

import { useEffect } from 'react'
import { isReallyOnline } from '@/lib/offline/connectivity'
import { requestPersistentStorage } from '@/lib/offline/db'
import { useNetworkStore } from '@/store/networkStore'
import { flushPendingQueue } from '@/lib/offline/syncEngine'
import { useToastStore } from '@/store/toastStore'

export default function NetworkProvider() {
  const setOnline = useNetworkStore((s) => s.setOnline)
  const showToast = useToastStore((s) => s.showToast)

  useEffect(() => {
    void requestPersistentStorage()

    async function syncAndNotify() {
      const { synced, failed, conflicts } = await flushPendingQueue()

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
        void syncAndNotify()
      }
    }

    async function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check — sets state only, does not flush
    void isReallyOnline().then(setOnline)

    // Poll every 30 seconds to catch captive portal situations
    const interval = setInterval(async () => {
      const online = await isReallyOnline()
      setOnline(online)
      if (online) {
        void syncAndNotify()
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
