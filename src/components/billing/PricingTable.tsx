'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createCheckoutSession, createPortalSession } from '@/lib/actions/billing'
import type { SubscriptionTier } from '@/lib/subscription'

// ─── Prices (USD) ─────────────────────────────────────────────────────────────

const PRICES = {
  scribe: { monthly: 9.99, annualPerMonth: 8, annualTotal: 96 },
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

// ─── Feature list per tier ────────────────────────────────────────────────────
// Default free-word limit for public/logged-out contexts (new-user offer).
// A signed-in user's actual allowance (2,000 starter or 15,000 grandfathered
// legacy) is passed in via the freeWordLimit prop — see resolveFreeWordLimit
// in src/lib/pricing.ts, the single source of truth for these numbers.
const DEFAULT_PUBLIC_FREE_WORD_LIMIT = 2000

function getFreeFeatures(freeWordLimit: number) {
  return [
    { label: '1 manuscript', included: true },
    { label: `Up to ${freeWordLimit.toLocaleString()} words`, included: true },
    { label: 'All writing tools', included: true },
    { label: 'Goals & Progress', included: true },
    { label: 'Notes', included: true },
    { label: 'Profile & Stats', included: true },
    { label: 'Export', included: true },
    { label: 'Focus Mode', included: true },
    { label: '1 Arena ticket / week', included: true },
  ]
}

const SCRIBE_FEATURES = [
  { label: 'Everything in Free', included: true },
  { label: 'Unlimited manuscripts', included: true },
  { label: 'Unlimited words', included: true },
  { label: 'Unlimited Arena access', included: true },
  { label: 'All unlockables', included: true },
]

function featureLabelNeedsNowrap(label: string): boolean {
  return /Arena ticket|Arena access/i.test(label)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricingTableProps {
  currentTier?: SubscriptionTier
  isLoggedIn?: boolean
  /** Signed-in user's actual free-tier allowance; defaults to the public new-user offer. */
  freeWordLimit?: number
  /**
   * The price the signed-in user is actually currently paying for Scribe
   * (e.g. 6.99 for a Founding Scribe subscriber), if different from the
   * standard price. Only affects the "Current Plan" display — never the
   * public/logged-out pricing shown to everyone else. Derived server-side
   * from trusted subscription_price_id data, never from a historical flag.
   */
  currentScribePrice?: number | null
}

type TierPrice = { monthly: number; annualPerMonth: number; annualTotal: number } | null

function getPromotekitReferral(): string {
  if (typeof window === 'undefined') return ''
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral
  return typeof referral === 'string' ? referral : ''
}

// ─── Pill toggle ──────────────────────────────────────────────────────────────

function PillToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label={label}
      style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--color-border-strong)' }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
          style={{
            background: value === opt.value ? 'var(--color-gold)' : 'transparent',
            color: value === opt.value ? 'var(--color-ink)' : 'var(--color-mist)',
          }}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── CTA Button ───────────────────────────────────────────────────────────────

function CtaButton({
  tier,
  currentTier,
  isLoggedIn,
  billingPeriod,
  isFeatured,
}: {
  tier: SubscriptionTier
  currentTier: SubscriptionTier
  isLoggedIn: boolean
  billingPeriod: 'monthly' | 'annual'
  isFeatured: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const isCurrentPlan = tier === currentTier

  function handleUpgrade() {
    if (tier === 'free') {
      router.push('/signup')
      return
    }
    startTransition(async () => {
      try {
        const referralId = getPromotekitReferral()
        const res = await createCheckoutSession('scribe', billingPeriod, referralId)
        if (res?.url) {
          window.location.href = res.url
        } else if (res?.error) {
          console.error("Stripe Session Error:", res.error)
          alert(`Billing Error: ${res.error}`)
        }
      } catch (err) {
        console.error("Failed to reach billing server:", err)
        alert("Server is updating, please try again in a moment.")
      }
    })
  }

  function handleManage() {
    startTransition(async () => {
      try {
        const res = await createPortalSession()
        if (res?.url) {
          window.location.href = res.url
        } else if (res?.error) {
          console.error("Portal Session Error:", res.error)
        }
      } catch (err) {
        console.error("Failed to reach billing portal:", err)
      }
    })
  }

  if (isCurrentPlan) {
    return (
      <button
        disabled
        className="w-full rounded-lg px-5 py-2.5 text-sm font-medium"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-gold)',
          color: 'var(--color-gold)',
          opacity: 0.7,
          cursor: 'default',
        }}
        aria-label={`Current plan: ${tier}`}
      >
        Current Plan
      </button>
    )
  }

  const tierOrder: SubscriptionTier[] = ['free', 'scribe']
  const isDowngrade =
    isLoggedIn &&
    tierOrder.indexOf(tier) < tierOrder.indexOf(currentTier)

  if (isDowngrade) {
    return (
      <button
        onClick={handleManage}
        disabled={isPending}
        className="w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-mist)',
        }}
      >
        {isPending ? 'Loading…' : 'Manage Plan'}
      </button>
    )
  }

  const label =
    tier === 'free'
      ? 'Get Started'
      : !isLoggedIn
      ? 'Get Started'
      : 'Upgrade'

  return (
    <button
      onClick={handleUpgrade}
      disabled={isPending}
      className="w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
      style={{
        background: isFeatured ? 'var(--color-ink)' : 'var(--color-gold)',
        color: isFeatured ? 'var(--color-gold)' : 'var(--color-ink)',
      }}
    >
      {isPending ? 'Loading…' : label}
    </button>
  )
}

