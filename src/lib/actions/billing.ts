'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { PRICE_IDS } from '@/lib/stripe/config'
import type { PaidTier, BillingPeriod } from '@/lib/stripe/config'
import type { User } from '@supabase/supabase-js'
import Stripe from 'stripe'

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

export async function createCheckoutSession(
  tier: PaidTier,
  billingPeriod: BillingPeriod,
  referralId?: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }

  const { customerId, error: customerError } = await getOrCreateStripeCustomerId(supabase, user)
  if (customerError || !customerId) return { url: null, error: customerError ?? 'Failed to resolve billing customer' }

  const priceId = PRICE_IDS[tier][billingPeriod]

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings?upgraded=true`,
    cancel_url: `${APP_URL}/settings`,
    metadata: {
      supabase_user_id: user.id,
      tier,
      promotekit_referral: referralId || '',
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        tier,
        promotekit_referral: referralId || '',
      },
    },
    allow_promotion_codes: true,
  })

  return { url: session.url, error: null }
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

export async function getWeeklyTicketUsage(userId: string): Promise<number> {
  const supabase = await createClient()
  const weekStart = getWeekStart()

  const { data } = await supabase
    .from('game_tickets')
    .select('tickets_used')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  return (data as { tickets_used: number } | null)?.tickets_used ?? 0
}

export async function consumeGameTicket(
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const weekStart = getWeekStart()

  const { error } = await supabase.rpc('increment_game_ticket', {
    p_user_id: userId,
    p_week_start: weekStart,
  })

  if (error) return { error: error.message }
  return { error: null }
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setUTCDate(diff)
  return monday.toISOString().slice(0, 10)
}
