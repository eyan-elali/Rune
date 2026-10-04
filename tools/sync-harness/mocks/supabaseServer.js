// Mock of '@/lib/supabase/server' for bundled Rune server code.
// createClient() returns whatever client the test installed with
// setServerClient() — normally createSupabaseAdapter(db, { userId }) from
// ../lib/supabase-adapter.mjs — so server actions and route handlers run
// against real PGlite + RLS as the chosen user.
let current = null;

export function setServerClient(client) {
  current = client;
}

export async function createClient() {
  if (!current) throw new Error('mocks/supabaseServer: no client installed — call setServerClient() first');
  return current;
}

