"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createProject, deleteTrashedProject, renameProject } from "@/lib/actions/projects";
import { PROJECT_TITLE_MAX } from "@/lib/projectCreation";

// The Project dialogs of the Projects surface and the Project shell (Beta
// Completion A): New project, Rename, and Delete permanently. Each says what
// happened only after the server has it: the action resolves first, the
// dialog closes after, and a failure keeps the dialog open with its reason
// and the writer's input intact.

const OFFLINE = "You appear to be offline. Nothing was changed — try again when you’re connected.";

function Dialog({
  title,
  busy,
  onClose,
  children,
  role = "dialog",
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: (titleId: string) => ReactNode;
  role?: "dialog" | "alertdialog";
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="r2-dialog r2-project-dialog" role={role} aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children(titleId)}
      </div>
    </div>
  );
}

/** A new, blank Project: its name, then straight into it. */
export function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (projectId: string) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per attempt, reused by its retries: a lost response never makes a second Project.
  const requestId = useRef<string | null>(null);
  const fieldId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await createProject(name, undefined, undefined, requestId.current);
      if (result.error !== null) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onCreated(result.data.id);
    } catch {
      setError(OFFLINE);
      setBusy(false);
    }
  }

  return (
    <Dialog title="New project" busy={busy} onClose={onClose}>
      {() => (
        <form onSubmit={submit}>
          <p>A project holds one manuscript and the workspace around it. It starts with a first chapter, ready to write.</p>
          <label htmlFor={fieldId} className="r2-label r2-project-dialog-label">
            Title
          </label>
          <input
            id={fieldId}
            className="r2-field r2-project-dialog-field"
            value={title}
            maxLength={PROJECT_TITLE_MAX}
            autoFocus
            autoComplete="off"
            placeholder="Untitled novel"
            disabled={busy}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              // A different title is a different attempt.
              requestId.current = null;
            }}
          />
          {error && (
            <p role="alert" className="r2-import-error">
              {error}
            </p>
          )}
          <div className="r2-dialog-actions">
            <button type="button" className="r2-button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="r2-button r2-button--primary" disabled={busy || !title.trim()}>
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Renames a Project. */
export function RenameProjectDialog({
  project,
  onClose,
  onRenamed,
}: {
  project: { id: string; title: string };
  onClose: () => void;
  onRenamed: (title: string) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name || busy) return;
    if (name === project.title) return onClose();
    setBusy(true);
    setError(null);
    try {
      const result = await renameProject(project.id, name);
      if (result.error !== null) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onRenamed(result.data.title);
    } catch {
      setError(OFFLINE);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Rename project" busy={busy} onClose={onClose}>
      {() => (
        <form onSubmit={submit}>
          <label htmlFor={fieldId} className="r2-label r2-project-dialog-label">
            Title
          </label>
          <input
            id={fieldId}
            className="r2-field r2-project-dialog-field"
            value={title}
            maxLength={PROJECT_TITLE_MAX}
            autoFocus
            autoComplete="off"
            disabled={busy}
            aria-invalid={error ? true : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTitle(e.target.value)}
          />
          {error && (
            <p role="alert" className="r2-import-error">
              {error}
            </p>
          )}
          <div className="r2-dialog-actions">
            <button type="button" className="r2-button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="r2-button r2-button--primary" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : "Rename"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/**
 * Permanent deletion of a Project in Trash. A strong confirmation: the
 * writer types the Project's title.
 */
export function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: { id: string; title: string; words: number };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const matches = typed.trim() === project.title.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTrashedProject(project.id);
      if (result.error !== null) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onDeleted();
    } catch {
      setError(OFFLINE);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete project permanently" busy={busy} onClose={onClose} role="alertdialog">
      {() => (
        <form onSubmit={submit}>
          <p>
            <strong>{project.title}</strong> and everything in it — its manuscript
            {project.words > 0 ? ` (${project.words.toLocaleString()} words)` : ""}, scene history, milestones, revision
            notes, workspace pages, collections, canvases and images — will be deleted for good. This can’t be undone.
          </p>
          <p>Download a backup first if you might want any of it later.</p>
          <label htmlFor={fieldId} className="r2-label r2-project-dialog-label">
            Type the project’s title to confirm
          </label>
          <input
            id={fieldId}
            className="r2-field r2-project-dialog-field"
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={project.title}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
          />
          {error && (
            <p role="alert" className="r2-import-error">
              {error}
            </p>
          )}
          <div className="r2-dialog-actions">
            <button type="button" className="r2-button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="r2-button r2-button--danger" disabled={busy || !matches}>
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
