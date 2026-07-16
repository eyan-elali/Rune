'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  createCheckoutSession,
  createPortalSession,
  changeScribeBillingInterval,
} from '@/lib/actions/billing'
import type { SubscriptionTier } from '@/lib/subscription'
import {
  billingIntervalMatchesSelection,
  type ActiveBillingInterval,
} from '@/lib/pricing'

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
  /**
   * The cadence the signed-in user's Scribe subscription actually bills on,
   * derived server-side from subscription_price_id (resolveActiveScribeBilling
   * in src/lib/pricing.ts). Drives which toggle position shows "Current
   * Plan" vs. a "Change to ..." action — never inferred from the toggle
   * itself, client state, or founder_offer_status.
   */
  activeBillingInterval?: ActiveBillingInterval
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
      style={{ background: 'color-mix(in srgb, var(--color-gold) 8%, transparent)', border: '1px solid var(--color-border-strong)' }}
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

// ─── Founding-plan forfeiture confirmation ────────────────────────────────────
// Only ever shown for the one path that actually forfeits an irreversible
// price: a Founding Scribe subscriber changing to annual. Never shown for
// ordinary standard monthly/annual subscribers.

function LeaveFoundingPlanDialog({
  isPending,
  onConfirm,
  onCancel,
}: {
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-founding-plan-heading"
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(10, 8, 6, 0.88)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg px-8 py-8 text-center"
        style={{
          background: 'var(--color-sepia)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="leave-founding-plan-heading"
          className="font-rune-serif text-xl"
          style={{ color: 'var(--text-primary)' }}
        >
          Leave your founding plan?
        </h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-mist)' }}>
          Changing plans will end your $6.99/month founding price. It cannot be restored later.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
            style={{ background: 'var(--color-gold)', color: 'var(--text-on-accent)' }}
          >
            {isPending ? 'Updating…' : 'Change to annual'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            Keep founding plan
          </button>
        </div>
      </div>
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
  activeBillingInterval,
}: {
  tier: SubscriptionTier
  currentTier: SubscriptionTier
  isLoggedIn: boolean
  billingPeriod: 'monthly' | 'annual'
  isFeatured: boolean
  activeBillingInterval: ActiveBillingInterval
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)

  const sameTier = tier === currentTier
  // For the Scribe card specifically, "current plan" also requires the
  // toggle to match the interval the user is actually billed on — a
  // founding subscriber only ever matches the monthly position, since
  // there's no founding annual price. Free has no interval concept, so
  // sameTier alone is enough there (unchanged from before).
  const isCurrentPlan =
    sameTier &&
    (tier !== 'scribe' || billingIntervalMatchesSelection(activeBillingInterval, billingPeriod))

  const isLeavingFoundingPlan = activeBillingInterval === 'founding_monthly'

  function runIntervalChange() {
    setChangeError(null)
    startTransition(async () => {
      const res = await changeScribeBillingInterval(billingPeriod)
      if (res?.error) {
        setChangeError(res.error)
        return
      }
      setShowForfeitConfirm(false)
      router.refresh()
    })
  }

  function handleIntervalChange() {
    if (isPending) return
    if (isLeavingFoundingPlan) {
      setShowForfeitConfirm(true)
      return
    }
    runIntervalChange()
  }

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
    // Transparent background shows the card behind it — on the featured
    // card that's a var(--color-gold) fill, so border/text need
    // --text-on-accent there instead of --color-gold (which can be a dark
    // charcoal in some themes and would disappear against its own fill).
    const currentPlanColor = isFeatured ? 'var(--text-on-accent)' : 'var(--color-gold)'
    return (
      <button
        disabled
        className="w-full rounded-lg px-5 py-2.5 text-sm font-medium"
        style={{
          background: 'transparent',
          border: `1px solid ${currentPlanColor}`,
          color: currentPlanColor,
          opacity: 0.7,
          cursor: 'default',
        }}
        aria-label={`Current plan: ${tier}`}
      >
        Current Plan
      </button>
    )
  }

  if (sameTier && tier === 'scribe') {
    // Same tier, but the toggle is previewing the interval the user isn't
    // currently billed on — an explicit, interval-specific plan change.
    // Never routed through Checkout (would risk a second subscription) or
    // the Portal (plan-switching support there isn't verifiable from this
    // repo — see changeScribeBillingInterval in src/lib/actions/billing.ts).
    const label = billingPeriod === 'annual' ? 'Change to annual' : 'Change to monthly'
    return (
      <>
        <button
          onClick={handleIntervalChange}
          disabled={isPending}
          className="w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
          style={{
            background: isFeatured ? 'var(--color-ink)' : 'var(--color-gold)',
            color: isFeatured ? 'var(--color-parchment)' : 'var(--text-on-accent)',
          }}
        >
          {isPending ? 'Updating…' : label}
        </button>
        <p
          className="mt-2 text-center text-[11px]"
          style={{
            color: isFeatured
              ? 'color-mix(in srgb, var(--text-on-accent) 60%, transparent)'
              : 'var(--text-muted)',
          }}
        >
          Applies immediately — billing is prorated automatically.
        </p>
        {changeError && (
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--color-crimson)' }}>
            {changeError}
          </p>
        )}
        {showForfeitConfirm && (
          <LeaveFoundingPlanDialog
            isPending={isPending}
            onConfirm={runIntervalChange}
            onCancel={() => setShowForfeitConfirm(false)}
          />
        )}
      </>
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
        // --color-ink is always dark, but --color-gold is sometimes a dark
        // charcoal itself (Manuscript) — gold-on-ink there was nearly
        // invisible, and plain ink-on-gold had the same problem in
        // reverse. --color-parchment is reliably light in every theme, and
        // --text-on-accent is calibrated per theme for the gold fill.
        color: isFeatured ? 'var(--color-parchment)' : 'var(--text-on-accent)',
      }}
    >
      {isPending ? 'Loading…' : label}
    </button>
  )
}