// ─── Tier card ────────────────────────────────────────────────────────────────

function tierTextColors(isFeatured: boolean) {
  if (isFeatured) {
    return {
      heading: 'var(--color-ink)',
      tagline: 'rgba(26,22,20,0.6)',
      price: 'var(--color-ink)',
      priceSuffix: 'rgba(26,22,20,0.55)',
      annualNote: 'rgba(26,22,20,0.5)',
      featureIncluded: 'rgba(26,22,20,0.8)',
      featureExcluded: 'rgba(26,22,20,0.35)',
      featureMark: 'var(--color-ink)',
    }
  }
  return {
    heading: 'var(--text-primary)',
    tagline: 'var(--text-muted)',
    price: 'var(--text-primary)',
    priceSuffix: 'var(--text-muted)',
    annualNote: 'var(--text-muted)',
    featureIncluded: 'var(--text-primary)',
    featureExcluded: 'var(--text-muted)',
    featureMark: 'var(--color-gold)',
  }
}

function TierCard({
  tier,
  name,
  tagline,
  price,
  features,
  billingPeriod,
  currentTier,
  isLoggedIn,
  isFeatured,
  currentPriceOverride,
}: {
  tier: SubscriptionTier
  name: string
  tagline: string
  price: TierPrice
  features: { label: string; included: boolean }[]
  billingPeriod: 'monthly' | 'annual'
  currentTier: SubscriptionTier
  isLoggedIn: boolean
  isFeatured: boolean
  currentPriceOverride?: number | null
}) {
  const isCurrentPlan = tier === currentTier
  // A signed-in user's own current plan always reflects what they're actually
  // paying (e.g. a Founding Scribe subscriber's $6.99), never the standard
  // rate — the billing-period toggle doesn't apply to "what you already pay".
  const effectivePrice =
    isCurrentPlan && currentPriceOverride != null
      ? currentPriceOverride
      : price
      ? billingPeriod === 'monthly'
        ? price.monthly
        : price.annualPerMonth
      : 0
  const showAnnualNote = billingPeriod === 'annual' && price && !(isCurrentPlan && currentPriceOverride != null)
  const colors = tierTextColors(isFeatured)
  const isFree = tier === 'free'

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl px-5 py-8 transition-all duration-300',
        isFeatured && 'shadow-2xl'
      )}
      style={{
        background: isFeatured ? 'var(--color-gold)' : 'var(--surface-card)',
        border: isFeatured ? 'none' : '1px solid var(--color-border)',
        boxShadow: isFeatured ? '0 8px 48px rgba(201,168,76,0.22)' : undefined,
      }}
    >
      {billingPeriod === 'annual' && tier !== 'free' && (
        <div
          className="absolute -top-3 right-5 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            background: isFeatured ? 'var(--color-ink)' : 'rgba(201,168,76,0.15)',
            border: `1px solid ${isFeatured ? 'transparent' : 'rgba(201,168,76,0.3)'}`,
            color: 'var(--color-gold)',
          }}
        >
          20% off
        </div>
      )}

      <p
        className="mb-1 font-rune-serif text-xl"
        style={{ color: colors.heading }}
      >
        {name}
      </p>
      <p
        className="mb-6 text-xs"
        style={{ color: colors.tagline }}
      >
        {tagline}
      </p>

      <div className="mb-2 flex items-baseline gap-0.5">
        <span
          className="font-rune-serif text-4xl"
          style={{ color: colors.price }}
        >
          {price ? formatUsd(effectivePrice) : '$0'}
        </span>
        {price && (
          <span
            className="text-sm"
            style={{ color: colors.priceSuffix }}
          >
            /mo
          </span>
        )}
      </div>

      {showAnnualNote && (
        <p
          className="mb-6 text-xs"
          style={{ color: colors.annualNote, opacity: isFeatured ? 1 : 0.7 }}
        >
          Billed annually at {formatUsd((price as NonNullable<TierPrice>).annualTotal)}/yr
        </p>
      )}
      {!showAnnualNote && <div className="mb-6" />}

      <ul className="mb-8 flex-1 space-y-2.5">
        {features.map((f) => (
          <li
            key={f.label}
            className="flex items-start gap-2 text-sm"
            style={{
              color: f.included ? colors.featureIncluded : colors.featureExcluded,
              opacity: f.included ? 1 : isFree ? 0.55 : 1,
            }}
          >
            <span
              className="mt-px shrink-0 text-xs"
              style={{
                color: f.included ? colors.featureMark : 'transparent',
              }}
              aria-hidden
            >
              {f.included ? '✦' : '—'}
            </span>
            <span className={featureLabelNeedsNowrap(f.label) ? 'whitespace-nowrap' : undefined}>
              {f.label}
            </span>
          </li>
        ))}
      </ul>

      <CtaButton
        tier={tier}
        currentTier={currentTier}
        isLoggedIn={isLoggedIn}
        billingPeriod={billingPeriod}
        isFeatured={isFeatured}
      />
    </div>
  )
}

