// Mock of '@/lib/supabase/service': the service-role client a test installs
// (normally createSupabaseAdapter(db, { role: 'service_role' })).
export async function createServiceClient() {
  return globalThis.__runeServiceClient ?? null;
}
