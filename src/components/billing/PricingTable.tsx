'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createCheckoutSession, createPortalSession } from '@/lib/actions/billing'
import type { SubscriptionTier } from '@/lib/subscription'

// ─── Prices ──────────────────────────────────────────────────────────────────

const PRICES = {
  scribe: { monthly: { usd: 6, cad: 8 }, annual: { usd: 5, cad: 7 } },
  arcane: { monthly: { usd: 12, cad: 16 }, annual: { usd: 10, cad: 13 } },
}

// ─── Feature list per tier ────────────────────────────────────────────────────

const TIER_FEATURES = {
  free: [
    { label: '1 project', included: true },
    { label: '20,000 word limit', included: true },
    { label: 'Basic editor', included: true },
    { label: 'Focus Mode', included: true },
    { label: '1 game ticket / week', included: true },
    { label: 'Goals & streaks', included: false },
    { label: 'Export pages & manuscripts', included: false },
    { label: 'Game Mode', included: false },
  ],
  scribe: [
    { label: 'Everything in Free', included: true },
    { label: 'Unlimited projects & words', included: true },
    { label: 'Goals & streaks', included: true },
    { label: 'Writing heatmap & stats', included: true },
    { label: 'Export pages & manuscripts (PDF)', included: true },
    { label: 'More unlockables', included: true },
    { label: '1 game ticket / week', included: true },
    { label: 'Game Mode (unlimited)', included: false },
  ],
  arcane: [
    { label: 'Everything in Scribe', included: true },
    { label: 'Full Game Mode (unlimited)', included: true },
    { label: 'Battle Mode enemies', included: true },
    { label: '1v1 multiplayer (coming soon)', included: true },
    { label: 'All unlockables', included: true },
    { label: 'Priority support', included: true },
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricingTableProps {
  currentTier?: SubscriptionTier
  isLoggedIn?: boolean
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
  currency,
  isFeatured,
}: {
  tier: SubscriptionTier
  currentTier: SubscriptionTier
  isLoggedIn: boolean
  billingPeriod: 'monthly' | 'annual'
  currency: 'usd' | 'cad'
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
        const res = await createCheckoutSession(
          tier as 'scribe' | 'arcane',
          billingPeriod,
          currency
        )
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

  // Downgrade — user is on a paid plan and this is a lower tier
  const tierOrder: SubscriptionTier[] = ['free', 'scribe', 'arcane']
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

function TierCard({
  tier,
  name,
  tagline,
  price,
  features,
  billingPeriod,
  currency,
  currentTier,
  isLoggedIn,
  isFeatured,
}: {
  tier: SubscriptionTier
  name: string
  tagline: string
  price: { monthly: { usd: number; cad: number }; annual: { usd: number; cad: number } } | null
  features: { label: string; included: boolean }[]
  billingPeriod: 'monthly' | 'annual'
  currency: 'usd' | 'cad'
  currentTier: SubscriptionTier
  isLoggedIn: boolean
  isFeatured: boolean
}) {
  const effectivePrice = price ? price[billingPeriod][currency] : 0
  const monthlyEquiv = price ? price.annual[currency] : 0
  const currSymbol = currency === 'usd' ? '$' : 'CA$'

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl p-7 transition-all duration-300',
        isFeatured && 'shadow-2xl'
      )}
      style={{
        background: isFeatured
          ? 'var(--color-gold)'
          : tier === 'arcane'
          ? 'var(--color-ink)'
          : 'transparent',
        border: isFeatured
          ? 'none'
          : tier === 'arcane'
          ? '1px solid rgba(201,168,76,0.42)'
          : '1px solid var(--color-border)',
        boxShadow: tier === 'arcane'
          ? '0 0 0 1px rgba(201,168,76,0.07), inset 0 1px 0 rgba(201,168,76,0.11), 0 6px 48px rgba(201,168,76,0.06)'
          : isFeatured
          ? '0 8px 48px rgba(201,168,76,0.22)'
          : undefined,
      }}
    >
      {/* Arcane bloom */}
      {tier === 'arcane' && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl blur-2xl"
          style={{ background: 'var(--color-gold)', opacity: 0.06, zIndex: -1 }}
          aria-hidden
        />
      )}

      {/* Annual badge */}
      {billingPeriod === 'annual' && tier !== 'free' && (
        <div
          className="absolute -top-3 right-5 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            background: isFeatured ? 'var(--color-ink)' : 'rgba(201,168,76,0.15)',
            border: `1px solid ${isFeatured ? 'transparent' : 'rgba(201,168,76,0.3)'}`,
            color: isFeatured ? 'var(--color-gold)' : 'var(--color-gold)',
          }}
        >
          2 months free
        </div>
      )}

      {/* Header */}
      <p
        className="mb-1 font-rune-serif text-xl"
        style={{ color: isFeatured ? 'var(--color-ink)' : 'var(--color-parchment)' }}
      >
        {name}
      </p>
      <p
        className="mb-6 text-xs"
        style={{ color: isFeatured ? 'rgba(26,22,20,0.6)' : 'var(--color-mist)' }}
      >
        {tagline}
      </p>

      {/* Price */}
      <div className="mb-2 flex items-baseline gap-0.5">
        <span
          className="font-rune-serif text-4xl"
          style={{ color: isFeatured ? 'var(--color-ink)' : 'var(--color-parchment)' }}
        >
          {price ? `${currSymbol}${effectivePrice}` : '$0'}
        </span>
        {price && (
          <span
            className="text-sm"
            style={{ color: isFeatured ? 'rgba(26,22,20,0.55)' : 'var(--color-mist)' }}
          >
            /mo
          </span>
        )}
      </div>

      {billingPeriod === 'annual' && price && (
        <p
          className="mb-6 text-xs"
          style={{ color: isFeatured ? 'rgba(26,22,20,0.5)' : 'var(--color-mist)', opacity: 0.7 }}
        >
          {currSymbol}{monthlyEquiv}/mo · billed annually
        </p>
      )}
      {!(billingPeriod === 'annual' && price) && <div className="mb-6" />}

      {/* Features */}
      <ul className="mb-8 flex-1 space-y-2.5">
        {features.map((f) => (
          <li
            key={f.label}
            className="flex items-start gap-2 text-sm"
            style={{
              color: f.included
                ? isFeatured
                  ? 'rgba(26,22,20,0.8)'
                  : 'var(--color-mist)'
                : isFeatured
                ? 'rgba(26,22,20,0.35)'
                : 'rgba(107,101,96,0.35)',
            }}
          >
            <span
              className="mt-px shrink-0 text-xs"
              style={{
                color: f.included
                  ? isFeatured
                    ? 'var(--color-ink)'
                    : 'var(--color-gold)'
                  : 'transparent',
              }}
              aria-hidden
            >
              {f.included ? '✦' : '—'}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <CtaButton
        tier={tier}
        currentTier={currentTier}
        isLoggedIn={isLoggedIn}
        billingPeriod={billingPeriod}
        currency={currency}
        isFeatured={isFeatured}
      />
    </div>
  )
}

// ─── PricingTable ─────────────────────────────────────────────────────────────

export function PricingTable({ currentTier = 'free', isLoggedIn = false }: PricingTableProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [currency, setCurrency] = useState<'usd' | 'cad'>('usd')

  const tiers: {
    id: SubscriptionTier
    name: string
    tagline: string
    price: { monthly: { usd: number; cad: number }; annual: { usd: number; cad: number } } | null
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
    {
      id: 'arcane',
      name: 'Arcane',
      tagline: 'For the devoted.',
      price: PRICES.arcane,
      featured: false,
    },
  ]

  return (
    <div>
      {/* Toggles */}
      <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
        <PillToggle
          label="Billing period"
          value={billingPeriod}
          onChange={setBillingPeriod}
          options={[
            { label: 'Monthly', value: 'monthly' },
            { label: 'Annual', value: 'annual' },
          ]}
        />
        <PillToggle
          label="Currency"
          value={currency}
          onChange={setCurrency}
          options={[
            { label: 'USD', value: 'usd' },
            { label: 'CAD', value: 'cad' },
          ]}
        />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-end">
        {tiers.map((t) => (
          <TierCard
            key={t.id}
            tier={t.id}
            name={t.name}
            tagline={t.tagline}
            price={t.price}
            features={TIER_FEATURES[t.id]}
            billingPeriod={billingPeriod}
            currency={currency}
            currentTier={currentTier}
            isLoggedIn={isLoggedIn}
            isFeatured={t.featured}
          />
        ))}
      </div>
    </div>
  )
}
