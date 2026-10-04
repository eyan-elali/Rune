// Mock of `next/headers` for bundling Rune server code outside Next.js:
// an empty request (no forwarded IP, no cookies), so a limiter keyed on the
// caller's address fails open, as src/lib/rateLimit.ts documents.
export async function headers() {
  return new Headers();
}

export async function cookies() {
  return { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} };
}
