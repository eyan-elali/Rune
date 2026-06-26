"use client";

import Link from "next/link";
import { useModeStore } from "@/store/modeStore";
import { TaskList } from "@/components/tasks/TaskList";
import { UpgradeTeaser } from "@/components/billing/UpgradeTeaser";
import { canAccessFeature } from "@/lib/subscription";
import { FocusCard, EmptyFocusCard } from "@/components/dashboard/FocusCard";
import { EnemyCard, ENEMIES } from "@/components/dashboard/EnemyCard";
import { StatRowsCard } from "@/components/dashboard/StatRowsCard";
import { GoalSection } from "@/components/dashboard/GoalSection";
import { BetaFeedbackBanner } from "@/components/dashboard/BetaFeedbackBanner";
import { ContinueWritingHero } from "@/components/dashboard/ContinueWritingHero";
import type { DashboardContentProps, CombatRecord } from "@/components/dashboard/types";

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
}: DashboardContentProps) {
  const mode = useModeStore((s) => s.mode);
  const recentProject = projects[0] ?? null;
  const canSeeTasks = canAccessFeature(subscriptionTier, "tasks");

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

      <ContinueWritingHero
        recentWork={recentWork}
        recentPageCard={recentPageCards[0]}
      />

      <div className="mb-10">
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

      <GoalSection
        goals={goals}
        projects={projects}
        writingStreak={writingStreak}
        tier={subscriptionTier}
      />

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Stats">
        <div className="flex items-center gap-4 rounded-lg p-5" style={cardStyle}>
          <span className="text-2xl" aria-hidden>🏆</span>
          <div>
            <p
              className="font-rune-serif text-xl"
              style={{ color: "var(--text-primary)" }}
            >
              {totalWords.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              words written
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-lg p-5" style={cardStyle}>
          <span className="text-2xl" aria-hidden>📖</span>
          <div>
            <p
              className="font-rune-serif text-xl"
              style={{ color: "var(--text-primary)" }}
            >
              {projects.length}
            </p>
            <p className="text-xs" style={{ color: "var(--color-mist)" }}>
              {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
        </div>

        {profile && (
          <div className="flex items-center gap-4 rounded-lg p-5" style={cardStyle}>
            <span className="text-2xl" aria-hidden>✦</span>
            <div>
              <p
                className="font-rune-serif text-xl"
                style={{ color: "var(--text-primary)" }}
              >
                Level {profile.level}
              </p>
              <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                {profile.xp.toLocaleString()} XP
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mb-10" aria-label="Recent Work">
        <h2
          className="!mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Recent Work
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {recentProject ? (
            <FocusCard
              href={`/projects/${recentProject.id}`}
              label="Recent Project"
              title={recentProject.title}
              meta={`${recentProject.word_count.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Project" />
          )}

          {recentPageCards[0] ? (
            <FocusCard
              href={`/projects/${recentPageCards[0].projectId}/chapters/${recentPageCards[0].chapterId}`}
              label="Recent Page"
              title={recentPageCards[0].pageTitle}
              subtitle={`${recentPageCards[0].chapterTitle} · ${recentPageCards[0].projectTitle}`}
              meta={`${recentPageCards[0].wordCount.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Page" />
          )}

          {recentPageCards[1] ? (
            <FocusCard
              href={`/projects/${recentPageCards[1].projectId}/chapters/${recentPageCards[1].chapterId}`}
              label="Recent Page"
              title={recentPageCards[1].pageTitle}
              subtitle={`${recentPageCards[1].chapterTitle} · ${recentPageCards[1].projectTitle}`}
              meta={`${recentPageCards[1].wordCount.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Page" />
          )}
        </div>
      </section>

      <BetaFeedbackBanner />
    </div>
  );
}
