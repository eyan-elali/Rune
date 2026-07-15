import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/client'
import { PRICE_IDS } from '@/lib/stripe/config'
import { recordAnalyticsEvent } from '@/lib/actions/analytics'
import type Stripe from 'stripe'

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isFoundingPriceId(priceId: string): boolean {
  return !!process.env.STRIPE_FOUNDING_MONTHLY_PRICE_ID && priceId === process.env.STRIPE_FOUNDING_MONTHLY_PRICE_ID
}

function tierFromPriceId(priceId: string): string {
  // The founding price is deliberately kept out of PRICE_IDS (see
  // src/lib/actions/pricing.ts) so it can never be selected by a client-
  // supplied tier/plan. It must still resolve to 'scribe' here, otherwise a
  // founding subscriber's `customer.subscription.updated` event (which
  // Stripe fires for many non-plan-change reasons) would silently downgrade
  // them to 'free'.
  if (isFoundingPriceId(priceId)) return 'scribe'
  for (const [tier, periods] of Object.entries(PRICE_IDS)) {
    if ((Object.values(periods) as string[]).includes(priceId)) return tier
  }
  return 'free'
}

async function upsertSubscriptionEvent(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await supabase.from('subscription_events').insert({
    user_id: userId,
    event_type: eventType,
    payload,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      if (!userId) break

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id

      if (!subscriptionId) break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const firstItem = subscription.items.data[0]
      const priceId = firstItem?.price.id ?? ''
      const isFounding = isFoundingPriceId(priceId)
      const tier =
        session.metadata?.tier ?? tierFromPriceId(priceId) ?? 'scribe'
      const periodEnd = firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null

      await supabase.from('profiles').update({
        subscription_tier: tier,
        subscription_status: 'active',
        subscription_price_id: priceId,
        subscription_period_end: periodEnd,
      }).eq('id', userId)

      await upsertSubscriptionEvent(supabase, userId, event.type, {
        session_id: session.id,
        subscription_id: subscriptionId,
        tier,
        price_id: priceId,
      })

      if (isFounding) {
        // pricing_cohort is never written here — it stays legacy_15k, set
        // once at migration time and otherwise immutable.
        await supabase.from('user_pricing_entitlements').update({
          founder_offer_status: 'claimed',
          founder_offer_claimed_at: new Date().toISOString(),
        }).eq('user_id', userId).is('founder_offer_claimed_at', null)

        await supabase.from('user_pricing_entitlements').update({
          pricing_notice_resolved_at: new Date().toISOString(),
        }).eq('user_id', userId).is('pricing_notice_resolved_at', null)
      }

      // Dedupe on the Stripe event id so a webhook retry (Stripe redelivers
      // on any non-2xx response) can never double-record this analytics
      // event, even though upsertSubscriptionEvent above has no such guard.
      await recordAnalyticsEvent({
        userId,
        eventName: 'subscription_started',
        metadata: isFounding ? { plan: 'founding_monthly' } : undefined,
        dedupeKey: event.id,
      }).catch(() => {
        // Analytics must never fail webhook processing.
      })
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.supabase_user_id
      if (!userId) break

      const firstItem = subscription.items.data[0]
      const priceId = firstItem?.price.id ?? ''
      const tier = tierFromPriceId(priceId)
      const periodEnd = firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null

      await supabase.from('profiles').update({
        subscription_tier: tier,
        subscription_status: subscription.status,
        subscription_period_end: periodEnd,
      }).eq('id', userId)

      await upsertSubscriptionEvent(supabase, userId, event.type, {
        subscription_id: subscription.id,
        tier,
        status: subscription.status,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.supabase_user_id
      if (!userId) break

      await supabase.from('profiles').update({
        subscription_tier: 'free',
        subscription_status: 'canceled',
      }).eq('id', userId)

      await upsertSubscriptionEvent(supabase, userId, event.type, {
        subscription_id: subscription.id,
      })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id

      if (!customerId) break

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (!profile) break

      await supabase.from('profiles').update({
        subscription_status: 'past_due',
      }).eq('id', profile.id)

      await upsertSubscriptionEvent(supabase, profile.id as string, event.type, {
        invoice_id: invoice.id,
        customer_id: customerId,
      })
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
