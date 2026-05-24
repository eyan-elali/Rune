export const PRICE_IDS = {
  scribe: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_USD!,
    annual: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_USD!,
  },
} as const

export type PaidTier = 'scribe'
export type BillingPeriod = 'monthly' | 'annual'
