"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, Pin, PinOff, Trash2, X } from "lucide-react";
import {
  completeProjectNote,
  createProjectNote,
  deleteProjectNote,
  listProjectNotes,
  pinProjectNote,
  unpinProjectNote,
} from "@/lib/actions/notes";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { referenceSubject } from "@/lib/rune2/references";
import type { ProjectNote } from "@/lib/types";
import { SceneSuggestions } from "./CollectionSchema";
import { ObjectLinks } from "./ObjectLinks";
import { AddProperty, ItemProperties } from "./PropertyFields";
import { usePropertyStore } from "./PropertyStore";
import { useReferenceStore } from "./ReferenceStore";
import { useRune2Selection, type PanelView } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";

// The one optional right-hand panel. Revision Notes and Inspector are separate actions
// in the context bar, but they share this single physical panel: choosing one
// shows it here, choosing the other switches views, choosing the view showing
// closes the panel. It is a column of the shell, beside — never over — the
// content, so the content simply narrows (see .r2-shell in rune2.css), and it
// sits outside the content's subtree, so opening, switching or closing it
// never remounts an editor.
//
// The column is always in the tree: opening and closing animate its width
// (rune2.css), so the manuscript column widens and narrows in one calm
// movement rather than jumping. The view's content is mounted while the
// panel is open and kept through the closing movement, then let go.

const TITLES: Record<PanelView, string> = { notes: "Revision Notes", inspector: "Inspector" };
const CLOSE_MS = 320;

