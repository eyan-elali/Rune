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

const FEATURES = [
  {
    glyph: "✦",
    name: "Focus Mode",
    description:
      "Strip away every distraction. Full-screen writing with nothing but your words and a gentle candlelight vignette.",
  },
  {
    glyph: "⚔",
    name: "Battle Mode",
    description:
      "Face the Blank Page, Writer's Block, or the Deadline. Type to deal damage. Stop typing and take it.",
  },
  {
    glyph: "◎",
    name: "Race Mode",
    description:
      "Set a timer. Beat your personal word-count record. Every session is a chance to rewrite your limits.",
  },
];

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Start your practice.",
    features: [
      "1 project",
      "1 game ticket / week",
      "Focus Mode",
      "Full editor & auto-save",
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
      "Unlimited projects",
      "3 game tickets / week",
      "All game modes",
      "XP & level progression",
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
      "Everything in Scribe",
      "Unlimited game tickets",
      "Early multiplayer access",
      "Exclusive unlockable themes",
    ],
    cta: "Unlock the Arcane",
    href: "/signup",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--color-ink)", color: "var(--color-parchment)" }}
    >
      {/* ── Nav ──────────────────────────────────────────── */}
      <nav
        className="flex items-center justify-between px-8 py-5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
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
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="flex flex-col items-center px-8 py-32 text-center"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(44,36,32,0.9) 0%, var(--color-ink) 68%)",
        }}
      >
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
      <section id="features" className="mx-auto w-full max-w-5xl px-8 py-24">
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
              className="flex flex-col rounded-lg p-8"
              style={{
                background: "var(--color-sepia)",
                border: "1px solid var(--color-border)",
              }}
            >
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
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section
        id="pricing"
        className="w-full px-8 py-24"
        style={{ background: "var(--color-sepia)" }}
      >
        <p
          className="mb-4 text-center text-[10px] uppercase tracking-[0.4em]"
          style={{ color: "var(--color-mist)", opacity: 0.45 }}
        >
          Choose your path
        </p>
        <h2
          className="mb-16 text-center font-rune-serif text-3xl"
          style={{ color: "var(--color-parchment)" }}
        >
          Simple, honest pricing
        </h2>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col rounded-lg"
              style={{
                background: tier.highlighted
                  ? "var(--color-gold)"
                  : "var(--color-ink)",
                border: `1px solid ${
                  tier.highlighted
                    ? "var(--color-gold)"
                    : "var(--color-border)"
                }`,
                transform: tier.highlighted ? "scale(1.04)" : undefined,
                boxShadow: tier.highlighted
                  ? "0 8px 40px rgba(201, 168, 76, 0.18)"
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
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <span
                        className="mt-px shrink-0"
                        style={{
                          color: tier.highlighted
                            ? "var(--color-ink)"
                            : "var(--color-gold)",
                          opacity: 0.85,
                        }}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span
                        style={{
                          color: tier.highlighted
                            ? "rgba(26,22,20,0.8)"
                            : "var(--color-mist)",
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
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
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer
        className="flex flex-col items-center gap-5 px-8 py-14 text-center"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
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
      </footer>
    </div>
  );
}
