"use client";

import { useState, useRef, useEffect, useLayoutEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// useLayoutEffect is a no-op (with a console warning) during SSR, so this
// falls back to useEffect on the server render pass and only switches to
// the synchronous, pre-paint version once mounted in the browser. Also
// keeps the setState-in-effect lint rule quiet for state that's genuinely
// derived from a browser-only API on mount, not from React state itself.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type FreeTheme = "parchment" | "candlelight";

type Stage =
  | "title"
  | "interlude-recognition"
  | "sentence"
  | "interlude-momentum"
  | "theme"
  | "interlude-authorship"
  | "letter-invite"
  | "letter-entry"
  | "interlude-arrival";

const DRAFT_KEY = "rune_onboarding_draft_v1";
const LETTER_MAX_LENGTH = 2000;

// Stages safe to restore into on refresh. The final stage is excluded —
// it's mid-submission, so a refresh there must restart clean rather than
// risk re-triggering (or half-observing) the authoritative server call.
const RESUMABLE_STAGES: ReadonlySet<Stage> = new Set([
  "title",
  "interlude-recognition",
  "sentence",
  "interlude-momentum",
  "theme",
  "interlude-authorship",
  "letter-invite",
  "letter-entry",
]);

// Back navigation always lands on an editable stage, skipping over the
// auto-advancing interludes rather than momentarily replaying them.
const PREVIOUS_INTERACTIVE_STAGE: Partial<Record<Stage, Stage>> = {
  sentence: "title",
  theme: "sentence",
  "letter-invite": "theme",
  "letter-entry": "letter-invite",
};

interface Draft {
  stage: Stage;
  title: string;
  firstSentence: string;
  theme: FreeTheme;
  letterContent: string;
}

function isFreeTheme(value: unknown): value is FreeTheme {
  return value === "parchment" || value === "candlelight";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);
  return reduced;
}

function Wordmark() {
  return (
    <div className="absolute left-8 top-8 select-none" aria-hidden="true">
      <span
        className="font-rune-serif text-2xl"
        style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
      >
        Rune
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back to the previous step"
      className="absolute left-8 top-20 text-xs uppercase tracking-widest outline-none focus-visible:underline"
      style={{ color: "var(--onboarding-muted)" }}
    >
      ← Back
    </button>
  );
}

interface InterludeProps {
  eyebrow?: string;
  heading: string;
  supporting?: string;
  footnote?: string;
  durationMs?: number;
  onContinue: () => void;
}

// Shared shell for the four non-interactive "turning a page" beats. Reads
// briefly, then advances on its own — or immediately on click/Enter/Space,
// no button required.
function Interlude({ eyebrow, heading, supporting, footnote, durationMs = 1900, onContinue }: InterludeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onContinue();
  }, [onContinue]);

  useEffect(() => {
    containerRef.current?.focus();
    const timer = setTimeout(fire, durationMs);
    return () => clearTimeout(timer);
  }, [fire, durationMs]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fire();
        }
      }}
      className="rune-step-enter flex min-h-screen cursor-pointer flex-col items-center justify-center px-6 text-center outline-none"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="w-full max-w-[480px]">
        {eyebrow && (
          <p
            className="mb-6 text-xs uppercase tracking-widest"
            style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
          >
            {eyebrow}
          </p>
        )}
        <p className="font-rune-serif text-3xl italic leading-snug" style={{ color: "var(--text-primary)" }}>
          {heading}
        </p>
        {supporting && (
          <p className="mt-4 font-rune-serif text-base" style={{ color: "var(--onboarding-muted)" }}>
            {supporting}
          </p>
        )}
        {footnote && (
          <p
            className="mt-3 font-rune-serif text-sm italic"
            style={{ color: "var(--onboarding-muted)", opacity: 0.8 }}
          >
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}

interface ThemeOptionProps {
  id: FreeTheme;
  name: string;
  description: string;
  active: boolean;
  onSelect: (id: FreeTheme) => void;
}

function ThemeOption({ id, name, description, active, onSelect }: ThemeOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      aria-label={`${name} — ${description}`}
      className="relative flex flex-1 flex-col items-start rounded-lg p-5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
      style={{
        background: active ? "color-mix(in srgb, var(--color-gold) 10%, transparent)" : "var(--bg-secondary)",
        border: `1px solid ${active ? "var(--color-gold)" : "var(--color-border)"}`,
      }}
    >
      {active && (
        <span
          className="absolute right-3 top-3 text-xs"
          style={{ color: "var(--color-gold)" }}
          aria-hidden="true"
        >
          ✓
        </span>
      )}
      <p className="font-rune-serif text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {name}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--onboarding-muted)" }}>
        {description}
      </p>
    </button>
  );
}

