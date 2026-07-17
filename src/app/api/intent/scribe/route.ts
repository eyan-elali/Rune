// Entry point for the landing page's "Continue with Scribe" CTA
// (src/components/LandingPage.tsx). Never trusts the `billing` query param
// as a Stripe price id — it only selects 'monthly' | 'annual', which is
// mapped to a real price server-side inside createCheckoutSession.
//
// - Already authenticated (Flow C/D): resolve straight to Checkout, or to
//   the workspace if already subscribed. No detour through signup.
// - Not authenticated (Flow B): record the intent in a short-lived, httpOnly
//   cookie and continue to signup — /auth/continue picks the intent back up
//   once a session exists (see that route for the full continuation).
//
// This route must stay reachable by signed-out visitors — it's listed in
// proxy.ts's PUBLIC_ROUTES for exactly that reason.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startScribeCheckoutForCurrentUser } from "@/lib/actions/billing";
import {
  PURCHASE_INTENT_COOKIE,
  PURCHASE_INTENT_COOKIE_OPTIONS,
  serializePurchaseIntent,
  validateBillingInterval,
} from "@/lib/purchaseIntent";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const interval = validateBillingInterval(searchParams.get("billing"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const result = await startScribeCheckoutForCurrentUser(interval, "landing_purchase_intent");

    if (result.status === "ok") {
      return NextResponse.redirect(result.url);
    }
    if (result.status === "already_subscribed") {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
    // "unauthenticated" can't happen here (we just checked); "error" means
    // Checkout itself couldn't be reached — the account is fine either way,
    // so land them in the workspace rather than a dead end.
    return NextResponse.redirect(`${origin}/dashboard?checkoutError=1`);
  }

  const response = NextResponse.redirect(
    `${origin}/signup?plan=scribe&billing=${interval}`
  );
  response.cookies.set(
    PURCHASE_INTENT_COOKIE,
    serializePurchaseIntent(interval),
    PURCHASE_INTENT_COOKIE_OPTIONS
  );
  return response;
}
