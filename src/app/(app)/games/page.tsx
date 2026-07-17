import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArenaGuideMount } from "./ArenaGuideMount";
import type { UserPreferences } from "@/lib/types";

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

  const [bestRace, profileRow] = await Promise.all([
    user ? getBestRaceSession(user.id) : null,
    user
      ? supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single()
          .then(({ data }) => data)
      : null,
  ]);

  const prefs = ((profileRow as { preferences?: Record<string, unknown> | null } | null)?.preferences ?? {}) as Partial<UserPreferences>;
  if (prefs.hideArena === true) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      {/* Header */}
      <div className="relative text-center mb-2">
        <div className="absolute right-0 top-0">
          <ArenaGuideMount />
        </div>
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
          data-guide="arena-race"
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

          <div className="p-9 flex flex-col flex-1">
            <div
              className="arena-game-icon mb-6 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{
                background: "color-mix(in srgb, var(--color-gold) 10%, transparent)",
                border: "1px solid var(--color-border-strong)",
              }}
              aria-hidden
            >
              ⏱
            </div>

            <h2
              className="!mb-2 font-rune-serif text-3xl transition-colors duration-150"
              style={{ color: "var(--text-primary)" }}
            >
              Race Yourself
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--color-mist)" }}>
              Choose a time limit. Write as many words as you can. Beat your
              personal best.
            </p>

            <div className="mt-auto">
              {bestRace ? (
                <div
                  className="flex items-baseline gap-2 rounded px-3 py-2"
                  style={{
                    background: "color-mix(in srgb, var(--color-gold) 8%, transparent)",
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
                  No record yet. Set your first one.
                </p>
              )}
            </div>

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
          data-guide="arena-battle"
          className="group relative flex flex-col rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
          aria-label="Play Battle Mode"
        >
          <div
            className="h-0.5 w-full transition-all duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-crimson), transparent)",
              opacity: 0.4,
            }}
          />

          <div className="p-9 flex flex-col flex-1">
            <div
              className="arena-game-icon mb-6 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{
                background: "color-mix(in srgb, var(--color-crimson) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-crimson) 25%, transparent)",
              }}
              aria-hidden
            >
              ⚔
            </div>

            <h2
              className="!mb-2 font-rune-serif text-3xl transition-colors duration-150"
              style={{ color: "var(--text-primary)" }}
            >
              Battle Mode
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--color-mist)" }}>
              Defeat the blank page by writing. Every word deals damage.
            </p>

            <div className="mt-auto">
              <div
                className="flex items-center gap-2 rounded px-3 py-2"
                style={{
                  background: "color-mix(in srgb, var(--color-crimson) 7%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-crimson) 20%, transparent)",
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

      <p className="text-center text-xs" style={{ color: "var(--color-mist)", opacity: 0.4 }}>
        1v1 Race &mdash; multiplayer &mdash; arrives post-launch
      </p>
    </div>
  );
}
