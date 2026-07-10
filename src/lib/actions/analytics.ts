"use server";

// Single write path for Rune's first-party analytics. analytics_events has
// RLS enabled with zero user-facing policies (same pattern as
// deleted_accounts), so every write goes through a service-role client here
// — never a plain authenticated insert from a client component.
//
// Deduplication: dedupe_key always gets a value before the insert. Callers
// recording a one-time-per-user milestone (e.g. "first_save") can omit
// dedupeKey entirely — it defaults to a fixed sentinel, so the unique index
// on (user_id, event_name, dedupe_key) blocks a second row outright.
// Callers recording a repeatable-but-idempotent event (e.g. a per-day
// event, or "session_2"/"session_3" for retention milestones) pass a
// stable dedupeKey so each distinct value gets exactly one row. Either way
// the insert uses ON CONFLICT DO NOTHING, so it's always safe to retry.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, no
// NEXT_PUBLIC_ prefix) — matches the existing pattern in
// src/lib/actions/settings.ts's deleteAccount().

import type { AnalyticsEventName } from "@/lib/analyticsEvents";

const ONE_TIME_DEDUPE_KEY = "once";

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

export interface RecordAnalyticsEventInput {
  userId: string;
  eventName: AnalyticsEventName;
  projectId?: string | null;
  localDate?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export async function recordAnalyticsEvent(
  input: RecordAnalyticsEventInput
): Promise<{ error: string | null }> {
  const admin = await getServiceClient();
  if (!admin) {
    return { error: "Analytics is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { error } = await admin
    .from("analytics_events")
    .upsert(
      {
        user_id: input.userId,
        event_name: input.eventName,
        project_id: input.projectId ?? null,
        local_date: input.localDate ?? null,
        metadata: input.metadata ?? null,
        dedupe_key: input.dedupeKey ?? ONE_TIME_DEDUPE_KEY,
      },
      { onConflict: "user_id,event_name,dedupe_key", ignoreDuplicates: true }
    );

  if (error) return { error: error.message };
  return { error: null };
}

// Narrow, client-callable server action for the one event in this taxonomy
// that has no server-side completion point to hook into: supabase.auth.signUp()
// talks directly to Supabase's REST API, and — because email confirmation is
// required — no session exists yet for a server component/action to derive
// identity from. This function is deliberately scoped to write only
// "signup_completed" for a userId it has independently verified corresponds
// to a real profiles row, so a compromised/malicious client cannot use it to
// forge arbitrary events or attribute events to a different user's account.
// It must never be widened into a general-purpose "record any event for any
// user" entry point — recordAnalyticsEvent() above stays server-only for that.
export async function recordSignupCompletedEvent(
  userId: string
): Promise<{ error: string | null }> {
  const admin = await getServiceClient();
  if (!admin) {
    return { error: "Analytics is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { error: null };

  return recordAnalyticsEvent({ userId, eventName: "signup_completed" });
}
