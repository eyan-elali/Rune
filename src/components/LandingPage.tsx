"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Users,
  Compass,
  Crown,
} from 'lucide-react'

const HERO_THEMES = {
  candlelight: {
    bgEditor:     '#ede8db',
    headerBg:     '#1a1614',
    headerText:   'rgba(245, 240, 232, 0.42)',
    textMuted:    '#7a6f63',
    textBody:     '#2c2218',
    gold:         '#c9a84c',
    border:       'rgba(201, 168, 76, 0.18)',
    borderStrong: 'rgba(201, 168, 76, 0.38)',
    name:         'Candlelight',
  },
  obsidian: {
    bgEditor:     '#d0dde8',
    headerBg:     '#060608',
    headerText:   'rgba(208, 221, 232, 0.42)',
    textMuted:    '#6a7888',
    textBody:     '#1c2a38',
    gold:         '#6eb0d4',
    border:       'rgba(110, 176, 212, 0.2)',
    borderStrong: 'rgba(110, 176, 212, 0.38)',
    name:         'Obsidian',
  },
  absinthe: {
    bgEditor:     '#e4ebe0',
    headerBg:     '#081210',
    headerText:   'rgba(228, 235, 224, 0.42)',
    textMuted:    '#576b54',
    textBody:     '#1a2c18',
    gold:         '#6a9e68',
    border:       'rgba(106, 158, 104, 0.22)',
    borderStrong: 'rgba(106, 158, 104, 0.42)',
    name:         'Absinthe',
  },
} as const

type HeroThemeKey = keyof typeof HERO_THEMES

function SectionDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1.5rem' }}>
      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
      <span style={{ margin: '0 16px', color: 'var(--color-gold)', fontSize: '12px', opacity: 0.6 }}>✦</span>
      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
    </div>
  )
}

const HEATMAP_FILLED = [
  true,  false, true,  true,  false,
  true,  true,  false, true,  true,
  false, true,  true,  true,  false,
  true,  false, true,  false, true,
  true,  true,  true,  false, true,
  false, true,  false, true,  true,
  true,  false, true,  true,  false,
]

const SERIF = "Georgia, 'Times New Roman', serif"
const SANS  = 'system-ui, -apple-system, sans-serif'

