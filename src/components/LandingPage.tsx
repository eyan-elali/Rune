"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
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

// 20 weeks × 7 days = 140 cells; column-major (Mon–Sun per week, oldest→newest)
// intensities: 0=empty, 1=dim, 2=medium, 3=bright
const S5_HEATMAP: number[] = [
  0,0,1,0,2,0,0, // week 0
  0,1,0,0,1,0,1, // week 1
  1,0,2,0,0,1,0, // week 2
  0,1,0,1,2,0,0, // week 3
  2,0,1,2,0,1,0, // week 4
  0,2,1,0,2,1,2, // week 5
  1,2,0,2,1,2,0, // week 6
  2,1,2,0,2,2,1, // week 7
  2,2,1,3,1,2,1, // week 8
  1,2,3,2,2,1,2, // week 9
  2,3,2,1,3,2,2, // week 10
  3,2,2,3,2,3,1, // week 11
  2,3,3,2,3,2,2, // week 12
  3,2,3,3,2,3,2, // week 13
  3,3,2,3,3,2,3, // week 14
  2,3,3,3,2,3,3, // week 15
  3,2,3,3,2,3,2, // week 16 — animated
  3,3,2,3,3,2,3, // week 17 — animated
  2,3,3,2,3,3,2, // week 18 — animated
  3,3,2,3,3,2,0, // week 19 — animated (last cell = today, not yet written)
]

const SERIF = "Georgia, 'Times New Roman', serif"
const SANS  = 'system-ui, -apple-system, sans-serif'

const DEMO_PAGES: {
  label: string
  wordCount: number
  body: { text: string; indent: boolean; italic: boolean; cursor?: boolean }[]
}[] = [
  {
    label: 'The Arrival',
    wordCount: 312,
    body: [
      { text: 'The library was already dark by the time she arrived.', indent: false, italic: false },
      { text: 'She had taken the long road deliberately — through the courtyard rather than the stone passage — because on nights like this she needed the cold air to remind her she was still moving forward.', indent: true, italic: false },
      { text: '“You’re late,” said the archivist, not looking up.', indent: true, italic: true },
      { text: 'She sat down at the long oak table and opened the manuscript.', indent: true, italic: false, cursor: true },
    ],
  },
  {
    label: 'The Letter',
    wordCount: 247,
    body: [
      { text: 'The envelope had arrived without a return address.', indent: false, italic: false },
      { text: 'She turned it over in her hands three times before breaking the seal, as though reading it would make things real in a way she wasn’t ready for.', indent: true, italic: false },
      { text: '“If you’re reading this,” it began, “then I was wrong about the time.”', indent: true, italic: true },
      { text: 'She folded it carefully and placed it inside the manuscript.', indent: true, italic: false, cursor: true },
    ],
  },
  {
    label: 'The Garden',
    wordCount: 183,
    body: [
      { text: 'By morning the frost had retreated to the edges of the stone path.', indent: false, italic: false },
      { text: 'She walked through it slowly, notebook in hand, the way her mother had taught her to think — without hurrying toward a conclusion.', indent: true, italic: false },
      { text: '“Nothing is truly lost,” the old woman used to say. “Only misplaced.”', indent: true, italic: true },
      { text: 'She was beginning to believe it.', indent: true, italic: false, cursor: true },
    ],
  },
]

