"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProjectWithDraft } from "@/lib/actions/projects";
import { Button } from "@/components/ui/Button";
import type { RecentWork, RecentPageCard } from "./types";
import type { WritingGoal } from "@/lib/actions/writingStats";
import type { ProjectNote } from "@/lib/types";

interface YourStoryHeroProps {
  recentWork: RecentWork | null;
  recentPageCard?: RecentPageCard;
  todayWords?: number;
  writingStreak?: { currentStreak: number; maxStreak: number };
  goals?: WritingGoal[];
  pinnedNote?: ProjectNote | null;
}

function NewUserHero() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || loading) return;
    setLoading(true);
    setError(null);

    const result = await createProjectWithDraft(title.trim());

    if (!result.data) {
      setError(result.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    router.push(
      `/projects/${result.data.projectId}/chapters/${result.data.chapterId}`
    );
  }

  return (
    <section aria-label="Your Story">
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Your Story
      </p>
      <div
        className="rounded-lg px-10 py-12"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex flex-col items-start gap-6">
          <span
            className="select-none font-rune-serif leading-none"
            aria-hidden
            style={{ color: "var(--color-gold)", opacity: 0.18, fontSize: "4rem" }}
          >
            §
          </span>
          <div>
            <h2
              className="mb-3 font-rune-serif text-3xl leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              Your first story begins here.
            </h2>
            <p
              className="font-rune-serif text-base italic"
              style={{ color: "var(--color-mist)" }}
            >
              Every novel starts with a single sentence.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is your story called?"
              maxLength={200}
              disabled={loading}
              aria-label="Manuscript title"
              className="w-full border-b bg-transparent pb-2 font-rune-serif text-xl outline-none transition-colors duration-150 placeholder:text-rune-mist/40"
              style={{
                borderColor: title
                  ? "var(--color-gold)"
                  : "var(--color-border-strong)",
                color: "var(--text-primary)",
              }}
            />
            {error && (
              <p
                className="text-xs"
                style={{ color: "var(--color-crimson)" }}
                role="alert"
              >
                {error}
              </p>
            )}
            <div>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!title.trim()}
              >
                Begin Writing →
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function getStoryHeroSubtitle(
  todayWords: number,
  streak: number,
  goals: WritingGoal[]
): string {
  if (todayWords > 0) {
    return `${todayWords} words today. Keep going.`;
  }

  const nearlyComplete = goals.some(
    (g) =>
      g.type === "project_total" &&
      g.target_words > 0 &&
      g.current_words / g.target_words >= 0.8
  );
  if (nearlyComplete) {
    return "The ending is getting closer.";
  }

  if (streak > 1) {
    return `${streak} days strong. Keep the page alive.`;
  }
  if (streak === 1) {
    return "You wrote yesterday. Begin again today.";
  }

  if (todayWords === 0 && streak === 0) {
    return "The page is waiting.";
  }

  return "Resume where you left off.";
}

export function YourStoryHero({
  recentWork,
  recentPageCard,
  todayWords = 0,
  writingStreak = { currentStreak: 0, maxStreak: 0 },
  goals = [],
  pinnedNote = null,
}: YourStoryHeroProps) {
  const matchingPage =
    recentPageCard &&
    recentWork &&
    recentPageCard.chapterId === recentWork.chapterId
      ? recentPageCard
      : undefined;

  if (!recentWork) {
    return <NewUserHero />;
  }

  const accentColor = recentWork.coverColor ?? "var(--color-gold)";

  return (
    <section aria-label="Your Story" data-guide="dashboard-your-story">
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Your Story
      </p>
      <div
        className="rounded-lg px-8 py-7"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="min-w-0">
          {(recentWork.chapterTitle || matchingPage?.pageTitle) && (
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)", opacity: 0.6 }}
            >
              {recentWork.chapterTitle}
              {matchingPage ? ` · ${matchingPage.pageTitle}` : ""}
            </p>
          )}
          <h2
            className="mb-3 font-rune-serif leading-tight"
            style={{
              color: "var(--text-primary)",
              fontSize: "clamp(2rem, 4vw, 3rem)",
            }}
          >
            {recentWork.projectTitle}
          </h2>
          <p
            className="font-rune-serif text-base italic"
            style={{ color: "var(--color-mist)" }}
          >
            {getStoryHeroSubtitle(todayWords, writingStreak.currentStreak, goals)}
          </p>
        </div>

        {pinnedNote && (
          <div
            className="my-5 rounded-md px-4 py-3"
            style={{
              background: "rgba(201,168,76,0.06)",
              border: "1px solid rgba(201,168,76,0.18)",
            }}
          >
            <p
              className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-gold)" }}
            >
              Today&apos;s Focus
            </p>
            <p
              className="font-rune-serif text-sm italic leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              {pinnedNote.content}
            </p>
          </div>
        )}

        {!pinnedNote && (
          <div
            className="my-5"
            style={{ borderTop: "1px solid var(--color-border)" }}
          />
        )}

        <div className="flex items-center justify-between gap-4">
          {(recentWork.chapterWordCount ?? 0) > 0 ? (
            <p className="text-sm" style={{ color: "var(--color-mist)" }}>
              {(recentWork.chapterWordCount ?? 0).toLocaleString()} words in this chapter
            </p>
          ) : (
            <span />
          )}
          <Link
            href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
            className="rune-btn-primary inline-flex shrink-0 items-center gap-2 rounded-md px-7 py-3 text-sm font-medium focus-visible:outline-none"
          >
            Write
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
