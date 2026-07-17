// Purchase-intent capture for the landing page's "Continue with Scribe" CTA.
// Carries { tier: 'scribe', interval } through signup/login/email-confirmation
// so a visitor who authenticates doesn't lose their choice and land in normal
// free onboarding instead of Checkout. Stored in a short-lived, httpOnly
// cookie — never trusted without re-validating shape and expiry, since it's
// just cookie content an attacker fully controls in their own browser.

import type { BillingPeriod } from "@/lib/stripe/config";

export const PURCHASE_INTENT_COOKIE = "rune_purchase_intent";

// Shared with src/lib/actions/billing.ts's duplicate-subscription guard —
// kept here (not exported from that "use server" module) because a "use
// server" file may only export async functions; a plain string constant
// there breaks the whole module's exports at build time.
export const ALREADY_SUBSCRIBED_MESSAGE = "You already have an active subscription.";

// Short-lived by design: long enough to survive signup -> email confirmation
// on a normal connection, short enough that a stale/abandoned intent can't
// resurface and redirect a later, unrelated free signup into Checkout.
export const PURCHASE_INTENT_MAX_AGE_SECONDS = 60 * 30;

export interface PurchaseIntent {
  tier: "scribe";
  interval: BillingPeriod;
  issuedAt: number;
}

export function validateBillingInterval(value: unknown): BillingPeriod {
  return value === "annual" ? "annual" : "monthly";
}

export function serializePurchaseIntent(interval: BillingPeriod): string {
  const payload: PurchaseIntent = { tier: "scribe", interval, issuedAt: Date.now() };
  return JSON.stringify(payload);
}

// Re-validates the cookie's shape and age on every read rather than trusting
// it — the client can send any string here, and an expired intent must
// never silently resurrect a checkout the visitor already walked away from.
export function parsePurchaseIntent(raw: string | undefined | null): PurchaseIntent | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.tier !== "scribe") return null;
  if (candidate.interval !== "monthly" && candidate.interval !== "annual") return null;
  if (typeof candidate.issuedAt !== "number" || !Number.isFinite(candidate.issuedAt)) return null;

  const age = Date.now() - candidate.issuedAt;
  if (age < 0 || age > PURCHASE_INTENT_MAX_AGE_SECONDS * 1000) return null;

  return { tier: "scribe", interval: candidate.interval, issuedAt: candidate.issuedAt };
}

export const PURCHASE_INTENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: PURCHASE_INTENT_MAX_AGE_SECONDS,
};
