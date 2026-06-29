"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { cn } from "@/lib/utils";
import type { Page, Chapter, Project } from "@/lib/types";

// Pre-fetch the EditorShell module as soon as the user lands on /onboarding
// so it is already cached by the time they press Begin.
const editorShellModulePromise = import("@/components/editor/EditorShell");

const EditorShell = dynamic(
  () => editorShellModulePromise.then((m) => ({ default: m.EditorShell })),
  { ssr: false }
);

type ChapterWithStats = Chapter & { pages: { id: string; word_count: number }[] };

interface WritingSceneData {
  projectId: string;
  chapterId: string;
  page: Page;
  chapter: Chapter;
  project: Project;
}

// "form"    — title entry screen (initial state)
// "exiting" — form is fading out while the API request runs
// "writing" — EditorShell is mounted on this page
type Stage = "form" | "exiting" | "writing";

interface Props {
  authorName: string | null;
}

export function OnboardingClient({ authorName }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const editorUrlRef = useRef<string>("");
  const hasShownBegunRef = useRef(false);

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [writingData, setWritingData] = useState<WritingSceneData | null>(null);
  const [showBegunMessage, setShowBegunMessage] = useState(false);

  const hasValidTitle = title.trim().length > 0;
  const buttonActive = hasValidTitle && !loading;

  // Auto-focus the title input when the form is visible.
  useEffect(() => {
    if (stage === "form") {
      titleRef.current?.focus();
    }
  }, [stage]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setStage("exiting");

    // Use a plain fetch (not a server action) so Next.js does NOT auto-refresh
    // the /onboarding route after the call. A server action revalidation would
    // cause the /onboarding server component to re-run, see count > 0, and
    // redirect to the real editor route — making the AppShell flash before the
    // writing scene appears.
    const [json] = await Promise.all([
      fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      }).then((r) => r.json()),
      new Promise<void>((resolve) => setTimeout(resolve, 300)),
    ]);

    if (json.error) {
      setError(json.error);
      setLoading(false);
      setStage("form");
      return;
    }

    const { projectId, chapterId, page, chapter, project } = json.data;

    editorUrlRef.current = `/projects/${projectId}/chapters/${chapterId}`;
    setWritingData({ projectId, chapterId, page, chapter, project });
    setLoading(false);
    // Stay on /onboarding — no router.replace, no history.replaceState.
    // The URL changes only after handleFirstSavePersisted fires (first save).
    setStage("writing");
  }

  // Called by EditorShell after the first sentence is saved and the flag persisted.
  // Shows the "Your story has begun." transition, then navigates to the real editor.
  function handleFirstSavePersisted() {
    if (hasShownBegunRef.current) return;
    hasShownBegunRef.current = true;
    const url = editorUrlRef.current;
    if (!url) return;
    setShowBegunMessage(true);
    setTimeout(() => {
      startTransition(() => {
        router.replace(url);
      });
    }, 2200);
  }

  const allChapters: ChapterWithStats[] = writingData
    ? [
        {
          ...writingData.chapter,
          pages: [{ id: writingData.page.id, word_count: 0 }],
        },
      ]
    : [];

  return (
    <>
      <RegistrationTracker />

      {/* ── Title page ─────────────────────────────────────────────── */}
      {stage !== "writing" && (
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6"
          style={{
            background: "var(--bg-primary)",
            opacity: stage === "exiting" ? 0 : 1,
            transform:
              stage === "exiting"
                ? "scale(0.97) translateY(-6px)"
                : "scale(1) translateY(0)",
            transition:
              stage === "exiting"
                ? "opacity 300ms ease, transform 300ms ease"
                : "none",
            pointerEvents: stage === "exiting" ? "none" : "auto",
          }}
        >
          {/* Wordmark */}
          <div className="absolute left-8 top-8 select-none" aria-hidden="true">
            <span
              className="font-rune-serif text-2xl"
              style={{
                color: "var(--color-gold)",
                letterSpacing: "0.3em",
                fontStyle: "italic",
              }}
            >
              Rune
            </span>
          </div>

          <div className="w-full max-w-[480px]">
            {/* Heading block */}
            <div className="mb-20 text-center">
              <h1
                className="font-rune-serif text-5xl font-semibold leading-tight"
                style={{ color: "var(--color-ink)" }}
              >
                Welcome to Rune.
              </h1>
              <p
                className="mt-4 font-rune-serif text-xl italic"
                style={{ color: "var(--color-mist)" }}
              >
                Every story begins somewhere.
              </p>
            </div>

            {/* Title page composition */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-16 text-center">
                <label
                  htmlFor="story-title"
                  className="mb-6 block text-xs uppercase tracking-widest"
                  style={{ color: "var(--color-mist)", opacity: 0.7 }}
                >
                  What is your story called?
                </label>

                <input
                  ref={titleRef}
                  id="story-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Untitled"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "w-full border-0 border-b-2 bg-transparent pb-3 text-center font-rune-serif text-4xl outline-none transition-colors duration-200",
                    "placeholder:italic placeholder:opacity-30",
                    "focus:outline-none"
                  )}
                  style={{
                    color: "var(--color-ink)",
                    borderColor: error
                      ? "var(--color-crimson)"
                      : hasValidTitle
                      ? "var(--color-gold)"
                      : "var(--color-border-strong)",
                  }}
                  aria-required="true"
                  aria-describedby={error ? "title-error" : undefined}
                />

                {/* Author byline — fades in once typing begins */}
                {authorName && (
                  <p
                    className="mt-5 font-rune-serif text-sm italic"
                    style={{
                      color: "var(--color-mist)",
                      opacity: hasValidTitle ? 0.6 : 0,
                      transition: "opacity 200ms ease",
                    }}
                    aria-hidden={!hasValidTitle}
                  >
                    by {authorName}
                  </p>
                )}

                {error && (
                  <p
                    id="title-error"
                    role="alert"
                    className="mt-3 text-xs"
                    style={{ color: "var(--color-crimson)" }}
                  >
                    {error}
                  </p>
                )}
              </div>

              {/* CTA */}
              <button
                type="submit"
                disabled={!buttonActive}
                className="w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
                style={{
                  background: "var(--color-gold)",
                  color: "var(--color-ink)",
                  opacity: buttonActive ? 1 : 0.42,
                  transition: "opacity 175ms ease",
                  cursor: buttonActive ? "pointer" : "default",
                }}
                aria-label="Create project and begin writing"
              >
                {loading ? "Opening your manuscript…" : "Begin →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Writing scene ───────────────────────────────────────────── */}
      {stage === "writing" && writingData && (
        <div
          className="fixed inset-0 rune-onboarding-canvas-enter"
          style={{ background: "var(--surface-editor)" }}
        >
          <EditorShell
            projectId={writingData.projectId}
            chapterId={writingData.chapterId}
            initialPages={[writingData.page]}
            chapter={writingData.chapter}
            project={writingData.project}
            allChapters={allChapters}
            isOnboarding={true}
            onFirstSavePersisted={handleFirstSavePersisted}
          />

          {/* "Your story has begun." — fades in after first sentence saved */}
          {showBegunMessage && (
            <div
              className="rune-story-begun pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "var(--surface-editor)" }}
            >
              <p
                className="font-rune-serif text-2xl italic"
                style={{ color: "var(--color-mist)" }}
              >
                Your story has begun.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
