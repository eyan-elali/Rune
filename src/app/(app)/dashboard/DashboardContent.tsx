"use client";

import Link from "next/link";
import { useModeStore } from "@/store/modeStore";
import { TaskList } from "@/components/tasks/TaskList";
import type { Project } from "@/lib/types";

// ── Shared sub-components ────────────────────────────────────────────────────

const cardStyle = {
  background: "var(--color-sepia)",
  border: "1px solid var(--color-border)",
} as const;

type RecentPageCard = {
  pageId: string;
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
  meta,
  className,
}: {
  href: string;
  label: string;
  title: string;
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
      <h3 className="font-rune-serif text-lg leading-snug text-rune-parchment group-hover:text-rune-gold transition-colors duration-150 line-clamp-2">
        {title}
      </h3>
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
      <p className="font-rune-serif text-sm text-rune-parchment/40">Nothing here yet</p>
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
        background: "var(--color-sepia)",
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
      <h3 className="font-rune-serif text-lg text-rune-parchment mb-2">{name}</h3>
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
}

const RACE_DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 300, label: "5 min" },
  { seconds: 600, label: "10 min" },
  { seconds: 900, label: "15 min" },
  { seconds: 1800, label: "30 min" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardContent({
  displayName,
  projects,
  totalWords,
  recentWork,
  recentPageCards,
  profile,
  personalBests,
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
          <h1 className="font-rune-serif text-4xl text-rune-parchment">
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

          {/* Column 2 — Personal Bests */}
          <div className="flex flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Personal Bests
            </h2>
            <div
              className="rounded-lg p-5"
              style={cardStyle}
            >
              <ul className="flex flex-col gap-3">
                {RACE_DURATIONS.map(({ seconds, label }) => (
                  <li key={seconds} className="flex items-center justify-between">
                    <span
                      className="text-sm"
                      style={{ color: "var(--color-mist)" }}
                    >
                      {label}
                    </span>
                    <span className="font-rune-serif text-sm text-rune-parchment">
                      {personalBests[seconds] != null
                        ? `${personalBests[seconds].toLocaleString()} words`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
        <h1 className="font-rune-serif text-4xl text-rune-parchment">
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
              background: "var(--color-sepia)",
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
              <h3 className="truncate font-rune-serif text-xl text-rune-parchment">
                {recentWork.chapterTitle}
              </h3>
            </div>
            <Link
              href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-150"
              style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
            >
              Continue Writing
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Stats">
        <div className="flex items-center gap-4 rounded-lg p-5" style={cardStyle}>
          <span className="text-2xl" aria-hidden>🏆</span>
          <div>
            <p className="font-rune-serif text-xl text-rune-parchment">
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
            <p className="font-rune-serif text-xl text-rune-parchment">
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
              <p className="font-rune-serif text-xl text-rune-parchment">
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
              label={recentPageCards[0].projectTitle}
              title={recentPageCards[0].chapterTitle}
              meta={`${recentPageCards[0].wordCount.toLocaleString()} words`}
            />
          ) : (
            <EmptyFocusCard label="Recent Page" />
          )}

          {recentPageCards[1] ? (
            <FocusCard
              href={`/projects/${recentPageCards[1].projectId}/chapters/${recentPageCards[1].chapterId}`}
              label={recentPageCards[1].projectTitle}
              title={recentPageCards[1].chapterTitle}
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
