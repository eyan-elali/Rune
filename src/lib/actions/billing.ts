'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { PRICE_IDS } from '@/lib/stripe/config'
import type { PaidTier, BillingPeriod } from '@/lib/stripe/config'
import type { User } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { ALREADY_SUBSCRIBED_MESSAGE } from '@/lib/purchaseIntent'

const RETRYABLE_BILLING_ERROR = 'Billing is temporarily unavailable. Please try again in a moment.'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

// stripe_customer_id is a trusted billing field — protected from
// authenticated-client writes by protect_billing_columns() (migration 009).
// Every write goes through this service-role client instead, same pattern as
// src/lib/actions/analytics.ts / the Stripe webhook.
async function getServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function writeStripeCustomerId(userId: string, customerId: string): Promise<boolean> {
  const admin = await getServiceClient()
  if (!admin) return false

  const { error } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId)

  return !error
}

type CustomerOwnershipCheck =
  // Retrieved successfully, not deleted, metadata confirms this user owns it.
  | { status: 'valid' }
  // Retrieved successfully but doesn't belong to this user (deleted, or
  // metadata mismatch) — safe to create a replacement customer.
  | { status: 'replace' }
  // Stripe itself couldn't be reached or refused the request (auth,
  // rate-limit, connection, timeout, or any other transient API failure) —
  // NOT safe to create a replacement: doing so during a Stripe outage would
  // silently mint duplicate customers for the same user.
  | { status: 'error' }

/**
 * Verify a stored Stripe customer id actually belongs to this Rune user via
 * Stripe's own metadata, rather than trusting the `profiles` column alone —
 * defense in depth against a stale/corrupted/mismatched stored id.
 *
 * Deliberately distinguishes "this customer definitely isn't this user's"
 * (deleted, or a genuine 'resource_missing' from Stripe, or a metadata
 * mismatch — all safe to replace) from "Stripe couldn't tell us" (any other
 * API/network failure — must fail safely, never create a new customer,
 * since that would produce duplicates during a transient Stripe outage).
 */
async function verifyStripeCustomerOwnership(
  customerId: string,
  userId: string
): Promise<CustomerOwnershipCheck> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer

  try {
    customer = await stripe.customers.retrieve(customerId)
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      return { status: 'replace' }
    }
    // StripeAuthenticationError, StripeRateLimitError, StripeConnectionError,
    // StripeAPIError (5xx), a request timeout, or anything else unexpected.
    return { status: 'error' }
  }

  if (customer.deleted) return { status: 'replace' }
  if (customer.metadata?.supabase_user_id !== userId) return { status: 'replace' }
  return { status: 'valid' }
}

/**
 * Get-or-create the Stripe customer for a Supabase user. Reads
 * `stripe_customer_id` via the caller's normal (RLS-scoped, read-only)
 * client, but never writes it that way — the write always goes through
 * writeStripeCustomerId()'s service-role client, since the column is now
 * protected from authenticated writes. A stored id is re-verified against
 * Stripe's own metadata before being trusted; a brand-new customer is only
 * created when Stripe has definitively confirmed the old one is gone or
 * doesn't belong to this user — never on an ambiguous Stripe API/network
 * failure, which fails safely instead of risking a duplicate customer.
 * Shared by every checkout-session creator so there's one place that talks
 * to stripe.customers.create.
 */
export async function getOrCreateStripeCustomerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User
): Promise<{ customerId: string | null; error: string | null }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profileError) return { customerId: null, error: profileError.message }

  const storedCustomerId = profile?.stripe_customer_id as string | null

  if (storedCustomerId) {
    const check = await verifyStripeCustomerOwnership(storedCustomerId, user.id)
    if (check.status === 'valid') {
      return { customerId: storedCustomerId, error: null }
    }
    if (check.status === 'error') {
      return { customerId: null, error: RETRYABLE_BILLING_ERROR }
    }
    // status === 'replace': Stripe confirmed this id is deleted or doesn't
    // belong to this user — fall through and create a fresh customer.
  }

  let customer: Stripe.Customer
  try {
    customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
  } catch {
    return { customerId: null, error: RETRYABLE_BILLING_ERROR }
  }

  const wrote = await writeStripeCustomerId(user.id, customer.id)
  if (!wrote) return { customerId: null, error: 'Failed to persist billing customer' }

  return { customerId: customer.id, error: null }
}

