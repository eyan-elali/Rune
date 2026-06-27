import Link from "next/link";
import type { RecentWork, RecentPageCard } from "./types";
import type { WritingGoal } from "@/lib/actions/writingStats";

interface YourStoryHeroProps {
  recentWork: RecentWork | null;
  recentPageCard?: RecentPageCard;
  todayWords?: number;
  writingStreak?: { currentStreak: number; maxStreak: number };
  goals?: WritingGoal[];
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
}: YourStoryHeroProps) {
  const matchingPage =
    recentPageCard &&
    recentWork &&
    recentPageCard.chapterId === recentWork.chapterId
      ? recentPageCard
      : undefined;

  if (!recentWork) {
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
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-medium transition-colors duration-150"
              style={{
                background: "var(--color-gold)",
                color: "var(--text-on-accent)",
              }}
            >
              Begin your manuscript
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const accentColor = recentWork.coverColor ?? "var(--color-gold)";

  return (
    <section aria-label="Your Story">
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

        <div
          className="my-5"
          style={{ borderTop: "1px solid var(--color-border)" }}
        />

        <div className="flex items-center justify-between gap-4">
          {matchingPage && matchingPage.wordCount > 0 ? (
            <p className="text-sm" style={{ color: "var(--color-mist)" }}>
              {matchingPage.wordCount.toLocaleString()} words in this chapter
            </p>
          ) : (
            <span />
          )}
          <Link
            href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-7 py-3 text-sm font-medium transition-colors duration-150"
            style={{
              background: "var(--color-gold)",
              color: "var(--text-on-accent)",
            }}
          >
            Write
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
