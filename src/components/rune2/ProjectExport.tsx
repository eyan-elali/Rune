"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, FileDown } from "lucide-react";
import { ICON } from "./icons";
import { getPendingWrite } from "@/lib/offline/db";
import { createClient } from "@/lib/supabase/client";
import { BackupUnavailableError, makeProjectBackup, type BackupKind } from "@/lib/backup/projectBackup";
import { prepareDownload, saveFile, type PreparedDownload } from "@/lib/export/download";
import {
  defaultExportName,
  EXPORT_FORMATS,
  exportFileName,
  renderExport,
  safeFileName,
  type ExportFormat,
} from "@/lib/export/formats";
import { unsupportedPdfCharacters } from "@/lib/export/pdf";
import {
  ExportUnavailableError,
  loadExportSource,
  planExport,
  type ExportScope,
  type ExportSource,
} from "@/lib/export/plan";
import { useRune2Selection } from "./Rune2Selection";

// Export and Whole-Project Backup (Milestone 19): one dialog for "Export
// Manuscript", "Export Chapter" and "Export Scene" — the same pipeline
// (lib/export/plan.ts) at three scopes — and one for "Download Project
// Backup". Both read the canonical data as the writer, build the file on this
// device and hand it to the browser to save: nothing is written to the
// project, and nothing is kept on the server.
//
// The export dialog offers only what is useful: the format, the file name,
// what is being exported, and — for the Manuscript, when it has any —
// "Include Unplaced Scenes at the end" (off by default). If the writer's
// latest words are still on their way to the server, it says so: an export
// holds what the manuscript holds.

type Open = { kind: "export"; scope: ExportScope } | { kind: "backup" } | null;

type ProjectExportApi = {
  openExport: (scope: ExportScope) => void;
  openBackup: () => void;
  open: Open;
  close: () => void;
};

const ProjectExportContext = createContext<ProjectExportApi | null>(null);

export function useProjectExport(): ProjectExportApi | null {
  return useContext(ProjectExportContext);
}

export function ProjectExportProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const api = useMemo<ProjectExportApi>(
    () => ({
      openExport: (scope) => setOpen({ kind: "export", scope }),
      openBackup: () => setOpen({ kind: "backup" }),
      open,
      close,
    }),
    [open, close]
  );
  return <ProjectExportContext.Provider value={api}>{children}</ProjectExportContext.Provider>;
}

/** The open dialog, rendered inside the shell (where its theme lives). */
export function ProjectExportDialogs() {
  const api = useProjectExport();
  if (!api?.open) return null;
  return api.open.kind === "export" ? (
    <ExportDialog scope={api.open.scope} onClose={api.close} />
  ) : (
    <BackupDialog onClose={api.close} />
  );
}

