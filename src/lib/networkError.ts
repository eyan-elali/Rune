/**
 * True when a server-side Supabase read failed because the network is
 * unreachable (not because the row is missing or forbidden). The editor
 * routes then fall back to the offline cache instead of a 404.
 */
export function isNetworkError(err: { message?: string; status?: number; code?: string } | null): boolean {
  if (!err) return false;
  if ("status" in err && err.status === 0) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}
