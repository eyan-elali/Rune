"use server";

// The closed beta's actions (Beta Completion E, migration 052):
//   * joining the waitlist (anyone, signed in or not) — interest only;
//   * sending feedback (a signed-in writer) — their words and safe context;
//   * the operator's list and approval (an admin, in Pulse).
// Nothing here reads or sends manuscript content.

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAdmin } from "@/lib/actions/admin";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import {
  FEEDBACK_MAX,
  WAITLIST_NAME_MAX,
  WAITLIST_WRITES_MAX,
  isFeedbackCategory,
  isPlausibleEmail,
  normalizeBetaEmail,
  sanitizeFeedbackContext,
} from "@/lib/beta";

type Result = { error: string | null };

async function safeRecord(input: Parameters<typeof recordAnalyticsEvent>[0]) {
  try {
    await recordAnalyticsEvent(input);
  } catch {
    // Analytics never blocks the writer.
  }
}

/**
 * Adds an email to the waitlist. The same answer whether it was new, already
 * waiting, or already approved: the waitlist never says who else is on it,
 * and joining grants nothing.
 */
export async function joinBetaWaitlist(input: { email: string; name?: string; writes?: string }): Promise<Result> {
  const email = typeof input?.email === "string" ? normalizeBetaEmail(input.email) : "";
  if (!isPlausibleEmail(email)) return { error: "Enter an email address we can reach you at." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, WAITLIST_NAME_MAX) : "";
  const writes = typeof input.writes === "string" ? input.writes.trim().slice(0, WAITLIST_WRITES_MAX) : "";

  // Abuse guard (security audit): the RPC is anon-callable and every distinct
  // address is a row, so one client gets a handful of joins per window.
  // Per-instance, best-effort — see src/lib/rateLimit.ts for the caveats.
  if (!consumeRateLimit(`waitlist:${clientIpFromHeaders(await headers())}`, 5, 10 * 60 * 1000).allowed) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_beta_waitlist", {
    p_email: email,
    p_name: name || null,
    p_writes: writes || null,
  });
  if (error) {
    if (/invalid_email/.test(error.message)) return { error: "Enter an email address we can reach you at." };
    console.error("[beta] join_beta_waitlist failed:", error.code ?? "", error.message);
    return { error: "That didn’t go through. Please try again in a moment." };
  }
  // Signed in (an account without access yet): recorded against it. A
  // visitor without an account is counted by the waitlist itself.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await safeRecord({ userId: user.id, eventName: "beta_waitlist_joined" });
  return { error: null };
}

/**
 * Feedback from a signed-in writer: what they wrote in the feedback field,
 * an optional category, and the context sanitizeFeedbackContext keeps
 * (build, path, surface, device class, browser family, Project id) — nothing
 * from their manuscript or Workspace is ever read or attached.
 */
export async function submitFeedback(input: { body: string; category?: string | null; context?: unknown }): Promise<Result> {
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!body) return { error: "Write a few words first." };
  if (body.length > FEEDBACK_MAX) return { error: `Feedback can be up to ${FEEDBACK_MAX.toLocaleString()} characters.` };
  const category = isFeedbackCategory(input.category) ? input.category : null;
  const context = {
    ...sanitizeFeedbackContext(input.context),
    build: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").slice(0, 12),
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You’re signed out. Sign in again to send feedback." };

  // Abuse guard (security audit): feedback rows are unbounded per writer
  // (5,000 chars each, read back in Pulse). Twenty per writer per hour is
  // far above honest use. Per-instance, best-effort — see src/lib/rateLimit.ts.
  if (!consumeRateLimit(`feedback:${user.id}`, 20, 60 * 60 * 1000).allowed) {
    return { error: "You’ve sent a lot of feedback just now. Please try again in a little while." };
  }

  const { error } = await supabase.from("beta_feedback").insert({ user_id: user.id, category, body, context });
  if (error) {
    console.error("[beta] feedback insert failed:", error.code ?? "", error.message);
    return { error: "Your feedback couldn’t be sent. Please try again." };
  }
  // A repeatable event: one row per message, never its text.
  await safeRecord({
    userId: user.id,
    eventName: "feedback_submitted",
    projectId: context.projectId,
    metadata: { category, surface: context.surface },
    dedupeKey: crypto.randomUUID(),
  });
  return { error: null };
}

