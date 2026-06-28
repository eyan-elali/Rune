"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProjectWithDraft } from "@/lib/actions/projects";
import { RegistrationTracker } from "@/components/RegistrationTracker";
import { cn } from "@/lib/utils";

interface Props {
  authorName: string | null;
}

export function OnboardingClient({ authorName }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasValidTitle = title.trim().length > 0;
  const buttonActive = hasValidTitle && !loading;

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
    </>
  );
}