/**
 * `source` distinguishes the ordinary Settings/Billing upgrade path from the
 * landing-page purchase-intent handoff (src/app/auth/continue/route.ts,
 * src/app/api/intent/scribe/route.ts) — Stripe-metadata-only, never read by
 * the webhook. A landing-intent checkout returns through /auth/continue
 * instead of /settings so a not-yet-onboarded new writer lands back in
 * onboarding/the workspace rather than a Settings page they've never seen.
 */
export async function createCheckoutSession(
  tier: PaidTier,
  billingPeriod: BillingPeriod,
  referralId?: string,
  source: 'settings' | 'landing_purchase_intent' = 'settings'
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }

  // Local guard, checked before touching Stripe at all — same pattern as
  // createFoundingCheckoutSession in src/lib/actions/pricing.ts. The UI
  // already prevents this in the normal Settings flow (CtaButton only shows
  // "Upgrade" to non-subscribers), but the landing-page purchase-intent path
  // has no such UI state to rely on, so this must be enforced server-side.
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()
  if ((profile?.subscription_tier ?? 'free') === 'scribe') {
    return { url: null, error: ALREADY_SUBSCRIBED_MESSAGE }
  }

  const { customerId, error: customerError } = await getOrCreateStripeCustomerId(supabase, user)
  if (customerError || !customerId) return { url: null, error: customerError ?? 'Failed to resolve billing customer' }

  // Stripe-side guard: catches an existing subscription the local `profiles`
  // row hasn't caught up to yet (e.g. created directly in Stripe, or a race
  // with an in-flight webhook).
  try {
    const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10 })
    const hasExisting = existingSubs.data.some(
      (s) => s.status !== 'canceled' && s.status !== 'incomplete_expired'
    )
    if (hasExisting) {
      return { url: null, error: ALREADY_SUBSCRIBED_MESSAGE }
    }
  } catch {
    return { url: null, error: RETRYABLE_BILLING_ERROR }
  }

  const priceId = PRICE_IDS[tier][billingPeriod]
  const isLandingIntent = source === 'landing_purchase_intent'
  const successUrl = isLandingIntent
    ? `${APP_URL}/auth/continue?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    : `${APP_URL}/settings?upgraded=true`
  const cancelUrl = isLandingIntent
    ? `${APP_URL}/auth/continue?checkout=cancelled`
    : `${APP_URL}/settings`

  // One key per checkout ATTEMPT, not one permanent key per user — see the
  // matching comment on createFoundingCheckoutSession in
  // src/lib/actions/pricing.ts for why. Guards against a network retry of
  // the same click producing two sessions, without ever blocking a
  // genuinely new click.
  const attemptId = randomUUID()

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          supabase_user_id: user.id,
          tier,
          promotekit_referral: referralId || '',
          source,
        },
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            tier,
            promotekit_referral: referralId || '',
            source,
          },
        },
        allow_promotion_codes: true,
      },
      { idempotencyKey: `checkout_${user.id}_${attemptId}` }
    )
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : RETRYABLE_BILLING_ERROR }
  }

  return { url: session.url, error: null }
}

/**
 * Thin wrapper around createCheckoutSession for the landing-page
 * purchase-intent continuation (src/app/auth/continue/route.ts and
 * src/app/api/intent/scribe/route.ts) — classifies the result into a status
 * those route handlers can branch on directly, instead of string-matching
 * the error message at every call site.
 */
export async function startScribeCheckoutForCurrentUser(
  interval: BillingPeriod,
  source: 'landing_purchase_intent'
): Promise<
  | { status: 'ok'; url: string }
  | { status: 'already_subscribed' }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'unauthenticated' }

  const result = await createCheckoutSession('scribe', interval, undefined, source)
  if (result.url) return { status: 'ok', url: result.url }
  if (result.error === ALREADY_SUBSCRIBED_MESSAGE) return { status: 'already_subscribed' }
  return { status: 'error', error: result.error ?? 'Failed to start checkout' }
}

export async function createPortalSession(): Promise<{
  url: string | null
  error: string | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profileError) return { url: null, error: profileError.message }

  const customerId = profile?.stripe_customer_id as string | null
  if (!customerId) return { url: null, error: 'No billing account found' }

  const check = await verifyStripeCustomerOwnership(customerId, user.id)
  if (check.status === 'error') {
    return { url: null, error: RETRYABLE_BILLING_ERROR }
  }
  if (check.status === 'replace') {
    // The billing portal only makes sense for a customer this user
    // genuinely owns — there's no subscription to manage on a replacement,
    // so this is just "no valid billing account", not an error to retry.
    return { url: null, error: 'No billing account found' }
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/settings`,
  })

  return { url: session.url, error: null }
}