export default function LandingPage() {
  const [activeHeroTheme, setActiveHeroTheme] = useState<HeroThemeKey>('candlelight')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [priceVisible, setPriceVisible] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<'workspace' | 'focus'>('workspace')

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-font')
  }, [])

  const heroTheme = HERO_THEMES[activeHeroTheme]

  function handleBilling(plan: 'monthly' | 'annual') {
    setPriceVisible(false)
    setTimeout(() => { setBilling(plan); setPriceVisible(true) }, 200)
  }

  return (
    <div className="relative">

      {/* Layer 2 — continuous gold lines over section backgrounds */}
      <div
        className="absolute inset-0 z-10 pointer-events-none overflow-hidden select-none"
        aria-hidden={true}
      >
        <svg className="w-full h-full min-h-[4500px]" viewBox="0 0 1440 4500" preserveAspectRatio="none" fill="none">
          {/* PATH 1: Left Margin Accent (Thick Frame) */}
          <path
            d="M 80 0 C 180 900, 40 1800, 140 2700 C 220 3400, 60 3900, 70 4500"
            stroke="var(--color-gold)"
            strokeWidth="10.0"
            opacity="0.04"
          />
          {/* PATH 2: Right Margin Accent (Thick Frame) */}
          <path
            d="M 1360 0 C 1260 900, 1400 1800, 1300 2700 C 1220 3400, 1380 3900, 1370 4500"
            stroke="var(--color-gold)"
            strokeWidth="10.0"
            opacity="0.04"
          />
          {/* PATH 3: Symmetrical Center-Left (Criss-Cross Path) */}
          <path
            d="M 520 0 C 680 900, 880 1800, 720 2700 C 560 3400, 420 3900, 480 4500"
            stroke="var(--color-gold)"
            strokeWidth="4.0"
            opacity="0.06"
          />
          {/* PATH 4: Symmetrical Center-Right (Criss-Cross Mirror) */}
          <path
            d="M 920 0 C 760 900, 560 1800, 720 2700 C 880 3400, 1020 3900, 960 4500"
            stroke="var(--color-gold)"
            strokeWidth="4.0"
            opacity="0.06"
          />
        </svg>
      </div>

      {/* Layer 3 — fixed header (above lines and content) */}
      <header
          className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]"
          style={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            style={{
              fontFamily: SERIF,
              fontSize: '18px',
              letterSpacing: '0.12em',
              color: 'var(--color-gold)',
              userSelect: 'none',
            }}
          >
            ✦ RUNE
          </span>

          <Link
            href="/login"
            className="landing-header-cta"
            style={{
              border: '1px solid var(--color-border-strong)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '13px',
              letterSpacing: '0.04em',
              padding: '8px 18px',
              borderRadius: '4px',
              transition: 'background 0.15s ease',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Enter Workspace →
          </Link>
        </header>

        {/* spacer so content clears the fixed header */}
        <div style={{ height: '56px' }} aria-hidden />

        <SectionDivider />

        {/* ── SCREEN 1: HERO ───────────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            height: 'calc(100vh - 56px)',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Left — wordmark, headline, paragraph, CTA */}
          <div
            className="relative z-20"
            style={{
              width: '44%',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 3rem 3rem 5rem',
            }}
          >
            {/* Rune logo */}
            <div
              style={{
                fontFamily: SERIF,
                fontSize: '12px',
                letterSpacing: '0.26em',
                color: 'var(--color-gold)',
                marginBottom: '2.75rem',
                opacity: 0.85,
              }}
            >
              ✦ RUNE
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily: SERIF,
                fontSize: 'clamp(2.8rem, 4.3vw, 4.7rem)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
                marginBottom: '1.5rem',
              }}
            >
              The Writing Workspace Built for Novelists
            </h1>

            {/* Supporting paragraph */}
            <p
              style={{
                fontFamily: SANS,
                fontSize: '16px',
                color: 'var(--color-ink)',
                opacity: 0.65,
                lineHeight: 1.8,
                marginBottom: '2.5rem',
                maxWidth: '360px',
              }}
            >
              Organize your novel into chapters, build momentum every day, and write inside a workspace designed to help you finish your manuscript.
            </p>

            {/* Primary CTA */}
            <Link
              href="/signup"
              className="gold-btn"
              style={{
                display: 'inline-block',
                alignSelf: 'flex-start',
                background: 'var(--color-gold)',
                color: '#1e1a16',
                fontFamily: SERIF,
                fontSize: '13px',
                letterSpacing: '0.1em',
                fontWeight: 600,
                padding: '13px 26px',
                borderRadius: '4px',
                border: 'none',
                textDecoration: 'none',
                transition: 'background 0.15s ease',
              }}
            >
              Start Your Manuscript — Free
            </Link>
          </div>

          {/* Right — writing experience preview */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '2rem 3.5rem 2rem 0.5rem',
            }}
          >
            {/* Editor frame — application window with minimal chrome */}
            <div
              className="relative z-20"
              style={{
                height: 'min(500px, 64vh)',
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${heroTheme.borderStrong}`,
                boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
                background: heroTheme.bgEditor,
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 0.4s ease, background 0.4s ease, box-shadow 0.4s ease',
              }}
            >
              {/* App chrome bar — matches real Candlelight header: dark bg, gold wordmark, mode toggle */}
              <div
                style={{
                  background: heroTheme.headerBg,
                  borderBottom: `1px solid ${heroTheme.border}`,
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                  transition: 'background 0.4s ease, border-color 0.4s ease',
                }}
              >
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: '11px',
                    letterSpacing: '0.18em',
                    color: heroTheme.gold,
                    transition: 'color 0.4s ease',
                  }}
                >
                  ✦ Rune
                </span>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: '11px',
                    color: heroTheme.headerText,
                    letterSpacing: '0.02em',
                    transition: 'color 0.4s ease',
                  }}
                >
                  That Manuscript
                </span>
                {/* Static Focus/Game pill — matches real ModeToggle: rounded-full, p-[3px], sliding gold indicator */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '9999px',
                    padding: '3px',
                    border: `1px solid ${heroTheme.borderStrong}`,
                    pointerEvents: 'none',
                    transition: 'border-color 0.4s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 10,
                      borderRadius: '9999px',
                      padding: '3px 10px',
                      fontFamily: SANS,
                      fontSize: '10px',
                      color: heroTheme.headerText,
                      background: 'transparent',
                      transition: 'color 0.4s ease',
                    }}
                  >
                    Focus
                  </span>
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 10,
                      borderRadius: '9999px',
                      padding: '3px 10px',
                      fontFamily: SANS,
                      fontSize: '10px',
                      color: heroTheme.headerText,
                      background: 'transparent',
                      transition: 'color 0.4s ease',
                    }}
                  >
                    Game
                  </span>
                </div>
              </div>

              {/* Writing surface */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '2.25rem 3.5rem 2.5rem',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {/* Chapter label */}
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '9px',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: heroTheme.textMuted,
                    marginBottom: '1.5rem',
                    opacity: 0.55,
                    transition: 'color 0.4s ease',
                  }}
                >
                  CHAPTER I — THE ARRIVAL
                </div>

                {/* Prose — Rune-centered excerpt */}
                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  I couldn&apos;t focus.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  My eyes drifted across another blank document. Every sentence felt heavier than the last. Every excuse came faster than the words.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    fontStyle: 'italic',
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  &ldquo;You&apos;re writing a novel,&rdquo; I reminded myself.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  Then something changed.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  The blank page stopped feeling like an obstacle.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    marginBottom: '1.1rem',
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  It became a battlefield.
                </p>

                <p
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13.5px',
                    lineHeight: 1.9,
                    color: heroTheme.textBody,
                    textIndent: '2rem',
                    transition: 'color 0.4s ease',
                  }}
                >
                  I opened{' '}
                  <span
                    style={{
                      color: heroTheme.gold,
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                      transition: 'color 0.4s ease',
                    }}
                  >
                    RUNE
                  </span>.{' '}
                  <span
                    className="landing-cursor"
                    style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '15px',
                      background: heroTheme.gold,
                      verticalAlign: 'middle',
                      marginLeft: '1px',
                      transition: 'background 0.4s ease',
                    }}
                  />
                </p>

                {/* Word count pill — matches real RuneEditor pill: rounded-full, gold border, no icon */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '14px',
                    right: '18px',
                  }}
                  aria-hidden="true"
                >
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.82)',
                      border: `1px solid ${heroTheme.borderStrong}`,
                      borderRadius: '9999px',
                      padding: '5px 12px',
                      fontSize: '10px',
                      fontFamily: SANS,
                      color: heroTheme.textBody,
                      display: 'inline-flex',
                      alignItems: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      letterSpacing: '-0.01em',
                      transition: 'all 0.4s ease',
                    }}
                  >
                    49{' '}<span style={{ marginLeft: '4px', opacity: 0.75 }}>words</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Theme pills — only interaction in the Hero */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                paddingTop: '10px',
                flexShrink: 0,
              }}
            >
              {(Object.keys(HERO_THEMES) as HeroThemeKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveHeroTheme(key)}
                  aria-label={`Switch to ${HERO_THEMES[key].name} theme`}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${activeHeroTheme === key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    color: activeHeroTheme === key ? 'var(--color-gold)' : 'var(--text-muted)',
                    fontFamily: SANS,
                    fontSize: '11px',
                    letterSpacing: '0.07em',
                    padding: '5px 16px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s ease, color 0.2s ease',
                  }}
                >
                  {HERO_THEMES[key].name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SCREEN 2: THE PROBLEM ──────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-secondary)]"
          style={{
            width: '100%',
            minHeight: 'calc(100vh - 56px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="relative z-20" style={{ width: '100%', maxWidth: '1100px', margin: '0 auto' }}>

            {/* Eyebrow */}
            <div
              style={{
                fontFamily: SANS,
                fontSize: '10px',
                letterSpacing: '0.26em',
                color: 'var(--color-gold)',
                textAlign: 'center',
                marginBottom: '2.25rem',
                opacity: 0.7,
              }}
            >
              THE PROBLEM
            </div>

            {/* Headline */}
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: 'clamp(2.2rem, 4vw, 3.6rem)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                textAlign: 'center',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
                marginBottom: '2rem',
              }}
            >
              Novels outgrow blank documents.
            </h2>

            {/* Supporting paragraph */}
            <p
              style={{
                fontFamily: SANS,
                fontSize: '16px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.85,
                maxWidth: '600px',
                margin: '0 auto 4.5rem',
              }}
            >
              A novel starts as a page. Then it becomes chapters, scenes, revisions, goals, and loose ideas. Document editors were built to hold words—not entire manuscripts.
            </p>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4.5rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              <span style={{ margin: '0 16px', color: 'var(--color-gold)', fontSize: '12px', opacity: 0.45 }}>✦</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
            </div>

            {/* Three problem columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                maxWidth: '900px',
                margin: '0 auto',
              }}
            >
              {/* I — Structure disappears */}
              <div style={{ padding: '0 3rem 0 0', borderRight: '1px solid var(--color-border)' }}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '11px',
                    letterSpacing: '0.2em',
                    color: 'var(--color-gold)',
                    marginBottom: '1.25rem',
                    opacity: 0.55,
                  }}
                >
                  I.
                </div>
                <h3
                  style={{
                    fontFamily: SERIF,
                    fontSize: '19px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '0.85rem',
                    lineHeight: 1.3,
                  }}
                >
                  Your structure disappears
                </h3>
                <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  Your manuscript becomes one long scroll. You stop navigating chapters and start hunting for them. The shape of your novel lives in your memory, not your workspace.
                </p>
              </div>

              {/* II — Momentum fades */}
              <div style={{ padding: '0 3rem', borderRight: '1px solid var(--color-border)' }}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '11px',
                    letterSpacing: '0.2em',
                    color: 'var(--color-gold)',
                    marginBottom: '1.25rem',
                    opacity: 0.55,
                  }}
                >
                  II.
                </div>
                <h3
                  style={{
                    fontFamily: SERIF,
                    fontSize: '19px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '0.85rem',
                    lineHeight: 1.3,
                  }}
                >
                  Your momentum fades
                </h3>
                <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  The document doesn&apos;t know your story. It doesn&apos;t know where you left off or what comes next. The cursor blinks until something else wins.
                </p>
              </div>

              {/* III — Progress gets blurry */}
              <div style={{ padding: '0 0 0 3rem' }}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '11px',
                    letterSpacing: '0.2em',
                    color: 'var(--color-gold)',
                    marginBottom: '1.25rem',
                    opacity: 0.55,
                  }}
                >
                  III.
                </div>
                <h3
                  style={{
                    fontFamily: SERIF,
                    fontSize: '19px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '0.85rem',
                    lineHeight: 1.3,
                  }}
                >
                  Your progress blurs
                </h3>
                <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  You write for weeks and still feel lost. Word counts, goals, and revisions scatter across tabs and files. The manuscript is happening—somewhere.
                </p>
              </div>
            </div>

            {/* Bottom divider */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '4.5rem 0 3.5rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              <span style={{ margin: '0 16px', color: 'var(--color-gold)', fontSize: '12px', opacity: 0.45 }}>✦</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
            </div>

            {/* Closing line */}
            <p
              style={{
                fontFamily: SERIF,
                fontStyle: 'italic',
                fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
                color: 'var(--text-primary)',
                textAlign: 'center',
                opacity: 0.75,
              }}
            >
              Rune begins where the blank document stops being enough.
            </p>

          </div>
        </section>

        <SectionDivider />

        {/* ── SCREEN 3: THE WORKSPACE REVEAL ───────────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            width: '100%',
            minHeight: 'calc(100vh - 56px)',
            padding: '6rem 3rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="relative z-20" style={{ maxWidth: '1220px', margin: '0 auto', width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr',
                gap: '5rem',
                alignItems: 'center',
              }}
            >

              {/* ── Left: Copy ── */}
              <div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '10px',
                    letterSpacing: '0.26em',
                    color: 'var(--color-gold)',
                    marginBottom: '2rem',
                    opacity: 0.7,
                  }}
                >
                  THE WORKSPACE
                </div>

                <h2
                  style={{
                    fontFamily: SERIF,
                    fontSize: 'clamp(2rem, 3vw, 2.8rem)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    lineHeight: 1.18,
                    letterSpacing: '-0.01em',
                    marginBottom: '1.5rem',
                  }}
                >
                  Your novel deserves more than one endless document.
                </h2>

                <p
                  style={{
                    fontFamily: SANS,
                    fontSize: '16px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.8,
                    marginBottom: '2.5rem',
                    maxWidth: '380px',
                  }}
                >
                  Rune organizes every manuscript into projects, chapters, and pages—so you always know where you are, what comes next, and how far you&apos;ve come.
                </p>

                <div style={{ height: '1px', background: 'var(--color-border)', marginBottom: '2.5rem', maxWidth: '380px' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {[
                    {
                      title: 'Projects',
                      body: 'Keep every manuscript separate and organized.',
                    },
                    {
                      title: 'Chapters & Pages',
                      body: 'Navigate your story the way novels are actually written.',
                    },
                    {
                      title: 'Offline & Automatic Saving',
                      body: 'Write anywhere. Every word is protected and synchronized when you&apos;re back online.',
                    },
                  ].map(({ title, body }) => (
                    <div key={title}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.4rem' }}>
                        <span style={{ color: 'var(--color-gold)', fontSize: '11px', flexShrink: 0 }}>✦</span>
                        <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {title}
                        </h3>
                      </div>
                      <p
                        style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.75, paddingLeft: '21px' }}
                        dangerouslySetInnerHTML={{ __html: body }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Right: Workspace Mockup ── */}
              <div>
                {/* App window frame */}
                <div
                  style={{
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid var(--color-border-strong)',
                    boxShadow: '0 28px 80px rgba(0,0,0,0.14), 0 4px 20px rgba(0,0,0,0.07)',
                    height: '468px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-primary)',
                  }}
                >
                  {/* Window chrome */}
                  <div
                    style={{
                      height: '28px',
                      background: 'var(--bg-sidebar)',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      gap: '6px',
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57', opacity: 0.75 }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#febc2e', opacity: 0.75 }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c840', opacity: 0.75 }} />
                  </div>

                  {/* App layout */}
                  <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                    {/* ── Sidebar ── */}
                    <div
                      style={{
                        width: workspaceView === 'focus' ? '0px' : '132px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        transition: 'width 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: 'var(--bg-sidebar)',
                        borderRight: '1px solid var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      aria-hidden
                    >
                      {/* Wordmark row */}
                      <div
                        style={{
                          padding: '14px 14px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: SERIF,
                            fontSize: '13px',
                            letterSpacing: '0.2em',
                            color: 'var(--color-gold)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Rune
                        </span>
                      </div>
                      <div style={{ height: '1px', background: 'var(--color-border)', margin: '0 8px', flexShrink: 0 }} />

                      {/* User identity */}
                      <div style={{ padding: '10px 12px 0', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            border: '1px solid var(--color-border-strong)',
                            background: 'rgba(184, 146, 42, 0.18)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontFamily: SANS, fontSize: '10px', color: 'var(--text-primary)', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Eleanor V.
                        </span>
                      </div>
                      {/* XP bar strip */}
                      <div style={{ height: '2px', background: 'rgba(184, 146, 42, 0.1)', margin: '8px 0 6px', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: '62%', background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))' }} />
                      </div>

                      {/* Nav links */}
                      <nav style={{ flex: 1, padding: '4px 6px', overflow: 'hidden' }}>
                        {[
                          { label: 'Dashboard', active: false },
                          { label: 'Projects', active: true },
                          { label: 'Profile & Stats', active: false },
                          { label: 'Arena', active: false, muted: true },
                        ].map(({ label, active, muted }) => (
                          <div
                            key={label}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '0 4px 4px 0',
                              marginBottom: '1px',
                              borderLeft: `2px solid ${active ? 'var(--color-gold)' : 'transparent'}`,
                              background: active ? 'rgba(184, 146, 42, 0.1)' : 'transparent',
                              fontFamily: SANS,
                              fontSize: '10px',
                              color: active ? 'var(--color-gold)' : 'var(--text-primary)',
                              opacity: muted ? 0.35 : active ? 1 : 0.62,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            {label}
                          </div>
                        ))}
                      </nav>

                      {/* Bottom nav */}
                      <div style={{ padding: '6px 6px 8px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
                        <div style={{ padding: '6px 8px', fontFamily: SANS, fontSize: '10px', color: 'var(--text-primary)', opacity: 0.38, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          Settings
                        </div>
                      </div>
                    </div>

                    {/* ── Main column ── */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

                      {/* Header row */}
                      <div
                        style={{
                          height: '36px',
                          background: 'var(--bg-primary)',
                          borderBottom: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 14px',
                          flexShrink: 0,
                          opacity: workspaceView === 'focus' ? 0 : 1,
                          transition: 'opacity 0.4s ease',
                        }}
                        aria-hidden
                      >
                        {/* Breadcrumb */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: SANS, fontSize: '9.5px', color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span>Projects</span>
                          <span style={{ opacity: 0.4, margin: '0 1px' }}>›</span>
                          <span style={{ color: 'var(--text-primary)', opacity: 0.75 }}>The Midnight Thesis</span>
                          <span style={{ opacity: 0.4, margin: '0 1px' }}>›</span>
                          <span style={{ color: 'var(--text-primary)' }}>Chapter I</span>
                        </div>
                        {/* Focus/Game toggle */}
                        <div
                          style={{
                            display: 'flex',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: '9999px',
                            padding: '2px',
                            flexShrink: 0,
                          }}
                        >
                          {['Focus', 'Game'].map((m) => (
                            <span
                              key={m}
                              style={{
                                fontFamily: SANS,
                                fontSize: '8px',
                                padding: '2px 7px',
                                borderRadius: '9999px',
                                color: 'var(--text-primary)',
                                opacity: 0.5,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Content row: page list + editor */}
                      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                        {/* ── Page list ── */}
                        <div
                          style={{
                            width: workspaceView === 'focus' ? '0px' : '122px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            transition: 'width 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                            background: 'var(--bg-sidebar)',
                            borderRight: '1px solid var(--color-border)',
                          }}
                          aria-hidden
                        >
                          <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--color-border)' }}>
                            <span style={{ fontFamily: SANS, fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-mist)', opacity: 0.65, whiteSpace: 'nowrap' }}>
                              Pages
                            </span>
                          </div>

                          {/* Chapter I */}
                          <div style={{ padding: '8px 8px 4px' }}>
                            <div style={{ fontFamily: SANS, fontSize: '9px', color: 'var(--color-gold)', opacity: 0.85, marginBottom: '4px', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 2px' }}>
                              Chapter I
                            </div>
                            {[
                              { label: 'The Arrival', active: true },
                              { label: 'The Study', active: false },
                              { label: 'First Contact', active: false },
                            ].map(({ label, active }) => (
                              <div
                                key={label}
                                style={{
                                  padding: '5px 7px',
                                  borderRadius: '0 3px 3px 0',
                                  fontFamily: SANS,
                                  fontSize: '9.5px',
                                  color: active ? 'var(--color-gold)' : 'var(--text-primary)',
                                  opacity: active ? 1 : 0.52,
                                  background: active ? 'rgba(184, 146, 42, 0.1)' : 'transparent',
                                  borderLeft: `2px solid ${active ? 'var(--color-gold)' : 'transparent'}`,
                                  marginBottom: '1px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {label}
                              </div>
                            ))}
                          </div>

                          {/* Chapter II */}
                          <div style={{ padding: '4px 8px 4px' }}>
                            <div style={{ fontFamily: SANS, fontSize: '9px', color: 'var(--text-muted)', opacity: 0.5, marginBottom: '4px', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 2px' }}>
                              Chapter II
                            </div>
                            {['The Letter', 'The Garden', 'Midnight'].map((pg) => (
                              <div
                                key={pg}
                                style={{
                                  padding: '5px 7px',
                                  borderRadius: '0 3px 3px 0',
                                  fontFamily: SANS,
                                  fontSize: '9.5px',
                                  color: 'var(--text-primary)',
                                  opacity: 0.38,
                                  marginBottom: '1px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {pg}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── Editor surface ── */}
                        <div
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                            background: 'var(--surface-editor)',
                            position: 'relative',
                          }}
                        >
                          {/* Focus vignette overlay */}
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'radial-gradient(ellipse at 50% 48%, transparent 38%, rgba(26, 22, 20, 0.22) 100%)',
                              pointerEvents: 'none',
                              zIndex: 2,
                              opacity: workspaceView === 'focus' ? 1 : 0,
                              transition: 'opacity 0.55s ease',
                            }}
                            aria-hidden
                          />

                          {/* Editor content */}
                          <div
                            style={{
                              padding: workspaceView === 'focus' ? '30px 44px 20px' : '18px 24px 18px',
                              transition: 'padding 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                              position: 'relative',
                              zIndex: 1,
                            }}
                          >
                            <div
                              style={{
                                fontFamily: SERIF,
                                fontSize: '7px',
                                letterSpacing: '0.22em',
                                textTransform: 'uppercase',
                                color: 'var(--color-mist)',
                                marginBottom: '14px',
                                opacity: 0.45,
                              }}
                            >
                              CHAPTER I — THE ARRIVAL
                            </div>

                            <p style={{ fontFamily: SERIF, fontSize: '11px', lineHeight: 1.9, color: 'var(--color-ink)', marginBottom: '10px' }}>
                              The library was already dark by the time she arrived.
                            </p>
                            <p style={{ fontFamily: SERIF, fontSize: '11px', lineHeight: 1.9, color: 'var(--color-ink)', marginBottom: '10px', textIndent: '18px' }}>
                              She had taken the long road deliberately — through the courtyard rather than the stone passage — because on nights like this she needed the cold air to remind her she was still moving forward.
                            </p>
                            <p style={{ fontFamily: SERIF, fontSize: '11px', lineHeight: 1.9, color: 'var(--color-ink)', marginBottom: '10px', textIndent: '18px', fontStyle: 'italic' }}>
                              &ldquo;You&apos;re late,&rdquo; said the archivist, not looking up.
                            </p>
                            <p style={{ fontFamily: SERIF, fontSize: '11px', lineHeight: 1.9, color: 'var(--color-ink)', textIndent: '18px' }}>
                              She sat down at the long oak table and opened the manuscript.{' '}
                              <span
                                className="landing-cursor"
                                style={{
                                  display: 'inline-block',
                                  width: '1.5px',
                                  height: '11px',
                                  background: 'var(--color-gold)',
                                  verticalAlign: 'middle',
                                  marginLeft: '1px',
                                }}
                              />
                            </p>
                          </div>

                          {/* Word count pill */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '10px',
                              right: '12px',
                              background: 'rgba(255,255,255,0.92)',
                              border: '1px solid var(--color-border-strong)',
                              borderRadius: '9999px',
                              padding: '3px 10px',
                              fontSize: '8.5px',
                              fontFamily: SANS,
                              color: 'var(--color-ink)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                              zIndex: 3,
                            }}
                            aria-hidden
                          >
                            312 <span style={{ opacity: 0.65 }}>words</span>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Mode toggle tabs ── */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '14px',
                  }}
                >
                  {(['workspace', 'focus'] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setWorkspaceView(view)}
                      aria-pressed={workspaceView === view}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${workspaceView === view ? 'var(--color-gold)' : 'var(--color-border)'}`,
                        color: workspaceView === view ? 'var(--color-gold)' : 'var(--text-muted)',
                        fontFamily: SANS,
                        fontSize: '11px',
                        letterSpacing: '0.07em',
                        padding: '5px 20px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s ease, color 0.2s ease',
                      }}
                    >
                      {view === 'workspace' ? 'Workspace' : 'Focus Mode'}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 4: THE ARENA ─────────────────────────────────────── */}
        <section className="bg-[var(--bg-primary)]" style={{ width: '100%', padding: '7rem 1.5rem' }}>
          <div className="relative z-20">
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textAlign: 'center',
              marginBottom: '1rem',
            }}
          >
            The Arena — Why Gamify Execution?
          </h2>

          <p
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
              color: 'var(--color-gold)',
              textAlign: 'center',
              maxWidth: '640px',
              margin: '1rem auto 3.5rem',
            }}
          >
            &ldquo;The blank page is an enemy. Defeat it with raw volume.&rdquo;
          </p>

          <p
            style={{
              fontFamily: SANS,
              fontSize: '16px',
              color: 'var(--text-muted)',
              lineHeight: 1.75,
              maxWidth: '620px',
              margin: '0 auto 4rem',
              textAlign: 'center',
            }}
          >
            Most writers stall because their internal editor fires before the first draft is done. They rewrite sentence two before sentence three exists. The Arena eliminates this. Under pressure and HP stakes, the analytical brain goes quiet. Raw creative output is all that remains.
          </p>

          {/* Two-column split */}
          <div
            className="arena-grid"
            style={{ display: 'flex', flexDirection: 'row', gap: '2rem', maxWidth: '960px', margin: '0 auto' }}
          >
            {/* Battle Mode */}
            <div className="relative z-20 bg-[var(--surface-card)]" style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '10px',
                  fontFamily: SANS,
                  letterSpacing: '0.12em',
                  color: 'var(--color-crimson)',
                  border: '1px solid rgba(139, 46, 46, 0.4)',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  marginBottom: '1.25rem',
                }}
              >
                BATTLE MODE
              </span>
              <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                Fight the Blank Page
              </h3>
              <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '1.5rem' }}>
                An enemy with an HP bar faces you across the canvas. Every word you write deals damage. Every second you stop typing, you take damage instead. No pausing to edit. No second-guessing a sentence. The only way through is through.
              </p>

              {/* HP bar mockup */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '8px', fontFamily: SANS, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    THE BLANK PAGE
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--color-border)' }}>
                    <div style={{ width: '45%', height: '100%', background: 'linear-gradient(90deg, #6b1a1a, #8b2e2e)', borderRadius: '4px' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '8px', fontFamily: SANS, letterSpacing: '0.08em', color: 'var(--color-gold)', marginBottom: '4px' }}>
                    YOU
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--color-border)' }}>
                    <div style={{ width: '78%', height: '100%', background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))', borderRadius: '4px' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Race Mode */}
            <div className="relative z-20 bg-[var(--surface-card)]" style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '10px',
                  fontFamily: SANS,
                  letterSpacing: '0.12em',
                  color: 'var(--color-gold)',
                  border: '1px solid var(--color-border-strong)',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  marginBottom: '1.25rem',
                }}
              >
                RACE MODE
              </span>
              <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                Race the Clock
              </h3>
              <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '1.5rem' }}>
                Choose your duration: 5, 10, 15, or 30 minutes. Write as many words as you can before time expires. Your personal record is always visible. Every session is a chance to beat it. Consistency compounds.
              </p>

              {/* Timer mockup */}
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '36px',
                    fontWeight: 700,
                    color: 'var(--color-gold)',
                    letterSpacing: '0.05em',
                    lineHeight: 1,
                    marginBottom: '12px',
                  }}
                >
                  12:47
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--color-border)', marginBottom: '8px' }}>
                  <div style={{ width: '57%', height: '100%', background: 'var(--color-gold)', borderRadius: '2px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontFamily: SANS, color: 'var(--text-primary)', fontWeight: 600 }}>843 words</span>
                  <span style={{ fontSize: '12px', fontFamily: SANS, color: 'var(--text-muted)' }}>Personal best: 1,204</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 5: COMING SOON ───────────────────────────────────── */}
        <section className="bg-[var(--bg-secondary)]" style={{ width: '100%', padding: '6rem 1.5rem' }}>
          <div className="relative z-20">
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            What&apos;s Coming to Rune
          </h2>
          <p
            style={{
              fontFamily: SANS,
              fontSize: '15px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginBottom: '3.5rem',
            }}
          >
            Rune is being built in the open. These features are in active development.
          </p>

          <div
            className="coming-soon-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1.5rem',
              maxWidth: '700px',
              margin: '0 auto',
            }}
          >
            {/* Card 1 — 1v1 Live Races */}
            <div
              className="relative z-20 bg-[var(--surface-card)]"
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '1.75rem',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(201, 168, 76, 0.1)',
                  border: '1px solid var(--color-border-strong)',
                  color: 'var(--color-gold)',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  fontFamily: SANS,
                }}
              >
                COMING SOON
              </span>

              <Users size={24} className="text-[var(--color-gold)] opacity-70 mb-4" aria-hidden />

              <h3
                style={{
                  fontFamily: SERIF,
                  fontSize: '17px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem',
                }}
              >
                1v1 Live Races
              </h3>
              <p
                style={{
                  fontFamily: SANS,
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.65,
                }}
              >
                Challenge another writer to a real-time word count race. Same duration, same stakes. See who breaks first. Leaderboards, match history, and ranked seasons are all in scope.
              </p>
            </div>

            {/* Card 2 — Plotting & Story Architecture */}
            <div
              className="relative z-20 bg-[var(--surface-card)]"
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '1.75rem',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(201, 168, 76, 0.1)',
                  border: '1px solid var(--color-border-strong)',
                  color: 'var(--color-gold)',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  fontFamily: SANS,
                }}
              >
                COMING SOON
              </span>

              <Compass size={24} className="text-[var(--color-gold)] opacity-70 mb-4" aria-hidden />

              <h3
                style={{
                  fontFamily: SERIF,
                  fontSize: '17px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem',
                }}
              >
                Plotting &amp; Story Architecture
              </h3>
              <p
                style={{
                  fontFamily: SANS,
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.65,
                }}
              >
                A dedicated plotting workspace with drag-and-drop scene cards, act structure templates, character relationship maps, and timeline views. Your story&apos;s skeleton, built before a single chapter begins.
              </p>
            </div>
          </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 6: PRICING ───────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            width: '100%',
            padding: '7rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="relative z-20">
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            The Price of Absolute Craftsmanship
          </h2>
          <p style={{ fontFamily: SANS, fontSize: '16px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2.5rem' }}>
            Start free. Upgrade when you&apos;re ready to go all in.
          </p>

          {/* Billing toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3rem' }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: '24px', padding: '4px' }}>
              {(['monthly', 'annual'] as const).map((plan) => (
                <button
                  key={plan}
                  onClick={() => handleBilling(plan)}
                  style={{
                    background: billing === plan ? 'var(--color-gold)' : 'transparent',
                    color: billing === plan ? '#1e1a16' : 'var(--text-muted)',
                    borderRadius: '20px',
                    padding: '6px 20px',
                    fontSize: '13px',
                    fontWeight: billing === plan ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s ease',
                    fontFamily: SANS,
                  }}
                >
                  {plan === 'monthly' ? 'Monthly' : 'Annual (Save 20%)'}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing grid */}
          <div
            className="pricing-grid"
            style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', maxWidth: '780px', margin: '0 auto', alignItems: 'flex-start' }}
          >
            {/* Free */}
            <div className="relative z-20 bg-[var(--surface-card)]" style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem' }}>
              <div style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Free</div>
              <div style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Start your practice.</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: SERIF, fontSize: '48px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>$0</span>
                <span style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>/month</span>
              </div>

              <div style={{ height: '1px', background: 'var(--color-border)', margin: '1.5rem 0' }} />

              {['1 active project', '20,000 word limit', 'Core text editor', 'Focus Mode', '1 Arena ticket / week'].map((f) => (
                <div key={f} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, fontFamily: SANS }}>
                  <span style={{ color: 'var(--color-gold)', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>✦</span>
                  {f}
                </div>
              ))}
              {['Goals & streak tracking', 'Export to PDF', 'Arena unlimited access'].map((f) => (
                <div key={f} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5, fontFamily: SANS }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>—</span>
                  {f}
                </div>
              ))}

              <Link
                href="/signup"
                className="ghost-btn"
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '2rem',
                  border: '1px solid var(--color-border-strong)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  padding: '11px 0',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: SERIF,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  textAlign: 'center',
                  textDecoration: 'none',
                }}
              >
                Get Started — Free
              </Link>
            </div>

            {/* Scribe */}
            <div className="relative z-20 bg-[var(--surface-card)]" style={{ flex: 1, border: '1px dashed var(--color-gold)', borderRadius: '8px', padding: '2rem' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--color-gold)',
                  color: '#1e1a16',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  padding: '3px 14px',
                  borderRadius: '10px',
                  whiteSpace: 'nowrap',
                  fontFamily: SANS,
                }}
              >
                MOST POPULAR
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: 'var(--color-gold)', marginBottom: '0.35rem' }}>
                <Crown size={20} className="text-[var(--color-gold)]" aria-hidden />
                Scribe
              </div>
              <div style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>For writers who show up.</div>

              <div style={{ opacity: priceVisible ? 1 : 0, transition: 'opacity 0.2s ease' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: SERIF, fontSize: '48px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {billing === 'monthly' ? '$9.99' : '$8.00'}
                  </span>
                  <span style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>/mo</span>
                </div>
                {billing === 'annual' && (
                  <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Billed annually at $96/yr
                  </div>
                )}
              </div>

              <div style={{ height: '1px', background: 'var(--color-border)', margin: '1.5rem 0' }} />

              {[
                'Everything in Free',
                'Unlimited projects & words',
                'Full Arena access — unlimited tickets',
                'Goals, streaks & heatmap analytics',
                'Export pages & full manuscripts (PDF)',
                'All 34 themes, fonts & avatar insignias',
                'Task manager',
                'Priority support',
              ].map((f) => (
                <div key={f} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, fontFamily: SANS }}>
                  <span style={{ color: 'var(--color-gold)', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>✦</span>
                  {f}
                </div>
              ))}

              <Link
                href={`/signup?plan=scribe&billing=${billing}`}
                className="gold-btn"
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '2rem',
                  background: 'var(--color-gold)',
                  color: '#1e1a16',
                  border: 'none',
                  padding: '13px 0',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: SERIF,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  textAlign: 'center',
                  textDecoration: 'none',
                }}
              >
                Unlock Access →
              </Link>
            </div>
          </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 7: FOOTER ────────────────────────────────────────── */}
        <footer
          className="bg-[var(--bg-primary)]"
          style={{
            padding: '2.5rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            textAlign: 'center',
          }}
        >
          <div className="relative z-20">
          <div style={{ fontFamily: SERIF, fontSize: '14px', letterSpacing: '0.12em', color: 'var(--color-gold)', marginBottom: '0.75rem' }}>
            ✦ RUNE
          </div>
          <div style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Built for writers who want to actually write.
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link href="/terms" style={{ fontSize: '12px', fontFamily: SANS, color: 'var(--text-muted)', textDecoration: 'none' }}>
              Terms of Service
            </Link>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 10px' }} aria-hidden> · </span>
            <Link href="/privacy" style={{ fontSize: '12px', fontFamily: SANS, color: 'var(--text-muted)', textDecoration: 'none' }}>
              Privacy Policy
            </Link>
          </div>
          <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.75rem', opacity: 0.6 }}>
            © 2025 Rune. All rights reserved.
          </div>
          </div>
        </footer>

    </div>
  )
}
