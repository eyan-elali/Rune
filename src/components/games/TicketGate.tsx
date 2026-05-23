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

export function TicketGate({ children, onTicketConsumed }: TicketGateProps) {
  const profile = useProfileStore((s) => s.profile)
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier)

  const [ticketsUsed, setTicketsUsed] = useState<number | null>(null)
  const [ticketConsumed, setTicketConsumed] = useState(false)
  const [upgradePending, startUpgradeTransition] = useTransition()

  const allowed = getGameTicketsAllowed(subscriptionTier)
  const isGated = ticketsUsed !== null && ticketsUsed >= allowed && !ticketConsumed

  useEffect(() => {
    if (!profile?.id) return
    if (allowed === Infinity) {
      setTicketsUsed(0)
      return
    }
    getWeeklyTicketUsage(profile.id).then(setTicketsUsed)
  }, [profile?.id, allowed])

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
      const { url, error } = await createCheckoutSession('arcane', 'monthly')
      if (url && !error) window.location.href = url
    })
  }

  // Still loading
  if (ticketsUsed === null) {
    return (
      <div className="flex min-h-full items-center justify-center py-24">
        <span style={{ color: 'var(--color-mist)' }}>Loading&hellip;</span>
      </div>
    )
  }

  // Gated — used weekly ticket
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
          You&rsquo;ve used your weekly ticket
        </p>
        <p
          className="mb-8 max-w-sm text-sm leading-relaxed"
          style={{ color: 'var(--color-mist)' }}
        >
          Free includes 1 game per week; Scribe includes 3. Your tickets reset
          every Monday. Upgrade to Arcane for unlimited games.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={handleUpgrade}
            disabled={upgradePending}
            className="rounded-lg px-8 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
            style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
          >
            {upgradePending ? 'Loading…' : 'Upgrade to Arcane'}
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
  // After arcane users or first click of the week, render the children
  if (!ticketConsumed && allowed !== Infinity) {
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
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier)
  const isScribe = subscriptionTier === 'scribe'

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
        {ticketsUsed === 0 ? 'Use your weekly ticket?' : 'Game ticket available'}
      </p>
      <p
        className="mb-2 text-sm leading-relaxed"
        style={{ color: 'var(--color-mist)' }}
      >
        {isScribe
          ? 'Scribe includes 3 game tickets per week.'
          : 'Free includes 1 game ticket per week.'}
        {' '}Ticket resets every Monday.
      </p>
      <p
        className="mb-8 text-xs"
        style={{ color: 'var(--color-mist)', opacity: 0.5 }}
      >
        Upgrade to Arcane for unlimited games.
      </p>

      <button
        onClick={onPlay}
        className="rounded-lg px-10 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
        style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
      >
        Use ticket &amp; play
      </button>
    </div>
  )
}
