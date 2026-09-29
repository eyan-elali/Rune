"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { IMPORT_ACCEPT, ImportFileError, parseImportFile, titleFromFileName } from "@/lib/import/readFile";
import {
  buildPlan,
  detectLines,
  planPayload,
  roleOf,
  titleOf,
  type Line,
  type Overrides,
  type PlanItem,
  type PlanScene,
  type Role,
} from "@/lib/import/structure";
import type { ImportNotice, ParsedFile } from "@/lib/import/types";

// Manuscript Import (Rune 2.0, Milestone 15): choose a file → Rune reads it
// here, on the writer's device → a preview of the Groups, Chapters and Scenes
// it found, which the writer can correct (what a heading is, its name,
// whether a line is a Scene break, a possible heading Rune left as prose) →
// Import, which creates a NEW Project in one database transaction
// (POST /api/manuscript-import → import_manuscript_checked, migration 033).
// Nothing is written anywhere before Import; the current Project is never
// changed. A failed import writes nothing and keeps the preview, so the
// writer can retry.

const ROLE_LABEL: Record<Role, string> = {
  title: "Project title",
  group: "Group",
  chapter: "Chapter",
  break: "Scene break",
  scene: "Start a new scene",
  text: "Text",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

type Read = { fileName: string; bytes: Uint8Array; parsed: ParsedFile & { hardWrapped?: boolean }; lines: Line[] };

export function ImportManuscriptLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="r2-import-launch" onClick={() => setOpen(true)}>
        <FileUp size={14} strokeWidth={1.75} aria-hidden />
        Import a manuscript…
      </button>
      {open && <ManuscriptImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ManuscriptImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [title, setTitle] = useState("");
  const [keepLineBreaks, setKeepLineBreaks] = useState(false);
  const [importing, setImporting] = useState(false);
  // One id per confirmation attempt, reused by its retries: never two Projects.
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, importing]);

  const readFile = useCallback(async (fileName: string, bytes: Uint8Array, keepBreaks: boolean) => {
    setReading(true);
    setError(null);
    try {
      const parsed = await parseImportFile(fileName, bytes, { keepLineBreaks: keepBreaks });
      const lines = detectLines(parsed);
      setRead({ fileName, bytes, parsed, lines });
      setOverrides({});
      requestId.current = null;
      const first = buildPlan(lines, {}, parsed.suggestedTitle ?? titleFromFileName(fileName));
      setTitle(first.title);
    } catch (e) {
      setError(e instanceof ImportFileError ? e.message : "Rune couldn’t read this file. Nothing was imported.");
    } finally {
      setReading(false);
    }
  }, []);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setKeepLineBreaks(false);
    await readFile(file.name, new Uint8Array(await file.arrayBuffer()), false);
  }

  const plan = useMemo(
    () => (read ? buildPlan(read.lines, overrides, read.parsed.suggestedTitle ?? titleFromFileName(read.fileName)) : null),
    [read, overrides]
  );

  const setRole = useCallback((line: number, role: Role) => {
    requestId.current = null;
    setOverrides((o) => ({ ...o, [line]: { ...o[line], role } }));
  }, []);
  const setLineTitle = useCallback((line: number, value: string) => {
    requestId.current = null;
    setOverrides((o) => ({ ...o, [line]: { ...o[line], title: value } }));
  }, []);

  async function confirm() {
    if (!plan || importing) return;
    setImporting(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const res = await fetch("/api/manuscript-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: planPayload(plan, title), requestId: requestId.current }),
      });
      const body = (await res.json().catch(() => null)) as { projectId?: string; error?: string } | null;
      if (!res.ok || !body?.projectId) {
        setError(body?.error ?? "The import couldn’t be saved. Nothing was created.");
        return;
      }
      router.push(`/rune2/${body.projectId}`);
      onClose();
    } catch {
      setError("You appear to be offline. Nothing was created; try again when you’re connected.");
    } finally {
      setImporting(false);
    }
  }

  const lineByIndex = useMemo(() => new Map((read?.lines ?? []).map((l) => [l.index, l])), [read]);

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !importing && onClose()}>
      <div
        className="r2-dialog r2-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r2-import-title"
        data-stage={plan ? "preview" : "choose"}
      >
        <h2 id="r2-import-title">Import a manuscript</h2>
        <input ref={input} type="file" accept={IMPORT_ACCEPT} hidden onChange={(e) => void choose(e)} />

        {!plan && (
          <>
            <p>
              Choose a Word document (.docx), Markdown (.md) or plain text (.txt) file. Rune reads it on this
              device and shows you the parts, chapters and scenes it finds before anything is saved.
            </p>
            <p>The import becomes a new project. This project isn’t changed.</p>
            {error && (
              <p role="alert" className="r2-import-error">
                {error}
              </p>
            )}
            <div className="r2-dialog-actions">
              <button type="button" className="r2-button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="r2-button r2-button--primary"
                disabled={reading}
                autoFocus
                onClick={() => input.current?.click()}
              >
                {reading ? "Reading…" : "Choose a file…"}
              </button>
            </div>
          </>
        )}

        {plan && read && (
          <>
            <div className="r2-import-head">
              <label className="r2-import-title-field">
                <span>Project title</span>
                <input
                  className="r2-prop-input"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <p className="r2-import-summary" aria-live="polite">
                {[
                  plan.groups ? plural(plan.groups, "group") : null,
                  plural(plan.chapters, "chapter"),
                  plural(plan.scenes, "scene"),
                  `about ${plural(plan.words, "word")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {plan.unplaced.length > 0 && (
                  <span>
                    {" "}
                    · {plural(plan.unplaced.length, "unplaced scene")} ({plural(plan.unplacedWords, "word")})
                  </span>
                )}
              </p>
              <p className="r2-import-file">
                From {read.fileName}.{" "}
                <button type="button" className="r2-import-link" disabled={importing} onClick={() => input.current?.click()}>
                  Choose another file
                </button>
              </p>
            </div>

            <Notices notices={read.parsed.notices} />
            {read.parsed.hardWrapped !== undefined && read.parsed.hardWrapped && (
              <label className="r2-import-check">
                <input
                  type="checkbox"
                  checked={keepLineBreaks}
                  disabled={reading || importing}
                  onChange={(e) => {
                    setKeepLineBreaks(e.target.checked);
                    void readFile(read.fileName, read.bytes, e.target.checked);
                  }}
                />
                Keep every line break
              </label>
            )}

            <div className="r2-import-outline" role="group" aria-label="What Rune found">
              {plan.titleLine !== null && lineByIndex.get(plan.titleLine) && (
                <LineRow
                  line={lineByIndex.get(plan.titleLine)!}
                  lines={lineByIndex}
                  overrides={overrides}
                  onRole={setRole}
                  kindLabel="Title"
                  note="Names the project; not part of the prose."
                />
              )}
              <Items
                items={plan.items}
                depth={0}
                lines={lineByIndex}
                overrides={overrides}
                onRole={setRole}
                onTitle={setLineTitle}
              />
              {plan.unplaced.length > 0 && (
                <section className="r2-import-unplaced">
                  <h3>Unplaced Scenes</h3>
                  <p>
                    Text before the first chapter of the book or of a group. It’s kept as Unplaced Scenes — out of the
                    manuscript total and export until you place it. To make it a chapter instead, mark its first line
                    as a Chapter.
                  </p>
                  {plan.unplaced.map((s, i) => (
                    <SceneRow
                      key={i}
                      scene={s}
                      label={s.title}
                      lines={lineByIndex}
                      overrides={overrides}
                      onRole={setRole}
                    />
                  ))}
                </section>
              )}
            </div>

            {error && (
              <p role="alert" className="r2-import-error">
                {error}
              </p>
            )}
            <div className="r2-dialog-actions r2-import-actions">
              <p>Nothing is saved until you import.</p>
              <button type="button" className="r2-button" disabled={importing} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="r2-button r2-button--primary"
                disabled={importing || reading || !title.trim() || plan.chapters + plan.unplaced.length === 0}
                onClick={() => void confirm()}
              >
                {importing ? "Importing…" : "Import as a new project"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Notices({ notices }: { notices: ImportNotice[] }) {
  if (!notices.length) return null;
  return (
    <div className="r2-import-notices">
      <p>Not everything in this file can be carried over:</p>
      <ul>
        {notices.map((n) => (
          <li key={n.code}>{n.message}</li>
        ))}
      </ul>
    </div>
  );
}

type RowProps = {
  lines: ReadonlyMap<number, Line>;
  overrides: Overrides;
  onRole: (line: number, role: Role) => void;
};

function Items({
  items,
  depth,
  onTitle,
  ...row
}: RowProps & { items: PlanItem[]; depth: number; onTitle: (line: number, value: string) => void }) {
  return (
    <ol className="r2-import-items" data-depth={depth}>
      {items.map((it, i) => {
        const line = it.line !== null ? row.lines.get(it.line) : undefined;
        return (
          <li key={`${it.kind}-${it.line ?? `i${i}`}`} className="r2-import-item" data-kind={it.kind}>
            <div className="r2-import-row">
              <span className="r2-import-kind">{it.kind === "group" ? "Group" : "Chapter"}</span>
              {line ? (
                <>
                  <input
                    className="r2-prop-input r2-import-name"
                    aria-label={`${it.kind === "group" ? "Group" : "Chapter"} title`}
                    value={titleOf(line, row.overrides)}
                    maxLength={500}
                    onChange={(e) => onTitle(line.index, e.target.value)}
                  />
                  <RoleSelect line={line} {...row} />
                </>
              ) : (
                <span className="r2-import-name r2-import-name--static">{it.kind === "chapter" ? it.title : ""}</span>
              )}
              <span className="r2-import-count">{plural(it.words, "word")}</span>
            </div>
            {it.kind === "group" ? (
              <Items items={it.items} depth={depth + 1} onTitle={onTitle} {...row} />
            ) : (
              <ol className="r2-import-scenes">
                {it.scenes.map((s, j) => (
                  <li key={j}>
                    <SceneRow scene={s} label={`Scene ${j + 1}`} {...row} />
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SceneRow({ scene, label, ...row }: RowProps & { scene: PlanScene; label: string }) {
  const start = scene.startLine !== null ? row.lines.get(scene.startLine) : undefined;
  return (
    <div className="r2-import-scene">
      <div className="r2-import-row">
        <span className="r2-import-kind">{label}</span>
        <span className="r2-import-excerpt">{scene.excerpt || <em>Empty</em>}</span>
        <span className="r2-import-count">{plural(scene.words, "word")}</span>
      </div>
      {start && roleOf(start, row.overrides) === "break" && (
        <LineRow line={start} note="Starts this scene." {...row} />
      )}
      {scene.candidates.map((c) => {
        const line = row.lines.get(c);
        return line ? <LineRow key={c} line={line} {...row} /> : null;
      })}
    </div>
  );
}

function LineRow({ line, note, kindLabel, ...row }: RowProps & { line: Line; note?: string; kindLabel?: string }) {
  const role = roleOf(line, row.overrides);
  const label =
    kindLabel ??
    (line.detected === "break" ? "Scene break" : role === "text" ? "Possible heading" : ROLE_LABEL[role]);
  return (
    <div className="r2-import-line">
      <span className="r2-import-kind">{label}</span>
      <q className="r2-import-quote">{line.text.length > 80 ? `${line.text.slice(0, 80)}…` : line.text}</q>
      <RoleSelect line={line} {...row} />
      {note && <span className="r2-import-note">{note}</span>}
    </div>
  );
}

function RoleSelect({ line, overrides, onRole }: RowProps & { line: Line }) {
  const role = roleOf(line, overrides);
  const options = line.options.length ? line.options : [role];
  return (
    <select
      className="r2-import-role"
      aria-label={`What “${line.text.slice(0, 40)}” is`}
      value={role}
      onChange={(e) => onRole(line.index, e.target.value as Role)}
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {r === "text" && line.detected === "break" ? "Not a scene break (keep as text)" : ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
