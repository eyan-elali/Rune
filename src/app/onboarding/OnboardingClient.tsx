"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProjectWithDraft } from "@/lib/actions/projects";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { cn } from "@/lib/utils";

const WRITING_TYPES = [
  "Novel",
  "Short Story",
  "Non-fiction",
  "Screenplay",
  "Other",
] as const;
type WritingType = (typeof WRITING_TYPES)[number];

export function OnboardingClient() {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [writingType, setWritingType] = useState<WritingType | null>(null);
  const [wordGoal, setWordGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give your story a name to begin.");
      titleRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createProjectWithDraft(trimmed);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const { projectId, chapterId } = result.data!;
    router.push(`/projects/${projectId}/chapters/${chapterId}`);
  }

  return (
    <>
      <RegistrationTracker />

      <div
        className="flex min-h-screen flex-col items-center justify-center px-6"
        style={{ background: "var(--bg-primary)" }}
      >
        {/* Wordmark */}
        <div
          className="absolute left-8 top-8 select-none"
          aria-hidden="true"
        >
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

        <div className="w-full max-w-[520px]">
          {/* Heading block */}
          <div className="mb-14 text-center">
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

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Title field — manuscript-style */}
            <div className="mb-10">
              <label
                htmlFor="story-title"
                className="mb-3 block text-xs uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
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
                placeholder="The name of your manuscript…"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "w-full border-0 border-b-2 bg-transparent pb-3 font-rune-serif text-3xl outline-none transition-colors duration-200 placeholder:opacity-30",
                  "focus:outline-none"
                )}
                style={{
                  color: "var(--color-ink)",
                  borderColor: error
                    ? "var(--color-crimson)"
                    : title
                    ? "var(--color-gold)"
                    : "var(--color-border-strong)",
                }}
                aria-required="true"
                aria-describedby={error ? "title-error" : undefined}
              />
              {error && (
                <p
                  id="title-error"
                  role="alert"
                  className="mt-2 text-xs"
                  style={{ color: "var(--color-crimson)" }}
                >
                  {error}
                </p>
              )}
            </div>

            {/* Optional: Writing type */}
            <div className="mb-8">
              <p
                className="mb-3 text-xs uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
              >
                What kind of story?{" "}
                <span style={{ opacity: 0.5 }}>(optional)</span>
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Writing type"
              >
                {WRITING_TYPES.map((type) => {
                  const active = writingType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setWritingType(active ? null : type)
                      }
                      aria-pressed={active}
                      className="rounded-full px-4 py-1.5 text-sm font-rune-serif transition-all duration-150"
                      style={{
                        background: active
                          ? "var(--color-gold)"
                          : "transparent",
                        color: active
                          ? "var(--color-ink)"
                          : "var(--color-mist)",
                        border: `1px solid ${
                          active
                            ? "var(--color-gold)"
                            : "var(--color-border-strong)"
                        }`,
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional: Manuscript goal */}
            <div className="mb-12">
              <label
                htmlFor="word-goal"
                className="mb-3 block text-xs uppercase tracking-widest"
                style={{ color: "var(--color-mist)" }}
              >
                Manuscript goal{" "}
                <span style={{ opacity: 0.5 }}>(optional)</span>
              </label>
              <div className="flex items-baseline gap-3">
                <input
                  id="word-goal"
                  type="number"
                  min={0}
                  value={wordGoal}
                  onChange={(e) => setWordGoal(e.target.value)}
                  placeholder="80,000"
                  className="w-32 border-0 border-b bg-transparent pb-1 text-right font-rune-serif text-lg outline-none transition-colors focus:outline-none"
                  style={{
                    color: "var(--color-ink)",
                    borderColor: wordGoal
                      ? "var(--color-gold)"
                      : "var(--color-border-strong)",
                  }}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--color-mist)" }}
                >
                  words
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-4 font-rune-serif text-lg font-semibold transition-all duration-150 disabled:opacity-60"
              style={{
                background: loading
                  ? "var(--color-gold-dim)"
                  : "var(--color-gold)",
                color: "var(--color-ink)",
              }}
              aria-label="Create project and begin writing"
            >
              {loading ? "Opening your manuscript…" : "Begin Writing →"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
