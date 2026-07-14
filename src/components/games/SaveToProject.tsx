"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getLocalDateString } from "@/lib/utils";
import {
  appendSprintToProject,
  appendToExistingPage,
} from "@/lib/actions/games";
import { transferGameWordsToProject } from "@/lib/actions/writingStats";
import { getProjects } from "@/lib/actions/projects";
import { getChapters } from "@/lib/actions/chapters";
import type { PageSource } from "@/components/games/PageSourceSelector";
import type { Project, Chapter } from "@/lib/types";

type SaveStep =
  | "idle"
  | "loading"
  | "pick-project"
  | "pick-chapter"
  | "saving"
  | "saved"
  | "error";

export function SaveToProject({
  words,
  textWritten,
  sessionInvalidated = false,
  pageSource,
}: {
  words: number;
  textWritten: string;
  sessionInvalidated?: boolean;
  pageSource?: PageSource;
}) {
  const [step, setStep] = useState<SaveStep>("idle");
  const [projects, setProjects] = useState<Project[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [savedChapterName, setSavedChapterName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [appendStep, setAppendStep] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [appendError, setAppendError] = useState("");

  if (words === 0) return null;

  // ── Existing page append flow ───────────────────────────────────────────────
  async function handleAppend() {
    if (pageSource?.type !== "existing") return;
    setAppendStep("saving");
    const result = await appendToExistingPage(pageSource.page.id, textWritten, words);
    if (result.error) { setAppendError(result.error); setAppendStep("error"); return; }
    if (!sessionInvalidated) {
      await transferGameWordsToProject(pageSource.project.id, words, getLocalDateString());
    }
    setAppendStep("saved");
  }

  if (pageSource?.type === "existing") {
    const { page, project } = pageSource;
    if (appendStep === "saved") {
      return (
        <div className="mt-4 rounded-lg px-5 py-3 text-center text-sm"
          style={{ background: "rgba(74, 103, 65, 0.15)", border: "1px solid rgba(74, 103, 65, 0.3)", color: "var(--color-sage)" }}>
          ✓ &nbsp;Appended to &ldquo;{page.title}&rdquo;
        </div>
      );
    }
    if (appendStep === "saving") {
      return <Button variant="ghost" loading disabled className="mt-4">Saving…</Button>;
    }
    if (appendStep === "error") {
      return (
        <div className="mt-4 text-center">
          <p className="mb-2 text-xs" style={{ color: "var(--color-crimson)" }}>{appendError}</p>
          <button type="button" className="text-xs underline" style={{ color: "var(--color-mist)" }}
            onClick={() => { setAppendStep("idle"); setAppendError(""); }}>Try again</button>
        </div>
      );
    }
    return (
      <div className="mt-4 text-center">
        <p className="mb-2 text-xs" style={{ color: "var(--color-mist)" }}>
          Append to:{" "}
          <span className="font-rune-serif" style={{ color: "var(--color-gold)" }}>{page.title}</span>
          {" · "}
          <span style={{ opacity: 0.6 }}>{project.title}</span>
        </p>
        <Button variant="ghost" className="mt-1" onClick={handleAppend}>
          Append to Page
        </Button>
      </div>
    );
  }

  async function handleOpenProjects() {
    setStep("loading");
    const result = await getProjects();
    if (result.error || !result.data) {
      setErrorMsg(result.error ?? "Failed to load projects");
      setStep("error");
      return;
    }
    setProjects(result.data);
    setStep("pick-project");
  }

  async function handleSelectProject(project: Project) {
    setSelectedProject(project);
    setStep("loading");
    const result = await getChapters(project.id);
    if (result.error || !result.data) {
      setErrorMsg(result.error ?? "Failed to load chapters");
      setStep("error");
      return;
    }
    setChapters(result.data);
    setStep("pick-chapter");
  }

  async function handleSelectChapter(chapter: Chapter) {
    if (!selectedProject) return;
    setStep("saving");
    const result = await appendSprintToProject(
      selectedProject.id,
      chapter.id,
      words,
      textWritten
    );
    if (result.error) {
      setErrorMsg(result.error);
      setStep("error");
      return;
    }
    // Transfer words to project stats unless session was invalidated by anti-cheat
    if (!sessionInvalidated) {
      await transferGameWordsToProject(selectedProject.id, words, getLocalDateString());
    }
    setSavedChapterName(chapter.title);
    setStep("saved");
  }

  // Saved confirmation
  if (step === "saved") {
    return (
      <div
        className="mt-4 rounded-lg px-5 py-3 text-center text-sm"
        style={{
          background: "rgba(74, 103, 65, 0.15)",
          border: "1px solid rgba(74, 103, 65, 0.3)",
          color: "var(--color-sage)",
        }}
      >
        ✓ &nbsp;Saved to &ldquo;{savedChapterName}&rdquo;
      </div>
    );
  }

  // Saving spinner
  if (step === "saving") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Saving…
      </Button>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="mt-4 text-center">
        <p className="mb-2 text-xs" style={{ color: "var(--color-crimson)" }}>
          {errorMsg}
        </p>
        <button
          type="button"
          className="text-xs underline"
          style={{ color: "var(--color-mist)" }}
          onClick={() => { setStep("idle"); setErrorMsg(""); }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Loading
  if (step === "loading") {
    return (
      <Button variant="ghost" loading disabled className="mt-4">
        Loading…
      </Button>
    );
  }

  // Project picker
  if (step === "pick-project") {
    return (
      <div className="mt-4 w-full max-w-xs">
        <p
          className="mb-2 text-center text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Pick a project
        </p>
        <div
          className="max-h-48 overflow-y-auto rounded-lg"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-border-strong) transparent",
          }}
        >
          {projects.length === 0 ? (
            <p
              className="px-4 py-3 text-center text-sm"
              style={{ color: "var(--color-mist)" }}
            >
              No projects yet
            </p>
          ) : (
            <ul role="list">
              {projects.map((project, i) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectProject(project)}
                    className="w-full px-4 py-3 text-left text-sm transition-colors duration-100 hover:bg-rune-gold/10"
                    style={{
                      color: "var(--text-primary)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <span className="font-rune-serif">{project.title}</span>
                    <span
                      className="ml-2 text-xs"
                      style={{ color: "var(--color-mist)" }}
                    >
                      {project.word_count.toLocaleString()} words
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full text-center text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
          onClick={() => setStep("idle")}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Chapter picker
  if (step === "pick-chapter") {
    return (
      <div className="mt-4 w-full max-w-xs">
        <p
          className="mb-1 text-center text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Pick a chapter
        </p>
        <p
          className="mb-2 text-center text-xs font-rune-serif"
          style={{ color: "var(--color-gold)" }}
        >
          {selectedProject?.title}
        </p>
        <div
          className="max-h-48 overflow-y-auto rounded-lg"
          style={{
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-border-strong) transparent",
          }}
        >
          {chapters.length === 0 ? (
            <p
              className="px-4 py-3 text-center text-sm"
              style={{ color: "var(--color-mist)" }}
            >
              No chapters in this project
            </p>
          ) : (
            <ul role="list">
              {chapters.map((chapter, i) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectChapter(chapter)}
                    className="w-full px-4 py-3 text-left text-sm transition-colors duration-100 hover:bg-rune-gold/10"
                    style={{
                      color: "var(--text-primary)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <span className="font-rune-serif">{chapter.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full text-center text-xs"
          style={{ color: "var(--color-mist)", opacity: 0.6 }}
          onClick={() => { setStep("pick-project"); setChapters([]); }}
        >
          ← Back to projects
        </button>
      </div>
    );
  }

  // Idle — show button
  return (
    <Button variant="ghost" className="mt-4" onClick={handleOpenProjects}>
      Save to Project
    </Button>
  );
}
