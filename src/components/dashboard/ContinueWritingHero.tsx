"use client";

import Link from "next/link";
import type { RecentWork, RecentPageCard } from "./types";

interface ContinueWritingHeroProps {
  recentWork: RecentWork | null;
  recentPageCard?: RecentPageCard;
}

export function ContinueWritingHero({
  recentWork,
  recentPageCard,
}: ContinueWritingHeroProps) {
  const matchingPage =
    recentPageCard &&
    recentWork &&
    recentPageCard.chapterId === recentWork.chapterId
      ? recentPageCard
      : undefined;

  if (!recentWork) {
    return (
      <section className="mb-10" aria-label="Continue Writing">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Continue Writing
        </p>
        <div
          className="rounded-lg p-8"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border)",
            borderTop: "3px solid var(--color-gold-dim)",
          }}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3
                className="mb-2 font-rune-serif text-2xl"
                style={{ color: "var(--text-primary)" }}
              >
                Your manuscript begins here.
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--color-mist)" }}
              >
                Create your first project to start writing.
              </p>
            </div>
            <span
              className="shrink-0 select-none font-rune-serif text-2xl leading-none"
              aria-hidden
              style={{ color: "var(--color-gold)", opacity: 0.25 }}
            >
              §
            </span>
          </div>

          <div
            className="mb-6"
            style={{ borderTop: "1px solid var(--color-border)" }}
          />

          <div className="flex justify-end">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-medium transition-colors duration-150"
              style={{
                background: "var(--color-gold)",
                color: "var(--text-on-accent)",
              }}
            >
              Open a Project
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const accentColor = recentWork.coverColor ?? "var(--color-gold)";

  return (
    <section className="mb-10" aria-label="Continue Writing">
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Continue Writing
      </p>
      <div
        className="rounded-lg p-8"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              {recentWork.projectTitle}
            </p>
            <h3
              className="mb-1 font-rune-serif text-3xl leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {recentWork.chapterTitle}
            </h3>
            {matchingPage && (
              <p
                className="font-rune-serif text-base"
                style={{ color: "var(--color-mist)" }}
              >
                {matchingPage.pageTitle}
              </p>
            )}
          </div>
          <span
            className="shrink-0 select-none font-rune-serif text-2xl leading-none"
            aria-hidden
            style={{ color: "var(--color-gold)", opacity: 0.3 }}
          >
            §
          </span>
        </div>

        <div
          className="mb-6"
          style={{ borderTop: "1px solid var(--color-border)" }}
        />

        <div className="flex items-center justify-between gap-4">
          {matchingPage && matchingPage.wordCount > 0 ? (
            <p
              className="text-sm"
              style={{ color: "var(--color-mist)" }}
            >
              {matchingPage.wordCount.toLocaleString()} words
            </p>
          ) : (
            <span />
          )}
          <Link
            href={`/projects/${recentWork.projectId}/chapters/${recentWork.chapterId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-6 py-3 text-sm font-medium transition-colors duration-150"
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
