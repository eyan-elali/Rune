"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useModeStore } from "@/store/modeStore";
import { TaskList } from "@/components/tasks/TaskList";
import { UpgradeTeaser } from "@/components/billing/UpgradeTeaser";
import { canAccessFeature } from "@/lib/subscription";
import { EnemyCard, ENEMIES } from "@/components/dashboard/EnemyCard";
import { StatRowsCard } from "@/components/dashboard/StatRowsCard";
import { BetaFeedbackBanner } from "@/components/dashboard/BetaFeedbackBanner";
import { YourStoryHero } from "@/components/dashboard/YourStoryHero";
import { MomentumStrip } from "@/components/dashboard/MomentumStrip";
import { ExploreRuneSection } from "@/components/dashboard/ExploreRuneSection";
import { ProgressDrawer } from "@/components/dashboard/ProgressDrawer";
import type { DashboardContentProps, CombatRecord } from "@/components/dashboard/types";
import type { WritingGoal } from "@/lib/actions/writingStats";

// ── Game mode constants ───────────────────────────────────────────────────────

const RACE_DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 300, label: "5 min" },
  { seconds: 600, label: "10 min" },
  { seconds: 900, label: "15 min" },
  { seconds: 1800, label: "30 min" },
];

const COMBAT_ADVERSARIES: { id: string; name: string }[] = [
  { id: "blank-page", name: "The Blank Page" },
  { id: "writers-block", name: "Writer's Block" },
  { id: "deadline", name: "The Deadline" },
];

function formatCombatRecord(record: CombatRecord | undefined): string {
  if (!record) return "—";
  const { wins, losses } = record;
  if (wins === 0 && losses === 0) return "—";
  const winLabel = wins === 1 ? "Win" : "Wins";
  const lossLabel = losses === 1 ? "Defeat" : "Defeats";
  return `${wins} ${winLabel} · ${losses} ${lossLabel}`;
}

// ── Card style shared by inline cards in this file ───────────────────────────

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardContent({
  displayName,
  projects,
  totalWords,
  recentWork,
  recentPageCards,
  profile,
  personalBests,
  combatRecords = {},
  goals = [],
  writingStreak = { currentStreak: 0, maxStreak: 0 },
  subscriptionTier = "free",
  todayWords = 0,
  progressChapters = [],
  avgWordsPerDay = 0,
}: DashboardContentProps) {
  const mode = useModeStore((s) => s.mode);
  const recentProject = projects[0] ?? null;
  const canSeeTasks = canAccessFeature(subscriptionTier, "tasks");
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [localGoals, setLocalGoals] = useState<WritingGoal[]>(goals);

  // Sync local goals when server re-fetches (after router.refresh())
  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

  function handleGoalsChange(newGoals: WritingGoal[]) {
    setLocalGoals(newGoals);
  }


  // ── Focus mode ──────────────────────────────────────────────────────────────
  if (mode === "focus") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[480px]">
          {canSeeTasks ? (
            <TaskList />
          ) : (
            <UpgradeTeaser
              feature="Task Manager"
              description="Organize your writing with a personal task list."
              tier="scribe"
            />
          )}
        </div>
      </div>
    );
  }

  // ── Game mode ───────────────────────────────────────────────────────────────
  if (mode === "game") {
    return (
      <div className="mx-auto max-w-5xl px-10 py-12">
        <div className="mb-8">
          <h1
            className="font-rune-serif text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            The Arena
          </h1>
          <p className="mt-2 font-rune-serif text-lg text-rune-mist">
            Words are weapons. Use them.
          </p>
        </div>

        <div className="mb-8">
          {canSeeTasks ? (
            <TaskList />
          ) : (
            <UpgradeTeaser
              feature="Task Manager"
              description="Organize your writing with a personal task list."
              tier="scribe"
            />
          )}
        </div>

        {/* Row 1 — Enemies */}
        <section className="mb-8" aria-label="Enemies">
          <h2
            className="!mb-4 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Enemies
          </h2>
          <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
            {ENEMIES.map((e) => (
              <EnemyCard key={e.id} {...e} />
            ))}
          </div>
        </section>

        {/* Row 2 — Stats & Quick Start */}
        <section
          className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3"
          aria-label="Arena stats and quick start"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Personal Bests
            </h2>
            <StatRowsCard
              rows={RACE_DURATIONS.map(({ seconds, label }) => ({
                label,
                value:
                  personalBests[String(seconds)] != null
                    ? `${personalBests[String(seconds)].toLocaleString()} words`
                    : "—",
              }))}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Combat Records
            </h2>
            <StatRowsCard
              rows={COMBAT_ADVERSARIES.map(({ id, name }) => ({
                label: name,
                value: formatCombatRecord(combatRecords[id]),
              }))}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Quick Start
            </h2>
            <div
              className="flex flex-1 flex-col gap-3 rounded-lg p-5"
              style={cardStyle}
            >
              <Link
                href="/games"
                className="flex items-center justify-center rounded-md px-6 py-4 text-base font-medium transition-colors duration-150 hover:bg-rune-gold/10"
                style={{
                  border: "1px solid var(--color-gold)",
                  color: "var(--color-gold)",
                  background: "transparent",
                }}
              >
                Enter the Arena
              </Link>
              <Link
                href="/games/race"
                className="flex items-center justify-center rounded-md px-6 py-4 text-base font-medium transition-colors duration-150 hover:bg-rune-gold/10"
                style={{
                  border: "1px solid var(--color-gold)",
                  color: "var(--color-gold)",
                  background: "transparent",
                }}
              >
                Race Yourself
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Normal mode ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      {/* Welcome */}
      <div className="mb-10">
        <h1
          className="font-rune-serif text-4xl"
          style={{ color: "var(--text-primary)" }}
        >
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          The page is waiting.
        </p>
      </div>

      {/* Your Story hero */}
      <div className="mb-6">
        <YourStoryHero
          recentWork={recentWork}
          recentPageCard={recentPageCards[0]}
          todayWords={todayWords}
          writingStreak={writingStreak}
          goals={goals}
        />
      </div>

      {/* Momentum strip */}
      <div className="mb-8">
        <MomentumStrip
          totalWords={totalWords}
          writingStreak={writingStreak ?? { currentStreak: 0, maxStreak: 0 }}
          goals={localGoals}
          tier={subscriptionTier ?? "free"}
          todayWords={todayWords}
        />
      </div>

      {/* Explore Rune */}
      <div className="mb-10">
        <ExploreRuneSection onProgressClick={() => setIsProgressOpen(true)} />
      </div>

      <BetaFeedbackBanner />

      {/* Progress drawer */}
      <ProgressDrawer
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        projects={projects}
        initialProject={recentProject}
        goals={localGoals}
        initialChapters={progressChapters}
        avgWordsPerDay={avgWordsPerDay}
        onGoalsChange={handleGoalsChange}
      />
    </div>
  );
}
