"use server";

// The one analytics event the browser records itself: supabase.auth.signUp()
// talks directly to Supabase's REST API, and — because email confirmation is
// required — no session exists yet for a server component/action to derive
// identity from. This action is deliberately scoped to write only
// "signup_completed" (and that sign-up's first-touch attribution, for a
// profile created in the last half hour) for a userId it has independently
// verified corresponds to a real profiles row, so a compromised/malicious client cannot use it to
// forge arbitrary events. It must never be widened into a general-purpose
// "record any event for any user" entry point — recordAnalyticsEvent stays
// in a plain server module (analytics.ts) with no action endpoint at all.

import { cookies } from "next/headers";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { recordFirstTouchAttribution } from "@/lib/actions/attribution";
import { ATTRIBUTION_COOKIE_NAME, deserializeAttributionCookie } from "@/lib/attribution";

// Only a profile this young is a sign-up happening now: the attribution write
// below never attaches this browser's campaign to an older account.
const FRESH_SIGNUP_MS = 30 * 60 * 1000;

// First touch, persisted in the browser that signed up. The auth callback
// persists it too, but only if the verification link opens where the cookie
// is — on a phone it often opens in the mail app's browser instead. Best
// effort, first touch wins (the callback's later write is a no-op), and
// never blocks the sign-up.
async function persistSignupAttribution(userId: string, createdAt: string | null) {
  try {
    if (!createdAt || Date.now() - new Date(createdAt).getTime() > FRESH_SIGNUP_MS) return;
    const touch = deserializeAttributionCookie((await cookies()).get(ATTRIBUTION_COOKIE_NAME)?.value);
    if (!touch) return;
    const { error } = await recordFirstTouchAttribution(userId, touch);
    if (error) console.error("[signup] first-touch attribution failed:", error);
  } catch (err) {
    console.error("[signup] first-touch attribution threw:", err instanceof Error ? err.message : String(err));
  }
}

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

  const { data: profile } = await admin.from("profiles").select("id, created_at").eq("id", userId).maybeSingle();
  if (!profile) return { error: null };

  await persistSignupAttribution(userId, (profile.created_at as string | null) ?? null);
  return recordAnalyticsEvent({ userId, eventName: "signup_completed" });
}
