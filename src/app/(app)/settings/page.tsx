export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndGrantUnlockables,
  getUserUnlockables,
} from "@/lib/actions/unlockables";
import {
  resolveFreeWordLimit,
  resolveActiveScribeBilling,
  type PricingCohort,
} from "@/lib/pricing";
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

  // Trusted "what are they actually paying, on what cadence" derivation —
  // never from the historical founder_offer_status flag, which persists
  // after cancellation. Server-only price id comparison so the raw founding
  // price id is never shipped to the client.
  const { interval: activeBillingInterval, price: currentScribePrice } =
    resolveActiveScribeBilling(
      profile?.subscription_tier,
      profile?.subscription_price_id,
      process.env.STRIPE_FOUNDING_MONTHLY_PRICE_ID,
      PRICE_IDS.scribe.annual
    );

  return (
    <SettingsClient
      profile={profile as Profile | null}
      email={user?.email ?? ""}
      unlockedIds={unlockedIds}
      freeWordLimit={freeWordLimit}
      currentScribePrice={currentScribePrice}
      activeBillingInterval={activeBillingInterval}
    />
  );
}
