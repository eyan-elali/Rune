"use client"

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  BookOpen,
  User,
  Users,
  Swords,
  Settings,
  LogOut,
  KanbanSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const THEME_CONFIGS = {
  parchment: {
    bgPrimary:    '#faf7f2',
    bgSidebar:    '#f0ebe0',
    bgEditor:     '#ffffff',
    textPrimary:  '#1e1a16',
    textMuted:    '#7a6f63',
    gold:         '#b8922a',
    border:       'rgba(139, 110, 60, 0.18)',
    borderStrong: 'rgba(139, 110, 60, 0.35)',
    name:         'Parchment',
  },
  candlelight: {
    bgPrimary:    '#1a1614',
    bgSidebar:    '#2c2420',
    bgEditor:     '#ede8db',
    textPrimary:  '#f5f0e8',
    textMuted:    '#6b6560',
    gold:         '#c9a84c',
    border:       'rgba(201, 168, 76, 0.2)',
    borderStrong: 'rgba(201, 168, 76, 0.4)',
    name:         'Candlelight',
  },
  obsidian: {
    bgPrimary:    '#060608',
    bgSidebar:    '#101018',
    bgEditor:     '#d0dde8',
    textPrimary:  '#e4eef4',
    textMuted:    '#6a7888',
    gold:         '#6eb0d4',
    border:       'rgba(110, 176, 212, 0.2)',
    borderStrong: 'rgba(110, 176, 212, 0.4)',
    name:         'Obsidian',
  },
} as const

type ThemeKey = keyof typeof THEME_CONFIGS

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

// Nav items matching real Sidebar.tsx NAV_LINKS + Arena in order
const MOCK_NAV: { label: string; active: boolean; icon: LucideIcon }[] = [
  { label: 'Dashboard',       active: true,  icon: LayoutDashboard },
  { label: 'Projects',        active: false, icon: BookOpen },
  { label: 'Profile & Stats', active: false, icon: User },
  { label: 'Arena',           active: false, icon: Swords },
]

