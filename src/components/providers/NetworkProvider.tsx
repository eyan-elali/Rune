'use client'

import { useEffect } from 'react'
import { isReallyOnline } from '@/lib/offline/connectivity'
import { requestPersistentStorage } from '@/lib/offline/db'
import { useNetworkStore } from '@/store/networkStore'
import { flushPendingQueue } from '@/lib/offline/syncEngine'

export default function NetworkProvider() {
  const setOnline = useNetworkStore((s) => s.setOnline)

  useEffect(() => {
    void requestPersistentStorage()

    async function handleOnline() {
      const online = await isReallyOnline()
      setOnline(online)
      if (online) {
        void flushPendingQueue()
      }
    }

    async function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check
    void isReallyOnline().then(setOnline)

    // Poll every 30 seconds to catch captive portal situations
    const interval = setInterval(async () => {
      const online = await isReallyOnline()
      setOnline(online)
      if (online) {
        void flushPendingQueue()
      }
    }, 30_000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [setOnline])

  return null
}
