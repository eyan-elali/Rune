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