export default function LandingPage() {
  const [activeTheme, setActiveTheme] = useState<ThemeKey>('parchment')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [priceVisible, setPriceVisible] = useState(true)

  const cfg = THEME_CONFIGS[activeTheme]

  function handleBilling(plan: 'monthly' | 'annual') {
    setPriceVisible(false)
    setTimeout(() => { setBilling(plan); setPriceVisible(true) }, 200)
  }

  // Always dark-on-light — works on all three editor surfaces (all are light/warm)
  const textLineColor = 'rgba(30, 26, 22, 0.12)'

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

        {/* ── SECTION 2: HERO ──────────────────────────────────────────── */}
        <section
          className="bg-[var(--bg-primary)]"
          style={{
            minHeight: 'calc(100vh - 56px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '4rem 1.5rem 6rem',
          }}
        >
          <div className="relative z-20 w-full">
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(2.2rem, 5vw, 4rem)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              maxWidth: '820px',
              margin: '0 auto 1.5rem',
              lineHeight: 1.15,
            }}
          >
            THE CREATIVE FORGE FOR SERIOUS AUTHORS
          </h1>

          <p
            style={{
              fontFamily: SANS,
              fontSize: 'clamp(1rem, 2vw, 1.2rem)',
              color: 'var(--text-muted)',
              maxWidth: '580px',
              margin: '0 auto 2.5rem',
              lineHeight: 1.7,
            }}
          >
            Stop writing in sterile office software. Command a canvas built from the ground up for deep focus, structured execution, and psychological momentum.
          </p>

          <Link
            href="/signup"
            className="gold-btn"
            style={{
              background: 'var(--color-gold)',
              color: '#1e1a16',
              fontFamily: SERIF,
              fontSize: '14px',
              letterSpacing: '0.1em',
              fontWeight: 600,
              padding: '14px 32px',
              borderRadius: '4px',
              border: 'none',
              textDecoration: 'none',
              display: 'inline-block',
              marginBottom: '4rem',
              transition: 'background 0.15s ease',
            }}
          >
            START YOUR MANUSCRIPT — FREE
          </Link>

          {/* ── INTERACTIVE THEME MOCKUP ── */}
          <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%' }}>
            {/* Tab row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
              {(Object.keys(THEME_CONFIGS) as ThemeKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveTheme(key)}
                  className={activeTheme === key ? 'landing-tab-active' : 'landing-tab-inactive'}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--text-muted)',
                    fontFamily: SANS,
                    fontSize: '12px',
                    letterSpacing: '0.08em',
                    padding: '6px 18px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {THEME_CONFIGS[key].name}
                </button>
              ))}
            </div>

            {/* Mockup frame — ALL colors from cfg, never CSS variables */}
            <div
              className="relative z-20 bg-[var(--surface-card)]"
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                border: `1px solid ${cfg.borderStrong}`,
                boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
                transition: 'border-color 0.3s ease',
              }}
            >
              {/* ── MOCK HEADER — replica of real Header.tsx ── */}
              <div
                style={{
                  height: '36px',
                  background: cfg.bgPrimary,
                  borderBottom: `1px solid ${cfg.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 14px',
                  flexShrink: 0,
                  transition: 'background-color 0.3s ease',
                }}
              >
                {/* Breadcrumb — matches real Header.tsx breadcrumb style */}
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '11px',
                    color: cfg.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'color 0.3s ease',
                  }}
                >
                  <span>Projects</span>
                  <span style={{ opacity: 0.5, fontSize: '9px' }}>›</span>
                  <span>The Obsidian Manuscript</span>
                </div>

                {/* Focus / Game mode toggle pill */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    border: `1px solid ${cfg.borderStrong}`,
                    borderRadius: '10px',
                    padding: '2px',
                    transition: 'border-color 0.3s ease',
                  }}
                >
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: '9px',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      color: cfg.textMuted,
                      transition: 'color 0.3s ease',
                    }}
                  >
                    Focus
                  </span>
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: '9px',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      color: cfg.textMuted,
                      transition: 'color 0.3s ease',
                    }}
                  >
                    Game
                  </span>
                </div>
              </div>

              {/* Mockup body */}
              <div style={{ display: 'flex', height: '380px' }}>

                {/* ── MOCK SIDEBAR — replica of real Sidebar.tsx ── */}
                <div
                  className="mockup-sidebar"
                  style={{
                    width: '200px',
                    background: cfg.bgSidebar,
                    borderRight: `1px solid ${cfg.border}`,
                    flexShrink: 0,
                    transition: 'background-color 0.3s ease',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Wordmark + collapse toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px 9px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: SERIF,
                        fontSize: '15px',
                        letterSpacing: '0.2em',
                        color: cfg.gold,
                        transition: 'color 0.3s ease',
                      }}
                    >
                      Rune
                    </span>
                    {/* Collapse toggle placeholder */}
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '3px',
                        background: `${cfg.gold}18`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ width: '6px', height: '1px', background: cfg.textMuted }} />
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ height: '1px', background: cfg.border, marginBottom: '0' }} />

                  {/* User identity section */}
                  <div
                    style={{
                      padding: '9px 14px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {/* Avatar circle — 22px, matching real sidebar avatar */}
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: `${cfg.gold}33`,
                        border: `1px solid ${cfg.gold}66`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.3s ease',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: SERIF,
                          fontSize: '10px',
                          color: cfg.gold,
                          lineHeight: 1,
                          transition: 'color 0.3s ease',
                        }}
                      >
                        R
                      </span>
                    </div>
                    {/* Display name + username */}
                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: SERIF,
                          fontSize: '11px',
                          color: cfg.textPrimary,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                          transition: 'color 0.3s ease',
                        }}
                      >
                        Scholar
                      </div>
                      <div
                        style={{
                          fontFamily: SANS,
                          fontSize: '9px',
                          color: cfg.textMuted,
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3,
                          transition: 'color 0.3s ease',
                        }}
                      >
                        @scholar
                      </div>
                    </div>
                  </div>

                  {/* Mini XP bar */}
                  <div
                    style={{
                      margin: '8px 14px 0',
                      height: '3px',
                      background: `${cfg.gold}22`,
                      borderRadius: '2px',
                      overflow: 'hidden',
                      transition: 'background-color 0.3s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '65%',
                        height: '100%',
                        background: cfg.gold,
                        opacity: 0.5,
                        transition: 'background-color 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Divider */}
                  <div style={{ height: '1px', background: cfg.border, margin: '10px 0 3px' }} />

                  {/* Primary nav — matching NAV_LINKS + Arena from real Sidebar.tsx */}
                  <nav style={{ flex: 1, padding: '2px 6px', overflow: 'hidden' }}>
                    {MOCK_NAV.map((item) => {
                      const NavIcon = item.icon
                      return (
                      <div
                        key={item.label}
                        style={{
                          height: '27px',
                          borderRadius: '0 4px 4px 0',
                          padding: '0 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '2px',
                          background: item.active ? `${cfg.gold}18` : 'transparent',
                          borderLeft: item.active ? `2px solid ${cfg.gold}` : '2px solid transparent',
                          transition: 'background-color 0.3s ease',
                        }}
                      >
                        <NavIcon
                          size={14}
                          className="mr-2.5 shrink-0"
                          style={{
                            color: item.active ? cfg.gold : cfg.textPrimary,
                            transition: 'color 0.3s ease',
                          }}
                          aria-hidden
                        />
                        <span
                          style={{
                            fontFamily: SANS,
                            fontSize: '11px',
                            color: item.active ? cfg.gold : cfg.textPrimary,
                            opacity: item.active ? 1 : 0.75,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            transition: 'color 0.3s ease',
                          }}
                        >
                          {item.label}
                        </span>
                      </div>
                    )})}
                  </nav>

                  {/* Bottom section — settings + sign out */}
                  <div>
                    <div style={{ height: '1px', background: cfg.border }} />
                    <div style={{ padding: '4px 6px 8px' }}>
                      {/* Settings row */}
                      <div
                        style={{
                          height: '27px',
                          borderRadius: '0 4px 4px 0',
                          padding: '0 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderLeft: '2px solid transparent',
                          marginBottom: '2px',
                        }}
                      >
                        <Settings
                          size={14}
                          className="mr-2.5 shrink-0"
                          style={{ color: cfg.textMuted, transition: 'color 0.3s ease' }}
                          aria-hidden
                        />
                        <span
                          style={{
                            fontFamily: SANS,
                            fontSize: '11px',
                            color: cfg.textMuted,
                            transition: 'color 0.3s ease',
                          }}
                        >
                          Settings
                        </span>
                      </div>
                      {/* Sign out row */}
                      <div
                        style={{
                          height: '27px',
                          borderRadius: '0 4px 4px 0',
                          padding: '0 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderLeft: '2px solid transparent',
                        }}
                      >
                        <LogOut
                          size={14}
                          className="mr-2.5 shrink-0"
                          style={{ color: cfg.textMuted, transition: 'color 0.3s ease' }}
                          aria-hidden
                        />
                        <span
                          style={{
                            fontFamily: SANS,
                            fontSize: '11px',
                            color: cfg.textMuted,
                            opacity: 0.6,
                            transition: 'color 0.3s ease',
                          }}
                        >
                          Sign out
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Editor panel */}
                <div
                  style={{
                    flex: 1,
                    background: cfg.bgEditor,
                    padding: '20px 28px',
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'background-color 0.3s ease',
                  }}
                >
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: '13px',
                      color: cfg.textMuted,
                      marginBottom: '16px',
                      transition: 'color 0.3s ease',
                    }}
                  >
                    Chapter I — The Arrival
                  </div>

                  {[100, 88, 95, 72].map((w, i) => (
                    <div
                      key={`a${i}`}
                      style={{
                        height: '10px',
                        borderRadius: '2px',
                        background: textLineColor,
                        width: `${w}%`,
                        marginBottom: '8px',
                      }}
                    />
                  ))}

                  <div style={{ height: '16px' }} />

                  {[100, 91].map((w, i) => (
                    <div
                      key={`b${i}`}
                      style={{
                        height: '10px',
                        borderRadius: '2px',
                        background: textLineColor,
                        width: `${w}%`,
                        marginBottom: '8px',
                      }}
                    />
                  ))}

                  {/* Last line + blinking cursor */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        height: '10px',
                        borderRadius: '2px',
                        background: textLineColor,
                        width: '60%',
                      }}
                    />
                    <div
                      className="landing-cursor"
                      style={{
                        width: '2px',
                        height: '14px',
                        background: cfg.gold,
                        display: 'inline-block',
                        marginLeft: '4px',
                        transition: 'background-color 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Word count pill */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      fontSize: '10px',
                      fontFamily: SANS,
                      color: cfg.textMuted,
                      border: `1px solid ${cfg.border}`,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      transition: 'color 0.3s ease, border-color 0.3s ease',
                    }}
                  >
                    1,247 words
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── SECTION 3: PROFESSIONAL NOVELIST SUITE ───────────────────── */}
        <section
          className="bg-[var(--bg-secondary)]"
          style={{
            width: '100%',
            padding: '7rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
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
              marginBottom: '1rem',
            }}
          >
            Engineered for the Long-Form Novelist
          </h2>
          <p style={{ fontFamily: SANS, fontSize: '16px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4rem' }}>
            Every tool a serious author needs. Nothing a hobbyist would recognize.
          </p>

          <div
            className="feature-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1.5rem',
              maxWidth: '1000px',
              margin: '0 auto',
            }}
          >
            {/* Card 1 — Heatmap */}
            <div className="feature-card relative z-20 bg-[var(--surface-card)]" style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem', transition: 'border-color 0.2s ease' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 7px)',
                  gridTemplateRows: 'repeat(7, 7px)',
                  gap: '2px',
                  marginBottom: '1.25rem',
                }}
                aria-hidden
              >
                {HEATMAP_FILLED.map((filled, i) => (
                  <div
                    key={i}
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '1px',
                      background: 'var(--color-gold)',
                      opacity: filled ? 1 : 0.15,
                    }}
                  />
                ))}
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: '17px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
                Writing Consistency Heatmap
              </h3>
              <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                A GitHub-style contribution map tracks every word across every session. See your momentum at a glance. Identify your patterns. Never lose a streak again.
              </p>
            </div>

            {/* Card 2 — Plot & Task Manager (no Scribe badge) */}
            <div className="feature-card relative z-20 bg-[var(--surface-card)]" style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem', transition: 'border-color 0.2s ease' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1.25rem' }} aria-hidden>
                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-gold)', width: '24px' }} />
                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-gold)', width: '18px' }} />
                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-gold)', width: '20px' }} />
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: '17px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
                 Task Manager
              </h3>
              <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
              Command the entire scope of your manuscript from a centralized operational hub. Track high-level scene criteria, character arcs, and overarching plot requirements across all chapters before you step foot in the editor. Plan the work, then execute without distraction.
              </p>
            </div>

            {/* Card 3 — Goals & Streaks */}
            <div className="feature-card relative z-20 bg-[var(--surface-card)]" style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '2rem', transition: 'border-color 0.2s ease' }}>
              <div style={{ marginBottom: '1.25rem' }} aria-hidden>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
                  <path d="M 20 5 A 15 15 0 1 1 5 20" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: '17px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
                Manuscript Goals &amp; Daily Streaks
              </h3>
              <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                Set a total word count target for your manuscript. Track daily streaks. Watch the heatmap fill. The system rewards consistency — not inspiration.
              </p>
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

              <KanbanSquare size={24} className="text-[var(--color-gold)] opacity-70 mb-4" aria-hidden />

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

              <div style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: 'var(--color-gold)', marginBottom: '0.35rem' }}>Scribe</div>
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
