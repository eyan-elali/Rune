import Link from "next/link";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
import type { WritingGoal } from "@/lib/actions/writingStats";

interface MomentumStripProps {
  totalWords: number;
  writingStreak: { currentStreak: number; maxStreak: number };
  goals: WritingGoal[];
  tier: SubscriptionTier;
  todayWords: number;
}

const cellStyle = { background: "var(--surface-card)" } as const;

export function MomentumStrip({
  totalWords,
  writingStreak,
  goals,
  tier,
  todayWords,
}: MomentumStripProps) {
  const canAccessStreaks = canAccessFeature(tier, "streaks");
  const canAccessGoals = canAccessFeature(tier, "projectGoals");
  const totalGoal = goals.find((g) => g.type === "project_total") ?? null;

  const goalPercent =
    totalGoal && totalGoal.target_words > 0
      ? Math.min(
          100,
          Math.round((totalGoal.current_words / totalGoal.target_words) * 100)
        )
      : null;

  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg sm:grid-cols-4"
      style={{
        background: "var(--color-border)",
        border: "1px solid var(--color-border)",
      }}
      aria-label="Writing momentum"
    >
      {/* Words Written */}
      <div className="flex flex-col gap-1 px-6 py-5" style={cellStyle}>
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Total Words
        </p>
        <p
          className="font-rune-serif leading-none"
          style={{ color: "var(--text-primary)", fontSize: "1.75rem" }}
        >
          {totalWords.toLocaleString()}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          across all manuscripts
        </p>
      </div>

      {/* Writing Streak */}
      <div className="flex flex-col gap-1 px-6 py-5" style={cellStyle}>
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Streak
        </p>
        {canAccessStreaks ? (
          <>
            <p
              className="font-rune-serif leading-none"
              style={{
                color:
                  writingStreak.currentStreak > 0
                    ? "var(--color-gold)"
                    : "var(--text-primary)",
                fontSize: "1.75rem",
              }}
            >
              {writingStreak.currentStreak}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
              {writingStreak.currentStreak === 1 ? "day" : "days"}
              {writingStreak.maxStreak > 0
                ? ` · best: ${writingStreak.maxStreak}`
                : ""}
            </p>
          </>
        ) : (
          <>
            <p
              className="font-rune-serif text-xl leading-none"
              style={{ color: "var(--color-mist)", opacity: 0.4 }}
            >
              —
            </p>
            <p
              className="mt-1 text-xs italic"
              style={{ color: "var(--color-mist)", opacity: 0.5 }}
            >
              Available with Scribe
            </p>
          </>
        )}
      </div>

      {/* Manuscript Goal */}
      <div className="flex flex-col gap-1 px-6 py-5" style={cellStyle}>
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Manuscript Goal
        </p>
        {!canAccessGoals ? (
          <>
            <p
              className="font-rune-serif text-xl leading-none"
              style={{ color: "var(--color-mist)", opacity: 0.4 }}
            >
              —
            </p>
            <p
              className="mt-1 text-xs italic"
              style={{ color: "var(--color-mist)", opacity: 0.5 }}
            >
              Available with Scribe
            </p>
          </>
        ) : totalGoal ? (
          <>
            <p
              className="font-rune-serif leading-none"
              style={{ color: "var(--text-primary)", fontSize: "1.75rem" }}
            >
              {goalPercent}%
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
              {totalGoal.current_words.toLocaleString()} /{" "}
              {totalGoal.target_words.toLocaleString()} words
            </p>
          </>
        ) : (
          <>
            <p
              className="font-rune-serif text-sm italic leading-snug"
              style={{ color: "var(--color-mist)", opacity: 0.6 }}
            >
              No target set
            </p>
            <Link
              href="/profile"
              className="mt-1 text-xs transition-opacity duration-150 hover:opacity-70"
              style={{ color: "var(--color-gold-dim)" }}
            >
              + Set in profile →
            </Link>
          </>
        )}
      </div>

      {/* Today's Words */}
      <div className="flex flex-col gap-1 px-6 py-5" style={cellStyle}>
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Today
        </p>
        <p
          className="font-rune-serif leading-none"
          style={{
            color:
              todayWords > 0 ? "var(--color-gold)" : "var(--text-primary)",
            fontSize: "1.75rem",
          }}
        >
          {todayWords.toLocaleString()}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          {todayWords > 0 ? "words written" : "Start today's session"}
        </p>
      </div>
    </div>
  );
}