// ─── Tier card ────────────────────────────────────────────────────────────────

function tierTextColors(isFeatured: boolean) {
  if (isFeatured) {
    // The featured card fills its whole background with var(--color-gold),
    // and that resolves to a different lightness in every theme (e.g. a dark
    // charcoal in Manuscript, a bright amber in Gilded Age). Use
    // --text-on-accent — already calibrated per theme for legibility on top
    // of --color-gold — instead of assuming dark ink always works.
    return {
      heading: 'var(--text-on-accent)',
      tagline: 'color-mix(in srgb, var(--text-on-accent) 60%, transparent)',
      price: 'var(--text-on-accent)',
      priceSuffix: 'color-mix(in srgb, var(--text-on-accent) 55%, transparent)',
      annualNote: 'color-mix(in srgb, var(--text-on-accent) 50%, transparent)',
      featureIncluded: 'color-mix(in srgb, var(--text-on-accent) 80%, transparent)',
      featureExcluded: 'color-mix(in srgb, var(--text-on-accent) 35%, transparent)',
      featureMark: 'var(--text-on-accent)',
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
  activeBillingInterval,
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
  activeBillingInterval: ActiveBillingInterval
}) {
  const isCurrentPlan = tier === currentTier
  // A signed-in Scribe subscriber's real price (e.g. a Founding Scribe's
  // $6.99) only applies while the toggle is actually previewing the interval
  // they're billed on — otherwise the toggle is being used to preview the
  // *other* interval's standard price, which must always be able to move.
  const isPreviewingActiveInterval =
    isCurrentPlan &&
    (tier !== 'scribe' || billingIntervalMatchesSelection(activeBillingInterval, billingPeriod))
  const effectivePrice =
    isPreviewingActiveInterval && currentPriceOverride != null
      ? currentPriceOverride
      : price
      ? billingPeriod === 'monthly'
        ? price.monthly
        : price.annualPerMonth
      : 0
  const showAnnualNote =
    billingPeriod === 'annual' && price && !(isPreviewingActiveInterval && currentPriceOverride != null)
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
        boxShadow: isFeatured ? '0 8px 48px color-mix(in srgb, var(--color-gold) 22%, transparent)' : undefined,
      }}
    >
      {billingPeriod === 'annual' && tier !== 'free' && (
        <div
          className="absolute -top-3 right-5 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            background: isFeatured ? 'var(--color-ink)' : 'color-mix(in srgb, var(--color-gold) 15%, transparent)',
            border: `1px solid ${isFeatured ? 'transparent' : 'color-mix(in srgb, var(--color-gold) 30%, transparent)'}`,
            // On the featured card this badge sits on --color-ink (always
            // dark), so it needs light text — --color-gold itself is
            // sometimes a dark charcoal/near-black and would vanish there.
            color: isFeatured ? 'var(--color-parchment)' : 'var(--color-gold)',
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
        activeBillingInterval={activeBillingInterval}
      />
    </div>
  )
}

// ─── PricingTable ─────────────────────────────────────────────────────────────

function initialToggleForInterval(interval: ActiveBillingInterval): 'monthly' | 'annual' {
  // A founding subscriber is billed monthly, so both null (no subscription)
  // and 'founding_monthly' land on the monthly position — only a real
  // standard-annual subscriber should open on Annual.
  return interval === 'annual' ? 'annual' : 'monthly'
}

export function PricingTable({
  currentTier = 'free',
  isLoggedIn = false,
  freeWordLimit = DEFAULT_PUBLIC_FREE_WORD_LIMIT,
  currentScribePrice = null,
  activeBillingInterval = null,
}: PricingTableProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>(() =>
    initialToggleForInterval(activeBillingInterval)
  )

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
            activeBillingInterval={activeBillingInterval}
          />
        ))}
      </div>
    </div>
  )
}
