"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";
import type { DrawerChapter } from "@/components/dashboard/types";
import {
  createGoal,
  updateGoal,
  deleteGoal,
} from "@/lib/actions/writingStats";
import { getProjectChaptersForDrawer } from "@/lib/actions/projects";

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

function estimateFinish(remaining: number, avgPerCalendarDay: number): string {
  if (avgPerCalendarDay <= 0) return "";
  const days = remaining / avgPerCalendarDay;
  if (days < 7) return "Less than a week";
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "About 1 week";
  if (weeks < 8) return `About ${weeks} weeks`;
  const months = Math.round(days / 30);
  if (months === 1) return "About 1 month";
  if (months < 24) return `About ${months} months`;
  const years = Math.round(months / 12);
  if (years === 1) return "About 1 year";
  return `About ${years} years`;
}

function daysAgo(dateStr: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86400000
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const w = Math.round(diffDays / 7);
    return w === 1 ? "1 week ago" : `${w} weeks ago`;
  }
  if (diffDays < 365) {
    const m = Math.round(diffDays / 30);
    return m === 1 ? "1 month ago" : `${m} months ago`;
  }
  const y = Math.round(diffDays / 365);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

function getMilestones(
  targetWords: number | null
): { words: number; name: string }[] {
  if (targetWords && targetWords > 0) {
    return [
      { words: Math.round(targetWords * 0.25), name: "Quarter Mark" },
      { words: Math.round(targetWords * 0.5), name: "Midpoint" },
      { words: Math.round(targetWords * 0.75), name: "Third Act" },
      { words: targetWords, name: "Complete" },
    ];
  }
  return [
    { words: 10_000, name: "First Act" },
    { words: 25_000, name: "Quarter Mark" },
    { words: 50_000, name: "Midpoint" },
    { words: 75_000, name: "Third Act" },
    { words: 100_000, name: "Full Novel" },
  ];
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ProgressDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  initialProject: Project | null;
  goals: WritingGoal[];
  initialChapters: DrawerChapter[];
  avgWordsPerDay: number;
  onGoalsChange: (goals: WritingGoal[]) => void;
  openInEditGoalMode?: boolean;
  guideActive?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProgressDrawer({
  isOpen,
  onClose,
  projects,
  initialProject,
  goals,
  initialChapters,
  avgWordsPerDay,
  onGoalsChange,
  openInEditGoalMode = false,
  guideActive = false,
}: ProgressDrawerProps) {
  const router = useRouter();

  // Project selection
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProject?.id ?? null
  );
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Chapter data for selected project
  const [chapters, setChapters] = useState<DrawerChapter[]>(initialChapters);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // Goal form
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  // Derived values
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const currentWords = selectedProject?.word_count ?? 0;

  const manuscriptGoal =
    goals.find(
      (g) => g.type === "project_total" && g.project_id === selectedProject?.id
    ) ?? null;
  const targetWords = manuscriptGoal?.target_words ?? null;

  const percentage =
    targetWords && targetWords > 0
      ? Math.min(100, Math.round((currentWords / targetWords) * 100))
      : null;
  const remaining =
    targetWords !== null ? Math.max(0, targetWords - currentWords) : null;
  const isComplete = remaining !== null && remaining <= 0;

  const finishText =
    targetWords !== null && !isComplete && remaining !== null && avgWordsPerDay > 0
      ? estimateFinish(remaining, avgWordsPerDay)
      : null;

  const readTime = currentWords > 0 ? formatReadTime(currentWords) : null;

  const nonEmptyChapters = chapters.filter((c) => c.wordCount > 0);
  const avgPerChapter =
    nonEmptyChapters.length > 0
      ? Math.round(
          nonEmptyChapters.reduce((s, c) => s + c.wordCount, 0) /
            nonEmptyChapters.length
        )
      : 0;
  const longestChapter =
    nonEmptyChapters.length > 0
      ? nonEmptyChapters.reduce((max, c) => (c.wordCount > max.wordCount ? c : max))
      : null;
  const shortestChapter =
    nonEmptyChapters.length > 1
      ? nonEmptyChapters.reduce((min, c) => (c.wordCount < min.wordCount ? c : min))
      : null;

  const milestones = getMilestones(targetWords);

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Sync initialChapters when prop updates (after router.refresh)
  useEffect(() => {
    if (
      selectedProjectId === (initialProject?.id ?? null) ||
      selectedProjectId === null
    ) {
      setChapters(initialChapters);
    }
  }, [initialChapters, initialProject?.id, selectedProjectId]);

  // Fetch chapters when switching to a different project
  useEffect(() => {
    const initialId = initialProject?.id ?? null;
    if (!selectedProjectId || selectedProjectId === initialId) return;

    let cancelled = false;
    setIsLoadingChapters(true);
    getProjectChaptersForDrawer(selectedProjectId)
      .then((data) => {
        if (!cancelled) setChapters(data);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, initialProject?.id]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isGoalFormOpen) {
        setIsGoalFormOpen(false);
        return;
      }
      if (isSelectorOpen) {
        setIsSelectorOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, isGoalFormOpen, isSelectorOpen, onClose]);

  // Auto-open goal form when drawer is opened via the Manuscript Goal cell
  useEffect(() => {
    if (!isOpen || !openInEditGoalMode) return;
    setGoalInput(manuscriptGoal ? String(manuscriptGoal.target_words) : "");
    setGoalError(null);
    setIsGoalFormOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, openInEditGoalMode]);

  // Close selector on outside click
  useEffect(() => {
    if (!isSelectorOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        selectorRef.current &&
        !selectorRef.current.contains(e.target as Node)
      ) {
        setIsSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isSelectorOpen]);

  // ── Goal form handlers ────────────────────────────────────────────────────────

  function openGoalForm() {
    setGoalInput(manuscriptGoal ? String(manuscriptGoal.target_words) : "");
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
      if (manuscriptGoal) {
        const result = await updateGoal(manuscriptGoal.id, target);
        if (result.error) {
          setGoalError(result.error);
          return;
        }
        onGoalsChange(
          goals.map((g) =>
            g.id === manuscriptGoal.id ? { ...g, target_words: target } : g
          )
        );
      } else {
        const result = await createGoal(
          "project_total",
          target,
          selectedProject?.id
        );
        if (result.error) {
          setGoalError(result.error);
          return;
        }
        if (result.data) {
          onGoalsChange([
            ...goals,
            { ...result.data, current_words: currentWords },
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
    if (!manuscriptGoal) return;
    setGoalSaving(true);
    setGoalError(null);
    try {
      const result = await deleteGoal(manuscriptGoal.id);
      if (result.error) {
        setGoalError(result.error);
        return;
      }
      onGoalsChange(goals.filter((g) => g.id !== manuscriptGoal.id));
      setIsGoalFormOpen(false);
      router.refresh();
    } finally {
      setGoalSaving(false);
    }
  }

  function handleProjectSelect(id: string) {
    setSelectedProjectId(id);
    setIsSelectorOpen(false);
    setIsGoalFormOpen(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "var(--color-ink)",
          opacity: isOpen && !guideActive ? 0.22 : 0,
          pointerEvents: isOpen && !guideActive ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Manuscript Progress"
        data-guide="dashboard-progress-drawer"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-y-auto transition-transform duration-300"
        style={{
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--color-border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: "-10px 0 40px var(--color-shadow)",
        }}
      >
        {/* Header — manuscript identity + project selector */}
        <div
          className="flex flex-shrink-0 items-start justify-between px-7 pb-5 pt-6"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="min-w-0 flex-1 pr-4">
            <p
              className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Your Manuscript
            </p>

            {projects.length > 1 ? (
              <div className="relative" ref={selectorRef}>
                <button
                  onClick={() => setIsSelectorOpen((o) => !o)}
                  className="flex items-center gap-2 font-rune-serif text-xl leading-tight transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-primary)" }}
                  aria-expanded={isSelectorOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate">
                    {selectedProject?.title ?? "Select manuscript"}
                  </span>
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      transform: isSelectorOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                      color: "var(--color-mist)",
                    }}
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {isSelectorOpen && (
                  <ul
                    role="listbox"
                    className="absolute left-0 top-full z-[56] mt-1.5 min-w-[220px] overflow-hidden rounded-lg"
                    style={{
                      background: "var(--surface-card)",
                      border: "1px solid var(--color-border-strong)",
                      boxShadow: "0 6px 20px var(--color-shadow)",
                    }}
                  >
                    {projects.map((p) => (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={p.id === selectedProjectId}
                      >
                        <button
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors"
                          style={{
                            color:
                              p.id === selectedProjectId
                                ? "var(--color-gold)"
                                : "var(--text-primary)",
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLElement).style.background =
                              "color-mix(in srgb, var(--color-gold) 6%, transparent)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLElement).style.background =
                              "transparent")
                          }
                          onClick={() => handleProjectSelect(p.id)}
                        >
                          <span className="truncate">{p.title}</span>
                          {p.id === selectedProjectId && (
                            <span
                              className="flex-shrink-0 text-[9px] uppercase tracking-widest"
                              style={{ color: "var(--color-gold)" }}
                            >
                              active
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p
                className="font-rune-serif text-xl leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {selectedProject?.title ?? "No manuscript"}
              </p>
            )}
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
          {selectedProject ? (
            <>
              {/* Manuscript metadata */}
              {selectedProject.created_at && (
                <>
                  <DrawerSection label="About">
                    <div
                      className="flex items-center gap-3 text-xs"
                      style={{ color: "var(--color-mist)" }}
                    >
                      <span>
                        Started {daysAgo(selectedProject.created_at)}
                      </span>
                      {selectedProject.updated_at && (
                        <>
                          <span
                            className="h-px w-3 flex-shrink-0"
                            style={{
                              background: "var(--color-border-strong)",
                            }}
                            aria-hidden="true"
                          />
                          <span>
                            Last written {daysAgo(selectedProject.updated_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </DrawerSection>
                  <DrawerDivider />
                </>
              )}

              {/* Manuscript progress */}
              <DrawerSection
                label="Manuscript Progress"
                action={
                  <button
                    onClick={openGoalForm}
                    className="text-[10px] uppercase tracking-widest transition-opacity hover:opacity-60"
                    style={{ color: "var(--color-gold-dim)" }}
                  >
                    {manuscriptGoal ? "Edit goal" : "Set goal"}
                  </button>
                }
              >
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
                      className="w-full overflow-hidden rounded-full"
                      style={{
                        height: "5px",
                        background: "color-mix(in srgb, var(--color-gold) 14%, transparent)",
                      }}
                      role="progressbar"
                      aria-valuenow={percentage ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percentage ?? 0}%`,
                          background: "var(--color-gold)",
                          opacity: 0.88,
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
                          {fmt(remaining)} remaining
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
                    <p
                      className="font-rune-serif text-sm italic"
                      style={{ color: "var(--color-mist)" }}
                    >
                      Writing freely
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-mist)", opacity: 0.7 }}>
                      No word target has been set for this manuscript.
                    </p>
                  </div>
                )}
              </DrawerSection>

              {/* Inline goal form */}
              {isGoalFormOpen && (
                <div
                  className="mx-7 mb-2 rounded-lg p-5"
                  style={{
                    background: "color-mix(in srgb, var(--color-gold) 4%, transparent)",
                    border: "1px solid var(--color-border-strong)",
                  }}
                >
                  <p
                    className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--color-mist)" }}
                  >
                    {manuscriptGoal ? "Edit Goal" : "Set Manuscript Goal"}
                  </p>
                  {!manuscriptGoal && (
                    <p
                      className="mb-3 text-xs italic leading-relaxed"
                      style={{ color: "var(--color-mist)", opacity: 0.7 }}
                    >
                      Word goals are optional. Leave this blank if this manuscript does not need one.
                    </p>
                  )}
                  <input
                    type="number"
                    min={100}
                    step={1000}
                    placeholder="Target word count"
                    value={goalInput}
                    onChange={(e) => {
                      setGoalInput(e.target.value);
                      setGoalError(null);
                    }}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={{
                      background: "var(--surface-card)",
                      border: "1px solid var(--color-border-strong)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) =>
                      ((e.currentTarget as HTMLElement).style.borderColor =
                        "var(--color-gold)")
                    }
                    onBlur={(e) =>
                      ((e.currentTarget as HTMLElement).style.borderColor =
                        "var(--color-border-strong)")
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveGoal();
                    }}
                    autoFocus
                  />
                  {goalError && (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--color-crimson)" }}
                    >
                      {goalError}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleSaveGoal}
                      disabled={goalSaving}
                      className="rounded px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{
                        background: "var(--color-gold)",
                        color: "var(--color-ink)",
                      }}
                    >
                      {goalSaving ? "Saving…" : "Save"}
                    </button>
                    {manuscriptGoal && (
                      <button
                        onClick={handleDeleteGoal}
                        disabled={goalSaving}
                        className="rounded px-3 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ color: "var(--color-mist)" }}
                      >
                        Remove goal
                      </button>
                    )}
                    <button
                      onClick={() => setIsGoalFormOpen(false)}
                      disabled={goalSaving}
                      className="ml-auto rounded px-3 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ color: "var(--color-mist)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Estimated finish */}
              {targetWords !== null && (
                <>
                  <DrawerDivider />
                  <DrawerSection label="Estimated Finish">
                    {isComplete ? (
                      <p
                        className="font-rune-serif text-base"
                        style={{ color: "var(--color-gold)" }}
                      >
                        Manuscript target reached.
                      </p>
                    ) : finishText ? (
                      <div className="space-y-1">
                        <p
                          className="font-rune-serif text-base"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {finishText}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-mist)" }}
                        >
                          at ~{fmt(avgWordsPerDay)} words per day over the last
                          30 days
                        </p>
                      </div>
                    ) : (
                      <p
                        className="text-sm"
                        style={{ color: "var(--color-mist)" }}
                      >
                        Write a few more sessions to estimate your finish.
                      </p>
                    )}
                  </DrawerSection>
                </>
              )}

              {/* Read time */}
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
              {(chapters.length > 0 || isLoadingChapters) && (
                <>
                  <DrawerDivider />
                  <DrawerSection label="Chapter Shape">
                    {isLoadingChapters ? (
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-mist)" }}
                      >
                        Loading…
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        <StatRow
                          label="Total chapters"
                          value={String(chapters.length)}
                        />
                        {avgPerChapter > 0 && (
                          <StatRow
                            label="Avg. per chapter"
                            value={`~${fmt(avgPerChapter)} words`}
                          />
                        )}
                        {longestChapter && (
                          <StatRow
                            label="Longest"
                            value={`${longestChapter.title} — ${fmt(longestChapter.wordCount)} words`}
                          />
                        )}
                        {shortestChapter &&
                          shortestChapter.id !== longestChapter?.id && (
                            <StatRow
                              label="Shortest"
                              value={`${shortestChapter.title} — ${fmt(shortestChapter.wordCount)} words`}
                            />
                          )}
                      </div>
                    )}
                    <Link
                      href={`/projects/${selectedProject.id}`}
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
                  {milestones.map(({ words, name }) => {
                    const reached = currentWords >= words;
                    return (
                      <li
                        key={`${name}-${words}`}
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
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-7 py-5">
      <div className="mb-3 flex items-center justify-between">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          {label}
        </p>
        {action}
      </div>
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
    <div className="flex items-start justify-between gap-4">
      <span
        className="flex-shrink-0 text-xs"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </span>
      <span
        className="text-right text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
