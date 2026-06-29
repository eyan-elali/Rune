import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { XpBar } from "@/components/profile/XpBar";
import { ContributionHeatmap } from "@/components/profile/ContributionHeatmap";
import { AvatarGlyph } from "@/components/profile/UserAvatar";
import {
  getContributionHistory,
  getWritingStreak,
} from "@/lib/actions/writingStats";
import { getUserUnlockables } from "@/lib/actions/unlockables";
import type { SubscriptionTier } from "@/lib/subscription";
import { calculateProjectWordCount } from "@/lib/manuscript";
import { UNLOCKABLES, type Unlockable } from "@/lib/unlockables";
import { ProfileGuideMount } from "./ProfileGuideMount";
import { ProfileStreakClient } from "@/components/profile/ProfileStreakClient";
import type { GameSession } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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
  deadline: "The Deadline",
};

const MODE_LABELS: Record<string, string> = {
  race_yourself: "Race Yourself",
  battle: "Battle Mode",
  race: "Word Race",
  "1v1": "1v1 Race",
};

// ── Stat block ─────────────────────────────────────────────────────────────
function StatBlock({
  label,
  value,
  sub,
  size = "md",
}: {
  label: string;
  value: string;
  sub?: string;
  size?: "lg" | "md" | "sm";
}) {
  const numClass =
    size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-lg";

  return (
    <div className="flex min-w-0 flex-col">
      <p
        className={`font-rune-serif ${numClass} leading-tight`}
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
        {label}
      </p>
      {sub && (
        <p
          className="mt-0.5 truncate text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.45 }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Card shell ─────────────────────────────────────────────────────────────
function Card({
  children,
  className = "",
  style,
  dataGuide,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dataGuide?: string;
}) {
  return (
    <div
      className={`rounded-lg ${className}`}
      data-guide={dataGuide}
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-4 text-xs font-semibold uppercase tracking-widest"
      style={{ color: "var(--color-mist)" }}
    >
      {children}
    </p>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: rawProjects },
    { data: recentSessions },
    { currentStreak, maxStreak },
    userUnlockables,
    { data: allWritingSessions },
    { data: allSessions },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    supabase
      .from("projects")
      .select("id, title, chapters(id, pages(id, word_count, is_canonical))")
      .eq("user_id", user!.id),
    supabase
      .from("game_sessions")
      .select(
        "id, mode, words_written, xp_earned, duration_seconds, completed, created_at, enemy_type, meta"
      )
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(3),
    getWritingStreak(user!.id),
    getUserUnlockables(user!.id),
    supabase
      .from("writing_sessions")
      .select("session_date, words_added")
      .eq("user_id", user!.id),
    supabase
      .from("game_sessions")
      .select("words_written, meta")
      .eq("user_id", user!.id),
  ]);

  const subscriptionTier = (
    profile?.subscription_tier ?? "free"
  ) as SubscriptionTier;
  const contributionHistory = await getContributionHistory(user!.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = (rawProjects ?? []) as any[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectWordCounts = projects.map((p: any) => ({
    title: (p.title as string) ?? "Untitled",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    words: calculateProjectWordCount((p.chapters ?? []) as any[]),
  }));

  const totalWords = projectWordCounts.reduce(
    (sum: number, p: { words: number }) => sum + p.words,
    0
  );

  const longestProject = projectWordCounts.reduce(
    (
      best: { title: string; words: number },
      p: { title: string; words: number }
    ) => (p.words > best.words ? p : best),
    { title: "", words: 0 }
  );

  // Biggest writing day
  const dayTotals = new Map<string, number>();
  for (const row of allWritingSessions ?? []) {
    dayTotals.set(
      row.session_date,
      (dayTotals.get(row.session_date) ?? 0) + (row.words_added ?? 0)
    );
  }
  const biggestDay =
    dayTotals.size > 0 ? Math.max(...Array.from(dayTotals.values())) : 0;

  // Arena session stats
  const totalSessions = (allSessions ?? []).length;
  const totalGameWords = (allSessions ?? []).reduce(
    (sum: number, s: { words_written: number }) =>
      sum + (s.words_written ?? 0),
    0
  );
  const avgWordsPerSession =
    totalSessions > 0 ? Math.round(totalGameWords / totalSessions) : 0;
  const estimatedPages = Math.floor(totalWords / 250);

  // Identity
  const xp = profile?.xp ?? 0;
  const level = profile?.level ?? 1;
  const displayName =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Writer";
  const preferences =
    (profile?.preferences as Record<string, unknown> | null) ?? {};
  const activeAvatarId =
    (preferences.activeAvatar as string | undefined) ?? "quill";

  // Unlockables preview
  const unlockedIdSet = new Set(userUnlockables.map((u) => u.unlockable_id));
  const alwaysFreeItems = UNLOCKABLES.filter((u) => u.requirement === null);
  const earnedItems = UNLOCKABLES.filter(
    (u) => u.requirement !== null && unlockedIdSet.has(u.id)
  );
  const unlockedCount = alwaysFreeItems.length + earnedItems.length;

  const recentlyEarnedItems = [...userUnlockables]
    .reverse()
    .slice(0, 5)
    .map((u) => UNLOCKABLES.find((r) => r.id === u.unlockable_id))
    .filter(Boolean) as Unlockable[];

  const previewItems =
    recentlyEarnedItems.length > 0
      ? recentlyEarnedItems
      : alwaysFreeItems.slice(0, 4);

  const lockedPreviewCount = Math.min(
    2,
    Math.max(0, UNLOCKABLES.length - unlockedCount)
  );

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">

      {/* ── Identity ───────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "rgba(201, 168, 76, 0.12)",
            border: "1px solid rgba(201, 168, 76, 0.25)",
          }}
          aria-hidden
        >
          <AvatarGlyph id={activeAvatarId} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="font-rune-serif text-2xl leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </h1>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-mist)", opacity: 0.65 }}
          >
            Writer since{" "}
            {profile?.created_at
              ? formatMemberSince(profile.created_at)
              : "—"}{" "}
            · Level {level}
          </p>
        </div>
        <ProfileGuideMount />
      </div>

      {/* ── Row 1: XP card + Heatmap ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">

        {/* XP panel */}
        <Card className="p-5" dataGuide="profile-xp">
          <XpBar xp={xp} level={level} hero />
        </Card>

        {/* Heatmap panel */}
        <Card className="p-5" dataGuide="profile-heatmap">
          <CardLabel>Writing Activity</CardLabel>
          <ContributionHeatmap data={contributionHistory} />
        </Card>
      </div>

      {/* ── Row 2: Stats + Unlockables ─────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">

        {/* Writing stats */}
        <Card className="p-5" aria-label="Writing statistics" dataGuide="profile-stats">
          <CardLabel>Writing</CardLabel>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <StatBlock
              size="lg"
              label="Total Words"
              value={totalWords > 0 ? totalWords.toLocaleString() : "—"}
            />
            <ProfileStreakClient
              initialCurrentStreak={currentStreak}
              initialMaxStreak={maxStreak}
            />
            <StatBlock
              size="md"
              label="Total Projects"
              value={
                projects.length > 0 ? projects.length.toLocaleString() : "—"
              }
            />
            <StatBlock
              size="md"
              label="Longest Manuscript"
              value={
                longestProject.words > 0
                  ? longestProject.words.toLocaleString()
                  : "—"
              }
              sub={longestProject.words > 0 ? longestProject.title : undefined}
            />
            <StatBlock
              size="md"
              label="Biggest Writing Day"
              value={
                biggestDay > 0 ? biggestDay.toLocaleString() + " words" : "—"
              }
            />
            <StatBlock
              size="sm"
              label="Arena Sessions"
              value={totalSessions > 0 ? totalSessions.toLocaleString() : "—"}
            />
            <StatBlock
              size="sm"
              label="Avg Words / Session"
              value={
                avgWordsPerSession > 0
                  ? avgWordsPerSession.toLocaleString()
                  : "—"
              }
            />
            <StatBlock
              size="sm"
              label="Est. Pages Written"
              value={
                estimatedPages > 0 ? estimatedPages.toLocaleString() : "—"
              }
              sub={estimatedPages > 0 ? "at 250 words/page" : undefined}
            />
          </div>
        </Card>

        {/* Unlockables panel */}
        <Card className="flex flex-col p-5" aria-label="Unlockables" dataGuide="profile-unlockables">
          <div className="mb-4 flex items-baseline justify-between">
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Unlockables
            </p>
            <span className="text-xs" style={{ color: "var(--color-mist)" }}>
              {unlockedCount} of {UNLOCKABLES.length}
            </span>
          </div>

          <p
            className="mb-4 text-xs leading-relaxed"
            style={{ color: "var(--color-mist)", opacity: 0.7 }}
          >
            Themes, fonts, and avatars earned through writing milestones.
          </p>

          {/* Glyph strip */}
          <div className="mb-5 flex flex-wrap gap-2">
            {previewItems.map((item) => (
              <div
                key={item.id}
                title={item.name}
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: "rgba(201, 168, 76, 0.12)",
                  border: "1px solid rgba(201, 168, 76, 0.28)",
                }}
                aria-label={item.name}
              >
                {item.type === "avatar" ? (
                  <AvatarGlyph id={item.id} size={14} />
                ) : item.type === "theme" ? (
                  <span
                    style={{ color: "var(--color-gold)", fontSize: "11px" }}
                    aria-hidden
                  >
                    ✦
                  </span>
                ) : (
                  <span
                    className="font-rune-serif"
                    style={{ color: "var(--color-gold)", fontSize: "11px" }}
                    aria-hidden
                  >
                    Aa
                  </span>
                )}
              </div>
            ))}
            {Array.from({ length: lockedPreviewCount }).map((_, i) => (
              <div
                key={`locked-${i}`}
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: "rgba(107, 101, 96, 0.08)",
                  border: "1px solid rgba(107, 101, 96, 0.18)",
                }}
                aria-hidden
              >
                <span
                  style={{
                    color: "var(--color-mist)",
                    opacity: 0.3,
                    fontSize: "12px",
                  }}
                >
                  ◌
                </span>
              </div>
            ))}
          </div>

          <Link
            href="/profile/unlockables"
            className="mt-auto inline-flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--color-gold)" }}
          >
            View gallery <span aria-hidden>→</span>
          </Link>
        </Card>
      </div>

      {/* ── Row 3: Recent Sessions ──────────────────────────────────── */}
      <div className="mt-4">
        <Card className="overflow-hidden" aria-label="Recent arena sessions">
          {/* Card header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Recent Sessions
            </p>
            {totalSessions > 3 && (
              <Link
                href="/games"
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--color-gold)" }}
              >
                View all →
              </Link>
            )}
          </div>

          {recentSessions && recentSessions.length > 0 ? (
            <ul role="list">
              {(recentSessions as GameSession[]).map((session, i) => {
                const meta = session.meta as SessionMeta | null;
                const isBattle = session.mode === "battle";
                const isRace =
                  session.mode === "race" || session.mode === "race_yourself";
                const outcome = meta?.outcome;
                const enemyName =
                  meta?.enemy_name ??
                  (session.enemy_type
                    ? (ENEMY_DISPLAY[session.enemy_type] ?? session.enemy_type)
                    : null);
                const isPb = meta?.is_pb;
                const wordsDisplay =
                  typeof meta?.sprint_words === "number"
                    ? meta.sprint_words
                    : session.words_written;

                return (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                    style={{
                      borderTop:
                        i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    {/* Left: mode + context */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span
                          className="font-rune-serif text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {MODE_LABELS[session.mode] ?? session.mode}
                        </span>
                        {isBattle && enemyName && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--color-mist)" }}
                          >
                            · {enemyName}
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
                                ({outcome === "victory" ? "Won" : "Defeated"})
                              </span>
                            )}
                          </span>
                        )}
                        {isRace && isPb && (
                          <span
                            className="text-xs font-rune-serif"
                            style={{ color: "var(--color-gold)" }}
                          >
                            · Personal Best
                          </span>
                        )}
                      </div>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-mist)", opacity: 0.65 }}
                      >
                        {formatDate(session.created_at)}
                      </p>
                    </div>

                    {/* Right: words + XP */}
                    <div className="flex shrink-0 items-center gap-5 text-right">
                      <div>
                        <p
                          className="font-rune-serif text-sm tabular-nums"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {wordsDisplay.toLocaleString()}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-mist)" }}
                        >
                          words
                        </p>
                      </div>
                      <div>
                        <p
                          className="font-rune-serif text-sm"
                          style={{ color: "var(--color-gold)" }}
                        >
                          +{session.xp_earned}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-mist)" }}
                        >
                          XP
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center">
              <p
                className="font-rune-serif text-sm"
                style={{ color: "var(--text-primary)", opacity: 0.5 }}
              >
                No arena sessions yet.
              </p>
              <Link
                href="/games"
                className="mt-2 inline-block text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--color-gold)" }}
              >
                Visit the Arena →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