export default function LandingPage() {
  const [activeHeroTheme, setActiveHeroTheme] = useState<HeroThemeKey>('candlelight')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [priceVisible, setPriceVisible] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<'workspace' | 'focus'>('workspace')
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [arenaMode, setArenaMode] = useState<'battle' | 'race'>('battle')
  const [enemyHp, setEnemyHp] = useState(62)
  const [battleWords, setBattleWords] = useState(147)
  const [raceSeconds, setRaceSeconds] = useState(767)
  const [raceWords, setRaceWords] = useState(843)
  const [breathOpacity, setBreathOpacity] = useState(1.0)
  const [heatStep, setHeatStep] = useState(112)
  const [s5Streak, setS5Streak] = useState(14)
  const [s5Words, setS5Words] = useState(47200)
  const [s5XpPct, setS5XpPct] = useState(70)

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-font')
  }, [])

  useEffect(() => {
    if (workspaceView !== 'workspace') return
    const timer = setInterval(() => {
      setActivePageIndex(prev => (prev + 1) % DEMO_PAGES.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [workspaceView])

  useEffect(() => {
    const timer = setInterval(() => {
      setBreathOpacity(prev => prev > 0.85 ? 0.78 : 1.0)
    }, 1500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setHeatStep(prev => prev >= 140 ? 112 : prev + 1)
    }, 160)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setS5Streak(prev => prev >= 21 ? 14 : prev + 1)
    }, 3200)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setS5Words(prev => prev >= 52000 ? 47200 : prev + 25)
    }, 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setS5XpPct(prev => prev >= 94 ? 70 : prev + 1)
    }, 600)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (arenaMode !== 'battle') return
    const timer = setInterval(() => {
      setEnemyHp(prev => prev <= 28 ? 62 : prev - 1)
      setBattleWords(prev => prev >= 600 ? 147 : prev + 2)
    }, 2200)
    return () => clearInterval(timer)
  }, [arenaMode])

  useEffect(() => {
    if (arenaMode !== 'race') return
    const timer = setInterval(() => {
      setRaceSeconds(prev => prev <= 0 ? 767 : prev - 1)
      setRaceWords(prev => prev >= 1100 ? 843 : prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [arenaMode])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const heroTheme = HERO_THEMES[activeHeroTheme]

  function handleBilling(plan: 'monthly' | 'annual') {
    setPriceVisible(false)
    setTimeout(() => { setBilling(plan); setPriceVisible(true) }, 200)
  }

  return (
    <div className="relative" style={{ overflowX: 'hidden' }}>
      <style>{`
        /* ══════════════════════════════════════════════════════
           RUNE LANDING PAGE — TABLET RESPONSIVE
           768px–1199px only. Desktop 1200px+ is never touched.
        ══════════════════════════════════════════════════════ */

        /* Heatmap: allow contained horizontal scroll on narrow tablets */
        .landing-heatmap-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* ─── TABLET LANDSCAPE 900px–1199px ──────────────── */
        @media (min-width: 900px) and (max-width: 1199px) {
          .landing-header { padding: 0 1.5rem !important; }

          .landing-hero-left { padding: 0 2rem 3rem 3rem !important; }
          .landing-hero-right { padding: 2rem 2rem 2rem 0.5rem !important; }

          .landing-problem-col-1 { padding: 0 1.75rem 0 0 !important; }
          .landing-problem-col-2 { padding: 0 1.75rem !important; }
          .landing-problem-col-3 { padding: 0 0 0 1.75rem !important; }

          .landing-workspace-section { padding: 5rem 2rem !important; }

          .landing-s6-left { padding-right: 2.5rem !important; }
          .landing-s6-right { padding-left: 1.5rem !important; }
        }

        /* ─── TABLET PORTRAIT 768px–899px ────────────────── */
        @media (min-width: 768px) and (max-width: 899px) {
          .landing-header { padding: 0 1.25rem !important; }

          /* Hero: stack copy then preview, centered composition */
          .landing-hero {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .landing-hero-left {
            width: 100% !important;
            padding: 3rem 1.75rem 2rem !important;
            align-items: center !important;
            text-align: center !important;
          }
          .landing-hero-left p {
            max-width: 440px !important;
          }
          .landing-hero-left .gold-btn {
            align-self: center !important;
          }
          .landing-hero-right {
            flex: none !important;
            width: 100% !important;
            padding: 0 1.75rem 3rem !important;
          }

          /* Problem: keep three columns, tighten gutters */
          .landing-problem-col-1 { padding: 0 1.1rem 0 0 !important; }
          .landing-problem-col-2 { padding: 0 1.1rem !important; }
          .landing-problem-col-3 { padding: 0 0 0 1.1rem !important; }

          /* Workspace: stack copy then preview */
          .landing-workspace-section { padding: 4rem 1.5rem !important; }
          .landing-workspace-grid {
            grid-template-columns: 1fr !important;
            gap: 2.5rem !important;
          }

          /* Long Game stats: keep three-column row, reduce gap */
          .landing-stats-row { gap: 0.6rem !important; }

          /* Trust / Make Rune Yours: stack */
          .landing-s6-grid { grid-template-columns: 1fr !important; }
          .landing-s6-left {
            padding-right: 0 !important;
            padding-bottom: 3rem !important;
          }
          .landing-s6-right {
            border-left: none !important;
            border-top: 1px solid var(--color-border) !important;
            padding-left: 0 !important;
            padding-top: 3rem !important;
          }

          /* Trust 3-point grid: single column */
          .landing-trust-pts {
            grid-template-columns: 1fr !important;
            gap: 1.25rem !important;
          }
        }

        /* ─── MOBILE < 768px ──────────────────────────────── */
        @media (max-width: 767px) {

          /* ── Header ── */
          .landing-header { padding: 0 1rem !important; }
          .landing-header-cta {
            font-size: 12px !important;
            padding: 6px 10px !important;
            white-space: nowrap !important;
          }

          /* ── Hero ── */
          .landing-hero {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .landing-hero-left {
            width: 100% !important;
            padding: 2rem 1.25rem 1.5rem !important;
            align-items: center !important;
            text-align: center !important;
          }
          .landing-hero-eyebrow { margin-bottom: 1.5rem !important; }
          .landing-hero-left h1 {
            font-size: clamp(1.95rem, 7.8vw, 2.5rem) !important;
            text-align: center !important;
          }
          .landing-hero-left p {
            max-width: 100% !important;
            text-align: center !important;
            font-size: 15px !important;
            margin-bottom: 1.75rem !important;
          }
          .landing-hero-left .gold-btn {
            align-self: stretch !important;
            text-align: center !important;
            display: block !important;
          }
          /* Slightly narrower hero preview so it breathes */
          .landing-hero-right {
            flex: none !important;
            width: 100% !important;
            padding: 0 2rem 2.5rem !important;
          }
          .landing-hero-editor-frame { height: 290px !important; }
          .landing-hero-writing-surface {
            padding: 1.25rem 1.5rem 1.5rem !important;
          }
          .landing-hero-theme-pills {
            gap: 6px !important;
            flex-wrap: wrap !important;
          }

          /* ── Section 2: Problem — stacked chapters, no column dividers ── */
          .landing-problem-cols {
            grid-template-columns: 1fr !important;
            max-width: 100% !important;
          }
          .landing-problem-col-1 {
            padding: 0 0 2.5rem !important;
            border-right: none !important;
            border-bottom: 1px solid var(--color-border) !important;
            margin-bottom: 2.5rem !important;
          }
          .landing-problem-col-2 {
            padding: 0 0 2.5rem !important;
            border-right: none !important;
            border-bottom: 1px solid var(--color-border) !important;
            margin-bottom: 2.5rem !important;
          }
          .landing-problem-col-3 {
            padding: 0 !important;
          }

          /* ── Section 3: Workspace — copy above, then full mockup ── */
          .landing-workspace-section {
            padding: 4rem 1.25rem !important;
            overflow: visible !important;
          }
          .landing-workspace-grid {
            grid-template-columns: 1fr !important;
            gap: 2.5rem !important;
          }
          /* Clip the horizontal layout overflow from the scaled frame */
          .landing-ws-mockup-outer {
            overflow: hidden !important;
            width: 100% !important;
          }

          /* ── Section 5: Long Game — stacked stat cards ── */
          .landing-stats-row {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
          }

          /* ── Section 6: Trust & Unlockables — full vertical stack ── */
          .landing-s6-grid { grid-template-columns: 1fr !important; }
          .landing-s6-left {
            padding-right: 0 !important;
            padding-bottom: 3rem !important;
            border-right: none !important;
          }
          .landing-s6-right {
            border-left: none !important;
            border-top: 1px solid var(--color-border) !important;
            padding-left: 0 !important;
            padding-top: 3rem !important;
          }
          .landing-trust-pts {
            grid-template-columns: 1fr !important;
            gap: 1.25rem !important;
          }

          /* ── Pricing — stacked cards, iOS-card sizing ── */
          .pricing-grid {
            flex-direction: column !important;
            align-items: center !important;
            max-width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            gap: 1.5rem !important;
          }
          .pricing-grid > div {
            width: min(92vw, 430px) !important;
            flex: none !important;
            padding: 1.5rem !important;
          }

          /* ── Hero editor: tighter header on mobile ── */
          .landing-hero-editor-header {
            padding: 5px 10px !important;
          }

          /* ── Hero editor: smaller prose fits all text above pill ── */
          .landing-hero-chapter-label {
            margin-bottom: 1rem !important;
          }
          .landing-hero-writing-surface p {
            font-size: 11.5px !important;
            line-height: 1.7 !important;
            margin-bottom: 0.65rem !important;
          }

          /* ── Heatmap: compress to fit mobile viewport, no horizontal scroll ── */
          .landing-heatmap-scroll {
            overflow-x: hidden !important;
          }
          .landing-heatmap-inner {
            min-width: 0 !important;
            gap: 2px !important;
          }
          .landing-heatmap-day-labels {
            width: 14px !important;
            gap: 2px !important;
          }
          .landing-heatmap-day-labels > div {
            height: 9px !important;
            font-size: 7px !important;
          }
          .landing-heatmap-grid {
            grid-template-rows: repeat(7, 9px) !important;
            grid-auto-columns: 9px !important;
            gap: 2px !important;
          }
        }

        /* ─── PHONES < 640px: workspace mockup — fluid, centered ─── */
        /* Each range picks a scale that fills the available width      */
        /* (vw − 40px) without cropping. margin-left centers the        */
        /* visual content: calc(50% − scale×680/2).                     */
        @media (max-width: 374px) {
          .landing-ws-app-frame {
            width: 680px !important;
            height: 468px !important;
            transform: scale(0.46) !important;
            transform-origin: top left !important;
            margin-left: calc(50% - 156.4px) !important;
            margin-bottom: -253px !important;
          }
        }
        @media (min-width: 375px) and (max-width: 429px) {
          .landing-ws-app-frame {
            width: 680px !important;
            height: 468px !important;
            transform: scale(0.49) !important;
            transform-origin: top left !important;
            margin-left: calc(50% - 166.6px) !important;
            margin-bottom: -239px !important;
          }
        }
        @media (min-width: 430px) and (max-width: 639px) {
          .landing-ws-app-frame {
            width: 680px !important;
            height: 468px !important;
            transform: scale(0.57) !important;
            transform-origin: top left !important;
            margin-left: calc(50% - 193.8px) !important;
            margin-bottom: -201px !important;
          }
        }

        /* ─── PHONES < 640px: hero editor prose ─── */
        /* Show a shorter manuscript on small screens to prevent the    */
        /* word-count pill from overlapping the body text.              */
        @media (max-width: 639px) {
          .landing-hero-prose-desktop { display: none !important; }
          .landing-hero-prose-mobile  { display: block !important; }
        }
        @media (min-width: 640px) {
          .landing-hero-prose-mobile  { display: none !important; }
        }
      `}</style>

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
          className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)] landing-header"
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
          className="bg-[var(--bg-primary)] landing-hero"
          style={{
            minHeight: 'calc(100vh - 56px)',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Left — wordmark, headline, paragraph, CTA */}
          <div
            className="relative z-20 landing-hero-left"
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
              className="landing-hero-eyebrow"
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
            className="landing-hero-right"
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
              className="relative z-20 landing-hero-editor-frame"
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
                className="landing-hero-editor-header"
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
                className="landing-hero-writing-surface"
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
                  className="landing-hero-chapter-label"
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

                {/* Mobile-only: shortened para 2 */}
                <p
                  className="landing-hero-prose-mobile"
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
                  Every sentence felt heavier than the last.
                </p>

                {/* Desktop-only: full para 2 */}
                <p
                  className="landing-hero-prose-desktop"
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
                  className="landing-hero-prose-desktop"
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
                  className="landing-hero-prose-desktop"
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
              className="landing-hero-theme-pills"
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
              className="landing-problem-cols"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                maxWidth: '900px',
                margin: '0 auto',
              }}
            >
              {/* I — Structure disappears */}
              <div className="landing-problem-col-1" style={{ padding: '0 3rem 0 0', borderRight: '1px solid var(--color-border)' }}>
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
              <div className="landing-problem-col-2" style={{ padding: '0 3rem', borderRight: '1px solid var(--color-border)' }}>
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
              <div className="landing-problem-col-3" style={{ padding: '0 0 0 3rem' }}>
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
          className="bg-[var(--bg-primary)] landing-workspace-section"
          style={{
            width: '100%',
            minHeight: 'calc(100vh - 56px)',
            padding: '6rem 3rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <div className="relative z-20" style={{ maxWidth: '1220px', margin: '0 auto', width: '100%' }}>
            <div
              className="landing-workspace-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr',
                gap: 'clamp(2.5rem, 6.5vw, 5rem)',
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
              <div className="landing-ws-mockup-outer">
                {/* App window frame */}
                <div
                  className="landing-ws-app-frame"
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
                  {/* App layout */}
                  <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                    {/* ── Sidebar ── */}
                    <div
                      style={{
                        width: workspaceView === 'focus' ? '0px' : '132px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1), border-right-color 0.45s ease',
                        transitionDelay: workspaceView === 'focus' ? '0ms' : '80ms',
                        background: 'var(--bg-sidebar)',
                        borderRight: '1px solid',
                        borderRightColor: workspaceView === 'focus' ? 'transparent' : 'var(--color-border)',
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
                            background: 'rgba(44, 36, 32, 0.9)',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                            <path d="M9.5 1C7.5 1 5.5 2.5 4.5 5C3.5 7.5 3.5 10 3.5 10" stroke="var(--color-gold)" strokeWidth="0.9" strokeLinecap="round" opacity="0.88"/>
                            <path d="M9.5 1C9.5 1 7.5 2.5 7 4C6.5 5.5 7 7 7 7" stroke="var(--color-gold)" strokeWidth="0.7" strokeLinecap="round" opacity="0.72"/>
                            <path d="M3.5 10L4.5 7.5" stroke="var(--color-gold)" strokeWidth="0.7" strokeLinecap="round" opacity="0.55"/>
                          </svg>
                        </div>
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
                          height: workspaceView === 'focus' ? '0px' : '36px',
                          background: 'var(--bg-primary)',
                          borderBottom: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 14px',
                          flexShrink: 0,
                          overflow: 'hidden',
                          opacity: workspaceView === 'focus' ? 0 : 1,
                          transition: 'opacity 0.35s ease, height 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                          transitionDelay: workspaceView === 'focus' ? '60ms' : '20ms',
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
                            transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1), border-right-color 0.45s ease',
                            transitionDelay: workspaceView === 'focus' ? '30ms' : '50ms',
                            background: 'var(--bg-sidebar)',
                            borderRight: '1px solid',
                            borderRightColor: workspaceView === 'focus' ? 'transparent' : 'var(--color-border)',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                          aria-hidden
                        >
                          <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: SANS, fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-mist)', opacity: 0.65, whiteSpace: 'nowrap' }}>
                              Pages
                            </span>
                            <span style={{ fontFamily: SANS, fontSize: '8px', color: 'var(--color-mist)', opacity: 0.4, whiteSpace: 'nowrap' }}>
                              Chapters
                            </span>
                          </div>

                          {/* Pages — cycles through DEMO_PAGES in workspace mode */}
                          <div style={{ padding: '6px 8px', flex: 1, overflow: 'hidden' }}>
                            {DEMO_PAGES.map(({ label }, idx) => {
                              const active = idx === activePageIndex
                              return (
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
                                    transition: 'color 0.6s ease, opacity 0.6s ease, background 0.6s ease, border-left-color 0.6s ease',
                                  }}
                                >
                                  {label}
                                </div>
                              )
                            })}
                          </div>

                          {/* New page */}
                          <div style={{ padding: '5px 10px 8px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
                            <div style={{ fontFamily: SANS, fontSize: '9px', color: 'var(--color-gold)', opacity: 0.5, padding: '3px 6px', whiteSpace: 'nowrap' }}>
                              + New Page
                            </div>
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
                              background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(26, 22, 20, 0.08) 100%)',
                              pointerEvents: 'none',
                              zIndex: 2,
                              opacity: workspaceView === 'focus' ? 1 : 0,
                              transition: 'opacity 0.65s ease',
                              transitionDelay: workspaceView === 'focus' ? '230ms' : '0ms',
                            }}
                            aria-hidden
                          />

                          {/* Editor content */}
                          <div
                            style={{
                              padding: workspaceView === 'focus' ? '24px 20px 20px' : '16px 22px 18px',
                              transition: 'padding 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
                              transitionDelay: workspaceView === 'focus' ? '120ms' : '0ms',
                              position: 'relative',
                              zIndex: 1,
                              display: 'flex',
                              justifyContent: workspaceView === 'focus' ? 'center' : 'flex-start',
                            }}
                          >
                            {/* Inner content — constrained width in focus mode */}
                            <div
                              style={{
                                width: '100%',
                                maxWidth: workspaceView === 'focus' ? '320px' : '100%',
                                transition: 'max-width 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
                                transitionDelay: workspaceView === 'focus' ? '120ms' : '0ms',
                              }}
                            >
                              {/* Page title — always visible */}
                              <div
                                style={{
                                  fontFamily: SERIF,
                                  fontSize: '12.5px',
                                  fontWeight: 700,
                                  color: 'var(--color-ink)',
                                  letterSpacing: '-0.01em',
                                  lineHeight: 1.3,
                                  paddingBottom: '10px',
                                  marginBottom: '14px',
                                  borderBottom: '1px solid var(--color-border)',
                                }}
                              >
                                {DEMO_PAGES[activePageIndex].label}
                              </div>

                              {DEMO_PAGES[activePageIndex].body.map((line, i) => (
                                <p
                                  key={i}
                                  style={{
                                    fontFamily: SERIF,
                                    fontSize: '11px',
                                    lineHeight: 1.9,
                                    color: 'var(--color-ink)',
                                    marginBottom: i < DEMO_PAGES[activePageIndex].body.length - 1 ? '10px' : '0',
                                    textIndent: line.indent ? '18px' : '0',
                                    fontStyle: line.italic ? 'italic' : 'normal',
                                  }}
                                >
                                  {line.text}
                                  {line.cursor && (
                                    <span
                                      className="landing-cursor"
                                      style={{
                                        display: 'inline-block',
                                        width: '1.5px',
                                        height: '11px',
                                        background: 'var(--color-gold)',
                                        verticalAlign: 'middle',
                                        marginLeft: '3px',
                                      }}
                                    />
                                  )}
                                </p>
                              ))}
                            </div>
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
                            {DEMO_PAGES[activePageIndex].wordCount} <span style={{ opacity: 0.65 }}>words</span>
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

                <div
                  aria-hidden
                  style={{
                    textAlign: 'center',
                    marginTop: '8px',
                    opacity: workspaceView === 'workspace' ? 0.38 : 0,
                    transition: 'opacity 0.4s ease',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontFamily: SANS, fontSize: '10px', letterSpacing: '0.1em', color: 'var(--color-mist)' }}>
                    Try Focus Mode
                  </span>
                </div>
              </div>

            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 4: BUILD MOMENTUM ──────────────────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            width: '100%',
            minHeight: 'calc(100vh - 56px)',
            padding: '7rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="relative z-20" style={{ maxWidth: '1120px', margin: '0 auto', width: '100%' }}>

            {/* Label */}
            <div style={{
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.26em',
              color: 'var(--color-gold)',
              textAlign: 'center',
              marginBottom: '2rem',
              opacity: 0.7,
            }}>
              THE MOMENTUM
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: SERIF,
              fontSize: 'clamp(2.2rem, 4vw, 3.6rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textAlign: 'center',
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              marginBottom: '1.5rem',
            }}>
              Write more by thinking less.
            </h2>

            {/* Subheading */}
            <p style={{
              fontFamily: SANS,
              fontSize: '16px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.85,
              maxWidth: '600px',
              margin: '0 auto 4.5rem',
            }}>
              Most writers don&apos;t stop because they run out of ideas. They stop because the inner editor arrives before the first draft is finished. Rune gives you systems that keep your hands moving.
            </p>

            {/* ── Arena Demo ── */}
            <div style={{ maxWidth: '680px', margin: '0 auto 6rem' }}>

              {/* Mode selector */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.75rem' }}>
                {(['battle', 'race'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setArenaMode(mode)}
                    aria-pressed={arenaMode === mode}
                    style={{
                      background: arenaMode === mode ? 'var(--color-gold)' : 'transparent',
                      border: `1px solid ${arenaMode === mode ? 'var(--color-gold)' : 'var(--color-border)'}`,
                      color: arenaMode === mode ? '#1e1a16' : 'var(--text-muted)',
                      fontFamily: SANS,
                      fontSize: '11px',
                      letterSpacing: '0.1em',
                      padding: '6px 20px',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontWeight: arenaMode === mode ? 600 : 400,
                    }}
                  >
                    {mode === 'battle' ? 'Battle Mode' : 'Race Mode'}
                  </button>
                ))}
              </div>

              {/* Demo window */}
              <div style={{
                border: '1px solid var(--color-border-strong)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
              }}>

                {/* Window chrome */}
                <div style={{
                  background: 'var(--bg-sidebar)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontFamily: SERIF, fontSize: '11px', letterSpacing: '0.18em', color: 'var(--color-gold)' }}>
                    ✦ Rune — Arena
                  </span>
                  <span style={{
                    fontFamily: SANS,
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    color: arenaMode === 'battle' ? 'rgba(139, 46, 46, 0.82)' : 'rgba(201, 168, 76, 0.82)',
                    border: `1px solid ${arenaMode === 'battle' ? 'rgba(139, 46, 46, 0.28)' : 'rgba(201, 168, 76, 0.28)'}`,
                    padding: '2px 10px',
                    borderRadius: '10px',
                    transition: 'all 0.3s ease',
                  }}>
                    {arenaMode === 'battle' ? 'BATTLE MODE' : 'RACE MODE'}
                  </span>
                </div>

                {/* Panels — overlapping with opacity crossfade */}
                <div style={{ position: 'relative', minHeight: '340px' }}>

                  {/* Battle Mode panel */}
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    padding: '2.25rem 2.5rem 2rem',
                    opacity: arenaMode === 'battle' ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                    pointerEvents: arenaMode === 'battle' ? 'auto' : 'none',
                  }}>

                    {/* Enemy */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontFamily: SANS, fontSize: '9px', letterSpacing: '0.2em', color: 'var(--color-crimson)', opacity: 0.72, marginBottom: '3px' }}>ENEMY</div>
                          <div style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>The Blank Page</div>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-muted)', opacity: 0.52, letterSpacing: '0.02em' }}>
                          {enemyHp * 5} / 500 HP
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{
                          width: `${enemyHp}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #6b1a1a, #8b2e2e)',
                          borderRadius: '4px',
                          transition: 'width 1.4s ease',
                        }} />
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', opacity: 0.28 }}>
                      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                      <span style={{ margin: '0 12px', color: 'var(--color-gold)', fontSize: '10px' }}>✦</span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                    </div>

                    {/* Player */}
                    <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontFamily: SANS, fontSize: '9px', letterSpacing: '0.2em', color: 'var(--color-gold)', opacity: 0.72, marginBottom: '3px' }}>YOU</div>
                          <div style={{ fontFamily: SERIF, fontSize: '14px', color: 'var(--text-primary)', opacity: 0.82 }}>Writing Progress</div>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-muted)', opacity: 0.52, letterSpacing: '0.02em' }}>
                          168 / 200 HP
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{
                          width: '84%',
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))',
                          borderRadius: '4px',
                          opacity: breathOpacity,
                          transition: 'opacity 1.5s ease-in-out',
                        }} />
                      </div>
                    </div>

                    {/* HUD bottom row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '1.25rem',
                      borderTop: '1px solid var(--color-border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                        <span style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                          {battleWords}
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)' }}>words written</span>
                      </div>
                      <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px', color: 'var(--text-muted)', opacity: 0.58 }}>
                        Keep writing.
                      </span>
                    </div>

                  </div>

                  {/* Race Mode panel */}
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    padding: '2.25rem 2.5rem 2rem',
                    opacity: arenaMode === 'race' ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                    pointerEvents: arenaMode === 'race' ? 'auto' : 'none',
                    textAlign: 'center',
                  }}>

                    <div style={{ fontFamily: SANS, fontSize: '9px', letterSpacing: '0.22em', color: 'var(--color-gold)', opacity: 0.55, marginBottom: '0.75rem' }}>
                      TIME REMAINING
                    </div>

                    <div style={{
                      fontFamily: SERIF,
                      fontSize: 'clamp(3rem, 7vw, 4rem)',
                      fontWeight: 700,
                      color: 'var(--color-gold)',
                      letterSpacing: '0.06em',
                      lineHeight: 1,
                      marginBottom: '1.75rem',
                    }}>
                      {formatTime(raceSeconds)}
                    </div>

                    <div style={{ marginBottom: '1.75rem' }}>
                      <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{
                          width: `${Math.min((raceWords / 1500) * 100, 100)}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))',
                          borderRadius: '3px',
                          transition: 'width 0.9s ease',
                        }} />
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1.5rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                        <span style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                          {raceWords.toLocaleString()}
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)' }}>words</span>
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)' }}>
                        Personal best:&nbsp;<span style={{ color: 'var(--color-gold)', opacity: 0.82 }}>1,204</span>
                      </div>
                    </div>

                    <div style={{ paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
                      <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px', color: 'var(--text-muted)', opacity: 0.58 }}>
                        Only momentum matters.
                      </span>
                    </div>

                  </div>

                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  marginTop: '1.25rem',
                }}
              >
                <p
                  style={{
                    gridArea: '1 / 1 / -1 / -1',
                    textAlign: 'center',
                    fontFamily: SANS,
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.7,
                    margin: 0,
                    opacity: arenaMode === 'battle' ? 0.65 : 0,
                    transition: 'opacity 0.35s ease',
                  }}
                >
                  Battle Mode turns drafting into a duel against hesitation—every word pushes the enemy.
                </p>
                <p
                  style={{
                    gridArea: '1 / 1 / -1 / -1',
                    textAlign: 'center',
                    fontFamily: SANS,
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.7,
                    margin: 0,
                    opacity: arenaMode === 'race' ? 0.65 : 0,
                    transition: 'opacity 0.35s ease',
                  }}
                >
                  Race Mode turns a writing session into a focused sprint, where the only goal is forward motion.
                </p>
              </div>
            </div>

          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 5: EVERY SESSION LEAVES ITS MARK ────────────────── */}
        <section
          className="bg-[var(--bg-secondary)]"
          style={{
            width: '100%',
            minHeight: '100vh',
            padding: '8rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="relative z-20" style={{ maxWidth: '820px', margin: '0 auto', width: '100%' }}>

            {/* Eyebrow */}
            <div style={{
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.26em',
              color: 'var(--color-gold)',
              textAlign: 'center',
              marginBottom: '2rem',
              opacity: 0.7,
            }}>
              THE LONG GAME
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: SERIF,
              fontSize: 'clamp(2.2rem, 4vw, 3.6rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textAlign: 'center',
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              marginBottom: '1.5rem',
            }}>
              Every session leaves its mark.
            </h2>

            {/* Supporting copy */}
            <p style={{
              fontFamily: SANS,
              fontSize: '16px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.85,
              maxWidth: '520px',
              margin: '0 auto 4rem',
            }}>
              Great novels aren&apos;t written in bursts of inspiration. They&apos;re written one day at a time.
            </p>

            {/* Heatmap card */}
            <div style={{
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '2rem 2rem 1.5rem',
              background: 'var(--bg-primary)',
              marginBottom: '1.25rem',
            }}>
              {/* Header row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
              }}>
                <span style={{
                  fontFamily: SANS,
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--color-mist)',
                  opacity: 0.75,
                }}>
                  Writing Activity
                </span>
                <span style={{
                  fontFamily: SANS,
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  opacity: 0.58,
                }}>
                  Last 20 weeks
                </span>
              </div>

              {/* Grid + day labels */}
              <div className="landing-heatmap-scroll">
              <div className="landing-heatmap-inner" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', minWidth: 'min-content' }}>

                {/* Day labels column */}
                <div className="landing-heatmap-day-labels" style={{
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: '4px',
                  paddingTop: '1px',
                  flexShrink: 0,
                  width: '22px',
                }}>
                  {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((label, i) => (
                    <div key={i} style={{
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      fontFamily: SANS,
                      fontSize: '9px',
                      color: 'var(--color-mist)',
                      opacity: 0.42,
                      userSelect: 'none' as const,
                    }}>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Cells — column-major layout matches S5_HEATMAP order */}
                <div className="landing-heatmap-grid" style={{
                  display: 'grid',
                  gridTemplateRows: 'repeat(7, 18px)',
                  gridAutoFlow: 'column',
                  gridAutoColumns: '18px',
                  gap: '4px',
                  flex: 1,
                }}>
                  {S5_HEATMAP.map((intensity, idx) => {
                    const active = idx < heatStep
                    const bg = !active || intensity === 0
                      ? 'rgba(201, 168, 76, 0.07)'
                      : intensity === 1
                      ? 'rgba(201, 168, 76, 0.24)'
                      : intensity === 2
                      ? 'rgba(201, 168, 76, 0.55)'
                      : 'rgba(201, 168, 76, 0.90)'
                    return (
                      <div
                        key={idx}
                        style={{
                          borderRadius: '3px',
                          background: bg,
                          transition: 'background 0.5s ease',
                        }}
                        aria-hidden
                      />
                    )
                  })}
                </div>
              </div>
              </div>

              {/* Legend */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px',
                marginTop: '1rem',
              }}>
                <span style={{ fontFamily: SANS, fontSize: '9px', color: 'var(--color-mist)', opacity: 0.45 }}>Less</span>
                {([0.07, 0.24, 0.55, 0.90] as const).map((op, i) => (
                  <div key={i} style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: `rgba(201, 168, 76, ${op})`,
                  }} aria-hidden />
                ))}
                <span style={{ fontFamily: SANS, fontSize: '9px', color: 'var(--color-mist)', opacity: 0.45 }}>More</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="landing-stats-row" style={{
              display: 'grid',
              gridTemplateColumns: '1.18fr 1fr 1fr',
              gap: '1rem',
              marginBottom: '5rem',
            }}>

              {/* Manuscript Goal */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '1.5rem',
                background: 'var(--bg-primary)',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: '0.75rem',
              }}>
                <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }} aria-hidden>
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(201, 168, 76, 0.1)" strokeWidth="5" />
                    <circle
                      cx="40" cy="40" r="32"
                      fill="none"
                      stroke="var(--color-gold)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray="201"
                      strokeDashoffset={201 * (1 - s5Words / 80000)}
                      style={{ transition: 'stroke-dashoffset 1.5s ease' }}
                    />
                  </svg>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{
                      fontFamily: SERIF,
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.02em',
                    }}>
                      {Math.round((s5Words / 80000) * 100)}%
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {s5Words.toLocaleString()} / 80,000 words
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Manuscript Goal
                  </div>
                </div>
              </div>

              {/* Writing Streak */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '1.5rem',
                background: 'var(--bg-primary)',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}>
                <div style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(36px, 4vw, 52px)',
                  fontWeight: 700,
                  color: 'var(--color-gold)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  transition: 'all 0.4s ease',
                }}>
                  {s5Streak}
                </div>
                <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  day streak
                </div>
                <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }} aria-hidden>
                  {[...Array(7)].map((_, i) => (
                    <div key={i} style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'var(--color-gold)',
                      opacity: i === 6 ? 0.35 : 1,
                    }} />
                  ))}
                </div>
              </div>

              {/* Level / XP */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '1.5rem',
                background: 'var(--bg-primary)',
                display: 'flex',
                flexDirection: 'column' as const,
                justifyContent: 'center',
                gap: '0.65rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Level 7
                  </span>
                  <span style={{ fontFamily: SANS, fontSize: '10px', color: 'var(--color-gold)', opacity: 0.65 }}>
                    → Lvl 8
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(201,168,76,0.1)' }}>
                  <div style={{
                    height: '100%',
                    width: `${s5XpPct}%`,
                    background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))',
                    borderRadius: '3px',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-muted)', opacity: 0.65 }}>
                  {Math.round(s5XpPct / 100 * 5000).toLocaleString()} / 5,000 XP
                </div>
                <div style={{ fontFamily: SERIF, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                  Current Level / XP
                </div>
              </div>

            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              <span style={{ margin: '0 16px', color: 'var(--color-gold)', fontSize: '12px', opacity: 0.45 }}>✦</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
            </div>

            {/* Closing line */}
            <p style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 'clamp(1.05rem, 1.8vw, 1.25rem)',
              color: 'var(--text-primary)',
              textAlign: 'center',
              opacity: 0.72,
              lineHeight: 1.75,
            }}>
              One sentence becomes one page. One page becomes one chapter. One chapter becomes a finished novel.
            </p>

          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 6: TRUST & MAKE RUNE YOURS ─────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            width: '100%',
            minHeight: 'calc(100vh - 56px)',
            padding: '7rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="relative z-20" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div className="landing-s6-grid" style={{
              display: 'grid',
              gridTemplateColumns: '1.75fr 1fr',
              gap: '0',
              alignItems: 'start',
            }}>

              {/* ── LEFT: Trust & Ownership (70%) ── */}
              <div className="landing-s6-left" style={{ paddingRight: 'clamp(2rem, 6.9vw, 5rem)' }}>

                <div style={{
                  fontFamily: SANS,
                  fontSize: '10px',
                  letterSpacing: '0.26em',
                  color: 'var(--color-gold)',
                  marginBottom: '2rem',
                  opacity: 0.7,
                }}>
                  TRUST & OWNERSHIP
                </div>

                <h2 style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(2rem, 3vw, 2.8rem)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.18,
                  letterSpacing: '-0.01em',
                  marginBottom: '1.25rem',
                  maxWidth: '520px',
                }}>
                  Your manuscript should always belong to you.
                </h2>

                <p style={{
                  fontFamily: SANS,
                  fontSize: '15px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.85,
                  marginBottom: '2.75rem',
                  maxWidth: '480px',
                }}>
                  Rune saves your work locally first, syncs it automatically when you&apos;re online, and keeps your manuscript exportable. Your words should never depend on a perfect connection.
                </p>

                {/* ── Trust Flow ── */}
                <div style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  marginBottom: '2.5rem',
                  background: 'var(--bg-secondary)',
                }}>
                  {([
                    { step: 'Write', badge: 'Active', color: 'var(--color-gold)' },
                    { step: 'Saved locally', badge: 'Protected', color: 'var(--color-sage)' },
                    { step: 'Synced automatically', badge: 'Online', color: 'var(--color-gold)' },
                    { step: 'Available everywhere', badge: 'Synced', color: 'var(--color-sage)' },
                    { step: 'Export anytime', badge: 'Yours', color: 'var(--color-gold)' },
                  ] as { step: string; badge: string; color: string }[]).map(({ step, badge, color }, idx, arr) => (
                    <div key={step}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.95rem 1.5rem',
                        background: idx === 0 ? 'rgba(201, 168, 76, 0.04)' : 'transparent',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: color,
                            flexShrink: 0,
                            opacity: 0.75,
                          }} aria-hidden />
                          <span style={{
                            fontFamily: SERIF,
                            fontSize: '15px',
                            color: 'var(--text-primary)',
                            opacity: 0.88,
                          }}>
                            {step}
                          </span>
                        </div>
                        <span style={{
                          fontFamily: SANS,
                          fontSize: '9px',
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase' as const,
                          color: color,
                          border: `1px solid ${color}`,
                          borderRadius: '10px',
                          padding: '2px 10px',
                          opacity: 0.65,
                        }}>
                          {badge}
                        </span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div style={{
                          padding: '0 1.5rem',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                        }}>
                          <div style={{ width: '7px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{
                              width: '1px',
                              height: '18px',
                              background: 'var(--color-border-strong)',
                              opacity: 0.5,
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* ── 3 Trust Points ── */}
                <div className="landing-trust-pts" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.5rem',
                  marginBottom: '2.5rem',
                }}>
                  {[
                    { title: 'Offline-first writing', body: 'Keep writing even when the connection drops.' },
                    { title: 'Automatic sync', body: "Rune reconciles your local drafts when you're back online." },
                    { title: 'Export ownership', body: 'Your manuscript stays yours to take with you.' },
                  ].map(({ title, body }) => (
                    <div key={title} style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.45rem' }}>
                        <span style={{ color: 'var(--color-gold)', fontSize: '10px' }} aria-hidden>✦</span>
                        <h3 style={{
                          fontFamily: SERIF,
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}>
                          {title}
                        </h3>
                      </div>
                      <p style={{
                        fontFamily: SANS,
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.7,
                      }}>
                        {body}
                      </p>
                    </div>
                  ))}
                </div>

              </div>

              {/* ── RIGHT: Make Rune Yours (30%) ── */}
              <div className="landing-s6-right" style={{
                paddingLeft: 'clamp(1.5rem, 5.5vw, 4rem)',
                borderLeft: '1px solid var(--color-border)',
              }}>

                <div style={{
                  fontFamily: SANS,
                  fontSize: '10px',
                  letterSpacing: '0.26em',
                  color: 'var(--color-gold)',
                  marginBottom: '1.75rem',
                  opacity: 0.7,
                }}>
                  MAKE RUNE YOURS
                </div>

                <h2 style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(1.4rem, 2vw, 1.9rem)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.22,
                  letterSpacing: '-0.01em',
                  marginBottom: '1rem',
                }}>
                  A workspace that grows with you.
                </h2>

                <p style={{
                  fontFamily: SANS,
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.8,
                  marginBottom: '2.25rem',
                }}>
                  Unlock new themes, fonts, and avatars simply by writing. Progress should make your manuscript stronger—and your workspace more personal.
                </p>

                {/* 3 Unlock Tiles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '2rem' }}>
                  {([
                    { title: 'Themes', body: 'Change the atmosphere of the page.', symbol: '◐' },
                    { title: 'Fonts', body: 'Shape the voice of your workspace.', symbol: 'Aa' },
                    { title: 'Avatars', body: 'Let your author profile evolve.', symbol: '✦' },
                  ] as { title: string; body: string; symbol: string }[]).map(({ title, body, symbol }) => (
                    <div key={title} style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '1rem 1.15rem',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'flex-start',
                    }}>
                      <div
                        aria-hidden
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border-strong)',
                          background: 'rgba(201, 168, 76, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontFamily: SERIF,
                          fontSize: '13px',
                          color: 'var(--color-gold)',
                        }}
                      >
                        {symbol}
                      </div>
                      <div>
                        <div style={{
                          fontFamily: SERIF,
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '0.3rem',
                        }}>
                          {title}
                        </div>
                        <div style={{
                          fontFamily: SANS,
                          fontSize: '12.5px',
                          color: 'var(--text-muted)',
                          lineHeight: 1.65,
                        }}>
                          {body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Earned, not bought */}
                <div style={{
                  padding: '1rem 1.15rem',
                  borderRadius: '6px',
                  background: 'rgba(201, 168, 76, 0.04)',
                  border: '1px solid var(--color-border)',
                }}>
                  <p style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.75,
                    opacity: 0.78,
                  }}>
                    Unlockables are earned through writing—not purchased separately.
                  </p>
                </div>

              </div>

            </div>

          </div>
        </section>

        <SectionDivider />

        {/* ── TESTIMONIAL ──────────────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-secondary)]"
          style={{
            width: '100%',
            padding: '3.5rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="relative z-20" style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 'clamp(1.45rem, 2.6vw, 1.85rem)',
              color: 'var(--text-primary)',
              lineHeight: 1.62,
              maxWidth: '61rem',
              margin: '0 auto 1.75rem',
              opacity: 0.88,
              letterSpacing: '-0.01em',
            }}>
              &ldquo;Rune feels like it was designed by someone who actually writes novels.&rdquo;
            </p>
            <div style={{
              fontFamily: SANS,
              fontSize: '12px',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              opacity: 0.52,
            }}>
              — Early beta tester
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
          <div className="relative z-20" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <div
            style={{
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.26em',
              color: 'var(--color-gold)',
              textAlign: 'center',
              marginBottom: '2rem',
              opacity: 0.7,
            }}
          >
            PRICING
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textAlign: 'center',
              letterSpacing: '-0.01em',
              marginBottom: '0.85rem',
            }}
          >
            Simple pricing. Start writing for free.
          </h2>
          <p style={{ fontFamily: SANS, fontSize: '16px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.75, maxWidth: '480px', margin: '0 auto 2.5rem' }}>
            Begin your manuscript today. Upgrade only when you&apos;re ready to write without limits.
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
              <div style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Start your first manuscript.</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: SERIF, fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>$0</span>
                <span style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>/month</span>
              </div>

              <div style={{ height: '1px', background: 'var(--color-border)', margin: '1.5rem 0' }} />

              {['1 active project', '20,000 words', 'Core editor', 'Focus Mode', '1 Arena ticket / week'].map((f) => (
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
                Start Free
              </Link>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  marginTop: '0.65rem',
                  opacity: 0.55,
                  letterSpacing: '0.02em',
                }}
              >
                No credit card required.
              </div>
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
                Best for Novelists
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: 'var(--color-gold)', marginBottom: '0.35rem' }}>
                <Crown size={20} className="text-[var(--color-gold)]" aria-hidden />
                Scribe
              </div>
              <div style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>For writers ready to go all in.</div>

              <div style={{ opacity: priceVisible ? 1 : 0, transition: 'opacity 0.2s ease' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: SERIF, fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
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
                'Unlimited Arena access',
                'Goals, streaks & heatmaps',
                'All themes, fonts & avatars',
                'PDF manuscript exports',
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
                Unlock Scribe
              </Link>
            </div>
          </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-secondary)]"
          style={{
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle radial warmth behind the text */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(201, 168, 76, 0.04) 0%, transparent 72%)',
              pointerEvents: 'none',
            }}
          />

          <div className="relative z-20" style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>

            {/* Label */}
            <div
              style={{
                fontFamily: SANS,
                fontSize: '10px',
                letterSpacing: '0.38em',
                color: 'var(--color-gold)',
                marginBottom: '3rem',
                opacity: 0.6,
              }}
            >
              BEGIN
            </div>

            {/* Ornament */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '3.25rem',
              }}
              aria-hidden
            >
              <div style={{ width: '72px', height: '1px', background: 'var(--color-border-strong)', opacity: 0.55 }} />
              <span style={{ margin: '0 18px', color: 'var(--color-gold)', fontSize: '14px', opacity: 0.45 }}>✦</span>
              <div style={{ width: '72px', height: '1px', background: 'var(--color-border-strong)', opacity: 0.55 }} />
            </div>

            {/* Headline */}
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: 'clamp(2.4rem, 4.5vw, 3.8rem)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.18,
                letterSpacing: '-0.01em',
                marginBottom: '2rem',
              }}
            >
              Every finished novel begins with one page.
            </h2>

            {/* Supporting copy */}
            <p
              style={{
                fontFamily: SANS,
                fontSize: '17px',
                color: 'var(--text-muted)',
                lineHeight: 1.85,
                marginBottom: '3.5rem',
                opacity: 0.78,
              }}
            >
              Stop wrestling with blank documents. Write inside a workspace built to help you finish.
            </p>

            {/* Primary CTA */}
            <Link
              href="/signup"
              className="gold-btn"
              style={{
                display: 'inline-block',
                background: 'var(--color-gold)',
                color: '#1e1a16',
                fontFamily: SERIF,
                fontSize: '14px',
                letterSpacing: '0.09em',
                fontWeight: 600,
                padding: '15px 36px',
                borderRadius: '4px',
                border: 'none',
                textDecoration: 'none',
                transition: 'background 0.15s ease',
                marginBottom: '1.1rem',
              }}
            >
              Start Your Manuscript — Free
            </Link>

            {/* Reassurance */}
            <div
              style={{
                fontFamily: SANS,
                fontSize: '12px',
                color: 'var(--text-muted)',
                opacity: 0.45,
                letterSpacing: '0.02em',
              }}
            >
              No credit card required.
            </div>

          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
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
