"use server";

// Server-authoritative desktop-link email for phone users stuck in the
// waiting room (see PhoneWaitingRoom.tsx). Two entry points share one send
// path: an automatic one-time send on first eligible view, and a
// user-triggered resend with a cooldown. Idempotency and cooldown state both
// live in profiles.preferences.mobile_desktop_email_sent_at — the same
// jsonb column already used for one-off account flags (see settings.ts).
//
// The magic link always goes to the authenticated user's own verified email
// (never a client-supplied recipient) and always redirects through the
// existing /auth/callback with a server-hardcoded `next=/onboarding` — the
// client never controls the destination.

import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const RESEND_COOLDOWN_MS = 45_000;
const GENERIC_SEND_ERROR = "Couldn't send the email. Try again in a moment.";
const COOLDOWN_ERROR = "Please wait a moment before requesting another link.";

export interface RequestDesktopLinkResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

async function getEligibleUser(supabase: ServerSupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email };
}

async function sendMagicLink(
  supabase: ServerSupabaseClient,
  email: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent("/onboarding")}`,
    },
  });
  if (error) {
    // Never log the email address or any link/token — operational signal only.
    console.error("[waitingRoom] signInWithOtp failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Fires at most once per account. Called from the client on the waiting
 * room's first render for an eligible ("new", zero-project) phone user. The
 * conditional update below is the atomic claim: only the caller that
 * actually flips the column from null wins the right to send, so concurrent
 * mounts or refreshes can't double-send.
 */
export async function triggerAutomaticDesktopLinkEmail(): Promise<{ sent: boolean }> {
  const supabase = await createClient();
  const user = await getEligibleUser(supabase);
  if (!user) return { sent: false };

  const { data: row, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();
  if (readError || !row) return { sent: false };

  const preferences = (row.preferences as Record<string, unknown>) ?? {};
  if (preferences.mobile_desktop_email_sent_at) return { sent: false };

  const merged = { ...preferences, mobile_desktop_email_sent_at: new Date().toISOString() };

  const { data: claimedRows, error: updateError } = await supabase
    .from("profiles")
    .update({ preferences: merged })
    .eq("id", user.id)
    .filter("preferences->>mobile_desktop_email_sent_at", "is", null)
    .select("id");

  if (updateError || !claimedRows || claimedRows.length === 0) return { sent: false };

  const { error: sendError } = await sendMagicLink(supabase, user.email);
  return { sent: !sendError };
}

/**
 * Records the phone-waiting-room impression for the caller's own
 * authenticated session — never a client-supplied userId — so this stays
 * safe to call directly from PhoneWaitingRoom's client component. Dedupe
 * key defaults to a fixed sentinel (see recordAnalyticsEvent), so repeated
 * renders/refreshes only ever produce one row.
 */
export async function recordPhoneWaitingRoomViewed(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await recordAnalyticsEvent({ userId: user.id, eventName: "phone_waiting_room_viewed" });
  } catch (err) {
    console.error("[waitingRoom] phone_waiting_room_viewed analytics threw:", err);
  }
}

/**
 * User-triggered resend. Enforces a cooldown against the same timestamp
 * used for automatic-send idempotency, with a compare-and-swap update so two
 * rapid clicks can't both clear the cooldown check and both send. A
 * delivery failure rolls the timestamp back so it doesn't cost the user a
 * resend attempt.
 */
export async function requestDesktopLinkEmail(): Promise<RequestDesktopLinkResult> {
  const supabase = await createClient();
  const user = await getEligibleUser(supabase);
  if (!user) {
    return { ok: false, error: "You need to be signed in to request this." };
  }

  const { data: row, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();
  if (readError || !row) {
    return { ok: false, error: GENERIC_SEND_ERROR };
  }

  const preferences = (row.preferences as Record<string, unknown>) ?? {};
  const previousSentAt = (preferences.mobile_desktop_email_sent_at as string | undefined) ?? null;

  if (previousSentAt) {
    const elapsedMs = Date.now() - new Date(previousSentAt).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        error: COOLDOWN_ERROR,
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000),
      };
    }
  }

  const now = new Date().toISOString();
  const merged = { ...preferences, mobile_desktop_email_sent_at: now };

  let updateQuery = supabase.from("profiles").update({ preferences: merged }).eq("id", user.id);
  updateQuery = previousSentAt
    ? updateQuery.filter("preferences->>mobile_desktop_email_sent_at", "eq", previousSentAt)
    : updateQuery.filter("preferences->>mobile_desktop_email_sent_at", "is", null);

  const { data: claimedRows, error: updateError } = await updateQuery.select("id");
  if (updateError || !claimedRows || claimedRows.length === 0) {
    return { ok: false, error: COOLDOWN_ERROR };
  }

  const { error: sendError } = await sendMagicLink(supabase, user.email);
  if (sendError) {
    await supabase
      .from("profiles")
      .update({ preferences: { ...preferences, mobile_desktop_email_sent_at: previousSentAt } })
      .eq("id", user.id);
    return { ok: false, error: GENERIC_SEND_ERROR };
  }

  try {
    await recordAnalyticsEvent({
      userId: user.id,
      eventName: "desktop_link_requested",
      dedupeKey: now,
    });
  } catch (err) {
    console.error("[waitingRoom] desktop_link_requested analytics threw:", err);
  }

  return { ok: true };
}
