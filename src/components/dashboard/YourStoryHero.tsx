import Link from "next/link";
import type { RecentWork, RecentPageCard } from "./types";

interface YourStoryHeroProps {
  recentWork: RecentWork | null;
  recentPageCard?: RecentPageCard;
}

export function YourStoryHero({ recentWork, recentPageCard }: YourStoryHeroProps) {
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
        className="rounded-lg px-10 py-10"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-start justify-between gap-8">
          <div className="min-w-0 flex-1">
            {(recentWork.chapterTitle || matchingPage?.pageTitle) && (
              <p
                className="mb-4 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-mist)", opacity: 0.6 }}
              >
                {recentWork.chapterTitle}
                {matchingPage ? ` · ${matchingPage.pageTitle}` : ""}
              </p>
            )}
            <h2
              className="mb-4 font-rune-serif leading-tight"
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
              The page is waiting.
            </p>
          </div>
          <span
            className="shrink-0 select-none font-rune-serif leading-none"
            aria-hidden
            style={{ color: "var(--color-gold)", opacity: 0.18, fontSize: "3.5rem" }}
          >
            §
          </span>
        </div>

        <div
          className="my-8"
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
            Continue Writing
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
