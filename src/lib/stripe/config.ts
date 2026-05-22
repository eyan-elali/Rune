export const PRICE_IDS = {
  scribe: {
    monthly: {
      usd: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_USD!,
      cad: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_MONTHLY_CAD!,
    },
    annual: {
      usd: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_USD!,
      cad: process.env.NEXT_PUBLIC_STRIPE_SCRIBE_ANNUAL_CAD!,
    },
  },
  arcane: {
    monthly: {
      usd: process.env.NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_USD!,
      cad: process.env.NEXT_PUBLIC_STRIPE_ARCANE_MONTHLY_CAD!,
    },
    annual: {
      usd: process.env.NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_USD!,
      cad: process.env.NEXT_PUBLIC_STRIPE_ARCANE_ANNUAL_CAD!,
    },
  },
} as const

export type PaidTier = 'scribe' | 'arcane'
export type BillingPeriod = 'monthly' | 'annual'
export type Currency = 'usd' | 'cad'
