import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rune — Write more. Fear less.",
  description:
    "A gamified, distraction-free writing environment for writers who struggle to start. Focus Mode, Battle Mode, Race Mode. Your words are waiting.",
  openGraph: {
    title: "Rune — Write more. Fear less.",
    description:
      "A gamified, distraction-free writing environment. Focus Mode. Battle Mode. Race Mode.",
    type: "website",
  },
};

type TierFeature = { label: string; included: boolean };

type Tier = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: TierFeature[];
  cta: string;
  href: string;
  highlighted: boolean;
};

type SubFeature = { icon: string; name: string; desc: string };

type Feature = {
  glyph: string;
  name: string;
  description: string;
  subFeatures?: SubFeature[];
  comingSoon?: boolean;
};

const FEATURES: Feature[] = [
  {
    glyph: "◈",
    name: "Focus Mode",
    description:
      "The pristine, distraction-free writing canvas. Strip away every distraction — full-screen with nothing but your words and a gentle candlelight vignette.",
  },
  {
    glyph: "⚔",
    name: "Game Mode",
    description: "Write against the clock. Outrun the pressure.",
    subFeatures: [
      {
        icon: "⚔",
        name: "Battles",
        desc: "Face enemies like The Deadline. Type to deal damage. Stop and take it.",
      },
      {
        icon: "◎",
        name: "Races",
        desc: "Set a timer. Beat your personal word-count record. Every session rewrites your limits.",
      },
    ],
  },
  {
    glyph: "◉",
    name: "Multiplayer 1v1",
    description:
      "Compete against another writer in real time. Split-time matches where every word is a move and silence is surrender.",
    comingSoon: true,
  },
];

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Start your practice.",
    features: [
      { label: "1 project max", included: true },
      { label: "20,000 w max", included: true },
      { label: "1 game ticket per week", included: true },
      { label: "Full Editor & auto-save", included: true },
      { label: "Focus Mode", included: false },
      { label: "XP & level progression", included: false },
      { label: "Ad-Free Experience", included: false },
      { label: "Game Mode (Battles & Races)", included: false },
      { label: "Exclusive Unlockables", included: false },
      { label: "Multiplayer Launch Access", included: false },
    ],
    cta: "Start Writing Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Scribe",
    price: "$5",
    period: "/mo",
    description: "For writers who show up.",
    features: [
      { label: "Unlimited projects", included: true },
      { label: "Unlimited words", included: true },
      { label: "1 game ticket per week", included: true },
      { label: "Full Editor & auto-save", included: true },
      { label: "Focus Mode", included: true },
      { label: "XP & level progression", included: true },
      { label: "Ad-Free Experience", included: true },
      { label: "Game Mode (Battles & Races)", included: false },
      { label: "Exclusive Unlockables", included: false },
      { label: "Multiplayer Launch Access", included: false },
    ],
    cta: "Become a Scribe",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Arcane",
    price: "$12",
    period: "/mo",
    description: "For the devoted.",
    features: [
      { label: "Unlimited projects", included: true },
      { label: "Unlimited words", included: true },
      { label: "Unlimited game tickets", included: true },
      { label: "Full Editor & auto-save", included: true },
      { label: "Focus Mode", included: true },
      { label: "XP & level progression", included: true },
      { label: "Ad-Free Experience", included: true },
      { label: "Game Mode (Battles & Races)", included: true },
      { label: "Exclusive Unlockables", included: true },
      { label: "Multiplayer Launch Access", included: true },
    ],
    cta: "Unlock the Arcane",
    href: "/signup",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div
      className="scroll-smooth flex min-h-screen flex-col"
      style={{ background: "var(--color-ink)", color: "var(--color-parchment)" }}
    >
      {/* ── Nav ──────────────────────────────────────────── */}
      <nav
        className="px-8 py-5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <span
            className="select-none font-rune-serif text-2xl text-rune-gold"
            style={{ letterSpacing: "0.25em" }}
          >
            Rune
          </span>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm transition-colors hover:text-rune-gold"
              style={{ color: "var(--color-mist)" }}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded px-5 py-2 text-sm font-medium transition-all duration-150 hover:opacity-90"
              style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="flex flex-col items-center px-8 py-24 text-center md:py-32 lg:py-40"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(44,36,32,0.9) 0%, var(--color-ink) 68%)",
        }}
      >
        <div className="mx-auto w-full max-w-7xl">
          <p
            className="mb-7 text-[10px] uppercase tracking-[0.45em]"
            style={{ color: "var(--color-gold)", opacity: 0.65 }}
          >
            ✦ &nbsp;For writers who want to actually write&nbsp; ✦
          </p>

          <h1
            className="mb-7 font-rune-serif leading-none"
            style={{
              fontSize: "clamp(4.5rem, 13vw, 10rem)",
              color: "var(--color-parchment)",
              letterSpacing: "0.06em",
            }}
          >
            Rune
          </h1>

          <p
            className="mb-14 font-rune-serif text-xl italic"
            style={{ color: "var(--color-mist)", letterSpacing: "0.1em" }}
          >
            Write more. Fear less.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded px-8 py-3.5 text-sm font-medium transition-all duration-150 hover:-translate-y-px hover:opacity-90"
              style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
            >
              Start Writing Free
            </Link>
            <a
              href="#features"
              className="rounded border px-8 py-3.5 text-sm transition-all duration-150 hover:bg-white/5"
              style={{
                borderColor: "var(--color-border-strong)",
                color: "var(--color-parchment)",
              }}
            >
              See How It Works
            </a>
          </div>
        </div>

        <div
          className="mt-24 h-px w-20"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
          }}
          aria-hidden
        />
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section id="features" className="py-16 md:py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-8">
          <p
            className="mb-16 text-center text-[10px] uppercase tracking-[0.4em]"
            style={{ color: "var(--color-mist)", opacity: 0.45 }}
          >
            Three ways to write
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.name}
                className="relative flex flex-col rounded-lg p-8"
                style={{
                  background: "var(--color-sepia)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {feature.comingSoon && (
                  <span
                    className="absolute right-4 top-4 rounded px-2.5 py-1 text-[9px] uppercase tracking-[0.3em]"
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      color: "var(--color-gold)",
                      border: "1px solid rgba(201,168,76,0.22)",
                      opacity: 0.8,
                    }}
                  >
                    ✦ Coming Soon
                  </span>
                )}
                <span
                  className="mb-5 block text-3xl"
                  style={{ color: "var(--color-gold)" }}
                  aria-hidden
                >
                  {feature.glyph}
                </span>
                <h3
                  className="mb-3 font-rune-serif text-xl"
                  style={{ color: "var(--color-parchment)" }}
                >
                  {feature.name}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-mist)" }}
                >
                  {feature.description}
                </p>
                {feature.subFeatures && (
                  <ul
                    className="mt-5 flex flex-col gap-3 border-t pt-5"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {feature.subFeatures.map((sub) => (
                      <li key={sub.name} className="flex items-start gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-sm"
                          style={{ color: "var(--color-gold)", opacity: 0.65 }}
                          aria-hidden
                        >
                          {sub.icon}
                        </span>
                        <div>
                          <p
                            className="mb-0.5 text-sm font-medium"
                            style={{ color: "var(--color-parchment)" }}
                          >
                            {sub.name}
                          </p>
                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: "var(--color-mist)", opacity: 0.75 }}
                          >
                            {sub.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section
        id="pricing"
        className="py-16 md:py-24 lg:py-32"
        style={{ background: "var(--color-sepia)" }}
      >
        <div className="mx-auto w-full max-w-7xl px-8">
          <div className="relative z-10 mb-16 text-center">
            <p
              className="mb-4 text-[10px] uppercase tracking-[0.4em]"
              style={{ color: "var(--color-mist)", opacity: 0.45 }}
            >
              Choose your path
            </p>
            <h2
              className="font-rune-serif text-3xl"
              style={{ color: "var(--color-parchment)" }}
            >
              Simple, honest pricing
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {TIERS.map((tier) => {
              const isArcane = tier.name === "Arcane";
              return (
                <div
                  key={tier.name}
                  className={isArcane ? "relative" : undefined}
                  style={isArcane ? { isolation: "isolate" } : undefined}
                >
                  {isArcane && (
                    <div
                      className="pointer-events-none absolute inset-0 rounded-lg blur-xl"
                      style={{
                        background: "var(--color-gold)",
                        opacity: 0.14,
                        zIndex: -1,
                      }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="flex flex-col rounded-lg"
                    style={{
                      background: tier.highlighted
                        ? "var(--color-gold)"
                        : "var(--color-ink)",
                      border: isArcane
                        ? "1px solid rgba(201,168,76,0.48)"
                        : `1px solid ${
                            tier.highlighted
                              ? "var(--color-gold)"
                              : "var(--color-border)"
                          }`,
                      transform: tier.highlighted
                        ? "scale(1.04)"
                        : isArcane
                        ? "scale(1.05)"
                        : undefined,
                      boxShadow: tier.highlighted
                        ? "0 8px 40px rgba(201, 168, 76, 0.18)"
                        : isArcane
                        ? "0 4px 32px rgba(201,168,76,0.07), inset 0 1px 0 rgba(201,168,76,0.12)"
                        : undefined,
                    }}
                  >
                    <div className="flex-1 p-7">
                      <h3
                        className="mb-0.5 font-rune-serif text-lg"
                        style={{
                          color: tier.highlighted
                            ? "var(--color-ink)"
                            : "var(--color-parchment)",
                        }}
                      >
                        {tier.name}
                      </h3>
                      <p
                        className="mb-5 text-xs"
                        style={{
                          color: tier.highlighted
                            ? "rgba(26,22,20,0.6)"
                            : "var(--color-mist)",
                        }}
                      >
                        {tier.description}
                      </p>

                      <div className="mb-6 flex items-baseline gap-0.5">
                        <span
                          className="font-rune-serif text-4xl"
                          style={{
                            color: tier.highlighted
                              ? "var(--color-ink)"
                              : "var(--color-parchment)",
                          }}
                        >
                          {tier.price}
                        </span>
                        {tier.period && (
                          <span
                            className="text-sm"
                            style={{
                              color: tier.highlighted
                                ? "rgba(26,22,20,0.55)"
                                : "var(--color-mist)",
                            }}
                          >
                            {tier.period}
                          </span>
                        )}
                      </div>

                      <ul className="flex flex-col gap-2.5">
                        {tier.features.map((feature) => {
                          const isGameModeRow =
                            isArcane &&
                            feature.included &&
                            feature.label === "Game Mode (Battles & Races)";
                          return (
                            <li
                              key={feature.label}
                              className="flex items-start gap-2.5 text-sm"
                              style={{ opacity: feature.included ? 1 : 0.35 }}
                            >
                              <span
                                className="mt-px shrink-0"
                                style={{
                                  color: feature.included
                                    ? tier.highlighted
                                      ? "var(--color-ink)"
                                      : "var(--color-gold)"
                                    : tier.highlighted
                                    ? "var(--color-ink)"
                                    : "var(--color-crimson)",
                                  opacity: feature.included ? 0.85 : 1,
                                }}
                                aria-hidden
                              >
                                {feature.included ? "✓" : "✕"}
                              </span>
                              <span
                                style={{
                                  color: isGameModeRow
                                    ? "var(--color-gold)"
                                    : tier.highlighted
                                    ? "rgba(26,22,20,0.8)"
                                    : "var(--color-mist)",
                                  fontWeight: isGameModeRow ? 500 : undefined,
                                  letterSpacing: isGameModeRow
                                    ? "0.01em"
                                    : undefined,
                                }}
                              >
                                {feature.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="p-7 pt-0">
                      <Link
                        href={tier.href}
                        className="block rounded px-5 py-2.5 text-center text-sm font-medium transition-all duration-150 hover:opacity-90"
                        style={
                          tier.highlighted
                            ? {
                                background: "var(--color-ink)",
                                color: "var(--color-gold)",
                              }
                            : {
                                background: "var(--color-gold)",
                                color: "var(--color-ink)",
                              }
                        }
                      >
                        {tier.cta}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer
        className="px-8 py-14"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 text-center">
          <span
            className="select-none font-rune-serif text-xl text-rune-gold"
            style={{ letterSpacing: "0.2em" }}
          >
            Rune
          </span>
          <p
            className="font-rune-serif italic"
            style={{ color: "var(--color-mist)", fontSize: "0.9rem" }}
          >
            Built for writers who want to actually write.
          </p>
          <div
            className="flex gap-6 text-xs"
            style={{ color: "var(--color-mist)", opacity: 0.4 }}
          >
            <Link href="/login" className="transition-opacity hover:opacity-100">
              Sign in
            </Link>
            <Link href="/signup" className="transition-opacity hover:opacity-100">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
