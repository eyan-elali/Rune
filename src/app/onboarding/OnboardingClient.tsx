"use client";

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { cn } from "@/lib/utils";

type Stage = "title" | "sentence" | "transitioning";

const TRANSITION_LINES = [
  "The first sentence is the hardest.",
  "A story exists now.",
  "The page remembers.",
  "Every world begins with a line.",
  "The door is open.",
] as const;

interface Props {
  authorName: string | null;
}

export function OnboardingClient({ authorName }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const sentenceRef = useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [firstSentence, setFirstSentence] = useState("");
  const [stage, setStage] = useState<Stage>("title");
  const [isExiting, setIsExiting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionLine, setTransitionLine] = useState("");

  const hasValidTitle = title.trim().length > 0;
  const hasValidSentence = firstSentence.trim().length > 0;
  const titleButtonActive = hasValidTitle && !loading && !isExiting;
  const sentenceButtonActive = hasValidSentence && !loading;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (stage === "sentence") {
      sentenceRef.current?.focus();
    }
  }, [stage]);

  const autoResize = useCallback(() => {
    const el = sentenceRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  async function handleBegin(e?: React.FormEvent) {
    e?.preventDefault();
    if (!hasValidTitle || loading || isExiting) return;

    setIsExiting(true);
    await new Promise<void>((r) => setTimeout(r, 280));
    setIsExiting(false);
    setStage("sentence");
    setError(null);
  }

  async function handleEnterRune(e?: React.FormEvent) {
    e?.preventDefault();
    if (!hasValidSentence || loading) return;

    const trimmedTitle = title.trim();
    const trimmedSentence = firstSentence.trim();

    setLoading(true);
    setError(null);

    const line = TRANSITION_LINES[Math.floor(Math.random() * TRANSITION_LINES.length)];
    setTransitionLine(line);
    setStage("transitioning");

    const [json] = await Promise.all([
      fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, firstSentence: trimmedSentence }),
      }).then((r) => r.json()),
      new Promise<void>((r) => setTimeout(r, 1100)),
    ]);

    if (json.error) {
      setLoading(false);
      setStage("sentence");
      setError(json.error);
      return;
    }

    const { projectId, chapterId } = json.data;
    startTransition(() => {
      router.replace(`/projects/${projectId}/chapters/${chapterId}?tutorial=editor`);
    });
  }

  const pageExitStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    opacity: isExiting ? 0 : 1,
    transform: isExiting ? "scale(0.97) translateY(-6px)" : "scale(1) translateY(0)",
    transition: isExiting ? "opacity 280ms ease, transform 280ms ease" : "none",
    pointerEvents: isExiting || loading ? "none" : "auto",
  };

  return (
    <>
      <RegistrationTracker />

      {/* ── Title stage ─────────────────────────────────────────────── */}
      {stage === "title" && (
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6"
          style={pageExitStyle}
        >
          <div className="absolute left-8 top-8 select-none" aria-hidden="true">
            <span
              className="font-rune-serif text-2xl"
              style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
            >
              Rune
            </span>
          </div>

          <div className="w-full max-w-[480px]">
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

            <form onSubmit={handleBegin} noValidate>
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
                    borderColor: hasValidTitle
                      ? "var(--color-gold)"
                      : "var(--color-border-strong)",
                  }}
                  aria-required="true"
                />

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
              </div>

              <button
                type="submit"
                disabled={!titleButtonActive}
                className="w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
                style={{
                  background: "var(--color-gold)",
                  color: "var(--color-ink)",
                  opacity: titleButtonActive ? 1 : 0.42,
                  transition: "opacity 175ms ease",
                  cursor: titleButtonActive ? "pointer" : "default",
                }}
                aria-label="Continue to first sentence"
              >
                Begin →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Sentence stage ───────────────────────────────────────────── */}
      {stage === "sentence" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6"
          style={{ background: "var(--bg-primary)", pointerEvents: loading ? "none" : "auto" }}
        >
          <div className="absolute left-8 top-8 select-none" aria-hidden="true">
            <span
              className="font-rune-serif text-2xl"
              style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
            >
              Rune
            </span>
          </div>

          <div className="w-full max-w-[480px]">
            <div className="mb-20 text-center">
              <h1
                className="font-rune-serif text-5xl font-semibold leading-tight"
                style={{ color: "var(--color-ink)" }}
              >
                Begin with one sentence.
              </h1>
              <p
                className="mt-4 font-rune-serif text-xl italic"
                style={{ color: "var(--color-mist)" }}
              >
                It does not have to be perfect. It only has to exist.
              </p>
            </div>

            <form onSubmit={handleEnterRune} noValidate>
              <div className="mb-16 text-center">
                <label
                  htmlFor="first-sentence"
                  className="mb-6 block text-xs uppercase tracking-widest"
                  style={{ color: "var(--color-mist)", opacity: 0.7 }}
                >
                  How does it begin?
                </label>

                <textarea
                  ref={sentenceRef}
                  id="first-sentence"
                  rows={1}
                  value={firstSentence}
                  onChange={(e) => {
                    setFirstSentence(e.target.value.replace(/[\r\n]/g, " "));
                    if (error) setError(null);
                    autoResize();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleEnterRune();
                    }
                  }}
                  placeholder={`Write the first sentence of ${title.length > 35 ? title.slice(0, 35) + "…" : title}…`}
                  autoComplete="off"
                  spellCheck={true}
                  className={cn(
                    "w-full resize-none overflow-hidden border-0 border-b-2 bg-transparent pb-3 text-center font-rune-serif text-2xl outline-none transition-colors duration-200",
                    "placeholder:italic placeholder:opacity-30",
                    "focus:outline-none"
                  )}
                  style={{
                    color: "var(--color-ink)",
                    borderColor: error
                      ? "var(--color-crimson)"
                      : hasValidSentence
                      ? "var(--color-gold)"
                      : "var(--color-border-strong)",
                    lineHeight: "1.6",
                  }}
                  aria-required="true"
                  aria-describedby={error ? "sentence-error" : undefined}
                />

                {error && (
                  <p
                    id="sentence-error"
                    role="alert"
                    className="mt-3 text-xs"
                    style={{ color: "var(--color-crimson)" }}
                  >
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!sentenceButtonActive}
                className="w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
                style={{
                  background: "var(--color-gold)",
                  color: "var(--color-ink)",
                  opacity: sentenceButtonActive ? 1 : 0.42,
                  transition: "opacity 175ms ease",
                  cursor: sentenceButtonActive ? "pointer" : "default",
                }}
                aria-label="Create your manuscript and open the editor"
              >
                Enter Rune →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Transition overlay ───────────────────────────────────────── */}
      {stage === "transitioning" && (
        <div
          className="rune-step-enter fixed inset-0 flex items-center justify-center"
          style={{ background: "var(--bg-primary)" }}
        >
          <p
            className="font-rune-serif text-2xl italic"
            style={{ color: "var(--color-mist)" }}
          >
            {transitionLine}
          </p>
        </div>
      )}
    </>
  );
}
