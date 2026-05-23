"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Trash2, Flame } from "lucide-react";
import { useModeStore } from "@/store/modeStore";
import { TaskList } from "@/components/tasks/TaskList";
import { UpgradeTeaser } from "@/components/billing/UpgradeTeaser";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { deleteGoal } from "@/lib/actions/writingStats";
import { getProjectStats } from "@/lib/actions/projects";
import { useToastStore } from "@/store/toastStore";
import { useRouter } from "next/navigation";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
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
        className="!mb-2 font-rune-serif text-lg"
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
  goals?: WritingGoal[];
  writingStreak?: { currentStreak: number; maxStreak: number };
  subscriptionTier?: SubscriptionTier;
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

// ── Circular ring (for project goal) ─────────────────────────────────────────

function CircularRing({
  current,
  target,
  size = 128,
}: {
  current: number;
  target: number;
  size?: number;
}) {
  const strokeWidth = 9;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, target > 0 ? current / target : 0);
  const reached = current >= target && target > 0;
  const strokeColor = reached ? "var(--color-sage)" : "var(--color-gold)";
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(201,168,76,0.10)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
      />
    </svg>
  );
}

// ── Average Words Per Chapter widget ─────────────────────────────────────────

function AvgWordsPerChapter({ projects }: { projects: Project[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? "");
  const [metric, setMetric] = useState<number | "none" | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("rune_avg_wpc_project_id");
    const resolvedId =
      stored && projects.some((p) => p.id === stored) ? stored : (projects[0]?.id ?? "");
    setSelectedProjectId(resolvedId);
    setInitialized(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized || !selectedProjectId) return;
    setLoading(true);
    getProjectStats(selectedProjectId).then(({ chapterCount, totalCanonicalWords }) => {
      setMetric(chapterCount === 0 ? "none" : Math.round(totalCanonicalWords / chapterCount));
      setLoading(false);
    });
  }, [selectedProjectId, initialized]);

  function handleSelect(projectId: string) {
    setSelectedProjectId(projectId);
    localStorage.setItem("rune_avg_wpc_project_id", projectId);
  }

  return (
    <div className="flex flex-col rounded-lg p-5" style={cardStyle}>
      <div className="mb-3">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Avg. Words / Chapter
        </p>
      </div>

      {projects.length > 0 ? (
        <>
          <select
            value={selectedProjectId}
            onChange={(e) => handleSelect(e.target.value)}
            className="mb-4 w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-rune-gold/40"
            style={{
              background: "var(--color-sepia)",
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
            }}
            aria-label="Select project for average words per chapter"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} style={{ background: "var(--color-sepia)" }}>
                {p.title}
              </option>
            ))}
          </select>

          {loading ? (
            <p
              className="font-rune-serif leading-none"
              style={{ color: "var(--text-primary)", opacity: 0.35, fontSize: "2.75rem" }}
            >
              …
            </p>
          ) : metric === "none" || metric === null ? (
            <p
              className="font-rune-serif text-sm"
              style={{ color: "var(--text-primary)", opacity: 0.45 }}
            >
              No chapters yet
            </p>
          ) : (
            <>
              <p
                className="font-rune-serif leading-none"
                style={{ color: "var(--text-primary)", fontSize: "2.75rem" }}
              >
                {(metric as number).toLocaleString()}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                avg. words per chapter
              </p>
            </>
          )}
        </>
      ) : (
        <p
          className="font-rune-serif text-sm"
          style={{ color: "var(--text-primary)", opacity: 0.45 }}
        >
          No projects yet
        </p>
      )}
    </div>
  );
}

// ── Goal section ──────────────────────────────────────────────────────────────

function GoalSection({
  goals,
  projects,
  writingStreak,
  tier,
}: {
  goals: WritingGoal[];
  projects: Project[];
  writingStreak: { currentStreak: number; maxStreak: number };
  tier: SubscriptionTier;
}) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const canAccessStreaks = canAccessFeature(tier, 'streaks');
  const canAccessAvgWords = canAccessFeature(tier, 'avgWordsWidget');
  const canAccessGoals = canAccessFeature(tier, 'projectGoals');

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

        {/* ── Card 1: Writing Streak ──────────────────────────────── */}
        {canAccessStreaks ? (
          <div className="flex flex-col rounded-lg p-5" style={cardStyle}>
            <div className="mb-3 flex items-center gap-2">
              <Flame size={13} style={{ color: "var(--color-gold)" }} aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
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
                <p className="mt-auto pt-3 text-xs" style={{ color: "var(--color-mist)", opacity: 0.55 }}>
                  Best: {writingStreak.maxStreak} {writingStreak.maxStreak === 1 ? "day" : "days"}
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
                <p className="mt-auto pt-3 text-xs italic" style={{ color: "var(--color-mist)", opacity: 0.6 }}>
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

        {/* ── Card 2: Avg. Words Per Chapter ─────────────────────── */}
        {canAccessAvgWords ? (
          <AvgWordsPerChapter projects={projects} />
        ) : (
          <UpgradeTeaser
            feature="Advanced Analytics"
            description="View detailed word count performance and chapter averages."
            tier="scribe"
          />
        )}

        {/* ── Card 3: Project Total Goal ──────────────────────────── */}
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
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                {totalGoal.project_title ? `${totalGoal.project_title} — Total Target` : "Manuscript Goal"}
              </p>
            </div>

            <div className="relative mx-auto my-3 flex items-center justify-center" style={{ width: 128, height: 128 }}>
              <CircularRing current={totalGoal.current_words} target={totalGoal.target_words} size={128} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-rune-serif text-xl leading-none" style={{ color: "var(--text-primary)" }}>
                  {totalGoal.current_words.toLocaleString()}
                </span>
                <span className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: "var(--color-mist)" }}>
                  / {totalGoal.target_words.toLocaleString()}
                </span>
              </div>
            </div>

            {totalGoal.current_words >= totalGoal.target_words ? (
              <p className="mt-auto text-center text-xs italic" style={{ color: "var(--color-gold)" }}>
                Goal Reached! ✦
              </p>
            ) : (
              <p className="mt-auto text-center text-xs" style={{ color: "var(--color-mist)" }}>
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
            <span className="mb-2 text-lg" style={{ color: "var(--color-border-strong)" }} aria-hidden>◎</span>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
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
  subscriptionTier = 'free',
}: DashboardContentProps) {
  const mode = useModeStore((s) => s.mode);
  const recentProject = projects[0] ?? null;
  const canSeeTasks = canAccessFeature(subscriptionTier, 'tasks');

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
