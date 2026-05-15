import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function getBestRaceSession(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("game_sessions")
    .select("words_written, duration_seconds")
    .eq("user_id", userId)
    .eq("mode", "race")
    .eq("completed", true)
    .order("words_written", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function OrnamentDivider() {
  return (
    <div className="flex items-center gap-3 my-8">
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
      <span style={{ color: "var(--color-gold)", opacity: 0.5 }} aria-hidden>
        ✦
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const bestRace = user ? await getBestRaceSession(user.id) : null;

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      {/* Header */}
      <div className="text-center mb-2">
        <p
          className="text-xs uppercase tracking-[0.3em] mb-3"
          style={{ color: "var(--color-mist)" }}
        >
          Enter
        </p>
        <h1
          className="font-rune-serif text-5xl md:text-6xl"
          style={{ color: "var(--color-gold)" }}
        >
          The Arena
        </h1>
        <p
          className="mt-3 font-rune-serif text-lg"
          style={{ color: "var(--color-mist)" }}
        >
          Words are your weapons. The page is your battlefield.
        </p>
      </div>

      <OrnamentDivider />

      {/* Game cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Race Yourself — active */}
        <Link
          href="/games/race"
          className="group relative flex flex-col rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
          aria-label="Play Race Yourself"
        >
          {/* Top accent bar */}
          <div
            className="h-0.5 w-full transition-all duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-gold), transparent)",
              opacity: 0.6,
            }}
          />

          <div className="p-8 flex flex-col flex-1">
            {/* Icon */}
            <div
              className="mb-5 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
              style={{
                background: "rgba(201, 168, 76, 0.1)",
                border: "1px solid var(--color-border-strong)",
              }}
              aria-hidden
            >
              ⏱
            </div>

            {/* Name + description */}
            <h2
              className="font-rune-serif text-2xl mb-2 transition-colors duration-150"
              style={{ color: "var(--color-parchment)" }}
            >
              Race Yourself
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--color-mist)" }}>
              Choose a time limit. Write as many words as you can. Beat your
              personal record and claim the page.
            </p>

            {/* Best score */}
            <div className="mt-auto">
              {bestRace ? (
                <div
                  className="flex items-baseline gap-2 rounded px-3 py-2"
                  style={{
                    background: "rgba(201, 168, 76, 0.08)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    className="font-rune-serif text-xl"
                    style={{ color: "var(--color-gold)" }}
                  >
                    {bestRace.words_written.toLocaleString()}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-mist)" }}>
                    words &mdash; your best
                  </span>
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
                  No record yet — write your first
                </p>
              )}
            </div>

            {/* CTA */}
            <div
              className="mt-5 flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              Enter the race
              <span
                className="transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden
              >
                →
              </span>
            </div>
          </div>
        </Link>

        {/* Battle Mode — active */}
        <Link
          href="/games/battle"
          className="group relative flex flex-col rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
          aria-label="Play Battle Mode"
        >
          {/* Top accent bar */}
          <div
            className="h-0.5 w-full transition-all duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-crimson), transparent)",
              opacity: 0.4,
            }}
          />

          <div className="p-8 flex flex-col flex-1">
            {/* Icon */}
            <div
              className="mb-5 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
              style={{
                background: "rgba(139, 46, 46, 0.1)",
                border: "1px solid rgba(139, 46, 46, 0.25)",
              }}
              aria-hidden
            >
              ⚔
            </div>

            {/* Name + description */}
            <h2
              className="font-rune-serif text-2xl mb-2 transition-colors duration-150"
              style={{ color: "var(--color-parchment)" }}
            >
              Battle Mode
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--color-mist)" }}>
              Deal damage by typing. Take damage when idle. Defeat the enemies
              of the blank page before your HP runs out.
            </p>

            {/* Enemy preview */}
            <div className="mt-auto">
              <div
                className="flex items-center gap-2 rounded px-3 py-2"
                style={{
                  background: "rgba(139, 46, 46, 0.07)",
                  border: "1px solid rgba(139, 46, 46, 0.2)",
                }}
              >
                <span className="text-xs" style={{ color: "var(--color-crimson)", opacity: 0.8 }}>
                  3 enemies await
                </span>
                <span style={{ color: "var(--color-mist)", opacity: 0.3 }}>·</span>
                <span className="text-xs italic" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
                  1.5× XP on victory
                </span>
              </div>
            </div>

            {/* CTA */}
            <div
              className="mt-5 flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
              style={{ color: "var(--color-crimson)" }}
            >
              Enter the battle
              <span
                className="transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden
              >
                →
              </span>
            </div>
          </div>
        </Link>
      </div>

      <OrnamentDivider />

      {/* Footer note */}
      <p className="text-center text-xs" style={{ color: "var(--color-mist)", opacity: 0.4 }}>
        1v1 Race &mdash; multiplayer &mdash; arrives post-launch
      </p>
    </div>
  );
}
