"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Trash2, Feather } from "lucide-react";
import { useModeStore } from "@/store/modeStore";
import { TaskList } from "@/components/tasks/TaskList";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { deleteGoal } from "@/lib/actions/writingStats";
import { useToastStore } from "@/store/toastStore";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";

// ── Shared sub-components ────────────────────────────────────────────────────

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

type RecentPageCard = {
  pageId: string;
  pageTitle: string;
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  wordCount: number;
};

type RecentWork = {
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  coverColor: string | null;
};

function FocusCard({
  href,
  label,
  title,
  subtitle,
  meta,
  className,
}: {
  href: string;
  label: string;
  title: string;
  subtitle?: string;
  meta: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className ?? ""}`}
      style={cardStyle}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <h3
        className="font-rune-serif text-lg leading-snug transition-colors duration-150 group-hover:text-rune-gold line-clamp-2"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1 text-xs line-clamp-1" style={{ color: "var(--color-mist)" }}>
          {subtitle}
        </p>
      )}
      <p className="mt-auto pt-3 text-xs" style={{ color: "var(--color-mist)" }}>
        {meta}
      </p>
    </Link>
  );
}

function EmptyFocusCard({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col rounded-lg p-5"
      style={{ ...cardStyle, borderStyle: "dashed" }}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <p
        className="font-rune-serif text-sm"
        style={{ color: "var(--text-primary)", opacity: 0.4 }}
      >
        Nothing here yet
      </p>
    </div>
  );
}

// ── Enemy card ───────────────────────────────────────────────────────────────

const ENEMIES = [
  {
    id: "blank-page",
    name: "The Blank Page",
    hp: 500,
    description: "An endless white void — silent, patient, and utterly merciless.",
    gimmick: null,
  },
  {
    id: "writers-block",
    name: "Writer's Block",
    hp: 800,
    description: "A stubborn phantom that feeds on hesitation. Stop moving and it heals.",
    gimmick: "Heals 50 HP every 60 s",
  },
  {
    id: "deadline",
    name: "The Deadline",
    hp: 1200,
    description: "Time itself, weaponised. Every idle moment costs double.",
    gimmick: "2× idle damage",
  },
] as const;

function EnemyCard({ name, hp, description, gimmick }: (typeof ENEMIES)[number]) {
  return (
    <div
      className="flex flex-col rounded-lg p-5"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--color-border)",
        borderTopColor: "var(--color-crimson)",
        borderTopWidth: "2px",
      }}
    >
      <p
        className="mb-0.5 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-crimson)" }}
      >
        {hp} HP
        {gimmick && (
          <span style={{ color: "var(--color-mist)" }}> · {gimmick}</span>
        )}
      </p>
      <h3
        className="mb-2 font-rune-serif text-lg"
        style={{ color: "var(--text-primary)" }}
      >
        {name}
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--color-mist)" }}>
        {description}
      </p>
      <Link
        href="/games/battle"
        className="mt-auto inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
        style={{ background: "var(--color-crimson)", color: "var(--color-parchment)" }}
      >
        Enter Battle
      </Link>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DashboardContentProps {
  displayName: string;
  projects: Project[];
  totalWords: number;
  recentWork: RecentWork | null;
  recentPageCards: RecentPageCard[];
  profile: { display_name: string | null; xp: number; level: number } | null;
  personalBests: Record<string, number>;
  combatRecords?: Record<string, CombatRecord>;
  wordsToday?: number;
  goals?: WritingGoal[];
}

const RACE_DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 300, label: "5 min" },
  { seconds: 600, label: "10 min" },
  { seconds: 900, label: "15 min" },
  { seconds: 1800, label: "30 min" },
];

type CombatRecord = { wins: number; losses: number };

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

function StatRowsCard({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg p-5" style={cardStyle}>
      <ul className="flex flex-col gap-3">
        {rows.map(({ label, value }) => (
          <li key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm" style={{ color: "var(--color-mist)" }}>
              {label}
            </span>
            <span
              className="shrink-0 font-rune-serif text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Goal section ──────────────────────────────────────────────────────────────

function GoalProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const reached = current >= target;
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(201,168,76,0.12)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: reached ? "var(--color-sage)" : "var(--color-gold)",
        }}
      />
    </div>
  );
}

function GoalSection({
  goals,
  wordsToday,
  projects,
}: {
  goals: WritingGoal[];
  wordsToday: number;
  projects: Project[];
}) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [showModal, setShowModal] = useState(false);
  const [, startTransition] = useTransition();

  const hasDailyGoal = goals.some((g) => g.type === "daily_global");
  const dailyGoal = goals.find((g) => g.type === "daily_global");

  async function handleDelete(id: string) {
    await deleteGoal(id);
    showToast("Goal removed.", "success");
    startTransition(() => router.refresh());
  }

  return (
    <section className="mb-10" aria-label="Writing goals">
      {/* Words Today */}
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Writing Goals
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            border: "1px solid var(--color-border)",
            color: "var(--color-gold)",
          }}
          aria-label="Add writing goal"
        >
          <Plus size={12} />
          Add Goal
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Words Today card — always shown */}
        <div
          className="flex items-start gap-4 rounded-lg p-5"
          style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
        >
          <Feather
            size={18}
            style={{ color: "var(--color-gold)", flexShrink: 0, marginTop: 2 }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="font-rune-serif text-3xl leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                {wordsToday.toLocaleString()}
              </span>
              <span className="text-sm" style={{ color: "var(--color-mist)" }}>
                words today
              </span>
            </div>
            {dailyGoal && (
              <>
                <GoalProgressBar current={wordsToday} target={dailyGoal.target_words} />
                <p className="mt-1.5 text-xs" style={{ color: "var(--color-mist)" }}>
                  {wordsToday >= dailyGoal.target_words
                    ? "Daily goal reached ✦"
                    : `${(dailyGoal.target_words - wordsToday).toLocaleString()} to go — goal: ${dailyGoal.target_words.toLocaleString()} words`}
                </p>
              </>
            )}
          </div>
          {dailyGoal && (
            <button
              onClick={() => handleDelete(dailyGoal.id)}
              className="mt-0.5 flex h-6 w-6 items-center justify-center rounded transition-colors"
              style={{ color: "var(--color-mist)", opacity: 0.5 }}
              aria-label="Remove daily goal"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Project total goals */}
        {goals
          .filter((g) => g.type === "project_total")
          .map((goal) => {
            const reached = goal.current_words >= goal.target_words;
            const remaining = goal.target_words - goal.current_words;
            return (
              <div
                key={goal.id}
                className="flex items-start gap-4 rounded-lg p-5"
                style={{
                  background: "var(--surface-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="mb-0.5 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "var(--color-mist)" }}
                  >
                    Project Goal
                  </p>
                  <p
                    className="font-rune-serif text-base leading-snug"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {goal.project_title ?? "Unknown Project"} — {goal.target_words.toLocaleString()} words
                  </p>
                  <GoalProgressBar current={goal.current_words} target={goal.target_words} />
                  <p className="mt-1.5 text-xs" style={{ color: "var(--color-mist)" }}>
                    {reached
                      ? "Goal reached! ✦"
                      : `${remaining.toLocaleString()} words to go · ${goal.current_words.toLocaleString()} written`}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(goal.id)}
                  className="mt-0.5 flex h-6 w-6 items-center justify-center rounded transition-colors"
                  style={{ color: "var(--color-mist)", opacity: 0.5 }}
                  aria-label="Remove goal"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}

        {goals.length === 0 && (
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{
              border: "1px dashed var(--color-border)",
              color: "var(--color-mist)",
            }}
          >
            No goals set. Add one to track your progress.
          </div>
        )}
      </div>

      {showModal && (
        <AddGoalModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            startTransition(() => router.refresh());
          }}
          projects={projects}
          hasDailyGoal={hasDailyGoal}
        />
      )}
    </section>
  );
}

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
  wordsToday = 0,
  goals = [],
}: DashboardContentProps) {
  const mode = useModeStore((s) => s.mode);
  const recentProject = projects[0] ?? null;

  if (mode === "focus") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[480px]">
          <TaskList />
        </div>
      </div>
    );
  }

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
          <TaskList />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Column 1 — Enemies */}
          <div className="flex flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Enemies
            </h2>
            {ENEMIES.map((e) => (
              <EnemyCard key={e.id} {...e} />
            ))}
          </div>

          {/* Column 2 — Personal Bests & Combat Records */}
          <div className="flex flex-col gap-4">
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

          {/* Column 3 — Quick Start */}
          <div className="flex flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Quick Start
            </h2>
            <div className="flex flex-col gap-3">
              <Link
                href="/games"
                className="flex items-center justify-center rounded-md px-6 py-4 text-base font-medium transition-colors duration-150"
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
                className="flex items-center justify-center rounded-md px-6 py-4 text-base font-medium transition-colors duration-150"
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
        </div>
      </div>
    );
  }

  // Normal mode
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

      <div className="mb-10">
        <TaskList />
      </div>

      {recentWork && (
        <section className="mb-10" aria-label="Continue Writing">
          <h2
            className="!mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-mist)" }}
          >
            Continue Writing
          </h2>
          <div
            className="flex items-center gap-6 rounded-lg p-6"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--color-border)",
              borderLeftColor: recentWork.coverColor ?? "var(--color-gold)",
              borderLeftWidth: "4px",
            }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="mb-0.5 text-xs uppercase tracking-wider"
                style={{ color: "var(--color-mist)" }}
              >
                {recentWork.projectTitle}
              </p>
              <h3
                className="truncate font-rune-serif text-xl"
                style={{ color: "var(--text-primary)" }}
              >
                {recentWork.chapterTitle}
              </h3>
            </div>
            <Link
              href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-150"
              style={{ background: "var(--color-gold)", color: "var(--text-on-accent)" }}
            >
              Continue Writing
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      <GoalSection goals={goals} wordsToday={wordsToday} projects={projects} />

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

      <section className="mb-10" aria-label="Current Focus">
        <h2
          className="!mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Current Focus
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
    </div>
  );
}