/**
 * Switch an active Scribe subscriber between the standard monthly and
 * annual Prices. Deliberately a direct `stripe.subscriptions.update()`
 * rather than the Billing Portal — this repo doesn't pass a `configuration`
 * to `billingPortal.sessions.create()`, so whether the account's default
 * portal config even supports plan switching is Dashboard state this code
 * can't see or safely assume. Never accepts a raw Price ID from the client:
 * `targetInterval` is only ever 'monthly' | 'annual' and is mapped through
 * the trusted PRICE_IDS.scribe table below.
 *
 * Immediate change with Stripe's default proration (`create_prorations`):
 * entitlement flips right away, and the prorated adjustment is applied to
 * the customer's next invoice — there is no separate Stripe-hosted
 * confirmation step for the user to review it first, since this bypasses
 * the Portal/Checkout entirely.
 */
export async function changeScribeBillingInterval(
  targetInterval: BillingPeriod
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_tier, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profileError) return { error: profileError.message }
  if (profile?.subscription_tier !== 'scribe') {
    return { error: 'No active Scribe subscription found.' }
  }

  const customerId = profile.stripe_customer_id as string | null
  if (!customerId) return { error: 'No billing account found' }

  const ownership = await verifyStripeCustomerOwnership(customerId, user.id)
  if (ownership.status === 'error') return { error: RETRYABLE_BILLING_ERROR }
  if (ownership.status === 'replace') return { error: 'No billing account found' }

  const targetPriceId = PRICE_IDS.scribe[targetInterval]

  let subscriptions: Stripe.ApiList<Stripe.Subscription>
  try {
    subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 10 })
  } catch {
    return { error: RETRYABLE_BILLING_ERROR }
  }

  // Same "ignore dead subscriptions" filter used in
  // createFoundingCheckoutSession (src/lib/actions/pricing.ts).
  const subscription = subscriptions.data.find(
    (s) => s.status !== 'canceled' && s.status !== 'incomplete_expired'
  )
  const item = subscription?.items.data[0]
  if (!subscription || !item) return { error: 'No active Scribe subscription found.' }

  if (item.price.id === targetPriceId) {
    return { error: `You are already on the ${targetInterval} plan.` }
  }

  let updated: Stripe.Subscription
  try {
    updated = await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, price: targetPriceId }],
      proration_behavior: 'create_prorations',
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : RETRYABLE_BILLING_ERROR }
  }

  // Write the confirmed result immediately rather than waiting on the async
  // customer.subscription.updated webhook — profiles' billing columns are
  // protected from authenticated writes (migration 009), so this goes
  // through the same service-role path as the rest of this file. Not
  // optimistic: `updated` is Stripe's own confirmation of the change that
  // already happened.
  const admin = await getServiceClient()
  if (admin) {
    const updatedItem = updated.items.data[0]
    await admin
      .from('profiles')
      .update({
        subscription_price_id: updatedItem?.price.id ?? targetPriceId,
        subscription_status: updated.status,
        subscription_period_end: updatedItem?.current_period_end
          ? new Date(updatedItem.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('id', user.id)
  }

  return { error: null }
}

