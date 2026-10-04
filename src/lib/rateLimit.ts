// A small fixed-window limiter for the closed beta's cheap-to-spam entry
// points (waitlist joins, feedback). Server-only.
//
// HONEST CAVEATS — this is an in-memory map:
//   * On Vercel each serverless/edge instance has its own map, so the real
//     ceiling is `max × (number of warm instances)`, and a cold start resets
//     the window. It blunts naive loops from one client; it is not a hard,
//     global quota. A durable cap belongs in the database (a trigger or RPC
//     check in a migration) once the beta needs one.
//   * The IP comes from x-forwarded-for, which the platform sets; behind a
//     different proxy it could be spoofable. Never use this for authorization.
//   * It fails OPEN: a missing key (no IP) is never blocked.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000; // bounds memory on a long-lived instance

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  if (buckets.size >= MAX_KEYS) buckets.clear(); // pathological: start over rather than grow
}

/**
 * Counts one hit against `key` and says whether it is still within `max`
 * hits per `windowMs`. `null`/empty keys are allowed through unchanged.
 */
export function consumeRateLimit(
  key: string | null | undefined,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  if (!key) return { allowed: true, retryAfterMs: 0 };
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  existing.count += 1;
  if (existing.count > max) return { allowed: false, retryAfterMs: existing.resetAt - now };
  return { allowed: true, retryAfterMs: 0 };
}

/** The caller's IP as the platform reports it (first x-forwarded-for hop), or null. */
export function clientIpFromHeaders(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || h.get("x-real-ip")?.trim() || null;
}
