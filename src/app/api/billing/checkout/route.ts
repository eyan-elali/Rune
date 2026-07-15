import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { PRICE_IDS } from '@/lib/stripe/config'
import type { BillingPeriod, PaidTier } from '@/lib/stripe/config'
import { getOrCreateStripeCustomerId } from '@/lib/actions/billing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

const VALID_TIERS = new Set<string>(['scribe'])
const VALID_PERIODS = new Set<string>(['monthly', 'annual'])

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const plan = searchParams.get('plan') ?? ''
  const billing = searchParams.get('billing') ?? 'monthly'
  const referralId = searchParams.get('promotekit_referral') ?? ''

  if (!VALID_TIERS.has(plan) || !VALID_PERIODS.has(billing)) {
    return NextResponse.redirect(new URL('/settings', APP_URL))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const next = encodeURIComponent(`/api/billing/checkout?plan=${plan}&billing=${billing}`)
    return NextResponse.redirect(new URL(`/login?next=${next}`, APP_URL))
  }

  const { customerId, error: customerError } = await getOrCreateStripeCustomerId(supabase, user)
  if (customerError || !customerId) {
    return NextResponse.redirect(new URL('/settings', APP_URL))
  }

  const priceId = PRICE_IDS[plan as PaidTier][billing as BillingPeriod]

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings?upgraded=true`,
    cancel_url: `${APP_URL}/settings`,
    metadata: {
      supabase_user_id: user.id,
      tier: plan,
      promotekit_referral: referralId || '',
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        tier: plan,
        promotekit_referral: referralId || '',
      },
    },
    allow_promotion_codes: true,
  })

  if (!session.url) {
    return NextResponse.redirect(new URL('/settings', APP_URL))
  }

  return NextResponse.redirect(session.url)
}