export function Rune2Panel() {
  const { panel, closePanel } = useRune2Selection();
  const ref = useRef<HTMLElement>(null);
  // The view shown: the open one, or during the closing movement the last one.
  const [shown, setShown] = useState<PanelView | null>(panel);
  if (panel && panel !== shown) setShown(panel);
  useEffect(() => {
    if (panel) return;
    const timer = setTimeout(() => setShown(null), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [panel]);

  // Escape from inside the panel closes it and returns to the action that opened it.
  // (Focus moves first: the action is outside the panel, so it never lands on
  // the page body while the panel's content unmounts.)
  const close = () => {
    if (panel && ref.current?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>(`[data-panel-action="${panel}"]`)?.focus();
    }
    closePanel();
  };

  const view = panel ?? shown;
  return (
    <aside
      ref={ref}
      className="r2-panel"
      data-open={panel ? "" : undefined}
      aria-label={view ? TITLES[view] : "Panel"}
      aria-hidden={!panel || undefined}
      inert={!panel || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          close();
        }
      }}
    >
      {view && (
        <div className="r2-panel-inner">
          <header className="r2-panel-head">
            <h2>{TITLES[view]}</h2>
            <button type="button" className="r2-icon-button" aria-label={`Close ${TITLES[view]}`} onClick={close}>
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </header>
          <div className="r2-panel-body">{view === "notes" ? <NotesView /> : <InspectorView />}</div>
        </div>
      )}
    </aside>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────
//
// Rune's durable notes today are Revision Notes: a project-wide checklist
// (project_notes), kept as it is for Rune 2.0 (architecture §30). The panel
// shows those, for the whole manuscript. There is no Scene- or Chapter-level
// note in the data model yet, so the panel does not pretend there is one.
// Notes are never manuscript prose: separate table, separate words.

function NotesView() {
  const { manuscript } = useRune2Selection();
  const projectId = manuscript.project.id;
  const [notes, setNotes] = useState<ProjectNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    listProjectNotes(projectId)
      .then((r) => {
        if (!live) return;
        if (r.data) setNotes(r.data);
        else setLoadFailed(true);
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [projectId]);

  function add() {
    const content = draft.trim();
    if (!content || !notes) return;
    setDraft("");
    setNotice(null);
    const tempId = `pending-${Date.now()}`;
    const now = new Date().toISOString();
    setNotes((prev) => [
      ...(prev ?? []),
      {
        id: tempId,
        user_id: "",
        project_id: projectId,
        content,
        is_completed: false,
        is_pinned: false,
        created_at: now,
        completed_at: null,
        updated_at: now,
      },
    ]);
    startTransition(async () => {
      const r = await createProjectNote(projectId, content).catch(() => null);
      if (r?.data) {
        const saved = r.data;
        setNotes((prev) => prev?.map((n) => (n.id === tempId ? saved : n)) ?? prev);
      } else {
        setNotes((prev) => prev?.filter((n) => n.id !== tempId) ?? prev);
        setDraft(content);
        setNotice("Couldn’t save the note. It’s back in the box — try again.");
      }
    });
  }

  /** Applies a change at once and saves it; a failed save puts the list back. */
  function change(next: (list: ProjectNote[]) => ProjectNote[], save: () => Promise<{ error: string | null }>) {
    if (!notes) return;
    const before = notes;
    setNotes(next(notes));
    setNotice(null);
    startTransition(async () => {
      const r = await save().catch(() => ({ error: "failed" }));
      if (r.error) {
        setNotes(before);
        setNotice("Couldn’t save that change.");
      }
    });
  }

  const complete = (note: ProjectNote) =>
    change(
      (list) => list.map((n) => (n.id === note.id ? { ...n, is_completed: true, is_pinned: false } : n)),
      () => completeProjectNote(note.id)
    );
  const remove = (note: ProjectNote) =>
    change((list) => list.filter((n) => n.id !== note.id), () => deleteProjectNote(note.id));
  const togglePin = (note: ProjectNote) =>
    note.is_pinned
      ? change(
          (list) => list.map((n) => (n.id === note.id ? { ...n, is_pinned: false } : n)),
          () => unpinProjectNote(note.id)
        )
      : change(
          (list) => list.map((n) => ({ ...n, is_pinned: n.id === note.id })),
          () => pinProjectNote(note.id, projectId)
        );

  const active = (notes ?? []).filter((n) => !n.is_completed);
  const ordered = [...active.filter((n) => n.is_pinned), ...active.filter((n) => !n.is_pinned)];
  const done = (notes ?? []).filter((n) => n.is_completed);

  return (
    <div className="r2-notes">
      <p className="r2-panel-caption">For the whole manuscript, not this chapter or scene.</p>

      {/* The composer: a place to write a note, not a form field. Quiet at
          rest, discoverable on hover, clearly active while writing; it grows
          with the note (rune2.css). */}
      <div className="r2-composer" data-filled={draft ? "" : undefined}>
        <textarea
          className="r2-composer-input"
          placeholder="Leave a note for the next pass…"
          aria-label="New revision note"
          rows={1}
          value={draft}
          disabled={!notes}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            } else if (e.key === "Escape" && draft) {
              // First Escape clears the draft; the next one closes the panel.
              e.preventDefault();
              setDraft("");
            }
          }}
          maxLength={2000}
        />
        <p className="r2-composer-hint" aria-hidden>
          Return to add · Shift-Return for a new line
        </p>
      </div>

      {notice && (
        <p role="status" className="r2-panel-notice">
          {notice}
        </p>
      )}

      {notes === null ? (
        <p className="r2-panel-empty">{loadFailed ? "Couldn’t load revision notes." : "Loading…"}</p>
      ) : ordered.length === 0 ? (
        <p className="r2-panel-empty">
          {done.length > 0 ? "Nothing open." : "Nothing here yet. What you write here stays with the manuscript for your next pass."}
        </p>
      ) : (
        <ul role="list" className="r2-notes-list">
          {ordered.map((note) => (
            <li key={note.id} className="r2-note" data-pinned={note.is_pinned || undefined}>
              <p>{note.content}</p>
              <span className="r2-note-actions">
                <button
                  type="button"
                  className="r2-icon-button"
                  aria-label="Mark done"
                  title="Mark done"
                  disabled={note.id.startsWith("pending-")}
                  onClick={() => complete(note)}
                >
                  <Check size={14} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  className="r2-icon-button"
                  aria-label={note.is_pinned ? "Unpin" : "Pin to top"}
                  title={note.is_pinned ? "Unpin" : "Pin to top"}
                  disabled={note.id.startsWith("pending-")}
                  onClick={() => togglePin(note)}
                >
                  {note.is_pinned ? (
                    <PinOff size={14} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Pin size={14} strokeWidth={1.75} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="r2-icon-button"
                  aria-label="Delete note"
                  title="Delete"
                  disabled={note.id.startsWith("pending-")}
                  onClick={() => remove(note)}
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="r2-notes-done">
          <button type="button" className="r2-panel-link" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} done ({done.length})
          </button>
          {showDone && (
            <ul role="list" className="r2-notes-list">
              {done.map((note) => (
                <li key={note.id} className="r2-note" data-done>
                  <p>{note.content}</p>
                  <span className="r2-note-actions">
                    <button
                      type="button"
                      className="r2-icon-button"
                      aria-label="Delete note"
                      title="Delete"
                      onClick={() => remove(note)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inspector ─────────────────────────────────────────────────────────────
//
// What the selected object *is*, structurally — only what the Phase 1 model
// actually holds: title, placement, derived position, words, and whether it
// is part of the ordered manuscript; for a Workspace Page, where it lives and
// when it was made and last edited. Then, for an Entry, a Page or a Scene (a
// Chapter shown as one piece of writing stands for its only Scene), its links
// and backlinks (028, ObjectLinks) — the Scene's metadata lives here, outside
// the prose. A divided Chapter shows only where it is mentioned (035). A Scene (and a Chapter shown as one piece of writing) also shows
// its Scene properties (032, architecture §8), edited in place and saved on
// their own — never with the prose, never inside the editor.

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function InspectorView() {
  const { manuscript, workspace, index, selected, select } = useRune2Selection();
  const { available: propertied, propertiesOf } = usePropertyStore();
  const { available: referable } = useReferenceStore();
  const subject = referable && selected ? referenceSubject(index, selected) : null;
  // The Scene whose properties show: the selected Scene, or a Chapter's only Scene.
  const scene = selected ? referenceSubject(index, selected) : null;

  const location = (entry: NavEntry): ReactNode => {
    const parents = entry.kind === "scene" ? entry.path.slice(0, -1) : entry.path;
    if (parents.length === 0) return "Manuscript";
    return parents.map((p) => p.title).join(" / ");
  };

  let kind: string;
  let title: string;
  let rows: [string, ReactNode][];

  if (!selected) {
    kind = "Manuscript";
    title = manuscript.project.title;
    rows = [
      ["Words", plural(manuscript.manuscriptWords, "word")],
      ["Chapters", manuscript.chapterCount.toLocaleString()],
      ["Scenes", manuscript.placedSceneCount.toLocaleString()],
      ...(manuscript.groupCount > 0 ? [["Groups", manuscript.groupCount.toLocaleString()] as [string, ReactNode]] : []),
      ...(manuscript.unplaced.length > 0
        ? [
            [
              "Unplaced",
              `${plural(manuscript.unplacedWords, "word")} · ${plural(manuscript.unplaced.length, "scene")}`,
            ] as [string, ReactNode],
          ]
        : []),
    ];
  } else {
    title = selected.title;
    switch (selected.kind) {
      case "group": {
        const inside = [...index.values()].filter((e) => e.path.some((p) => p.id === selected.id));
        const chapters = inside.filter((e) => e.kind === "chapter").length;
        const groups = inside.filter((e) => e.kind === "group").length;
        kind = "Group";
        rows = [
          ["Location", location(selected)],
          ["Chapters", chapters.toLocaleString()],
          ...(groups > 0 ? [["Groups", groups.toLocaleString()] as [string, ReactNode]] : []),
          ["Words", plural(selected.words, "word")],
        ];
        break;
      }
      case "chapter":
        kind = "Chapter";
        rows = [
          ["Location", location(selected)],
          ["Position", `${selected.ordinal} of ${manuscript.chapterCount}`],
          ["Scenes", (selected.sceneIds?.length ?? 0).toLocaleString()],
          ["Words", plural(selected.words, "word")],
        ];
        break;
      case "scene": {
        const chapter = selected.path[selected.path.length - 1];
        const siblings = chapter ? (index.get(chapter.id)?.sceneIds?.length ?? 0) : 0;
        kind = "Scene";
        rows = [
          [
            "Chapter",
            chapter ? (
              <button type="button" className="r2-panel-link" onClick={() => select(chapter.id)}>
                {chapter.title}
              </button>
            ) : (
              "—"
            ),
          ],
          ...(selected.path.length > 1 ? [["Location", location(selected)] as [string, ReactNode]] : []),
          ["Position", `Scene ${selected.ordinal} of ${siblings}`],
          ["Words", plural(selected.words, "word")],
          ["Manuscript", "Counts toward the total and export"],
        ];
        break;
      }
      case "unplacedScene":
        kind = "Unplaced Scene";
        rows = [
          ["Placement", "Unplaced Scenes"],
          ["Words", plural(selected.words, "word")],
          ["Manuscript", "Not in the total or export"],
        ];
        break;
      case "workspacePage": {
        const page = workspace.pages.find((p) => p.id === selected.id);
        kind = "Page";
        rows = [
          ["Location", ["Workspace", ...selected.path.map((p) => p.title)].join(" / ")],
          ...(page
            ? [
                ["Created", formatDate(page.created_at)] as [string, ReactNode],
                ["Edited", formatDate(page.updated_at)] as [string, ReactNode],
              ]
            : []),
        ];
        break;
      }
      case "workspaceCollection":
        kind = "Collection";
        rows = [
          ["Location", ["Workspace", ...selected.path.map((p) => p.title)].join(" / ")],
          ["Entries", plural(selected.childCount, "entry", "entries")],
          ...(propertied
            ? [["Properties", propertiesOf(selected.id).length.toLocaleString()] as [string, ReactNode]]
            : []),
        ];
        break;
      case "collectionEntry": {
        const entry = workspace.entries.find((e) => e.id === selected.id);
        kind = "Entry";
        rows = [
          ["Collection", selected.path[selected.path.length - 1]?.title ?? "—"],
          ...(entry
            ? [
                ["Created", formatDate(entry.created_at)] as [string, ReactNode],
                ["Edited", formatDate(entry.updated_at)] as [string, ReactNode],
              ]
            : []),
        ];
        break;
      }
      // Never selected (navigation only), but described if it ever were.
      case "workspaceFolder":
        kind = "Folder";
        rows = [
          ["Location", ["Workspace", ...selected.path.map((p) => p.title)].join(" / ")],
          ["Contains", plural(selected.childCount, "item")],
        ];
        break;
    }
  }

  return (
    <div className="r2-inspector">
      <p className="r2-inspector-kind">{kind}</p>
      <p className="r2-inspector-title">
        {title}
        {selected && !selected.named && (selected.kind === "scene" || selected.kind === "unplacedScene") && (
          <span className="r2-inspector-hint">Unnamed</span>
        )}
      </p>
      <dl className="r2-inspector-props">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {scene?.type === "scene" && <SceneInspectorProperties key={`props-${scene.id}`} sceneId={scene.id} />}
      {/* A fresh section per object, so an open search never carries over. */}
      {referable && (subject || selected?.kind === "chapter") && (
        <ObjectLinks
          key={subject?.id ?? selected?.id}
          subject={subject}
          chapterId={selected?.kind === "chapter" ? selected.id : null}
        />
      )}
    </div>
  );
}

/**
 * A Scene's properties in the Inspector: the Manuscript's Scene properties,
 * each value edited in place. With none defined, a faint way to start —
 * never a form the writer must fill. "Edit scene properties" opens the
 * Manuscript's property settings (rename, reorder, options, remove).
 */
function SceneInspectorProperties({ sceneId }: { sceneId: string }) {
  const { sceneAvailable, manuscriptId, propertiesOf } = usePropertyStore();
  const { select } = useRune2Selection();
  const { openScenes } = useViewStore();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!sceneAvailable || !manuscriptId) return null;
  const count = propertiesOf(manuscriptId).length;
  return (
    <section className="r2-scene-props" aria-label="Scene properties">
      <h3 className="r2-links-head">Scene properties</h3>
      <ItemProperties
        itemId={sceneId}
        ownerId={manuscriptId}
        empty={
          <>
            <SceneSuggestions ownerId={manuscriptId} onNotice={setNotice} />
            <AddProperty ownerId={manuscriptId} quiet />
          </>
        }
      />
      {count > 0 && (
        <button
          type="button"
          className="r2-panel-link r2-scene-props-edit"
          onClick={() => {
            select(null);
            openScenes("properties");
          }}
        >
          Edit scene properties
        </button>
      )}
      {notice && (
        <p role="status" className="r2-panel-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