interface Props {
  authorName: string | null;
  initialTheme: string;
}

export function OnboardingClient({ authorName, initialTheme }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const sentenceRef = useRef<HTMLTextAreaElement>(null);
  const letterRef = useRef<HTMLTextAreaElement>(null);
  const themeHeadingRef = useRef<HTMLHeadingElement>(null);
  const letterInviteHeadingRef = useRef<HTMLHeadingElement>(null);
  const arrivalHeadingRef = useRef<HTMLHeadingElement>(null);
  const [, startTransition] = useTransition();
  const reducedMotion = usePrefersReducedMotion();

  const [stage, setStage] = useState<Stage>("title");
  const [title, setTitle] = useState("");
  const [firstSentence, setFirstSentence] = useState("");
  const [theme, setTheme] = useState<FreeTheme>(isFreeTheme(initialTheme) ? initialTheme : "parchment");
  const [letterContent, setLetterContent] = useState("");

  const [isExiting, setIsExiting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasValidTitle = title.trim().length > 0;
  const hasValidSentence = firstSentence.trim().length > 0;
  const hasValidLetter = letterContent.trim().length > 0;
  const titleButtonActive = hasValidTitle && !isExiting;

  const hasSubmittedRef = useRef(false);

  // ── Restore an interrupted session (refresh, accidental navigation) ──
  useIsomorphicLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<Draft>;
        if (draft.stage && RESUMABLE_STAGES.has(draft.stage)) {
          setStage(draft.stage);
          if (typeof draft.title === "string") setTitle(draft.title);
          if (typeof draft.firstSentence === "string") setFirstSentence(draft.firstSentence);
          if (isFreeTheme(draft.theme)) setTheme(draft.theme);
          if (typeof draft.letterContent === "string") setLetterContent(draft.letterContent);
        }
      }
    } catch {
      // Corrupt or inaccessible sessionStorage — start fresh silently.
    }
    setHydrated(true);
  }, []);

  // Persist only while there's no manuscript yet — never once we're
  // submitting. No DB draft rows; this is browser-local UI convenience.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (!RESUMABLE_STAGES.has(stage)) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      const draft: Draft = { stage, title, firstSentence, theme, letterContent };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Best-effort only.
    }
  }, [hydrated, stage, title, firstSentence, theme, letterContent]);

  // ── Live theme switching — the whole onboarding experience, instantly ──
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (stage === "title") titleRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage === "sentence") sentenceRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage === "letter-entry") letterRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage === "theme") themeHeadingRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage === "letter-invite") letterInviteHeadingRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage === "interlude-arrival") arrivalHeadingRef.current?.focus();
  }, [stage]);

  const autoResizeSentence = useCallback(() => {
    const el = sentenceRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  function handleBack() {
    const prev = PREVIOUS_INTERACTIVE_STAGE[stage];
    if (prev) setStage(prev);
  }

  async function handleTitleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!hasValidTitle || isExiting) return;

    setIsExiting(true);
    await new Promise<void>((r) => setTimeout(r, reducedMotion ? 60 : 280));
    setIsExiting(false);
    setStage("interlude-recognition");
  }

  function handleSentenceContinue(e?: React.FormEvent) {
    e?.preventDefault();
    if (!hasValidSentence) return;
    setStage("interlude-momentum");
  }

  function handleSentenceSkip() {
    setFirstSentence("");
    setStage("interlude-momentum");
  }

  function handleThemeContinue() {
    setStage("interlude-authorship");
  }

  function handleWriteLetter() {
    setStage("letter-entry");
  }

  function handleSkipLetterInvite() {
    setLetterContent("");
    setStage("interlude-arrival");
  }

  function handleSealLetter(e?: React.FormEvent) {
    e?.preventDefault();
    setStage("interlude-arrival");
  }

  function handleSkipLetterEntry() {
    setLetterContent("");
    setStage("interlude-arrival");
  }

  const submitOnboarding = useCallback(async () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const trimmedTitle = title.trim();
    const trimmedSentence = firstSentence.trim();
    const trimmedLetter = letterContent.trim();
    const minWait = new Promise<void>((r) => setTimeout(r, reducedMotion ? 200 : 1200));

    let json: { data?: { projectId: string; chapterId: string }; error?: string };
    try {
      const [result] = await Promise.all([
        fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedTitle,
            firstSentence: trimmedSentence,
            theme,
            letter: trimmedLetter || undefined,
          }),
        }).then((r) => r.json()),
        minWait,
      ]);
      json = result;
    } catch {
      json = { error: "Something went wrong. Please try again." };
    }

    if (json.error || !json.data) {
      hasSubmittedRef.current = false;
      setSubmitting(false);
      setSubmitError(json.error ?? "Something went wrong. Please try again.");
      return;
    }

    const { projectId, chapterId } = json.data;
    startTransition(() => {
      router.replace(`/projects/${projectId}/chapters/${chapterId}?tutorial=editor`);
    });
  }, [title, firstSentence, letterContent, theme, reducedMotion, router, startTransition]);

  useIsomorphicLayoutEffect(() => {
    if (stage === "interlude-arrival") {
      void submitOnboarding();
    }
  }, [stage, submitOnboarding]);

  const pageExitStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    opacity: isExiting ? 0 : 1,
    transform: reducedMotion ? "none" : isExiting ? "scale(0.97) translateY(-6px)" : "scale(1) translateY(0)",
    transition: reducedMotion
      ? "opacity 120ms ease"
      : isExiting
      ? "opacity 280ms ease, transform 280ms ease"
      : "none",
    pointerEvents: isExiting ? "none" : "auto",
  };

  return (
    <div className="rune-onboarding">
      {/* ── Stage 1 — Name the story ─────────────────────────────────── */}
      {stage === "title" && (
        <div className="flex min-h-screen flex-col items-center justify-center px-6" style={pageExitStyle}>
          <Wordmark />

          <div className="w-full max-w-[480px]">
            <div className="mb-20 text-center">
              <p
                className="mb-4 text-xs uppercase tracking-widest"
                style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
              >
                Welcome to Rune
              </p>
              <h1
                className="font-rune-serif text-5xl font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Every story begins somewhere.
              </h1>
            </div>

            <form onSubmit={handleTitleSubmit} noValidate>
              <div className="mb-16 text-center">
                <label
                  htmlFor="story-title"
                  className="mb-6 block text-xs uppercase tracking-widest"
                  style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
                >
                  What is your story called?
                </label>

                <input
                  ref={titleRef}
                  id="story-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "w-full border-0 border-b-2 bg-transparent pb-3 text-center font-rune-serif text-4xl outline-none transition-colors duration-200",
                    "placeholder:italic placeholder:opacity-30",
                    "focus:outline-none"
                  )}
                  style={{
                    color: "var(--text-primary)",
                    borderColor: hasValidTitle ? "var(--color-gold)" : "var(--color-border-strong)",
                  }}
                  aria-required="true"
                />

                {authorName && (
                  <p
                    className="mt-5 font-rune-serif text-sm italic"
                    style={{
                      color: "var(--onboarding-muted)",
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
                aria-label="Continue"
              >
                Begin →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Interlude 1 — Recognition ────────────────────────────────── */}
      {stage === "interlude-recognition" && (
        <Interlude
          heading="It has a name now."
          supporting="Before today, this story lived only in your imagination."
          onContinue={() => setStage("sentence")}
        />
      )}

      {/* ── Stage 2 — First sentence ─────────────────────────────────── */}
      {stage === "sentence" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6"
          style={{ background: "var(--bg-primary)" }}
        >
          <Wordmark />
          <BackButton onClick={handleBack} />

          <div className="w-full max-w-[480px]">
            <div className="mb-16 text-center">
              <p
                className="mb-4 text-xs uppercase tracking-widest"
                style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
              >
                The First Line
              </p>
              <h1
                className="font-rune-serif text-4xl font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                The first sentence is often the hardest.
              </h1>
              <p className="mt-4 font-rune-serif text-lg italic" style={{ color: "var(--onboarding-muted)" }}>
                Once it is behind you, the rest becomes easier.
              </p>
              <p className="mt-2 font-rune-serif text-lg italic" style={{ color: "var(--onboarding-muted)" }}>
                It does not need to be perfect. It only needs to exist.
              </p>
            </div>

            <form onSubmit={handleSentenceContinue} noValidate>
              <div className="mb-10 text-center">
                <label
                  htmlFor="first-sentence"
                  className="mb-6 block text-xs uppercase tracking-widest"
                  style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
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
                    autoResizeSentence();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSentenceContinue();
                    }
                  }}
                  placeholder={`Write the first sentence of ${
                    title.length > 35 ? title.slice(0, 35) + "…" : title
                  }…`}
                  autoComplete="off"
                  spellCheck={true}
                  className={cn(
                    "w-full resize-none overflow-hidden border-0 border-b-2 bg-transparent pb-3 text-center font-rune-serif text-2xl outline-none transition-colors duration-200",
                    "placeholder:italic placeholder:opacity-30",
                    "focus:outline-none"
                  )}
                  style={{
                    color: "var(--text-primary)",
                    borderColor: hasValidSentence ? "var(--color-gold)" : "var(--color-border-strong)",
                    lineHeight: "1.6",
                  }}
                />
              </div>

              {hasValidSentence ? (
                <button
                  type="submit"
                  className="w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
                  style={{ background: "var(--color-gold)", color: "var(--color-ink)", cursor: "pointer" }}
                  aria-label="Continue"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSentenceSkip}
                  className="block w-full text-center font-rune-serif text-base italic"
                  style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
                >
                  I&rsquo;ll write it later
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Interlude 2 — Momentum ───────────────────────────────────── */}
      {stage === "interlude-momentum" && (
        <Interlude
          heading="Stories are not finished in a day."
          supporting="They are finished one page at a time."
          onContinue={() => setStage("theme")}
        />
      )}

      {/* ── Stage 3 — Choose your writing space ──────────────────────── */}
      {stage === "theme" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6"
          style={{ background: "var(--bg-primary)" }}
        >
          <Wordmark />
          <BackButton onClick={handleBack} />

          <div className="w-full max-w-[520px]">
            <div className="mb-12 text-center">
              <p
                className="mb-4 text-xs uppercase tracking-widest"
                style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
              >
                Your Writing Space
              </p>
              <h1
                ref={themeHeadingRef}
                tabIndex={-1}
                className="font-rune-serif text-4xl font-semibold leading-tight outline-none"
                style={{ color: "var(--text-primary)" }}
              >
                Where will this story be written?
              </h1>
            </div>

            <div className="mb-6 flex flex-col gap-3 sm:flex-row" role="group" aria-label="Writing space">
              <ThemeOption
                id="parchment"
                name="Parchment"
                description="Quiet. Timeless. Focused."
                active={theme === "parchment"}
                onSelect={setTheme}
              />
              <ThemeOption
                id="candlelight"
                name="Candlelight"
                description="Warm pages lit late into the night."
                active={theme === "candlelight"}
                onSelect={setTheme}
              />
            </div>

            <p
              className="mb-10 text-center text-sm italic"
              style={{ color: "var(--onboarding-muted)", opacity: 0.8 }}
            >
              More writing spaces reveal themselves as you continue writing.
            </p>

            <button
              type="button"
              onClick={handleThemeContinue}
              className="w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
              style={{ background: "var(--color-gold)", color: "var(--color-ink)", cursor: "pointer" }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Interlude 3 — Authorship and AI ──────────────────────────── */}
      {/* Held longer than the other interludes — this commitment matters
          more than a page-turn beat, so it gets more time to land. */}
      {stage === "interlude-authorship" && (
        <Interlude
          heading="Your words remain your own."
          supporting="Rune will never use AI to write, rewrite, or complete your story."
          footnote="Your voice belongs to you."
          durationMs={3400}
          onContinue={() => setStage("letter-invite")}
        />
      )}

      {/* ── Stage 4 — Letter invitation ──────────────────────────────── */}
      {stage === "letter-invite" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6"
          style={{ background: "var(--bg-primary)" }}
        >
          <Wordmark />
          <BackButton onClick={handleBack} />

          <div className="w-full max-w-[480px] text-center">
            <p
              className="mb-4 text-xs uppercase tracking-widest"
              style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
            >
              Before You Begin
            </p>
            <h1
              ref={letterInviteHeadingRef}
              tabIndex={-1}
              className="font-rune-serif text-4xl font-semibold leading-tight outline-none"
              style={{ color: "var(--text-primary)" }}
            >
              A letter to the writer you&rsquo;ll become.
            </h1>
            <p
              className="mt-6 font-rune-serif text-lg italic leading-relaxed"
              style={{ color: "var(--text-primary)" }}
            >
              Starting a novel is an act of optimism. You are choosing to create something that does not exist
              yet. Leave a few words for the person who will one day finish it.
            </p>

            <button
              type="button"
              onClick={handleWriteLetter}
              className="mt-12 w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
              style={{ background: "var(--color-gold)", color: "var(--color-ink)", cursor: "pointer" }}
            >
              Write the letter
            </button>
            <button
              type="button"
              onClick={handleSkipLetterInvite}
              className="mt-4 block w-full text-center font-rune-serif text-base italic"
              style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Stage 5 — Letter entry ───────────────────────────────────── */}
      {stage === "letter-entry" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6"
          style={{ background: "var(--bg-primary)" }}
        >
          <Wordmark />
          <BackButton onClick={handleBack} />

          <div className="w-full max-w-[560px]">
            <div className="mb-8 text-center">
              <h1
                className="font-rune-serif text-3xl font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                What would you like your future self to remember?
              </h1>
              <p className="mt-3 font-rune-serif text-base italic" style={{ color: "var(--onboarding-muted)" }}>
                Why are you beginning this story today?
              </p>
            </div>

            <form onSubmit={handleSealLetter} noValidate>
              <label htmlFor="future-letter" className="sr-only">
                Your letter
              </label>
              <textarea
                ref={letterRef}
                id="future-letter"
                rows={6}
                value={letterContent}
                onChange={(e) => setLetterContent(e.target.value.slice(0, LETTER_MAX_LENGTH))}
                maxLength={LETTER_MAX_LENGTH}
                placeholder="Dear future me…"
                className={cn(
                  "w-full resize-none rounded-lg border bg-transparent p-4 font-rune-serif text-base leading-relaxed outline-none transition-colors duration-200",
                  "placeholder:italic placeholder:opacity-40"
                )}
                style={{
                  color: "var(--text-primary)",
                  background: "var(--surface-card)",
                  borderColor: hasValidLetter ? "var(--color-gold)" : "var(--color-border)",
                }}
              />
              <p className="mt-2 text-right text-xs" style={{ color: "var(--onboarding-muted)", opacity: 0.6 }}>
                {letterContent.length}/{LETTER_MAX_LENGTH}
              </p>

              <button
                type="submit"
                className="mt-6 w-full rounded-lg py-3.5 font-rune-serif text-lg font-medium"
                style={{
                  background: "var(--color-gold)",
                  color: "var(--color-ink)",
                  opacity: hasValidLetter ? 1 : 0.42,
                  cursor: "pointer",
                }}
                disabled={!hasValidLetter}
              >
                Seal the letter
              </button>
              <button
                type="button"
                onClick={handleSkipLetterEntry}
                className="mt-4 block w-full text-center font-rune-serif text-base italic"
                style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
              >
                Skip
              </button>

              <p
                className="mt-6 text-center font-rune-serif text-sm italic"
                style={{ color: "var(--onboarding-muted)", opacity: 0.7 }}
              >
                One day, Rune will return this to you.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ── Final interlude — Arrival ─────────────────────────────────── */}
      {stage === "interlude-arrival" && (
        <div
          className="rune-step-enter flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{ background: "var(--bg-primary)", pointerEvents: submitting ? "none" : "auto" }}
        >
          <div className="w-full max-w-[480px]">
            <h1
              ref={arrivalHeadingRef}
              tabIndex={-1}
              className="font-rune-serif text-3xl italic outline-none"
              style={{ color: "var(--text-primary)" }}
            >
              Your desk is ready.
            </h1>
            <p className="mt-4 font-rune-serif text-base" style={{ color: "var(--onboarding-muted)" }}>
              Now begin.
            </p>

            {submitError && (
              <div className="mt-12">
                <p role="alert" className="font-rune-serif text-sm" style={{ color: "var(--color-crimson)" }}>
                  {submitError}
                </p>
                <button
                  type="button"
                  onClick={() => void submitOnboarding()}
                  className="mt-5 rounded-lg px-8 py-2.5 font-rune-serif text-base font-medium"
                  style={{ background: "var(--color-gold)", color: "var(--color-ink)", cursor: "pointer" }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
