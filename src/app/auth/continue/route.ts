// Single post-auth continuation point, reached from three places:
//   - src/app/auth/callback/route.ts   (email confirmation / magic link,
//     only when a purchase-intent cookie is present)
//   - src/app/(auth)/login/LoginClient.tsx (password login, same condition)
//   - src/app/(auth)/complete-profile (pen-name completion), same condition
// and by Stripe itself, as the success_url/cancel_url for checkout sessions
// created with source: 'landing_purchase_intent' (see createCheckoutSession
// in src/lib/actions/billing.ts).
//
// Responsibilities, in order:
//   1. Stripe returned with ?checkout=success|cancelled — resolve
//      subscription state (with a short bounded wait for the webhook on
//      success) and send the user on to their workspace.
//   2. Otherwise, consume any pending purchase-intent cookie: create the
//      Checkout session for it and redirect straight to Stripe, unless the
//      user is already an active Scribe subscriber.
//   3. No intent, no checkout return — just send the user to /dashboard,
//      which already redirects to /onboarding on its own when they have no
//      projects yet.
//
// The intent cookie is always cleared here — it must never survive past the
// moment it's acted on, so an abandoned Checkout never loops the user back
// into Stripe on a later, unrelated visit.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { startScribeCheckoutForCurrentUser } from "@/lib/actions/billing";
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from "@/lib/purchaseIntent";

const ACTIVATION_POLL_ATTEMPTS = 3;
const ACTIVATION_POLL_DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best-effort: the webhook is authoritative and may simply not have landed
// yet. This only smooths over that short, ordinary delay — it never blocks
// the redirect on failure, and never grants Scribe itself.
async function pollSubscriptionActivation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  for (let attempt = 0; attempt < ACTIVATION_POLL_ATTEMPTS; attempt++) {
    const { data } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .maybeSingle();
    if (data?.subscription_tier === "scribe") return;
    await sleep(ACTIVATION_POLL_DELAY_MS);
  }
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const checkoutParam = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  // Forwarded from auth/callback for a brand-new signup so the
  // CompleteRegistration pixel (RegistrationTracker, rendered on /dashboard)
  // still fires even when a pending Scribe intent detours through here
  // instead of landing directly on /onboarding.
  const wasJustRegistered = searchParams.get("registered") === "1";

  function dashboardUrl(extraParams?: Record<string, string>): string {
    const url = new URL("/dashboard", origin);
    if (wasJustRegistered) url.searchParams.set("registered", "1");
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (checkoutParam === "success") {
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // Never trust the query string alone as proof of payment — only a
        // session whose own metadata names this authenticated user is worth
        // waiting on.
        if (session.metadata?.supabase_user_id === user.id) {
          await pollSubscriptionActivation(supabase, user.id);
        }
      } catch (err) {
        console.error("[auth/continue] checkout session verification failed:", err);
      }
    }
    const response = NextResponse.redirect(dashboardUrl());
    response.cookies.delete(PURCHASE_INTENT_COOKIE);
    return response;
  }

  if (checkoutParam === "cancelled") {
    const response = NextResponse.redirect(dashboardUrl({ checkoutCancelled: "1" }));
    response.cookies.delete(PURCHASE_INTENT_COOKIE);
    return response;
  }

  const intent = parsePurchaseIntent(request.cookies.get(PURCHASE_INTENT_COOKIE)?.value);
  if (intent) {
    const result = await startScribeCheckoutForCurrentUser(intent.interval, "landing_purchase_intent");

    if (result.status === "ok") {
      const response = NextResponse.redirect(result.url);
      response.cookies.delete(PURCHASE_INTENT_COOKIE);
      return response;
    }
    if (result.status === "already_subscribed") {
      const response = NextResponse.redirect(dashboardUrl());
      response.cookies.delete(PURCHASE_INTENT_COOKIE);
      return response;
    }
    // Checkout creation failed (Stripe unreachable, etc). The account is
    // still valid and usable free — never strand the user here.
    const response = NextResponse.redirect(dashboardUrl({ checkoutError: "1" }));
    response.cookies.delete(PURCHASE_INTENT_COOKIE);
    return response;
  }

  return NextResponse.redirect(dashboardUrl());
}
