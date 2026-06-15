export async function isReallyOnline(): Promise<boolean> {
  if (typeof navigator === 'undefined') return true
  if (!navigator.onLine) return false
  try {
    const res = await fetch('/api/ping', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
