// The service-role Supabase client, for the few server-only operations that
// must act beyond the signed-in writer's own rows (the closed beta's operator
// list in Pulse). Never imported by client code; null when the key is not
// configured, so a caller can say so instead of failing obscurely.
export async function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
