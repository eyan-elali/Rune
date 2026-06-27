"use client";

import { useState, useTransition } from "react";
import { Trash2, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteGoal } from "@/lib/actions/writingStats";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
import { useToastStore } from "@/store/toastStore";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { CircularRing } from "./CircularRing";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";

interface ProgressPanelProps {
  goals: WritingGoal[];
  writingStreak: { currentStreak: number; maxStreak: number };
  totalWords: number;
  profile: { xp: number; level: number } | null;
  projects: Project[];
  tier: SubscriptionTier;
}

const divider = (
  <div
    className="my-5"
    style={{ borderTop: "1px solid var(--color-border)" }}
  />
);

export function ProgressPanel({
  goals,
  writingStreak,
  totalWords,
  profile,
  projects,
  tier,
}: ProgressPanelProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const canAccessGoals = canAccessFeature(tier, "projectGoals");
  const canAccessStreaks = canAccessFeature(tier, "streaks");

  const totalGoal = goals.find((g) => g.type === "project_total") ?? null;
  const hasProjectTotalGoal = totalGoal !== null;

  async function handleDelete(id: string) {
    await deleteGoal(id);
    showToast("Goal removed.", "success");
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="flex h-full flex-col rounded-lg p-6"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--color-border)",
      }}
      aria-label="Writing progress"
    >
      <p
        className="mb-5 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Progress
      </p>

      {/* Manuscript Goal */}
      {!canAccessGoals ? (
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Manuscript Goal
          </p>
          <p
            className="font-rune-serif text-sm italic"
            style={{ color: "var(--color-mist)", opacity: 0.55 }}
          >
            Track your word count target with Scribe.
          </p>
        </div>
      ) : totalGoal ? (
        <div className="relative">
          <button
            onClick={() => handleDelete(totalGoal.id)}
            className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded transition-opacity hover:opacity-80"
            style={{ color: "var(--color-mist)", opacity: 0.35 }}
            aria-label="Remove manuscript goal"
          >
            <Trash2 size={11} />
          </button>

          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            {totalGoal.project_title ?? "Manuscript Goal"}
          </p>

          <div
            className="relative mx-auto flex items-center justify-center"
            style={{ width: 104, height: 104 }}
          >
            <CircularRing
              current={totalGoal.current_words}
              target={totalGoal.target_words}
              size={104}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                className="font-rune-serif text-base leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                {totalGoal.current_words.toLocaleString()}
              </span>
              <span
                className="mt-0.5 text-[8px] uppercase tracking-wider"
                style={{ color: "var(--color-mist)" }}
              >
                / {totalGoal.target_words.toLocaleString()}
              </span>
            </div>
          </div>

          <p
            className="mt-3 text-center text-xs"
            style={{ color: "var(--color-mist)" }}
          >
            {totalGoal.current_words >= totalGoal.target_words
              ? "Goal reached ✦"
              : `${(totalGoal.target_words - totalGoal.current_words).toLocaleString()} words to go`}
          </p>
        </div>
      ) : (
        <button
          onClick={() => setModalOpen(true)}
          className="flex w-full flex-col items-center justify-center rounded-md px-4 py-5 text-center transition-colors duration-150 hover:border-rune-gold/40"
          style={{
            border: "1px dashed var(--color-border)",
            cursor: "pointer",
          }}
          aria-label="Set manuscript word count target"
        >
          <Crown
            size={15}
            className="mb-2"
            style={{ color: "var(--color-gold)" }}
            aria-hidden
          />
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Manuscript Goal
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--color-gold)" }}>
            + Set word count target
          </p>
        </button>
      )}

      {divider}

      {/* Writing Streak */}
      <div>
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Writing Streak
        </p>
        {!canAccessStreaks ? (
          <p
            className="font-rune-serif text-sm italic"
            style={{ color: "var(--color-mist)", opacity: 0.55 }}
          >
            Track your streak with Scribe.
          </p>
        ) : (
          <>
            <p
              className="font-rune-serif leading-none"
              style={{
                color:
                  writingStreak.currentStreak > 0
                    ? "var(--color-gold)"
                    : "var(--text-primary)",
                fontSize: "2rem",
              }}
            >
              {writingStreak.currentStreak}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
              {writingStreak.currentStreak === 1 ? "day" : "days"}
            </p>
            {writingStreak.maxStreak > 0 && (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--color-mist)", opacity: 0.5 }}
              >
                Best: {writingStreak.maxStreak}{" "}
                {writingStreak.maxStreak === 1 ? "day" : "days"}
              </p>
            )}
          </>
        )}
      </div>

      {divider}

      {/* Total Words */}
      <div>
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Total Words
        </p>
        <p
          className="font-rune-serif leading-none"
          style={{ color: "var(--text-primary)", fontSize: "2rem" }}
        >
          {totalWords.toLocaleString()}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
          across all manuscripts
        </p>
      </div>

      {profile && (
        <>
          {divider}
          <div>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Level
            </p>
            <p
              className="font-rune-serif leading-none"
              style={{ color: "var(--text-primary)", fontSize: "2rem" }}
            >
              {profile.level}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
              {profile.xp.toLocaleString()} XP
            </p>
          </div>
        </>
      )}

      {modalOpen && canAccessGoals && (
        <AddGoalModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            startTransition(() => router.refresh());
          }}
          projects={projects}
          hasProjectTotalGoal={hasProjectTotalGoal}
        />
      )}
    </div>
  );
}
