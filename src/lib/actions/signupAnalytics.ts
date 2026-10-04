"use server";

// The one analytics event the browser records itself: supabase.auth.signUp()
// talks directly to Supabase's REST API, and — because email confirmation is
// required — no session exists yet for a server component/action to derive
// identity from. This action is deliberately scoped to write only
// "signup_completed" for a userId it has independently verified corresponds
// to a real profiles row, so a compromised/malicious client cannot use it to
// forge arbitrary events. It must never be widened into a general-purpose
// "record any event for any user" entry point — recordAnalyticsEvent stays
// in a plain server module (analytics.ts) with no action endpoint at all.

import { recordAnalyticsEvent } from "@/lib/actions/analytics";

async function getServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function recordSignupCompletedEvent(userId: string): Promise<{ error: string | null }> {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: null };
  }
  const admin = await getServiceClient();
  if (!admin) {
    return { error: "Analytics is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) return { error: null };

  return recordAnalyticsEvent({ userId, eventName: "signup_completed" });
}
