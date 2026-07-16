// Canonical, server-authoritative free-word-limit resolution. Every path that
// enforces or displays a word limit must go through resolveFreeWordLimit()
// rather than hardcoding 15_000/2_000 — see user_pricing_entitlements.

export type PricingCohort = "legacy_15k" | "starter_2k";

export const WORD_LIMITS: Record<PricingCohort, number> = {
  legacy_15k: 15_000,
  starter_2k: 2_000,
};

export function resolveFreeWordLimit(cohort: PricingCohort): number {
  return WORD_LIMITS[cohort];
}

// Canonical, server-authoritative Scribe billing-interval resolution. Every
// path that needs "what is this user actually paying, on what cadence" must
// go through resolveActiveScribeBilling() rather than re-deriving it from
// subscription_price_id inline — see settings/page.tsx and PricingTable.
//
// Pure by design: the founding/annual price ids are resolved by the caller
// (server-only env access lives in settings/page.tsx) and passed in, so this
// function never touches process.env and stays safe to import from client
// components (PricingTable needs the ActiveBillingInterval type).
export type ActiveBillingInterval =
  | "monthly"
  | "annual"
  | "founding_monthly"
  | null;

export interface ActiveScribeBilling {
  interval: ActiveBillingInterval;
  price: number | null;
}

const STANDARD_SCRIBE_MONTHLY_PRICE = 9.99;
const STANDARD_SCRIBE_ANNUAL_PER_MONTH = 8;
const FOUNDING_SCRIBE_MONTHLY_PRICE = 6.99;

export function resolveActiveScribeBilling(
  subscriptionTier: string | null | undefined,
  subscriptionPriceId: string | null | undefined,
  foundingMonthlyPriceId: string | null | undefined,
  annualPriceId: string | null | undefined
): ActiveScribeBilling {
  if (subscriptionTier !== "scribe" || !subscriptionPriceId) {
    return { interval: null, price: null };
  }
  if (foundingMonthlyPriceId && subscriptionPriceId === foundingMonthlyPriceId) {
    return { interval: "founding_monthly", price: FOUNDING_SCRIBE_MONTHLY_PRICE };
  }
  if (annualPriceId && subscriptionPriceId === annualPriceId) {
    return { interval: "annual", price: STANDARD_SCRIBE_ANNUAL_PER_MONTH };
  }
  return { interval: "monthly", price: STANDARD_SCRIBE_MONTHLY_PRICE };
}

/** Maps an active interval onto the toggle position it corresponds to. */
export function billingIntervalMatchesSelection(
  active: ActiveBillingInterval,
  selected: "monthly" | "annual"
): boolean {
  if (active === null) return false;
  if (active === "founding_monthly") return selected === "monthly";
  return active === selected;
}
