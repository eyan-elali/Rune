// Mock of '@/lib/supabase/client' for bundling REAL browser code (the sync
// engine, SyncConflictModal's reads) against PGlite. createClient() returns
// the client a test installed on globalThis.__runeBrowserClient — normally
// createSupabaseAdapter(db, { userId }) from ../lib/supabase-adapter.mjs. A
// global (not a module export) because each bundle inlines its own copy of
// this module.
export function createClient() {
  const client = globalThis.__runeBrowserClient;
  if (!client) throw new Error('mocks/supabaseBrowser: set globalThis.__runeBrowserClient first');
  return client;
}