/** The Manuscript's own actions, on its overview: export the book, or back up the whole project. */
export function ProjectExportLaunchers() {
  const api = useProjectExport();
  if (!api) return null;
  return (
    <div className="r2-export-launchers">
      <button type="button" className="r2-import-launch" onClick={() => api.openExport({ kind: "manuscript" })}>
        <FileDown {...ICON} aria-hidden />
        Export manuscript…
      </button>
      <button type="button" className="r2-import-launch" onClick={() => api.openBackup()}>
        <Archive {...ICON} aria-hidden />
        Download project backup…
      </button>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Scenes whose latest writing is still only on this device. */
async function unsavedScenes(ids: string[]): Promise<number> {
  try {
    return (await Promise.all(ids.map((id) => getPendingWrite(id)))).filter(Boolean).length;
  } catch {
    return 0; // No device storage: nothing can be waiting in it.
  }
}

function useDialogKeys(onClose: () => void, busy: boolean) {
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
}

const TITLES: Record<ExportScope["kind"], string> = {
  manuscript: "Export manuscript",
  chapter: "Export chapter",
  scene: "Export scene",
};

function ExportDialog({ scope, onClose }: { scope: ExportScope; onClose: () => void }) {
  const { manuscript } = useRune2Selection();
  const projectId = manuscript.project.id;
  const [source, setSource] = useState<ExportSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [includeUnplaced, setIncludeUnplaced] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useDialogKeys(onClose, busy);

  useEffect(() => {
    let cancelled = false;
    // The Manuscript's Unplaced Scenes are read too, so the option can say how many there are.
    const read = scope.kind === "manuscript" ? { kind: "manuscript" as const, includeUnplaced: true } : scope;
    (async () => {
      try {
        const loaded = await loadExportSource(createClient(), projectId, read);
        const waiting = await unsavedScenes(loaded.scenes.map((s) => s.id));
        if (cancelled) return;
        setSource(loaded);
        setUnsaved(waiting);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ExportUnavailableError ? e.message : "Rune couldn’t read the manuscript to export it. Nothing was changed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, scope, reload]);

  const exportDoc = useMemo(() => {
    if (!source) return null;
    try {
      return planExport(source, scope.kind === "manuscript" ? { kind: "manuscript", includeUnplaced } : scope);
    } catch {
      return null;
    }
  }, [source, scope, includeUnplaced]);
  const unplacedCount = source && scope.kind === "manuscript" ? source.scenes.filter((s) => s.chapter_id === null).length : 0;
  const fileBase = name ?? (exportDoc ? defaultExportName(exportDoc) : "");
  const missing = useMemo(() => (exportDoc && format === "pdf" ? unsupportedPdfCharacters(exportDoc) : []), [exportDoc, format]);

  async function run() {
    if (!exportDoc || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await renderExport(exportDoc, format);
      saveFile(file.bytes, exportFileName(fileBase, format), file.mime);
      onClose();
    } catch {
      setError("The file couldn’t be made. Nothing was changed — try again, or choose another format.");
    } finally {
      setBusy(false);
    }
  }

  const summary = exportDoc
    ? scope.kind === "scene"
      ? `${plural(exportDoc.stats.words, "word")} · the scene’s text, without its title`
      : [
          scope.kind === "manuscript" ? plural(exportDoc.stats.chapters, "chapter") : null,
          plural(exportDoc.stats.scenes, "scene"),
          plural(exportDoc.stats.words, "word"),
        ]
          .filter(Boolean)
          .join(" · ")
    : null;

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="r2-dialog r2-export" role="dialog" aria-modal="true" aria-labelledby="r2-export-title">
        <h2 id="r2-export-title">{TITLES[scope.kind]}</h2>
        {exportDoc && scope.kind !== "manuscript" && <p className="r2-export-subject">{exportDoc.subject}</p>}
        {!source && !error && <p aria-live="polite">Reading the manuscript…</p>}

        {exportDoc && (
          <>
            <p className="r2-export-summary">{summary}</p>
            <fieldset className="r2-export-formats">
              <legend>Format</legend>
              {EXPORT_FORMATS.map((f) => (
                <label key={f.id} className="r2-export-format" data-selected={format === f.id || undefined}>
                  <input
                    type="radio"
                    name="r2-export-format"
                    value={f.id}
                    checked={format === f.id}
                    disabled={busy}
                    autoFocus={f.id === format}
                    onChange={() => setFormat(f.id)}
                  />
                  <span>
                    <span className="r2-export-format-name">
                      {f.label} <span className="r2-export-ext">.{f.extension}</span>
                    </span>
                    <span className="r2-export-format-hint">{f.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="r2-import-title-field r2-export-name">
              <span>File name</span>
              <span className="r2-export-name-row">
                <input
                  className="r2-field"
                  value={fileBase}
                  maxLength={120}
                  spellCheck={false}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName(safeFileName(fileBase, exportDoc ? defaultExportName(exportDoc) : "Manuscript"))}
                />
                <span className="r2-export-ext">.{EXPORT_FORMATS.find((f) => f.id === format)!.extension}</span>
              </span>
            </label>

            {scope.kind === "manuscript" && unplacedCount > 0 && (
              <label className="r2-import-check">
                <input
                  type="checkbox"
                  checked={includeUnplaced}
                  disabled={busy}
                  onChange={(e) => setIncludeUnplaced(e.target.checked)}
                />
                Include Unplaced Scenes at the end ({unplacedCount})
              </label>
            )}

            {missing.length > 0 && (
              <p className="r2-notice r2-export-note" role="status">
                The PDF’s font can’t show {missing.length === 1 ? "one character" : "some characters"} in this text (
                {missing.slice(0, 8).join(" ")}
                {missing.length > 8 ? " …" : ""}); {missing.length === 1 ? "it appears" : "they appear"} as “?”. Word
                and Markdown keep every character.
              </p>
            )}
            {unsaved > 0 && (
              <p className="r2-notice r2-export-note" role="status">
                Your latest writing in {plural(unsaved, "scene")} is still being saved, and isn’t in this export yet.{" "}
                <button type="button" className="r2-import-link" onClick={() => setReload((n) => n + 1)}>
                  Check again
                </button>
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="r2-import-error">
            {error}
          </p>
        )}
        <div className="r2-dialog-actions">
          <button type="button" className="r2-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="r2-button r2-button--primary"
            disabled={!exportDoc || busy || !fileBase.trim()}
            onClick={() => void run()}
          >
            {busy ? "Preparing…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

const KIND_LABELS: Partial<Record<BackupKind, string>> = {
  scenes: "scenes",
  revision_notes: "revision notes",
  scene_revisions: "scene history",
  milestones: "milestones",
  workspace_documents: "pages",
  workspace_collection_entries: "collections",
  workspace_canvases: "canvases",
  workspace_attachments: "images",
  object_references: "references",
  writing_sessions: "writing history",
};

function BackupDialog({ onClose }: { onClose: () => void }) {
  const { manuscript } = useRune2Selection();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<PreparedDownload | null>(null);
  // Whether the dialog is still open. Set on every mount: React may mount,
  // unmount and mount again (Strict Mode), and a flag that only ever went one
  // way would leave the backup silently unsaved.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The file stays in memory for the fallback link until the dialog closes or a new backup replaces it.
  useEffect(() => () => ready?.release(), [ready]);
  useDialogKeys(onClose, busy);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setReady(null);
    try {
      const { bytes, fileName } = await makeProjectBackup(createClient(), manuscript.project.id, (kind, i, total) => {
        const label = KIND_LABELS[kind];
        if (label && mounted.current) setProgress(`Reading ${label}… (${i + 1} of ${total})`);
      });
      // Closed while it was being made: nothing to save.
      if (!mounted.current) return;
      const download = prepareDownload(bytes, fileName, "application/zip");
      setReady(download);
      try {
        download.start();
      } catch {
        setError("Your browser didn’t start the download. Use “Download backup” below to save it.");
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(
        e instanceof BackupUnavailableError
          ? e.message
          : "The backup couldn’t be made. Nothing was changed — try again in a moment."
      );
    } finally {
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="r2-dialog r2-export" role="dialog" aria-modal="true" aria-labelledby="r2-backup-title">
        <h2 id="r2-backup-title">Download project backup</h2>
        <p>
          A complete copy of <strong>{manuscript.project.title}</strong> as a .zip file: every scene (placed, unplaced
          and in Trash), its structure, revision notes, scene history and milestones, Workspace pages and collections,
          and your writing history for this project.
        </p>
        <p>
          It’s made on this device, in open formats (JSON and Markdown) you can read without Rune. Rune can’t restore
          a backup yet.
        </p>
        {progress && (
          <p aria-live="polite" className="r2-export-summary">
            {progress}
          </p>
        )}
        {ready && !error && (
          <p role="status" className="r2-export-summary">
            Saved to your downloads as {ready.fileName}. If it didn’t appear, use “Download backup” below.
          </p>
        )}
        {error && (
          <p role="alert" className="r2-import-error">
            {error}
          </p>
        )}
        <div className="r2-dialog-actions">
          <button type="button" className="r2-button" disabled={busy} onClick={onClose}>
            {ready ? "Close" : "Cancel"}
          </button>
          {ready ? (
            // A real link: saving it is the writer's own click, which every browser allows.
            <a className="r2-button r2-button--primary" href={ready.url} download={ready.fileName}>
              Download backup
            </a>
          ) : (
            <button type="button" className="r2-button r2-button--primary" disabled={busy} autoFocus onClick={() => void run()}>
              {busy ? progress ? "Reading…" : "Preparing…" : "Download backup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
