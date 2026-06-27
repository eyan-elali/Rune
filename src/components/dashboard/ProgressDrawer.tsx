"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function formatReadTime(words: number): string {
  const minutes = Math.round(words / 250);
  if (minutes < 60) return `${minutes} min read`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h read`;
  return `${hours}h ${mins}m read`;
}

function estimateWeeks(remaining: number, avgPerDay: number): string {
  const days = remaining / avgPerDay;
  const weeks = Math.round(days / 7);
  if (weeks < 1) return "Less than a week";
  if (weeks === 1) return "About 1 week";
  if (weeks < 52) return `About ${weeks} weeks`;
  const months = Math.round(weeks / 4.3);
  return `About ${months} months`;
}

const MILESTONES = [
  { words: 10_000, name: "First Act" },
  { words: 25_000, name: "Quarter Mark" },
  { words: 50_000, name: "Midpoint" },
  { words: 75_000, name: "Third Act" },
  { words: 100_000, name: "Full Novel" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ProgressDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  goals: WritingGoal[];
  chapterCount: number;
  chapterWordCounts: number[];
  avgWordsPerDay: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProgressDrawer({
  isOpen,
  onClose,
  project,
  goals,
  chapterCount,
  chapterWordCounts,
  avgWordsPerDay,
}: ProgressDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const currentWords = project?.word_count ?? 0;

  const manuscriptGoal = goals.find(
    (g) => g.type === "project_total" && g.project_id === project?.id
  );
  const targetWords = manuscriptGoal?.target_words ?? null;

  const percentage =
    targetWords && targetWords > 0
      ? Math.min(100, Math.round((currentWords / targetWords) * 100))
      : null;
  const remaining =
    targetWords !== null ? Math.max(0, targetWords - currentWords) : null;

  const isComplete = remaining !== null && remaining <= 0;

  let finishText: string | null = null;
  if (targetWords !== null) {
    if (isComplete) {
      finishText = "Manuscript target reached.";
    } else if (remaining !== null && avgWordsPerDay > 0) {
      finishText = estimateWeeks(remaining, avgWordsPerDay);
    }
  }

  const readTime =
    currentWords > 0 ? formatReadTime(currentWords) : null;

  const nonZero = chapterWordCounts.filter((w) => w > 0);
  const avgPerChapter =
    nonZero.length > 0
      ? Math.round(nonZero.reduce((s, w) => s + w, 0) / nonZero.length)
      : 0;

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "var(--color-ink)",
          opacity: isOpen ? 0.22 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Manuscript Progress"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-y-auto transition-transform duration-300"
        style={{
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--color-border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: "-10px 0 40px var(--color-shadow)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-start justify-between px-7 pb-5 pt-6"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <h2
              className="font-rune-serif text-xl"
              style={{ color: "var(--text-primary)" }}
            >
              Progress
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
              How your manuscript is taking shape.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close progress panel"
            className="ml-4 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-opacity hover:opacity-60"
            style={{ color: "var(--color-mist)" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1L12 12M12 1L1 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col">
          {project ? (
            <>
              {/* Current manuscript */}
              <DrawerSection label="Your Manuscript">
                <p
                  className="font-rune-serif text-2xl leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {project.title}
                </p>
              </DrawerSection>

              <DrawerDivider />

              {/* Manuscript completion arc */}
              <DrawerSection label="Manuscript Progress">
                {targetWords ? (
                  <div className="space-y-3">
                    <p
                      className="font-rune-serif text-lg"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {fmt(currentWords)}{" "}
                      <span
                        className="text-sm font-normal"
                        style={{ color: "var(--color-mist)" }}
                      >
                        / {fmt(targetWords)} words
                      </span>
                    </p>

                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--color-border)" }}
                      role="progressbar"
                      aria-valuenow={percentage ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage ?? 0}%`,
                          background: "var(--color-gold)",
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-mist)" }}
                      >
                        {percentage}% complete
                      </span>
                      {!isComplete && remaining !== null && (
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-mist)" }}
                        >
                          {fmt(remaining)} words remaining
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p
                      className="font-rune-serif text-2xl"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {fmt(currentWords)}
                      <span
                        className="ml-2 text-sm font-normal"
                        style={{ color: "var(--color-mist)" }}
                      >
                        words
                      </span>
                    </p>
                    <Link
                      href="/settings"
                      className="text-xs transition-opacity hover:opacity-70"
                      style={{ color: "var(--color-mist)" }}
                      onClick={onClose}
                    >
                      Set a manuscript word goal to track completion →
                    </Link>
                  </div>
                )}
              </DrawerSection>

              {/* Estimated finish — only when there's a target */}
              {targetWords !== null && (
                <>
                  <DrawerDivider />
                  <DrawerSection label="Estimated Finish">
                    {finishText ? (
                      <div className="space-y-1">
                        <p
                          className="font-rune-serif text-base"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {finishText}
                        </p>
                        {!isComplete && avgWordsPerDay > 0 && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--color-mist)" }}
                          >
                            based on your average {fmt(avgWordsPerDay)} words
                            per active day
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--color-mist)" }}>
                        Write a few more sessions to estimate your finish.
                      </p>
                    )}
                  </DrawerSection>
                </>
              )}

              {/* Estimated read time */}
              {readTime && (
                <>
                  <DrawerDivider />
                  <DrawerSection label="Estimated Read Time">
                    <p
                      className="font-rune-serif text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {readTime}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--color-mist)" }}
                    >
                      at 250 words per minute
                    </p>
                  </DrawerSection>
                </>
              )}

              {/* Chapter shape */}
              {chapterCount > 0 && (
                <>
                  <DrawerDivider />
                  <DrawerSection label="Chapter Shape">
                    <div className="space-y-2.5">
                      <StatRow
                        label="Total chapters"
                        value={String(chapterCount)}
                      />
                      {avgPerChapter > 0 && (
                        <StatRow
                          label="Avg. per chapter"
                          value={`~${fmt(avgPerChapter)} words`}
                        />
                      )}
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      className="mt-4 inline-block text-xs transition-opacity hover:opacity-70"
                      style={{ color: "var(--color-gold-dim)" }}
                      onClick={onClose}
                    >
                      Manage chapters →
                    </Link>
                  </DrawerSection>
                </>
              )}

              {/* Milestones */}
              <DrawerDivider />
              <DrawerSection label="Milestones">
                <ul className="space-y-3" aria-label="Manuscript milestones">
                  {MILESTONES.map(({ words, name }) => {
                    const reached = currentWords >= words;
                    return (
                      <li
                        key={words}
                        className="flex items-center gap-3"
                        aria-label={`${name}: ${reached ? "reached" : "not yet reached"}`}
                      >
                        <span
                          className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
                          aria-hidden="true"
                        >
                          {reached ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2 6L5 9L10 3"
                                stroke="var(--color-gold)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <span
                              className="block h-1.5 w-1.5 rounded-full"
                              style={{
                                background: "var(--color-border-strong)",
                              }}
                            />
                          )}
                        </span>
                        <span
                          className="text-sm"
                          style={{
                            color: reached
                              ? "var(--text-primary)"
                              : "var(--color-mist)",
                          }}
                        >
                          {fmt(words)} words
                        </span>
                        <span
                          className="ml-auto text-xs"
                          style={{
                            color: reached
                              ? "var(--color-gold)"
                              : "var(--color-border-strong)",
                          }}
                        >
                          {name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </DrawerSection>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center px-7 py-16 text-center">
              <p
                className="font-rune-serif text-base"
                style={{ color: "var(--text-primary)" }}
              >
                No manuscript yet.
              </p>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--color-mist)" }}
              >
                Create a project to begin tracking your manuscript.
              </p>
              <Link
                href="/projects"
                className="mt-6 text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--color-gold-dim)" }}
                onClick={onClose}
              >
                Create a project →
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-7 py-5"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <Link
            href="/profile"
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--color-mist)" }}
            onClick={onClose}
          >
            View full statistics →
          </Link>
        </div>
      </aside>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-7 py-5">
      <p
        className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function DrawerDivider() {
  return (
    <hr
      style={{
        borderColor: "var(--color-border)",
        borderTopWidth: "1px",
        margin: 0,
      }}
    />
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--color-mist)" }}>
        {label}
      </span>
      <span
        className="text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