// ─── PricingTable ─────────────────────────────────────────────────────────────

export function PricingTable({
  currentTier = 'free',
  isLoggedIn = false,
  freeWordLimit = DEFAULT_PUBLIC_FREE_WORD_LIMIT,
  currentScribePrice = null,
}: PricingTableProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')

  const tiers: {
    id: SubscriptionTier
    name: string
    tagline: string
    price: TierPrice
    featured: boolean
  }[] = [
    {
      id: 'free',
      name: 'Free',
      tagline: 'Start your practice.',
      price: null,
      featured: false,
    },
    {
      id: 'scribe',
      name: 'Scribe',
      tagline: 'For writers who show up.',
      price: PRICES.scribe,
      featured: true,
    },
  ]

  const featuresByTier: Record<SubscriptionTier, { label: string; included: boolean }[]> = {
    free: getFreeFeatures(freeWordLimit),
    scribe: SCRIBE_FEATURES,
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
        <PillToggle
          label="Billing period"
          value={billingPeriod}
          onChange={setBillingPeriod}
          options={[
            { label: 'Monthly', value: 'monthly' },
            { label: 'Annual (Save 20%)', value: 'annual' },
          ]}
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
        {tiers.map((t) => (
          <TierCard
            key={t.id}
            tier={t.id}
            name={t.name}
            tagline={t.tagline}
            price={t.price}
            features={featuresByTier[t.id]}
            billingPeriod={billingPeriod}
            currentTier={currentTier}
            isLoggedIn={isLoggedIn}
            isFeatured={t.featured}
            currentPriceOverride={t.id === 'scribe' ? currentScribePrice : null}
          />
        ))}
      </div>
    </div>
  )
}
