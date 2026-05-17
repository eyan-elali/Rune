import Link from "next/link";
import type { Metadata } from "next";
import BackgroundPattern from "@/components/landing/BackgroundPattern";
import SectionDivider from "@/components/landing/SectionDivider";

export const metadata: Metadata = {
  title: "Rune — The manuscript is waiting.",
  description:
    "A gamified, distraction-free writing environment for writers who struggle to sit down. Focus Mode, Battle Mode, Race Mode. Your words are waiting.",
  openGraph: {
    title: "Rune — The manuscript is waiting.",
    description:
      "A gamified, distraction-free writing environment. Focus Mode. Battle Mode. Race Mode.",
    type: "website",
  },
};

/* ─── Focus Mode Mockup ──────────────────────────────────────────────────── */
function FocusMockup() {
  return (
    <div
      role="img"
      aria-label="Preview of Rune's Focus Mode: a dark writing canvas with only a centered text column"
      className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(201,168,76,0.15)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          background: "rgba(44,36,32,0.97)",
          borderBottom: "1px solid rgba(201,168,76,0.1)",
        }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(139,46,46,0.8)" }}
          aria-hidden
        />
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(138,111,46,0.8)" }}
          aria-hidden
        />
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(74,103,65,0.8)" }}
          aria-hidden
        />
        <div
          className="mx-auto max-w-[210px] flex-1 rounded-sm px-3 py-0.5 text-center"
          style={{
            background: "rgba(201,168,76,0.05)",
            border: "1px solid rgba(201,168,76,0.09)",
            color: "var(--color-mist)",
            fontSize: "0.62rem",
            letterSpacing: "0.01em",
          }}
        >
          rune.app/projects/the-novel
        </div>
      </div>

      {/* Writing canvas */}
      <div
        className="relative px-8 py-16 sm:px-16"
        style={{
          background: "var(--color-sepia)",
          backgroundImage:
            "radial-gradient(ellipse at 50% 50%, var(--color-sepia) 30%, rgba(0,0,0,0.85) 100%)",
          minHeight: "300px",
        }}
      >
        {/* Vignette */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.72) 100%)",
          }}
          aria-hidden
        />

        {/* Text column */}
        <div className="relative mx-auto max-w-[460px]">
          <p
            className="font-rune-serif leading-loose"
            style={{
              color: "var(--color-parchment)",
              fontSize: "1.05rem",
              opacity: 0.88,
              letterSpacing: "-0.01em",
            }}
          >
            She had been walking for three days when the forest finally ended.
            The road ahead was unpaved and smelled of rain. She did not know
            what came next. Neither, she realized, did the story.
          </p>
          <p
            className="mt-6 font-rune-serif leading-loose"
            style={{
              color: "var(--color-parchment)",
              fontSize: "1.05rem",
              opacity: 0.88,
              letterSpacing: "-0.01em",
            }}
          >
            She knelt and touched the mud.{" "}
            <span
              className="inline-block h-[1.1em] w-0.5 translate-y-[0.15em] animate-pulse"
              style={{ background: "var(--color-gold)" }}
              aria-hidden
            />
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Battle HUD Mockup ──────────────────────────────────────────────────── */
function BattleMockup() {
  return (
    <div
      role="img"
      aria-label="Preview of Rune's Battle Mode: enemy HP bar, player HP bar, and writing area below"
      className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(139,46,46,0.3)",
        boxShadow:
          "0 40px 100px rgba(0,0,0,0.65), 0 0 80px rgba(139,46,46,0.07)",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          background: "rgba(44,36,32,0.97)",
          borderBottom: "1px solid rgba(139,46,46,0.18)",
        }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(139,46,46,0.85)" }}
          aria-hidden
        />
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(138,111,46,0.8)" }}
          aria-hidden
        />
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "rgba(74,103,65,0.8)" }}
          aria-hidden
        />
        <div
          className="mx-auto max-w-[210px] flex-1 rounded-sm px-3 py-0.5 text-center"
          style={{
            background: "rgba(139,46,46,0.06)",
            border: "1px solid rgba(139,46,46,0.12)",
            color: "rgba(139,46,46,0.65)",
            fontSize: "0.62rem",
            letterSpacing: "0.01em",
          }}
        >
          rune.app/games/battle
        </div>
      </div>

      {/* Enemy section */}
      <div
        className="px-6 pb-4 pt-5"
        style={{
          background: "var(--color-ink)",
          borderBottom: "1px solid rgba(139,46,46,0.16)",
        }}
      >
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p
              className="mb-0.5 uppercase"
              style={{
                color: "var(--color-crimson)",
                fontSize: "0.6rem",
                letterSpacing: "0.22em",
              }}
            >
              Enemy
            </p>
            <p
              className="font-rune-serif text-base"
              style={{ color: "var(--color-parchment)" }}
            >
              The Deadline
            </p>
          </div>
          <span
            className="font-rune-serif tabular-nums text-sm"
            style={{ color: "var(--color-crimson)" }}
          >
            847 / 1200 HP
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(139,46,46,0.14)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "70.5%", background: "var(--color-crimson)" }}
          />
        </div>
      </div>

      {/* Player section */}
      <div
        className="px-6 py-4"
        style={{
          background: "var(--color-ink)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p
              className="mb-0.5 uppercase"
              style={{
                color: "var(--color-gold)",
                fontSize: "0.6rem",
                letterSpacing: "0.22em",
                opacity: 0.65,
              }}
            >
              You
            </p>
            <p
              className="font-rune-serif text-base"
              style={{ color: "var(--color-parchment)" }}
            >
              The Writer
            </p>
          </div>
          <span
            className="font-rune-serif tabular-nums text-sm"
            style={{ color: "var(--color-gold)" }}
          >
            178 / 200 HP
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(201,168,76,0.1)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "89%", background: "var(--color-gold)" }}
          />
        </div>
      </div>

      {/* Timer bar */}
      <div
        className="flex items-center justify-between px-6 py-2.5 text-xs"
        style={{
          background: "var(--color-ink)",
          borderBottom: "1px solid var(--color-border)",
          color: "var(--color-mist)",
        }}
      >
        <span>⏱ 14:32 remaining</span>
        <span style={{ color: "var(--color-gold)", opacity: 0.8 }}>
          247 words written
        </span>
      </div>

      {/* Writing area */}
      <div
        className="min-h-[120px] px-6 py-6"
        style={{ background: "rgba(26,22,20,0.6)" }}
      >
        <p
          className="font-rune-serif leading-loose"
          style={{
            color: "var(--color-parchment)",
            fontSize: "1rem",
            opacity: 0.8,
          }}
        >
          The letter lay unopened on the desk for six days. On the seventh she
          burned it.{" "}
          <span
            className="inline-block h-[1em] w-0.5 translate-y-[0.12em] animate-pulse"
            style={{ background: "var(--color-crimson)" }}
            aria-hidden
          />
        </p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div
      className="relative min-h-screen scroll-smooth"
      style={{ background: "var(--color-ink)", color: "var(--color-parchment)" }}
    >
      <BackgroundPattern />

      {/* All page content sits above the pattern layer */}
      <div className="relative z-10">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 px-6 py-4 sm:px-10"
        style={{
          background: "rgba(45,41,38,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <span
            className="select-none font-rune-serif text-xl"
            style={{ color: "var(--color-gold)", letterSpacing: "0.28em" }}
          >
            Rune
          </span>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-sm transition-colors duration-150"
              style={{ color: "var(--color-mist)" }}
              aria-label="Sign in to Rune"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded px-5 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
              style={{
                background: "var(--color-gold)",
                color: "var(--color-ink)",
              }}
              aria-label="Start writing free"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── 1. The Opening ──────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center px-6 py-36 text-center sm:px-10 sm:py-44 lg:py-56"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, rgba(44,36,32,1) 0%, var(--color-ink) 62%)",
        }}
      >
        {/* Top ornament */}
        <div
          className="mb-12 h-px w-14"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-gold), transparent)",
            opacity: 0.6,
          }}
          aria-hidden
        />

        <h1
          className="font-rune-serif leading-none"
          style={{
            fontSize: "clamp(5rem, 15vw, 11rem)",
            color: "var(--color-parchment)",
            letterSpacing: "0.07em",
          }}
        >
          Rune
        </h1>

        <p
          className="mx-auto mb-6 mt-9 max-w-lg font-rune-serif italic"
          style={{
            fontSize: "clamp(1.05rem, 2.5vw, 1.35rem)",
            color: "var(--color-mist)",
            lineHeight: 1.75,
          }}
        >
          The manuscript has been sitting there for three weeks.
          <br className="hidden sm:block" />
          You know the one.
        </p>

        <p
          className="mb-12 max-w-sm text-sm leading-loose"
          style={{ color: "var(--color-mist)", opacity: 0.5 }}
        >
          Rune is a writing environment that takes the problem of sitting down
          seriously.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded px-9 py-3.5 text-sm font-medium transition-all duration-150 hover:-translate-y-px hover:opacity-90"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
            }}
          >
            Begin Writing Free
          </Link>
          <a
            href="#sanctuary"
            className="rounded px-9 py-3.5 text-sm transition-all duration-150 hover:bg-white/5"
            style={{
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-parchment)",
            }}
          >
            See How It Works
          </a>
        </div>

        {/* Bottom ornament */}
        <div
          className="mt-24 h-px w-14"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
          }}
          aria-hidden
        />
      </section>

      <SectionDivider />

      {/* ── 2. The Sanctuary — Focus Mode ──────────────────────────────── */}
      <section
        id="sanctuary"
        className="px-6 py-28 sm:px-10 md:py-40"
        style={{ background: "var(--color-sepia)" }}
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-16 max-w-xl">
            <p
              className="mb-4 uppercase"
              style={{
                color: "var(--color-gold)",
                fontSize: "0.62rem",
                letterSpacing: "0.4em",
                opacity: 0.7,
              }}
            >
              Focus Mode
            </p>
            <h2
              className="mb-6 font-rune-serif leading-tight"
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
                color: "var(--color-parchment)",
              }}
            >
              The Sanctuary
            </h2>
            <p
              className="mb-6 font-rune-serif italic text-lg"
              style={{ color: "var(--color-mist)" }}
            >
              Some rooms are for thinking. This one is for writing.
            </p>
            <div
              className="space-y-4 text-sm leading-loose"
              style={{ color: "var(--color-mist)" }}
            >
              <p>
                Every time you context-switch — a notification, a toolbar you
                don&apos;t need, a file list reminding you of the chapters you
                haven&apos;t written yet — you lose the thread. Not the 30 seconds
                it takes to dismiss it. The thread. The interior logic of the
                sentence you were building. That costs you{" "}
                <em style={{ color: "var(--color-parchment)" }}>pages</em>, not
                minutes.
              </p>
              <p>
                Focus Mode removes everything. The sidebar is gone. The header is
                gone. The page list, the navigation, the entire application
                chrome: gone. What remains is a single text column, a vignette
                that softens the edges of the screen, and your words. The cursor
                blinks. You write.
              </p>
              <p>
                Press{" "}
                <kbd
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{
                    background: "rgba(201,168,76,0.07)",
                    border: "1px solid rgba(201,168,76,0.22)",
                    color: "var(--color-gold)",
                    fontFamily: "monospace",
                  }}
                >
                  ⌘⇧F
                </kbd>{" "}
                to enter. Press{" "}
                <kbd
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{
                    background: "rgba(201,168,76,0.07)",
                    border: "1px solid rgba(201,168,76,0.22)",
                    color: "var(--color-gold)",
                    fontFamily: "monospace",
                  }}
                >
                  Esc
                </kbd>{" "}
                when you&apos;re done. Everything else can wait.
              </p>
            </div>
          </div>

          <FocusMockup />
        </div>
      </section>

      <SectionDivider />

      {/* ── 3. The Arena — Game Mode ────────────────────────────────────── */}
      <section
        id="arena"
        className="px-6 py-28 sm:px-10 md:py-40"
        style={{ background: "var(--color-ink)" }}
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-16 max-w-xl">
            <p
              className="mb-4 uppercase"
              style={{
                color: "var(--color-crimson)",
                fontSize: "0.62rem",
                letterSpacing: "0.4em",
                opacity: 0.85,
              }}
            >
              Game Mode
            </p>
            <h2
              className="mb-6 font-rune-serif leading-tight"
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
                color: "var(--color-parchment)",
              }}
            >
              The Arena
            </h2>
            <p
              className="mb-6 font-rune-serif italic text-lg"
              style={{ color: "var(--color-mist)" }}
            >
              Willpower is unreliable. Urgency is not.
            </p>
            <div
              className="space-y-4 text-sm leading-loose"
              style={{ color: "var(--color-mist)" }}
            >
              <p>
                Writer&apos;s block is not a creative problem. It is a
                psychological one. You don&apos;t lack ideas — you lack the
                irreversibility of having started. Game Mode solves this by making
                the cost of{" "}
                <em style={{ fontStyle: "italic" }}>not writing</em> immediate and
                felt.
              </p>
              <p>
                In Battle Mode, you type to deal damage. You stop typing and the
                enemy attacks. The enemy is called{" "}
                <em style={{ color: "var(--color-crimson)", fontStyle: "italic" }}>
                  The Deadline
                </em>{" "}
                or{" "}
                <em style={{ color: "var(--color-crimson)", fontStyle: "italic" }}>
                  Writer&apos;s Block
                </em>{" "}
                or{" "}
                <em style={{ color: "var(--color-crimson)", fontStyle: "italic" }}>
                  The Blank Page
                </em>
                . The names are funny. The mechanism is not. You are staring a
                1,200-HP adversary in the face and the only weapon you have is
                your manuscript.
              </p>
              <p>
                In Race Mode, a timer runs. You set the duration. You try to beat
                the most words you&apos;ve ever written in a single sitting. The
                clock doesn&apos;t negotiate. After enough sessions, the best
                becomes the new floor.
              </p>
            </div>
          </div>

          <BattleMockup />
        </div>
      </section>

      <SectionDivider />

      {/* ── 4. The Philosophy of Velocity ──────────────────────────────── */}
      <section
        className="px-6 py-28 sm:px-10 md:py-36"
        style={{
          background: "var(--color-sepia)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="mx-auto w-full max-w-2xl">
          <p
            className="mb-8 uppercase"
            style={{
              color: "var(--color-gold)",
              fontSize: "0.62rem",
              letterSpacing: "0.4em",
              opacity: 0.55,
            }}
          >
            XP &amp; Progression
          </p>
          <h2
            className="mb-10 font-rune-serif leading-tight"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3rem)",
              color: "var(--color-parchment)",
            }}
          >
            The Philosophy of Velocity
          </h2>

          <div
            className="space-y-5 font-rune-serif leading-loose"
            style={{ fontSize: "1.08rem", color: "var(--color-mist)" }}
          >
            <p>
              Every session you complete in Rune earns XP. Every word you write
              moves the needle. The level you hold right now is not a vanity
              metric — it is a count.
            </p>
            <p style={{ color: "var(--color-parchment)" }}>
              A count of the nights you sat down when you didn&apos;t want to.
              The mornings you produced something ugly and saved it anyway. The
              sessions where you wrote 80 words and called it done, because 80
              words is 80 words more than zero.
            </p>
            <p>
              This is what a training log looks like for a writer. Not
              inspiration boards. Not a streak you broke three Tuesdays ago. A
              quiet, accumulating record that the muscle is there — and that it
              has been working.
            </p>
            <p style={{ color: "var(--color-parchment)" }}>
              At Level 3, a new theme unlocks. At Level 5, another. These
              aren&apos;t rewards in the conventional sense. They are evidence.
              Evidence that you have built enough of a practice to warrant a
              slightly darker library.
            </p>
          </div>

          <div
            className="mt-16 flex items-center gap-5"
            aria-hidden
          >
            <div
              className="h-px flex-1"
              style={{ background: "var(--color-border)" }}
            />
            <span
              className="font-rune-serif text-xl"
              style={{ color: "var(--color-gold)", opacity: 0.35 }}
            >
              ✦
            </span>
            <div
              className="h-px flex-1"
              style={{ background: "var(--color-border)" }}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 5. The Human Ink Manifesto ──────────────────────────────────── */}
      <section
        className="relative px-6 py-32 sm:px-10 md:py-44"
        style={{ background: "var(--color-ink)" }}
      >
        {/* Edge rules */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 8%, var(--color-gold) 50%, transparent 92%)",
            opacity: 0.18,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 8%, var(--color-gold) 50%, transparent 92%)",
            opacity: 0.18,
          }}
          aria-hidden
        />

        <div className="mx-auto w-full max-w-3xl">
          <p
            className="mb-10 text-center uppercase"
            style={{
              color: "var(--color-gold)",
              fontSize: "0.62rem",
              letterSpacing: "0.4em",
              opacity: 0.5,
            }}
          >
            On Human Writing
          </p>

          <h2
            className="mb-10 text-center font-rune-serif leading-snug"
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              color: "var(--color-parchment)",
              letterSpacing: "0.01em",
            }}
          >
            These words are yours.
            <br />
            Every single one.
          </h2>

          <div
            className="mx-auto max-w-xl space-y-6 text-center font-rune-serif"
            style={{ fontSize: "1.05rem", lineHeight: 1.9, color: "var(--color-mist)" }}
          >
            <p>
              Rune does not suggest sentences. It does not complete your
              paragraphs. It does not offer a better version of what you just
              wrote, or flag the word you&apos;ve used four times, or silently
              rewrite your opening.
            </p>
            <p style={{ color: "var(--color-parchment)" }}>
              The blank page is yours. The struggle to fill it is yours. When
              the words finally arrive — after the false starts and the deleted
              drafts and the sessions where you wrote one sentence and closed
              the tab — they belong entirely to the person who earned them.
            </p>
            <p>There is no AI in this room. There never will be.</p>
          </div>

          {/* Gold accent */}
          <div
            className="mx-auto mt-14 h-px w-20"
            style={{ background: "var(--color-gold)", opacity: 0.45 }}
            aria-hidden
          />
        </div>
      </section>

      <SectionDivider />

      {/* ── 6. Pricing ──────────────────────────────────────────────────── */}
      <section
        id="pricing"
        className="px-6 pb-36 pt-28 sm:px-10 md:pt-36"
        style={{ background: "var(--color-sepia)" }}
      >
        <div className="mx-auto w-full max-w-5xl">
          {/* Header */}
          <div className="mb-20 text-center">
            <p
              className="mb-4 uppercase"
              style={{
                color: "var(--color-gold)",
                fontSize: "0.62rem",
                letterSpacing: "0.4em",
                opacity: 0.55,
              }}
            >
              Choose your path
            </p>
            <h2
              className="font-rune-serif"
              style={{
                fontSize: "clamp(2rem, 4vw, 2.8rem)",
                color: "var(--color-parchment)",
              }}
            >
              Simple, honest pricing
            </h2>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:items-end">
            {/* Free — smallest, ghost */}
            <div
              className="rounded-lg p-7"
              style={{
                background: "transparent",
                border: "1px solid var(--color-border)",
              }}
            >
              <p
                className="mb-1 font-rune-serif text-xl"
                style={{ color: "var(--color-parchment)" }}
              >
                Free
              </p>
              <p
                className="mb-6 text-xs"
                style={{ color: "var(--color-mist)" }}
              >
                Start your practice.
              </p>
              <div className="mb-7 flex items-baseline gap-1">
                <span
                  className="font-rune-serif text-4xl"
                  style={{ color: "var(--color-parchment)" }}
                >
                  $0
                </span>
              </div>
              <ul
                className="mb-8 space-y-3 text-sm"
                style={{ color: "var(--color-mist)" }}
              >
                <li>1 project</li>
                <li>Full editor &amp; auto-save</li>
                <li>1 game ticket per week</li>
              </ul>
              <Link
                href="/signup"
                className="block rounded px-5 py-2.5 text-center text-sm transition-all duration-150 hover:bg-white/5"
                style={{
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-parchment)",
                }}
              >
                Begin Free
              </Link>
            </div>

            {/* Scribe — mid, solid gold */}
            <div
              className="rounded-lg py-9 px-7"
              style={{
                background: "var(--color-gold)",
                boxShadow: "0 8px 48px rgba(201,168,76,0.22)",
              }}
            >
              <p
                className="mb-1 font-rune-serif text-xl"
                style={{ color: "var(--color-ink)" }}
              >
                Scribe
              </p>
              <p
                className="mb-6 text-xs"
                style={{ color: "rgba(26,22,20,0.6)" }}
              >
                For writers who show up.
              </p>
              <div className="mb-7 flex items-baseline gap-0.5">
                <span
                  className="font-rune-serif text-4xl"
                  style={{ color: "var(--color-ink)" }}
                >
                  $5
                </span>
                <span
                  className="text-sm"
                  style={{ color: "rgba(26,22,20,0.55)" }}
                >
                  /mo
                </span>
              </div>
              <ul
                className="mb-8 space-y-3 text-sm"
                style={{ color: "rgba(26,22,20,0.75)" }}
              >
                <li>Unlimited projects</li>
                <li>Full editor &amp; Focus Mode</li>
                <li>XP &amp; level progression</li>
                <li>5 game tickets per week</li>
              </ul>
              <Link
                href="/signup"
                className="block rounded px-5 py-2.5 text-center text-sm font-medium transition-opacity duration-150 hover:opacity-90"
                style={{
                  background: "var(--color-ink)",
                  color: "var(--color-gold)",
                }}
              >
                Become a Scribe
              </Link>
            </div>

            {/* Arcane — largest, candlelight glow */}
            <div className="relative rounded-lg" style={{ isolation: "isolate" }}>
              {/* Soft candlelight bloom */}
              <div
                className="pointer-events-none absolute inset-0 rounded-lg blur-2xl"
                style={{
                  background: "var(--color-gold)",
                  opacity: 0.09,
                  zIndex: -1,
                }}
                aria-hidden
              />
              <div
                className="rounded-lg py-11 px-7"
                style={{
                  background: "var(--color-ink)",
                  border: "1px solid rgba(201,168,76,0.42)",
                  boxShadow:
                    "0 0 0 1px rgba(201,168,76,0.07), inset 0 1px 0 rgba(201,168,76,0.11), 0 6px 48px rgba(201,168,76,0.06)",
                }}
              >
                <div className="mb-1 flex items-start justify-between">
                  <p
                    className="font-rune-serif text-xl"
                    style={{ color: "var(--color-parchment)" }}
                  >
                    Arcane
                  </p>
                  <span
                    className="rounded px-2 py-0.5 uppercase"
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      border: "1px solid rgba(201,168,76,0.22)",
                      color: "var(--color-gold)",
                      fontSize: "0.58rem",
                      letterSpacing: "0.22em",
                    }}
                  >
                    Full
                  </span>
                </div>
                <p
                  className="mb-6 text-xs"
                  style={{ color: "var(--color-mist)" }}
                >
                  For the devoted.
                </p>
                <div className="mb-7 flex items-baseline gap-0.5">
                  <span
                    className="font-rune-serif text-4xl"
                    style={{ color: "var(--color-parchment)" }}
                  >
                    $12
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--color-mist)" }}
                  >
                    /mo
                  </span>
                </div>
                <ul
                  className="mb-8 space-y-3 text-sm"
                  style={{ color: "var(--color-mist)" }}
                >
                  <li>Everything in Scribe</li>
                  <li>Unlimited game tickets</li>
                  <li>All themes &amp; unlockables</li>
                  <li style={{ color: "var(--color-gold)" }}>
                    Early multiplayer access
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="block rounded px-5 py-2.5 text-center text-sm font-medium transition-opacity duration-150 hover:opacity-90"
                  style={{
                    background: "var(--color-gold)",
                    color: "var(--color-ink)",
                  }}
                >
                  Unlock the Arcane
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 7. Footer ───────────────────────────────────────────────────── */}
      <footer
        className="px-6 py-16 text-center sm:px-10"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div className="mx-auto w-full max-w-lg">
          <span
            className="mb-5 block select-none font-rune-serif text-lg"
            style={{ color: "var(--color-gold)", letterSpacing: "0.25em" }}
          >
            Rune
          </span>
          <p
            className="mb-8 font-rune-serif italic"
            style={{ color: "var(--color-mist)", fontSize: "1rem" }}
          >
            It won&apos;t always be easy. It will always have been worth it.
          </p>
          <div
            className="flex justify-center gap-8 text-xs"
            style={{ color: "var(--color-mist)", opacity: 0.4 }}
          >
            <Link
              href="/login"
              className="transition-opacity duration-150 hover:opacity-100"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="transition-opacity duration-150 hover:opacity-100"
            >
              Create account
            </Link>
          </div>
        </div>
      </footer>

      </div>{/* end z-10 content wrapper */}
    </div>
  );
}