// ── The operator (Pulse) ────────────────────────────────────────────────────

export type BetaOverviewRow = {
  email: string;
  waitlistedAt: string | null;
  name: string | null;
  writes: string | null;
  approvedAt: string | null;
  acceptedAt: string | null;
};

export type BetaFeedbackRow = {
  id: string;
  createdAt: string;
  category: string | null;
  body: string;
  route: string | null;
  writer: string | null;
};

async function adminService() {
  const admin = await getCurrentAdmin();
  if (!admin) return { client: null, error: "Not authorized" } as const;
  const client = await createServiceClient();
  if (!client) return { client: null, error: "The service role key isn’t configured." } as const;
  return { client, error: null } as const;
}

/** Every approved and waitlisted email, newest first, with whether it has been accepted; and recent feedback. */
export async function getBetaOverview(): Promise<
  { data: { people: BetaOverviewRow[]; feedback: BetaFeedbackRow[] }; error: null } | { data: null; error: string }
> {
  const { client, error } = await adminService();
  if (!client) return { data: null, error };

  const [access, waitlist, feedback] = await Promise.all([
    client.from("beta_access").select("email, approved_at, accepted_at"),
    client.from("beta_waitlist").select("email, name, writes, created_at"),
    client.from("beta_feedback").select("id, created_at, category, body, context, user_id").order("created_at", { ascending: false }).limit(50),
  ]);
  const failed = access.error ?? waitlist.error ?? feedback.error;
  if (failed) return { data: null, error: failed.message };

  const people = new Map<string, BetaOverviewRow>();
  const row = (email: string) => {
    let r = people.get(email);
    if (!r) {
      r = { email, waitlistedAt: null, name: null, writes: null, approvedAt: null, acceptedAt: null };
      people.set(email, r);
    }
    return r;
  };
  for (const w of waitlist.data ?? []) {
    Object.assign(row(w.email as string), {
      waitlistedAt: w.created_at as string,
      name: (w.name as string | null) ?? null,
      writes: (w.writes as string | null) ?? null,
    });
  }
  for (const a of access.data ?? []) {
    Object.assign(row(a.email as string), {
      approvedAt: a.approved_at as string,
      acceptedAt: (a.accepted_at as string | null) ?? null,
    });
  }
  const newest = (r: BetaOverviewRow) => Math.max(Date.parse(r.waitlistedAt ?? "") || 0, Date.parse(r.approvedAt ?? "") || 0);

  // Who sent feedback, by pen name: never their content beyond the message itself.
  const writerIds = [...new Set((feedback.data ?? []).map((f) => f.user_id as string))];
  const names = new Map<string, string>();
  if (writerIds.length > 0) {
    const { data } = await client.from("profiles").select("id, display_name").in("id", writerIds);
    for (const p of data ?? []) names.set(p.id as string, (p.display_name as string | null) ?? "");
  }

  return {
    data: {
      people: [...people.values()].sort((a, b) => newest(b) - newest(a)),
      feedback: (feedback.data ?? []).map((f) => ({
        id: f.id as string,
        createdAt: f.created_at as string,
        category: (f.category as string | null) ?? null,
        body: f.body as string,
        route: ((f.context as Record<string, unknown> | null)?.route as string | undefined) ?? null,
        writer: names.get(f.user_id as string) || null,
      })),
    },
    error: null,
  };
}

/** Approves an email for the beta. Idempotent; an email already accepted stays exactly as it is. */
export async function approveBetaEmail(rawEmail: string): Promise<Result> {
  const email = typeof rawEmail === "string" ? normalizeBetaEmail(rawEmail) : "";
  if (!isPlausibleEmail(email)) return { error: "That isn’t an email address." };
  const { client, error } = await adminService();
  if (!client) return { error };
  const { error: insertError } = await client.from("beta_access").insert({ email });
  // Already approved (or accepted): nothing to change.
  if (insertError && insertError.code !== "23505") return { error: insertError.message };
  return { error: null };
}
