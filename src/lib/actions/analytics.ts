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
//
// Deliberately NOT a "use server" module: recordAnalyticsEvent takes the
// user id it writes for, so it must only ever be called by server code that
// has established that identity itself. A "use server" file makes every
// export a Server Action the browser can invoke directly; the one event a
// client records lives in signupAnalytics.ts instead.

import type { AnalyticsEventName } from "@/lib/analyticsEvents";
import { analyticsEnvironment, sanitizeAnalyticsMetadata } from "@/lib/launchMetrics";

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

// Every event carries the environment it came from (lib/launchMetrics.ts:
// local development shares the production database), and only allowlisted,
// operational metadata keys — never a title, prose, a pen name or an email.
function eventMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...sanitizeAnalyticsMetadata(metadata), env: analyticsEnvironment() };
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
): Promise<{ error: string | null; code?: string }> {
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
        metadata: eventMetadata(input.metadata),
        dedupe_key: input.dedupeKey ?? ONE_TIME_DEDUPE_KEY,
      },
      { onConflict: "user_id,event_name,dedupe_key", ignoreDuplicates: true }
    );

  if (error) return { error: error.message, code: error.code };
  return { error: null };
}

// The signed-out front door's two events (landing_viewed, landing_cta_clicked):
// no account exists, so user_id is null and every row is its own (a fresh
// dedupe key). Only the front-door event route calls this, after validating
// and rate-limiting the request; it never takes a user id.
export type AnonymousEventName = Extract<AnalyticsEventName, "landing_viewed" | "landing_cta_clicked">;

export async function recordAnonymousEvent(
  eventName: AnonymousEventName,
  metadata: Record<string, unknown>
): Promise<{ error: string | null }> {
  const admin = await getServiceClient();
  if (!admin) return { error: "Analytics is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };
  const { error } = await admin.from("analytics_events").insert({
    user_id: null,
    event_name: eventName,
    metadata: eventMetadata(metadata),
    dedupe_key: crypto.randomUUID(),
  });
  return { error: error ? error.message : null };
}
