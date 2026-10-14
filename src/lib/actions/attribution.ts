// Single write path for Rune's first-touch acquisition attribution.
// acquisition_attribution has RLS enabled with zero user-facing policies
// (same pattern as deleted_accounts/analytics_events), so every write goes
// through a service-role client here — never a plain authenticated insert.
//
// First-touch-wins: user_id is unique on the table, and the upsert below
// uses onConflict + ignoreDuplicates so a retried call (e.g. an auth
// callback replay) never overwrites an existing row and never errors.
//
// Callers: the verified-session auth callback (the user from the code
// exchange), and signupAnalytics.ts at sign-up time — in the browser that
// signed up, where the cookie is, for a profile it has verified is brand new
// (so a verification link opened in another browser or the phone's mail app
// no longer loses the campaign). First touch wins either way.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, no
// NEXT_PUBLIC_ prefix) — matches the existing pattern in
// src/lib/actions/settings.ts's deleteAccount() and
// src/lib/actions/analytics.ts's recordAnalyticsEvent().

import type { AttributionTouch } from "@/lib/attribution";

async function getServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface RecordAttributionResult {
  error: string | null;
}

export async function recordFirstTouchAttribution(
  userId: string,
  touch: AttributionTouch
): Promise<RecordAttributionResult> {
  const admin = await getServiceClient();
  if (!admin) {
    return { error: "Attribution is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const row = {
    user_id: userId,
    source: touch.source,
    medium: touch.medium,
    campaign: touch.campaign,
    content: touch.content,
    term: touch.term,
    fbclid: touch.fbclid,
    landing_path: touch.landing_path,
    referrer_host: touch.referrer_host,
    captured_at: touch.captured_at,
  };
  const write = (values: Record<string, unknown>) =>
    admin.from("acquisition_attribution").upsert(values, { onConflict: "user_id", ignoreDuplicates: true });

  let { error } = await write(row);
  // A database without migration 058 has no referrer_host column: keep the
  // campaign fields rather than lose the whole first touch.
  if (error && (error.code === "PGRST204" || error.code === "42703") && /referrer_host/.test(error.message)) {
    const { referrer_host: _omit, ...withoutReferrer } = row;
    void _omit;
    ({ error } = await write(withoutReferrer));
  }

  if (error) return { error: error.message };
  return { error: null };
}
