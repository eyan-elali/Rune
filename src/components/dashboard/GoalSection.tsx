"use client";

import { useState, useTransition } from "react";
import { Trash2, Flame, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteGoal } from "@/lib/actions/writingStats";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
import { useToastStore } from "@/store/toastStore";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { UpgradeTeaser } from "@/components/billing/UpgradeTeaser";
import { AvgWordsPerChapter } from "./AvgWordsPerChapter";
import { CircularRing } from "./CircularRing";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

interface GoalSectionProps {
  goals: WritingGoal[];
  projects: Project[];
  writingStreak: { currentStreak: number; maxStreak: number };
  tier: SubscriptionTier;
}

export function GoalSection({
  goals,
  projects,
  writingStreak,
  tier,
}: GoalSectionProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const canAccessStreaks = canAccessFeature(tier, "streaks");
  const canAccessAvgWords = canAccessFeature(tier, "avgWordsWidget");
  const canAccessGoals = canAccessFeature(tier, "projectGoals");

  const totalGoal = goals.find((g) => g.type === "project_total") ?? null;
  const hasProjectTotalGoal = totalGoal !== null;

  async function handleDelete(id: string) {
    await deleteGoal(id);
    showToast("Goal removed.", "success");
    startTransition(() => router.refresh());
  }

  return (
    <section className="mb-10" aria-label="Writing momentum">
      <h2
        className="!mb-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Writing Goals
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

        {/* Card 1: Writing Streak */}
        {canAccessStreaks ? (
          <div className="flex flex-col rounded-lg p-5" style={cardStyle}>
            <div className="mb-3 flex items-center gap-2">
              <Flame size={13} style={{ color: "var(--color-gold)" }} aria-hidden />
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
              >
                Writing Streak
              </p>
            </div>

            {writingStreak.currentStreak > 0 ? (
              <>
                <p
                  className="font-rune-serif leading-none"
                  style={{ color: "var(--color-gold)", fontSize: "2.75rem" }}
                >
                  {writingStreak.currentStreak}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  Day Streak
                </p>
                <p
                  className="mt-auto pt-3 text-xs"
                  style={{ color: "var(--color-mist)", opacity: 0.55 }}
                >
                  Best: {writingStreak.maxStreak}{" "}
                  {writingStreak.maxStreak === 1 ? "day" : "days"}
                </p>
              </>
            ) : (
              <>
                <p
                  className="font-rune-serif leading-none"
                  style={{ color: "var(--text-primary)", fontSize: "2.75rem" }}
                >
                  0
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  Day Streak
                </p>
                <p
                  className="mt-auto pt-3 text-xs italic"
                  style={{ color: "var(--color-mist)", opacity: 0.6 }}
                >
                  Start your streak today
                </p>
              </>
            )}
          </div>
        ) : (
          <UpgradeTeaser
            feature="Writing Streaks"
            description="Track your consecutive days writing and maintain your momentum."
            tier="scribe"
          />
        )}

        {/* Card 2: Avg. Words Per Chapter */}
        {canAccessAvgWords ? (
          <AvgWordsPerChapter projects={projects} />
        ) : (
          <UpgradeTeaser
            feature="Advanced Analytics"
            description="View detailed word count performance and chapter averages."
            tier="scribe"
          />
        )}

        {/* Card 3: Project Total Goal */}
        {!canAccessGoals ? (
          <UpgradeTeaser
            feature="Writing Goals"
            description="Set project word count targets to keep your manuscripts on track."
            tier="scribe"
          />
        ) : totalGoal ? (
          <div
            className="relative flex flex-col rounded-lg p-5"
            style={cardStyle}
          >
            <button
              onClick={() => handleDelete(totalGoal.id)}
              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded transition-colors"
              style={{ color: "var(--color-mist)", opacity: 0.45 }}
              aria-label="Remove manuscript goal"
            >
              <Trash2 size={12} />
            </button>

            <div className="mb-1">
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
              >
                {totalGoal.project_title
                  ? `${totalGoal.project_title} — Total Target`
                  : "Manuscript Goal"}
              </p>
            </div>

            <div
              className="relative mx-auto my-3 flex items-center justify-center"
              style={{ width: 128, height: 128 }}
            >
              <CircularRing
                current={totalGoal.current_words}
                target={totalGoal.target_words}
                size={128}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span
                  className="font-rune-serif text-xl leading-none"
                  style={{ color: "var(--text-primary)" }}
                >
                  {totalGoal.current_words.toLocaleString()}
                </span>
                <span
                  className="mt-0.5 text-[9px] uppercase tracking-wider"
                  style={{ color: "var(--color-mist)" }}
                >
                  / {totalGoal.target_words.toLocaleString()}
                </span>
              </div>
            </div>

            {totalGoal.current_words >= totalGoal.target_words ? (
              <p
                className="mt-auto text-center text-xs italic"
                style={{ color: "var(--color-gold)" }}
              >
                Goal Reached! ✦
              </p>
            ) : (
              <p
                className="mt-auto text-center text-xs"
                style={{ color: "var(--color-mist)" }}
              >
                {(totalGoal.target_words - totalGoal.current_words).toLocaleString()} words to go
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className="flex flex-col items-center justify-center rounded-lg p-5 text-center transition-colors duration-150 hover:border-rune-gold/40"
            style={{
              background: "var(--surface-card)",
              border: "1px dashed var(--color-border)",
              cursor: "pointer",
            }}
            aria-label="Pin manuscript word count target"
          >
            <Crown size={20} className="mb-2 text-[var(--color-gold)]" aria-hidden />
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Manuscript Goal
            </p>
            <p className="mt-3 text-xs font-medium" style={{ color: "var(--color-gold)" }}>
              + Pinned Book Target
            </p>
          </button>
        )}
      </div>

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
    </section>
  );
}
