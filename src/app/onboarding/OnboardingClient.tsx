"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createProjectWithDraft } from "@/lib/actions/projects";
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
// "exiting" — form is fading out while the server action runs
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

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [writingData, setWritingData] = useState<WritingSceneData | null>(null);

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

    // Run the server action and exit animation concurrently.
    // Promise.all ensures we wait for whichever takes longer.
    const [result] = await Promise.all([
      createProjectWithDraft(trimmed),
      new Promise<void>((resolve) => setTimeout(resolve, 300)),
    ]);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      setStage("form");
      return;
    }

    const { projectId, chapterId, page, chapter, project } = result.data!;
    const url = `/projects/${projectId}/chapters/${chapterId}`;

    editorUrlRef.current = url;
    setWritingData({ projectId, chapterId, page, chapter, project });

    // Update the URL bar immediately — no Next.js navigation, just history.
    // When router.replace fires later (after first save), the URL is already correct.
    window.history.replaceState(null, "", url);

    setLoading(false);
    setStage("writing");
  }

  // Called by EditorShell after the first successful autosave has been persisted
  // to the DB (has_written_first_words = true). We transition to the real editor
  // route in the background — startTransition keeps the current UI visible and
  // interactive until the new route is fully ready.
  function handleFirstSavePersisted() {
    const url = editorUrlRef.current;
    if (!url) return;
    startTransition(() => {
      router.replace(url);
    });
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
        </div>
      )}
    </>
  );
}
