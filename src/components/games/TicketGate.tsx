'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useProfileStore } from '@/store/profileStore'
import { getWeeklyTicketUsage, consumeGameTicket } from '@/lib/actions/billing'
import { createCheckoutSession } from '@/lib/actions/billing'
import { getGameTicketsAllowed } from '@/lib/subscription'

interface TicketGateProps {
  children: React.ReactNode
  onTicketConsumed: () => void
}

function getPromotekitReferral(): string {
  if (typeof window === 'undefined') return ''
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral
  return typeof referral === 'string' ? referral : ''
}

export function TicketGate({ children, onTicketConsumed }: TicketGateProps) {
  const profile = useProfileStore((s) => s.profile)
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier)

  const [ticketsUsed, setTicketsUsed] = useState<number | null>(null)
  const [ticketConsumed, setTicketConsumed] = useState(false)
  const [upgradePending, startUpgradeTransition] = useTransition()

  const allowed = getGameTicketsAllowed(subscriptionTier)
  const isUnlimited = allowed === Infinity
  const isGated =
    !isUnlimited &&
    ticketsUsed !== null &&
    ticketsUsed >= allowed &&
    !ticketConsumed

  useEffect(() => {
    if (isUnlimited) {
      onTicketConsumed()
    }
  }, [isUnlimited, onTicketConsumed])

  useEffect(() => {
    if (!profile?.id || isUnlimited) return
    getWeeklyTicketUsage(profile.id).then(setTicketsUsed)
  }, [profile?.id, isUnlimited])

  function handleConsumeAndPlay() {
    if (!profile?.id) return
    consumeGameTicket(profile.id).then(({ error }) => {
      if (!error) {
        setTicketConsumed(true)
        onTicketConsumed()
      }
    })
  }

  function handleUpgrade() {
    startUpgradeTransition(async () => {
      const referralId = getPromotekitReferral()
      const { url, error } = await createCheckoutSession('scribe', 'monthly', referralId)
      if (url && !error) window.location.href = url
    })
  }

  if (isUnlimited) {
    return <>{children}</>
  }

  // Still loading
  if (ticketsUsed === null) {
    return (
      <div className="flex min-h-full items-center justify-center py-24">
        <span style={{ color: 'var(--color-mist)' }}>Loading&hellip;</span>
      </div>
    )
  }

  // Gated — used weekly ticket (Free tier)
  if (isGated) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-8 py-20 text-center">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
          style={{
            background: 'rgba(139,46,46,0.08)',
            border: '1px solid rgba(139,46,46,0.25)',
          }}
          aria-hidden
        >
          🎟
        </div>

        <p
          className="mb-2 font-rune-serif text-2xl"
          style={{ color: 'var(--color-parchment)' }}
        >
          You&rsquo;ve used your weekly Arena entry
        </p>
        <p
          className="mb-8 max-w-sm text-sm leading-relaxed"
          style={{ color: 'var(--color-mist)' }}
        >
          Free includes one Arena entry per week; your access resets every Monday.
          Upgrade to Scribe for unlimited battles and races.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={handleUpgrade}
            disabled={upgradePending}
            className="rounded-lg px-8 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
            style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
          >
            {upgradePending ? 'Loading…' : 'Upgrade to Scribe'}
          </button>
          <Link href="/games">
            <button
              className="rounded-lg px-8 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-strong)',
                color: 'var(--color-mist)',
              }}
            >
              Return to Hub
            </button>
          </Link>
        </div>
      </div>
    )
  }

  // Not yet consumed this session — show gate "play now" state
  if (!ticketConsumed) {
    return (
      <TicketPrompt onPlay={handleConsumeAndPlay} ticketsUsed={ticketsUsed} />
    )
  }

  return <>{children}</>
}

function TicketPrompt({
  onPlay,
  ticketsUsed,
}: {
  onPlay: () => void
  ticketsUsed: number
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-20 text-center">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
        style={{
          background: 'rgba(201,168,76,0.08)',
          border: '1px solid var(--color-border-strong)',
        }}
        aria-hidden
      >
        🎟
      </div>

      <p
        className="mb-2 font-rune-serif text-2xl"
        style={{ color: 'var(--color-parchment)' }}
      >
        {ticketsUsed === 0 ? 'Use your weekly Arena entry?' : 'Arena entry available'}
      </p>
      <p
        className="mb-8 text-sm leading-relaxed"
        style={{ color: 'var(--color-mist)' }}
      >
        Free includes one Arena entry per week. Entries reset every Monday.
      </p>

      <button
        onClick={onPlay}
        className="rounded-lg px-10 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
        style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
      >
        Enter the Arena
      </button>
    </div>
  )
}
