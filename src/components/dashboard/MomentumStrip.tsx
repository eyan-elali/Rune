"use client";

import type { SubscriptionTier } from "@/lib/subscription";
import type { WritingGoal } from "@/lib/actions/writingStats";
import { TodayWordsCount } from "./TodayWordsCount";

interface MomentumStripProps {
  totalWords: number;
  writingStreak: { currentStreak: number; maxStreak: number };
  goals: WritingGoal[];
  tier?: SubscriptionTier;
  todayWords: number;
  primaryProjectId?: string;
  primaryProjectTitle?: string;
  onOpenProgress?: () => void;
}

const cellStyle = { background: "var(--surface-card)" } as const;

export function MomentumStrip({
  totalWords,
  writingStreak,
  goals,
  tier,
  todayWords,
  primaryProjectId,
  primaryProjectTitle,
  onOpenProgress,
}: MomentumStripProps) {
  const totalGoal = primaryProjectId
    ? (goals.find((g) => g.type === "project_total" && g.project_id === primaryProjectId) ?? null)
    : (goals.find((g) => g.type === "project_total") ?? null);

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
      data-guide="dashboard-momentum"
    >
      {/* Today's Words — first position */}
      <div
        className="flex flex-col gap-1 px-6 py-5"
        style={{
          ...cellStyle,
          borderTop: "2px solid color-mix(in srgb, var(--color-gold) 45%, transparent)",
        }}
      >
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Today
        </p>
        <p
          className="font-rune-serif leading-none"
          data-stat="today-words"
          style={{ color: "var(--text-primary)", fontSize: "1.75rem" }}
        >
          <TodayWordsCount value={todayWords} />
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          {todayWords > 0 ? "words written" : "Start today's session"}
        </p>
      </div>

      {/* Total Words */}
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
          {writingStreak.currentStreak === 0
            ? "Begin again today"
            : `${writingStreak.currentStreak === 1 ? "day" : "days"}${writingStreak.maxStreak > 0 ? ` · best: ${writingStreak.maxStreak}` : ""}`}
        </p>
      </div>

      {/* Manuscript Goal */}
      {(
        <button
          type="button"
          onClick={onOpenProgress}
          className="flex w-full flex-col gap-1 px-6 py-5 text-left transition-colors duration-150"
          style={cellStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "color-mix(in srgb, var(--color-gold) 4%, transparent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--surface-card)";
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "inset 0 0 0 2px color-mix(in srgb, var(--color-gold) 35%, transparent)";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
          aria-label={
            totalGoal
              ? `Edit manuscript goal — ${goalPercent}% complete`
              : "Set manuscript goal"
          }
        >
          <p
            className="mb-1 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Manuscript Goal
          </p>
          {totalGoal ? (
            <>
              <p
                className="font-rune-serif leading-none"
                style={{ color: "var(--text-primary)", fontSize: "1.75rem" }}
              >
                {goalPercent}%
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                {primaryProjectTitle ? `${primaryProjectTitle} · ` : ""}
                {totalGoal.current_words.toLocaleString()} /{" "}
                {totalGoal.target_words.toLocaleString()} words
              </p>
              <div
                className="mt-2 overflow-hidden rounded-full"
                style={{ height: "3px", background: "color-mix(in srgb, var(--color-gold) 12%, transparent)" }}
                role="progressbar"
                aria-valuenow={goalPercent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  style={{
                    width: `${goalPercent}%`,
                    height: "100%",
                    background: "var(--color-gold)",
                    opacity: 0.7,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <p
                className="font-rune-serif leading-none"
                style={{ color: "var(--text-primary)", fontSize: "1.75rem" }}
              >
                {primaryProjectTitle ?? "—"}
              </p>
              <p
                className="mt-1 text-xs italic"
                style={{ color: "var(--color-mist)", opacity: 0.7 }}
              >
                Writing freely
              </p>
            </>
          )}
        </button>
      )}
    </div>
  );
}
