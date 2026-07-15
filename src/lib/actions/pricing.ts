"use server";

// Server actions for the one-time legacy pricing notice: declining the
// founding offer, and creating a founding-price Stripe Checkout session.
// The founding Stripe Price id (STRIPE_FOUNDING_MONTHLY_PRICE_ID) is a
// server-only env var (no NEXT_PUBLIC_ prefix) and is never accepted from
// the client — every path here re-derives eligibility from trusted server
// state (profiles.subscription_tier, user_pricing_entitlements) rather than
// trusting anything passed in.

import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomerId } from "@/lib/actions/billing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

// Same pattern as src/lib/actions/analytics.ts / the Stripe webhook — a
// local service-role client, not consolidated into a shared helper, to match
// the existing convention rather than an unrelated refactor.
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

export async function declinePricingNotice(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = await getServiceClient();
  if (!admin) return { error: "Not configured" };

  // Guarded by `pricing_notice_resolved_at is null` so this is idempotent —
  // a retry (refresh, network blip) can never double-write or flip an
  // already-resolved notice.
  const { error } = await admin
    .from("user_pricing_entitlements")
    .update({
      founder_offer_status: "declined",
      pricing_notice_resolved_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .is("pricing_notice_resolved_at", null);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createFoundingCheckoutSession(): Promise<{
  url: string | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: "Not authenticated" };

  // Independent server-side "not already a paid subscriber" check, using the
  // app's sole canonical entitlement test (subscription_tier === 'scribe' —
  // see canAccessFeature in src/lib/subscription.ts). Checked before touching
  // Stripe at all.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if ((profile?.subscription_tier ?? "free") === "scribe") {
    return { url: null, error: "You already have an active subscription." };
  }

  // select-own RLS policy covers this read — no service role needed.
  const { data: entitlement } = await supabase
    .from("user_pricing_entitlements")
    .select("pricing_cohort, founder_offer_status, pricing_notice_resolved_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const eligible =
    entitlement?.pricing_cohort === "legacy_15k" &&
    entitlement?.founder_offer_status === "eligible" &&
    !entitlement?.pricing_notice_resolved_at;

  if (!eligible) {
    return { url: null, error: "This offer is not available for your account." };
  }

  const priceId = process.env.STRIPE_FOUNDING_MONTHLY_PRICE_ID;
  if (!priceId) {
    return { url: null, error: "The founding offer is not configured." };
  }

  const { customerId, error: customerError } = await getOrCreateStripeCustomerId(
    supabase,
    user
  );
  if (customerError || !customerId) {
    return { url: null, error: customerError ?? "Failed to resolve billing customer" };
  }

  // Second, Stripe-side guard: catches an existing subscription that the
  // local `profiles` row hasn't caught up to yet (e.g. created directly in
  // Stripe, or a race with an in-flight webhook) — not relying on the local
  // tier check alone.
  try {
    const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    const hasExisting = existingSubs.data.some(
      (s) => s.status !== "canceled" && s.status !== "incomplete_expired"
    );
    if (hasExisting) {
      return { url: null, error: "You already have an active subscription." };
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}/settings?upgraded=true`,
        cancel_url: `${APP_URL}/settings`,
        metadata: {
          supabase_user_id: user.id,
          tier: "scribe",
          founding: "true",
        },
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            tier: "scribe",
            founding: "true",
          },
        },
        allow_promotion_codes: false,
      },
      // Closes the double-tab/double-submit race: rapid duplicate calls with
      // identical params replay the same Checkout Session instead of Stripe
      // creating a second one.
      { idempotencyKey: `founding_checkout_${user.id}` }
    );

    return { url: session.url, error: null };
  } catch (err) {
    // No DB write happens above this point on any failure path, so the
    // notice stays unresolved and the offer remains re-offerable.
    return { url: null, error: err instanceof Error ? err.message : "Failed to start checkout" };
  }
}
