// Single write path for Rune's first-touch acquisition attribution.
// acquisition_attribution has RLS enabled with zero user-facing policies
// (same pattern as deleted_accounts/analytics_events), so every write goes
// through a service-role client here — never a plain authenticated insert.
//
// First-touch-wins: user_id is unique on the table, and the upsert below
// uses onConflict + ignoreDuplicates so a retried call (e.g. an auth
// callback replay) never overwrites an existing row and never errors.
//
// This module never accepts a client-supplied userId — the only caller is
// the verified-session auth callback, which resolves the user server-side
// via supabase.auth.getUser() before calling in.
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

  const { error } = await admin
    .from("acquisition_attribution")
    .upsert(
      {
        user_id: userId,
        source: touch.source,
        medium: touch.medium,
        campaign: touch.campaign,
        content: touch.content,
        term: touch.term,
        fbclid: touch.fbclid,
        landing_path: touch.landing_path,
        captured_at: touch.captured_at,
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  if (error) return { error: error.message };
  return { error: null };
}
