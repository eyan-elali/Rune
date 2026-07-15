export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndGrantUnlockables,
  getUserUnlockables,
} from "@/lib/actions/unlockables";
import { resolveFreeWordLimit, type PricingCohort } from "@/lib/pricing";
import { PRICE_IDS } from "@/lib/stripe/config";
import { SettingsClient } from "./SettingsClient";
import type { Profile } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, userUnlockables, { data: entitlement }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    getUserUnlockables(user!.id),
    supabase
      .from("user_pricing_entitlements")
      .select("pricing_cohort")
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  const newlyGranted = await checkAndGrantUnlockables(user!.id);
  const unlockedIds = new Set([
    ...userUnlockables.map((u) => u.unlockable_id),
    ...newlyGranted,
  ]);

  const cohort = (entitlement?.pricing_cohort as PricingCohort | undefined) ?? "starter_2k";
  const freeWordLimit = resolveFreeWordLimit(cohort);

  // Trusted "what are they actually paying" derivation — never from the
  // historical founder_offer_status flag, which persists after cancellation.
  // Only meaningful when subscription_tier === 'scribe' (the canonical
  // entitled-subscriber test); server-only price id comparison so the raw
  // founding price id is never shipped to the client.
  let currentScribePrice: number | null = null;
  if (profile?.subscription_tier === "scribe") {
    const priceId = profile.subscription_price_id;
    if (priceId && priceId === process.env.STRIPE_FOUNDING_MONTHLY_PRICE_ID) {
      currentScribePrice = 6.99;
    } else if (priceId === PRICE_IDS.scribe.annual) {
      currentScribePrice = 8;
    } else {
      currentScribePrice = 9.99;
    }
  }

  return (
    <SettingsClient
      profile={profile as Profile | null}
      email={user?.email ?? ""}
      unlockedIds={unlockedIds}
      freeWordLimit={freeWordLimit}
      currentScribePrice={currentScribePrice}
    />
  );
}
