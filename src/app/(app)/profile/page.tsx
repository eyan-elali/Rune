import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { XpBar } from "@/components/profile/XpBar";
import { ContributionHeatmap } from "@/components/profile/ContributionHeatmap";
import { getContributionHistory } from "@/lib/actions/writingStats";
import type { GameSession } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function favoriteTime(sessions: Pick<GameSession, "created_at">[]): string {
  if (!sessions.length) return "—";
  const hours = sessions.map((s) => new Date(s.created_at).getHours());
  const morning = hours.filter((h) => h >= 5 && h < 12).length;
  const afternoon = hours.filter((h) => h >= 12 && h < 18).length;
  const evening = hours.filter((h) => h >= 18 || h < 5).length;
  if (morning >= afternoon && morning >= evening) return "Morning";
  if (afternoon >= morning && afternoon >= evening) return "Afternoon";
  return "Evening";
}

type SessionMeta = {
  outcome?: string;
  enemy_name?: string;
  is_pb?: boolean;
  sprint_words?: number;
  lap_words?: number;
};

const ENEMY_DISPLAY: Record<string, string> = {
  "blank-page": "The Blank Page",
  "writers-block": "Writer's Block",
  "deadline": "The Deadline",
};

const MODE_LABELS: Record<string, string> = {
  race_yourself: "Race Yourself",
  battle: "Battle Mode",
  race: "Word Race",
  "1v1": "1v1 Race",
};

