"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, PenLine } from "lucide-react";
import { beginOnboarding, chooseOnboardingPath, completeOnboarding, createOnboardingProject } from "@/lib/actions/onboarding";
import type { OnboardingStep } from "@/lib/onboarding";
import { PROJECT_TITLE_MAX } from "@/lib/projectCreation";
import { APPEARANCES, type AppearanceId } from "@/lib/rune2/preferences";
import { ICON } from "./icons";
import { ManuscriptImportDialog } from "./ManuscriptImport";
import { useRunePreferences, useRuneRootProps } from "./RunePreferences";

// Onboarding (Beta Completion E): a short transition into Rune — not a
// feature tour, not a motivational sequence. One idea per screen:
//
//   welcome     Your story has a place now. (and the authorship promise)
//   path        How are you starting? — new, or import: equal choices
//   title       What are you working on?           (new)
//   import      the existing Manuscript Import      (import)
//   model       Write here. Build around it only when you need to.
//   appearance  Make the desk yours. (optional)
//   arrival     Your desk is ready. → the Project
//
// The server holds the journey (lib/actions/onboarding.ts); the page tells
// this where to resume. Each step's heading takes focus as it appears, for
// the keyboard and screen readers; motion is a short fade, none when the
// writer asks for reduced motion (rune2.css).

type Step = OnboardingStep | "appearance" | "arrival";

/** The three looks onboarding offers; System stays a quiet secondary choice. */
const DESK_THEMES: AppearanceId[] = ["light", "candlelight", "dark"];

