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
import { createGoal, updateGoal, deleteGoal } from "@/lib/actions/writingStats";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const recentProject = projects[0] ?? null;
  const canSeeTasks = canAccessFeature(subscriptionTier, "tasks");
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [localGoals, setLocalGoals] = useState<WritingGoal[]>(goals);

  // Goal form state (strip-level, shared with drawer via localGoals)
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [goalProjectId, setGoalProjectId] = useState<string | undefined>(recentProject?.id);
  const [goalInput, setGoalInput] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  const formGoal =
    localGoals.find(
      (g) => g.type === "project_total" && g.project_id === goalProjectId
    ) ?? null;

  // Sync local goals when server re-fetches (after router.refresh())
  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

  function handleGoalsChange(newGoals: WritingGoal[]) {
    setLocalGoals(newGoals);
  }

  function handleGoalProjectChange(projectId: string) {
    setGoalProjectId(projectId);
    const existingGoal = localGoals.find(
      (g) => g.type === "project_total" && g.project_id === projectId
    );
    setGoalInput(existingGoal ? String(existingGoal.target_words) : "");
    setGoalError(null);
  }

  function openGoalForm() {
    const defaultId = recentProject?.id;
    setGoalProjectId(defaultId);
    const existingGoal = localGoals.find(
      (g) => g.type === "project_total" && g.project_id === defaultId
    );
    setGoalInput(existingGoal ? String(existingGoal.target_words) : "");
    setGoalError(null);
    setIsGoalFormOpen(true);
  }

  async function handleSaveGoal() {
    const target = parseInt(goalInput, 10);
    if (isNaN(target) || target < 100) {
      setGoalError("Enter a valid word count (minimum 100).");
      return;
    }
    setGoalSaving(true);
    setGoalError(null);
    try {
      const selectedProjectObj = projects.find((p) => p.id === goalProjectId);
      if (formGoal) {
        const result = await updateGoal(formGoal.id, target);
        if (result.error) { setGoalError(result.error); return; }
        handleGoalsChange(
          localGoals.map((g) =>
            g.id === formGoal.id ? { ...g, target_words: target } : g
          )
        );
      } else {
        const result = await createGoal("project_total", target, goalProjectId);
        if (result.error) { setGoalError(result.error); return; }
        if (result.data) {
          handleGoalsChange([
            ...localGoals,
            { ...result.data, current_words: selectedProjectObj?.word_count ?? 0 },
          ]);
        }
      }
      setIsGoalFormOpen(false);
      router.refresh();
    } finally {
      setGoalSaving(false);
    }
  }

  async function handleDeleteGoal() {
    if (!formGoal) return;
    setGoalSaving(true);
    setGoalError(null);
    try {
      const result = await deleteGoal(formGoal.id);
      if (result.error) { setGoalError(result.error); return; }
      handleGoalsChange(localGoals.filter((g) => g.id !== formGoal.id));
      setIsGoalFormOpen(false);
      router.refresh();
    } finally {
      setGoalSaving(false);
    }
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
          primaryProjectId={recentProject?.id}
          onGoalAction={
            canAccessFeature(subscriptionTier ?? "free", "projectGoals")
              ? openGoalForm
              : undefined
          }
        />
      </div>

      {/* Inline goal form — rendered below the strip */}
      {isGoalFormOpen && (
        <div
          className="mb-8 overflow-hidden rounded-lg"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border)",
            borderTop: "2px solid rgba(201, 168, 76, 0.25)",
          }}
        >
          {/* Form header */}
          <div className="px-6 pb-4 pt-5">
            <p className="font-rune-serif text-base" style={{ color: "var(--text-primary)" }}>
              {formGoal ? "Edit manuscript goal" : "Set a manuscript goal"}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-mist)" }}>
              Track your progress toward a word count target.
            </p>
          </div>

          {/* Form body */}
          <div
            className="px-6 pb-5 pt-4"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <div className="flex flex-col gap-4">
              {/* Project selector — only when multiple projects exist */}
              {projects.length > 1 && (
                <div>
                  <label
                    htmlFor="goal-form-project"
                    className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--color-mist)" }}
                  >
                    Manuscript
                  </label>
                  <select
                    id="goal-form-project"
                    value={goalProjectId ?? ""}
                    onChange={(e) => handleGoalProjectChange(e.target.value)}
                    className="rounded-md px-3 py-2 text-sm outline-none transition-colors"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--color-border-strong)",
                      color: "var(--text-primary)",
                      width: "100%",
                      maxWidth: "320px",
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLSelectElement).style.borderColor =
                        "var(--color-gold)";
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLSelectElement).style.borderColor =
                        "var(--color-border-strong)";
                    }}
                  >
                    {projects.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        style={{ background: "var(--color-sepia)" }}
                      >
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Word count target */}
              <div>
                <label
                  htmlFor="goal-form-target"
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-mist)" }}
                >
                  Word count target
                </label>
                <input
                  id="goal-form-target"
                  type="number"
                  min={100}
                  step={1000}
                  placeholder="e.g. 80,000"
                  value={goalInput}
                  onChange={(e) => {
                    setGoalInput(e.target.value);
                    setGoalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveGoal();
                    if (e.key === "Escape") setIsGoalFormOpen(false);
                  }}
                  className="rounded-md px-3 py-2 text-sm outline-none transition-colors"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--text-primary)",
                    width: "100%",
                    maxWidth: "200px",
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor =
                      "var(--color-gold)";
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor =
                      "var(--color-border-strong)";
                  }}
                  autoFocus
                />
                {goalError && (
                  <p className="mt-1.5 text-xs" style={{ color: "var(--color-crimson)" }}>
                    {goalError}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveGoal}
                disabled={goalSaving}
                className="rounded px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{
                  border: "1px solid rgba(201, 168, 76, 0.45)",
                  color: "var(--color-gold)",
                  background: "rgba(201, 168, 76, 0.06)",
                }}
              >
                {goalSaving ? "Saving…" : "Save goal"}
              </button>
              {formGoal && (
                <button
                  onClick={handleDeleteGoal}
                  disabled={goalSaving}
                  className="rounded px-3 py-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ color: "var(--color-mist)" }}
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setIsGoalFormOpen(false)}
                disabled={goalSaving}
                className="ml-auto text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ color: "var(--color-mist)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