function getModeDisplay(mode: string): string {
  if (mode === "battle") return "⚔️ Battle";
  if (mode === "race" || mode === "race_yourself") {
    return `🏁 ${MODE_LABELS[mode] ?? "Race"}`;
  }
  return MODE_LABELS[mode] ?? mode;
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg p-5"
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p
        className="text-2xl font-rune-serif"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="text-xs" style={{ color: "var(--color-mist)" }}>
        {label}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawProjects }, { data: recentSessions }, contributionHistory] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user!.id).single(),
      supabase
        .from("projects")
        .select("id, word_count")
        .eq("user_id", user!.id),
      supabase
        .from("game_sessions")
        .select("id, mode, words_written, xp_earned, duration_seconds, completed, created_at, enemy_type, meta")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5),
      getContributionHistory(user!.id),
    ]);

  const projects = rawProjects ?? [];
  const projectIds = projects.map((p) => p.id);
  const totalWords = projects.reduce((sum, p) => sum + (p.word_count ?? 0), 0);

  // Pages count via chapters
  let pageCount = 0;
  if (projectIds.length > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id")
      .in("project_id", projectIds);

    const chapterIds = chapters?.map((c) => c.id) ?? [];
    if (chapterIds.length > 0) {
      const { count } = await supabase
        .from("pages")
        .select("id", { count: "exact", head: true })
        .in("chapter_id", chapterIds);
      pageCount = count ?? 0;
    }
  }

  // Longest session
  const { data: topSession } = await supabase
    .from("game_sessions")
    .select("words_written")
    .eq("user_id", user!.id)
    .order("words_written", { ascending: false })
    .limit(1)
    .maybeSingle();

  const xp = profile?.xp ?? 0;
  const level = profile?.level ?? 1;
  const initial = (profile?.display_name ?? user?.email ?? "W")
    .trim()
    .charAt(0)
    .toUpperCase();
  const displayName =
    profile?.display_name ??
    user?.email?.split("@")[0] ??
    "Writer";

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      {/* ── Identity card ───────────────────────────────────────────── */}
      <section
        className="mb-8 flex items-center gap-6 rounded-lg p-6"
        style={{
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border)",
        }}
        aria-label="Identity"
      >
        {/* Avatar */}
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-semibold"
            style={{
              background: "rgba(201, 168, 76, 0.15)",
              color: "var(--color-gold)",
              border: "1px solid rgba(201, 168, 76, 0.3)",
            }}
            aria-hidden
          >
            {initial}
          </div>
        )}

        <div className="min-w-0">
          <h1
            className="font-rune-serif text-2xl leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </h1>
          {profile?.username && (
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-mist)" }}>
              @{profile.username}
            </p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: "var(--color-mist)", opacity: 0.6 }}>
            Member since {profile?.created_at ? formatDate(profile.created_at) : "—"}
          </p>
        </div>
      </section>

      {/* ── Level & XP ──────────────────────────────────────────────── */}
      <section
        className="mb-8 rounded-lg p-6"
        style={{
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border)",
        }}
        aria-label="Level and XP"
      >
        <h2
          className="mb-5 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Progress
        </h2>
        <XpBar xp={xp} level={level} />
      </section>

      {/* ── Writing stats ────────────────────────────────────────────── */}
      <section className="mb-8" aria-label="Writing stats">
        <h2
          className="mb-4 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Writing Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Total words written"
            value={totalWords.toLocaleString()}
          />
          <StatCard
            label="Projects"
            value={projects.length.toLocaleString()}
          />
          <StatCard
            label="Pages"
            value={pageCount.toLocaleString()}
          />
          <StatCard
            label="Longest session"
            value={
              topSession?.words_written
                ? `${topSession.words_written.toLocaleString()} words`
                : "—"
            }
          />
          <StatCard
            label="Favorite time to write"
            value={favoriteTime(recentSessions ?? [])}
          />
          <StatCard
            label="Total XP earned"
            value={xp.toLocaleString()}
            sub={`Level ${level}`}
          />
        </div>
      </section>

      {/* ── Contribution Heatmap ─────────────────────────────────────── */}
      <section
        className="mb-8 rounded-lg p-6"
        style={{
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border)",
        }}
        aria-label="Writing activity heatmap"
      >
        <h2
          className="mb-5 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Writing Activity
        </h2>
        <ContributionHeatmap data={contributionHistory} />
      </section>

      {/* ── Unlockables link ────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href="/profile/unlockables"
          className="flex items-center justify-between rounded-lg p-5 transition-colors duration-150"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Unlockables Gallery
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-mist)" }}>
              Themes, avatars, and rewards earned through writing
            </p>
          </div>
          <span style={{ color: "var(--color-gold)" }} aria-hidden>
            →
          </span>
        </Link>
      </div>

      {/* ── Recent activity ──────────────────────────────────────────── */}
      <section aria-label="Recent activity">
        <h2
          className="mb-4 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Recent Sessions
        </h2>

        {recentSessions && recentSessions.length > 0 ? (
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--color-sepia)",
              border: "1px solid var(--color-border)",
            }}
          >
            <ul role="list">
              {(recentSessions as GameSession[]).map((session, i) => {
                const meta = session.meta as SessionMeta | null;
                const isBattle = session.mode === "battle";
                const isRace = session.mode === "race" || session.mode === "race_yourself";
                const outcome = meta?.outcome;
                const enemyName =
                  meta?.enemy_name ??
                  (session.enemy_type
                    ? (ENEMY_DISPLAY[session.enemy_type] ?? session.enemy_type)
                    : null);
                const isPb = meta?.is_pb;

                return (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p
                          className="truncate text-sm font-rune-serif"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {getModeDisplay(session.mode)}
                        </p>
                        {isBattle && enemyName && (
                          <span className="text-xs" style={{ color: "var(--color-mist)" }}>
                            vs {enemyName}
                            {outcome && (
                              <span
                                className="ml-1"
                                style={{
                                  color:
                                    outcome === "victory"
                                      ? "var(--color-sage)"
                                      : "var(--color-crimson)",
                                }}
                              >
                                •{" "}
                                {outcome === "victory" ? "Won" : "Defeated"}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                        {formatDate(session.created_at)}
                        {isRace && isPb && (
                          <span
                            className="ml-2 font-rune-serif"
                            style={{ color: "var(--color-gold)" }}
                          >
                            ✦ Personal Best
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-5 text-right">
                      <div>
                        <p
                          className="text-sm font-rune-serif"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {session.words_written.toLocaleString()}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                          words
                        </p>
                      </div>
                      <div>
                        <p
                          className="text-sm font-rune-serif"
                          style={{ color: "var(--color-gold)" }}
                        >
                          +{session.xp_earned}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                          XP
                        </p>
                      </div>
                      <div>
                        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
                          {formatDuration(session.duration_seconds)}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                          duration
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div
            className="rounded-lg px-6 py-10 text-center"
            style={{
              background: "var(--color-sepia)",
              border: "1px dashed var(--color-border-strong)",
            }}
          >
            <p className="font-rune-serif text-sm" style={{ color: "var(--text-primary)", opacity: 0.55 }}>
              No game sessions yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