export function Onboarding({
  initialStep,
  project: initialProject,
}: {
  initialStep: OnboardingStep;
  project: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const rootProps = useRuneRootProps();
  const [step, setStep] = useState<Step>(initialStep);
  const [project, setProject] = useState(initialProject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const failure = await fn();
      if (failure) setError(failure);
    } catch {
      setError("You appear to be offline. Nothing was lost — try again when you’re connected.");
    } finally {
      setBusy(false);
    }
  }

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const choosePath = (path: "new" | "import") =>
    run(async () => {
      const r = await chooseOnboardingPath(path);
      if (r.error !== null) return r.error;
      go(path === "new" ? "title" : "import");
      return null;
    });

  return (
    <div className="r2 r2-onb" {...rootProps}>
      <header className="r2-onb-head">
        <span className="r2-wordmark" aria-hidden>
          Rune
        </span>
      </header>
      <main className="r2-onb-main">
        {step === "welcome" && (
          <Screen key="welcome" title="Your story has a place now.">
            <p className="r2-onb-lede">
              Rune keeps your manuscript at the center, with a workspace that can grow around it only when you need it.
            </p>
            <p className="r2-onb-promise">
              <strong>Your words remain your own.</strong> Rune will never use AI to write, rewrite, or complete your story.
            </p>
            <Actions>
              <button
                type="button"
                className="r2-button r2-button--primary r2-onb-primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await beginOnboarding();
                    if (r.error !== null) return r.error;
                    go("path");
                    return null;
                  })
                }
              >
                Continue
              </button>
            </Actions>
          </Screen>
        )}

        {step === "path" && (
          <Screen key="path" title="How are you starting?">
            <div className="r2-onb-choices" role="group" aria-label="How are you starting?">
              <button type="button" className="r2-onb-choice" disabled={busy} onClick={() => choosePath("new")}>
                <PenLine {...ICON} aria-hidden />
                <span className="r2-onb-choice-title">Start something new</span>
                <span className="r2-onb-choice-detail">Begin with a clean manuscript.</span>
              </button>
              <button type="button" className="r2-onb-choice" disabled={busy} onClick={() => choosePath("import")}>
                <FileUp {...ICON} aria-hidden />
                <span className="r2-onb-choice-title">Bring in a manuscript</span>
                <span className="r2-onb-choice-detail">Import your existing writing.</span>
              </button>
            </div>
          </Screen>
        )}

        {step === "title" && (
          <TitleStep
            busy={busy}
            initial={project?.title ?? ""}
            onBack={() => go("path")}
            onSubmit={(title) =>
              run(async () => {
                const r = await createOnboardingProject(title);
                if (r.error !== null) return r.error;
                setProject({ id: r.data.projectId, title: r.data.title });
                go("model");
                return null;
              })
            }
          />
        )}

        {step === "import" && (
          <ImportStep
            onBack={() => go("path")}
            onImported={(p) => {
              setProject({ id: p.projectId, title: p.title });
              go("model");
              router.refresh();
            }}
          />
        )}

        {step === "model" && (
          <Screen key="model" title="Write here. Build around it only when you need to.">
            <MentalModel />
            <p className="r2-onb-lede r2-onb-lede--center">You never need to build a system just to start writing.</p>
            <Actions>
              <button type="button" className="r2-button r2-button--primary r2-onb-primary" onClick={() => go("appearance")}>
                Continue
              </button>
            </Actions>
          </Screen>
        )}

        {step === "appearance" && <AppearanceStep onDone={() => go("arrival")} />}

        {step === "arrival" && (
          <Screen key="arrival" title="Your desk is ready.">
            <Actions>
              <button
                type="button"
                className="r2-button r2-button--primary r2-onb-primary r2-onb-open"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await completeOnboarding();
                    if (r.error !== null) return r.error;
                    router.replace(r.data.href);
                    // The page changes; stay busy until it does.
                    return new Promise<null>(() => {});
                  })
                }
              >
                {project ? `Open ${project.title}` : "Open Rune"}
              </button>
            </Actions>
          </Screen>
        )}

        {error && (
          <p role="alert" className="r2-notice r2-onb-error" data-tone="danger">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}

/** One screen: its heading (focused as it appears) and what follows. */
function Screen({ title, children, back }: { title: string; children?: ReactNode; back?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="r2-onb-screen" aria-labelledby="r2-onb-title">
      {back && (
        <button type="button" className="r2-button r2-button--quiet r2-button--sm r2-onb-back" onClick={back}>
          <ArrowLeft {...ICON} aria-hidden />
          Back
        </button>
      )}
      <h1 id="r2-onb-title" ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </section>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="r2-onb-actions">{children}</div>;
}

function TitleStep({
  busy,
  initial,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  initial: string;
  onBack: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) onSubmit(title.trim());
  };
  return (
    <Screen key="title" title="What are you working on?" back={busy ? undefined : onBack}>
      <form className="r2-onb-form" onSubmit={submit}>
        <label htmlFor="r2-onb-project-title" className="sr-only">
          Project title
        </label>
        <input
          id="r2-onb-project-title"
          className="r2-onb-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={PROJECT_TITLE_MAX}
          placeholder="A working title"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="r2-onb-title-hint"
          autoFocus
        />
        <p id="r2-onb-title-hint" className="r2-onb-hint">
          You can change this anytime.
        </p>
        <Actions>
          <button type="submit" className="r2-button r2-button--primary r2-onb-primary" disabled={busy || !title.trim()}>
            {busy ? "Making your manuscript…" : "Continue"}
          </button>
        </Actions>
      </form>
    </Screen>
  );
}

function ImportStep({
  onBack,
  onImported,
}: {
  onBack: () => void;
  onImported: (project: { projectId: string; title: string }) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Screen key="import" title="Bring in your manuscript." back={onBack}>
      <p className="r2-onb-lede">
        Choose a file and Rune shows you the chapters and scenes it finds — you can correct them before anything is
        created.
      </p>
      <p className="r2-onb-hint">Rune reads Word (.docx), Markdown and plain text files.</p>
      <Actions>
        <button type="button" className="r2-button r2-button--primary r2-onb-primary" onClick={() => setOpen(true)}>
          <FileUp {...ICON} aria-hidden />
          Choose a file
        </button>
      </Actions>
      {open && <ManuscriptImportDialog onboarding onClose={() => setOpen(false)} onImported={onImported} />}
    </Screen>
  );
}

/**
 * The one idea: the Manuscript is the book; the Workspace is everything
 * around it, built only as the book asks. Drawn, not listed — the book as a
 * column of chapters and scenes; the workspace as a few things set loosely
 * around it.
 */
function MentalModel() {
  return (
    <div className="r2-onb-model" role="img" aria-label="Your Manuscript is the book itself — chapters, scenes, your prose in order. The Workspace around it holds notes, characters, research and anything else you choose to build.">
      <div className="r2-onb-model-book" aria-hidden>
        <p className="r2-onb-model-kind">Manuscript</p>
        <p className="r2-onb-model-what">Your book</p>
        <div className="r2-onb-model-page">
          <span className="r2-onb-model-chapter">Chapter 1</span>
          <span className="r2-onb-model-scene" />
          <span className="r2-onb-model-scene r2-onb-model-scene--short" />
          <span className="r2-onb-model-chapter">Chapter 2</span>
          <span className="r2-onb-model-scene" />
          <span className="r2-onb-model-scene r2-onb-model-scene--mid" />
        </div>
        <p className="r2-onb-model-note">Chapters, scenes and your prose, in order.</p>
      </div>
      <div className="r2-onb-model-space" aria-hidden>
        <p className="r2-onb-model-kind">Workspace</p>
        <p className="r2-onb-model-what">Everything around it</p>
        <div className="r2-onb-model-things">
          <span>Notes</span>
          <span>Characters</span>
          <span>Research</span>
          <span>A map of ideas</span>
          <span className="r2-onb-model-more">whatever you choose</span>
        </div>
        <p className="r2-onb-model-note">Grows only when the book asks for it.</p>
      </div>
    </div>
  );
}

function AppearanceStep({ onDone }: { onDone: () => void }) {
  const { appearance, accent, update } = useRunePreferences();
  const [error, setError] = useState<string | null>(null);
  const choose = async (id: AppearanceId) => {
    setError(null);
    const failure = await update({ appearance: id });
    if (failure) setError(failure);
  };
  const label = (id: AppearanceId) => APPEARANCES.find((a) => a.id === id)?.label ?? id;
  return (
    <Screen key="appearance" title="Make the desk yours.">
      <p className="r2-onb-lede">Choose how Rune looks. You can change this anytime in Settings.</p>
      <div className="r2-onb-themes" role="radiogroup" aria-label="Appearance">
        {DESK_THEMES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={appearance === id}
            className="r2-onb-theme"
            onClick={() => void choose(id)}
          >
            <span className="r2 r2-onb-theme-preview" data-theme={id} data-accent={accent} aria-hidden>
              <span className="r2-onb-theme-nav" />
              <span className="r2-onb-theme-page">
                <span className="r2-onb-theme-line r2-onb-theme-line--title" />
                <span className="r2-onb-theme-line" />
                <span className="r2-onb-theme-line" />
                <span className="r2-onb-theme-line r2-onb-theme-line--short" />
              </span>
            </span>
            <span className="r2-onb-theme-name">{label(id)}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={appearance === "system"}
        className="r2-button r2-button--quiet r2-button--sm r2-onb-system"
        onClick={() => void choose("system")}
      >
        {appearance === "system" ? "Matching your system’s light or dark setting" : "Match my system instead"}
      </button>
      {error && (
        <p role="alert" className="r2-notice" data-tone="danger">
          {error}
        </p>
      )}
      <Actions>
        <button type="button" className="r2-button r2-button--primary r2-onb-primary" onClick={onDone}>
          Continue
        </button>
        <button type="button" className="r2-button r2-button--quiet" onClick={onDone}>
          Skip
        </button>
      </Actions>
    </Screen>
  );
}
