'use client'

import { useTransition } from 'react'
import { createCheckoutSession } from '@/lib/actions/billing'

export function GameModeGate() {
  const [isPending, startTransition] = useTransition()

  function handleUpgrade() {
    startTransition(async () => {
      const { url, error } = await createCheckoutSession('arcane', 'monthly', 'usd')
      if (url && !error) window.location.href = url
    })
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-xl px-8 py-20 text-center"
      style={{
        background: 'rgba(201,168,76,0.03)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl blur-3xl"
        style={{ background: 'var(--color-gold)', opacity: 0.03 }}
        aria-hidden
      />

      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
        style={{
          background: 'rgba(201,168,76,0.08)',
          border: '1px solid var(--color-border-strong)',
        }}
        aria-hidden
      >
        ⚔
      </div>

      <p
        className="mb-2 font-rune-serif text-2xl"
        style={{ color: 'var(--color-parchment)' }}
      >
        Game Mode is an Arcane feature
      </p>
      <p
        className="mb-8 max-w-sm text-sm leading-relaxed"
        style={{ color: 'var(--color-mist)' }}
      >
        Unlock unlimited games, Battle Mode, and early multiplayer access.
        Words are your weapons — upgrade to wield them.
      </p>

      <button
        onClick={handleUpgrade}
        disabled={isPending}
        className="rounded-lg px-8 py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
        style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
      >
        {isPending ? 'Loading…' : 'Upgrade to Arcane'}
      </button>
    </div>
  )
}
