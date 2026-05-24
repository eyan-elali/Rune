'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { PRICE_IDS } from '@/lib/stripe/config'
import type { PaidTier, BillingPeriod } from '@/lib/stripe/config'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function createCheckoutSession(
  tier: PaidTier,
  billingPeriod: BillingPeriod
): Promise<{ url: string | null; error: string | null }> {
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

  let customerId = profile?.stripe_customer_id as string | null

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

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
    },
    subscription_data: {
      metadata: { supabase_user_id: user.id, tier },
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
