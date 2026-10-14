"use server";

// Pulse's launch report loader (admin only): the signup cohort in range and
// everything the report needs about it, read with the service role (the
// analytics tables have no user-facing policies) and handed to the pure
// buildLaunchReport (lib/launchReport.ts), which holds the definitions.
//
// Only production events count: every event carries metadata.env since this
// change (lib/launchMetrics.ts analyticsEnvironment — local development and
// preview deployments share the production database), and an event without
// env predates the tag and is kept as before. Internal accounts
// (analytics_excluded_users) are left out unless includeInternal.
//
// Nothing here reads writing, titles, names or emails: only ids, dates, event
// names, the allowlisted metadata, and the first-touch campaign fields.

import { getCurrentAdmin } from "@/lib/actions/admin";
import { readAllRows } from "@/lib/readAllRows";
import { buildLaunchReport, type AttributionRow, type CohortEvent, type CohortSignup, type LandingEvent, type LaunchReport } from "@/lib/launchReport";
import type { PulseTimeRange } from "@/lib/actions/pulse";

const PRODUCTION_ONLY = "metadata->>env.is.null,metadata->>env.eq.production";
const CHUNK = 150;

const COHORT_EVENTS = [
  "email_verified",
  "onboarding_path_new",
  "onboarding_path_import",
  "onboarding_completed",
  "project_created",
  "first_words_written",
  "second_writing_day",
  "third_writing_day",
  "phone_waiting_room_viewed",
  "desktop_link_requested",
  "desktop_link_copied",
];

async function service() {
  if (!(await getCurrentAdmin())) throw new Error("Not authorized");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Pulse is not configured (missing SUPABASE_SERVICE_ROLE_KEY).");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function since(range: PulseTimeRange): string | null {
  if (range === "all") return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (range === "7d" ? 7 : range === "30d" ? 30 : 90));
  return d.toISOString();
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

export async function getLaunchReport(range: PulseTimeRange, includeInternal = false): Promise<LaunchReport> {
  const client = await service();
  const from = since(range);

  const excluded = new Set<string>();
  if (!includeInternal) {
    const { data } = await client.from("analytics_excluded_users").select("user_id");
    for (const r of data ?? []) excluded.add(r.user_id as string);
  }

  const signupRows = await readAllRows<{ id: string; user_id: string; created_at: string }>(() => {
    let q = client.from("analytics_events").select("id, user_id, created_at").eq("event_name", "signup_completed").or(PRODUCTION_ONLY);
    if (from) q = q.gte("created_at", from);
    return q;
  });
  const firstSignup = new Map<string, string>();
  for (const r of signupRows) {
    if (!r.user_id || excluded.has(r.user_id)) continue;
    const prev = firstSignup.get(r.user_id);
    if (!prev || r.created_at < prev) firstSignup.set(r.user_id, r.created_at);
  }
  const signups: CohortSignup[] = [...firstSignup].map(([user_id, created_at]) => ({ user_id, created_at }));
  const ids = signups.map((s) => s.user_id);

  const events: CohortEvent[] = [];
  const writingDays: { user_id: string; session_date: string }[] = [];
  const owners = new Set<string>();
  const attributions: AttributionRow[] = [];
  for (const part of chunks(ids)) {
    const [ev, ws, pr, at] = await Promise.all([
      readAllRows<CohortEvent & { id: string }>(() =>
        client
          .from("analytics_events")
          .select("id, user_id, event_name, created_at, local_date, metadata")
          .in("user_id", part)
          .in("event_name", COHORT_EVENTS)
      ),
      readAllRows<{ id: string; user_id: string; session_date: string }>(() =>
        client.from("writing_sessions").select("id, user_id, session_date").in("user_id", part).gt("words_added", 0).not("project_id", "is", null)
      ),
      readAllRows<{ id: string; user_id: string }>(() => client.from("projects").select("id, user_id").in("user_id", part)),
      // "*": referrer_host exists only from migration 058 on; naming it would fail before.
      readAllRows<AttributionRow & { id: string }>(() => client.from("acquisition_attribution").select("*").in("user_id", part)),
    ]);
    events.push(...ev);
    writingDays.push(...ws);
    for (const p of pr) owners.add(p.user_id);
    attributions.push(
      ...at.map((a) => ({
        user_id: a.user_id,
        source: a.source,
        medium: a.medium,
        campaign: a.campaign,
        content: a.content,
        fbclid: a.fbclid,
        referrer_host: a.referrer_host ?? null,
      }))
    );
  }

  const landing = await readAllRows<LandingEvent & { id: string }>(() => {
    let q = client
      .from("analytics_events")
      .select("id, event_name, metadata")
      .is("user_id", null)
      .in("event_name", ["landing_viewed", "landing_cta_clicked"])
      .or(PRODUCTION_ONLY);
    if (from) q = q.gte("created_at", from);
    return q;
  });

  return buildLaunchReport({
    signups,
    events,
    writingDays,
    projectOwners: [...owners],
    attributions,
    landing,
    today: new Date().toISOString().slice(0, 10),
  });
}
