// Mock of '@supabase/ssr' for bundling the auth callback outside Next.js.
// createServerClient() returns the client the test installed on
// globalThis.__ssrClient (normally createSupabaseAdapter(db, { userId })),
// with the email-link half of Supabase Auth added: exchangeCodeForSession and
// verifyOtp succeed for globalThis.__ssrLinks[code or token_hash] — the
// account that link belongs to — and fail for any other link, as an expired
// or already-used link does.
export function createServerClient() {
  const client = globalThis.__ssrClient;
  if (!client) throw new Error('mocks/supabaseSsr: no client installed — set globalThis.__ssrClient');
  const links = globalThis.__ssrLinks ?? {};
  const answer = (key) => links[key]
    ? { data: { user: { id: links[key] }, session: {} }, error: null }
    : { data: { user: null, session: null }, error: { message: 'Email link is invalid or has expired' } };
  return {
    ...client,
    auth: {
      ...client.auth,
      async exchangeCodeForSession(code) { return answer(code); },
      async verifyOtp({ token_hash }) { return answer(token_hash); },
    },
  };
}
