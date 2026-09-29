"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ListTree, PenLine, StickyNote } from "lucide-react";
import { getReadingScenes, getReadingVersions } from "@/lib/actions/reading";
import { listSceneNotes } from "@/lib/actions/sceneNotes";
import { getCachedScene, getPendingWrite } from "@/lib/offline/db";
import { isSceneView } from "@/lib/rune2/collectionViews";
import { openableId } from "@/lib/rune2/references";
import {
  blockAt,
  describeViewFilters,
  manuscriptReadingPlan,
  navRowFor,
  READING_BATCH,
  readingLocation,
  readingTabKey,
  sceneAt,
  viewIsSorted,
  viewReadingPlan,
  type ReadingPlan,
  type ReadingSource,
} from "@/lib/rune2/reading";
import {
  noteExcerpt,
  SCENE_NOTE_SAVED_EVENT,
  type SceneNoteSavedDetail,
  type SceneRevisionNote,
} from "@/lib/rune2/sceneNotes";
import type { SavedView } from "@/lib/types";
import { useSceneItems } from "./ManuscriptScenes";
import { usePropertyStore } from "./PropertyStore";
import { ReadingDocument, readingAnchor } from "./ReadingDocument";
import { useRune2Selection } from "./Rune2Selection";
import { focusSceneNote } from "./SceneNote";
import { useViewStore } from "./ViewStore";

// Reading Mode (Milestone 18): the live manuscript, or the Scenes one Scene
// View selects, read continuously and read-only, in a Reading tab of the
// working set. It is a way of reading, not another editor and not another
// manuscript:
//
//   * the text is each Scene's own current text, read from the live Scene
//     rows whenever Reading Mode is shown (only Scenes changed since it last
//     read them are read again), with the writer's own unsynced typing on
//     this device taken over the server's copy, as the editor does. Nothing
//     here writes: no Scene, no cache, no writing credit;
//   * a contents rail goes straight to any Group, Chapter or Scene, and marks
//     where the writer is as they read;
//   * "Edit" opens the Scene being read in the ordinary Scene editor, in a
//     tab of its own — the Reading tab stays, and shows the edited text when
//     the writer comes back to it;
//   * "Note" opens that Scene's revision note in the Inspector, beside the
//     text, so a note is written without leaving Reading Mode. Scenes with a
//     note carry a quiet mark in the margin.

type Texts = Map<string, Record<string, unknown> | null>;

/** What Reading Mode last read of each Scene, by version, for this session. Never written anywhere. */
const readCache = new Map<string, { version: number; content: Record<string, unknown> | null }>();

const EMPTY_PLAN: ReadingPlan = { blocks: [], nav: [], sceneIds: [], words: 0 };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The Scene View a Reading tab reads, if it still exists. */
function useReadingView(source: ReadingSource): SavedView | null {
  const { manuscriptId } = usePropertyStore();
  const { viewsOf, viewById } = useViewStore();
  if (source.kind !== "view" || !manuscriptId) return null;
  const view = viewsOf(manuscriptId).find((v) => v.id === source.viewId) ?? viewById(source.viewId);
  return view && isSceneView(view) ? view : null;
}

/** A Reading tab's label: "Reading", or "Reading · Needs revision" for a Scene View. */
export function useReadingTitle(source: ReadingSource | null): string {
  const view = useReadingView(source ?? { kind: "manuscript" });
  if (!source || source.kind === "manuscript") return "Reading";
  return view ? `Reading · ${view.name}` : "Reading";
}

/** Reads the text of `ids`: the device's unsynced typing first, then the server, then the device's copy. */
async function readTexts(projectId: string, ids: readonly string[]): Promise<{ texts: Texts; failed: Set<string> }> {
  const texts: Texts = new Map();
  const failed = new Set<string>();
  if (ids.length === 0) return { texts, failed };

  let versions: Map<string, number> | null = null;
  try {
    const r = await getReadingVersions(projectId);
    if (r.error === null) versions = new Map(r.data.map((v) => [v.id, v.version]));
  } catch {
    // Offline: read what can be read below.
  }
  const stale = ids.filter((id) => {
    const held = readCache.get(id);
    return !held || !versions || versions.get(id) !== held.version;
  });

  const batches: string[][] = [];
  for (let i = 0; i < stale.length; i += READING_BATCH) batches.push(stale.slice(i, i + READING_BATCH));
  let next = 0;
  const unread = new Set(stale);
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const r = await getReadingScenes(projectId, batch);
        if (r.error !== null) continue;
        for (const scene of r.data) {
          readCache.set(scene.id, { version: scene.version, content: scene.content });
          unread.delete(scene.id);
        }
      } catch {
        // Left unread: the device's copy is tried below.
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  await Promise.all(
    ids.map(async (id) => {
      const pending = await getPendingWrite(id);
      if (pending) {
        texts.set(id, pending.content);
        return;
      }
      if (!unread.has(id)) {
        texts.set(id, readCache.get(id)?.content ?? null);
        return;
      }
      const held = readCache.get(id) ?? null;
      const cached = held ? null : await getCachedScene(id);
      if (held) texts.set(id, held.content);
      else if (cached) texts.set(id, cached.content ?? null);
      else failed.add(id);
    }),
  );
  return { texts, failed };
}

export function ReadingMode({ source }: { source: ReadingSource }) {
  const {
    manuscript,
    workspace,
    index,
    openInNewTab,
    panel,
    togglePanel,
    readingJump,
    clearReadingJump,
    readingPositionOf,
    rememberReadingPosition,
    setReadingAt,
    setReadingFocus,
  } = useRune2Selection();
  const projectId = manuscript.project.id;
  const key = readingTabKey(source);
  const view = useReadingView(source);
  const { properties, arranged } = useSceneItems(view);
  const arrangedKey = arranged.join(",");
  const sorted = view ? viewIsSorted(view, properties) : false;

  const plan = useMemo(() => {
    if (source.kind === "manuscript") return manuscriptReadingPlan(manuscript.outline, index);
    return view ? viewReadingPlan(arrangedKey ? arrangedKey.split(",") : [], index, sorted) : EMPTY_PLAN;
  }, [source.kind, manuscript.outline, index, view, arrangedKey, sorted]);
  const idsKey = plan.sceneIds.join(",");

  const [texts, setTexts] = useState<Texts>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState<Map<string, SceneRevisionNote>>(new Map());
  const [railOpen, setRailOpen] = useState(true);
  const [at, setAt] = useState(-1);

  const bodyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const tops = useRef<number[] | null>(null);
  const frame = useRef<number | null>(null);
  const placed = useRef(false);
  const held = useRef(new Set<string>());

  // Read the text of every Scene in the plan not yet read here; the first
  // read also re-reads Scenes changed since Reading Mode last showed them.
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const missing = ids.filter((id) => !held.current.has(id));
    if (missing.length === 0) {
      setReady(true);
      return;
    }
    let live = true;
    void readTexts(projectId, missing).then((r) => {
      if (!live) return;
      for (const id of r.texts.keys()) held.current.add(id);
      setTexts((prev) => new Map([...prev, ...r.texts]));
      setFailed((prev) => new Set([...[...prev].filter((id) => !r.texts.has(id)), ...r.failed]));
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [idsKey, projectId]);

  // Which Scenes have a revision note (a quiet mark in the margin).
  useEffect(() => {
    if (!workspace.sceneNotable) return;
    let live = true;
    void listSceneNotes(projectId).then((r) => {
      if (live && r.error === null) setNotes(new Map(r.data.map((n) => [n.scene_id, n])));
    });
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<SceneNoteSavedDetail>).detail;
      if (!detail) return;
      setNotes((prev) => {
        const next = new Map(prev);
        if (detail.note) next.set(detail.sceneId, detail.note);
        else next.delete(detail.sceneId);
        return next;
      });
    };
    window.addEventListener(SCENE_NOTE_SAVED_EVENT, onSaved);
    return () => {
      live = false;
      window.removeEventListener(SCENE_NOTE_SAVED_EVENT, onSaved);
    };
  }, [projectId, workspace.sceneNotable]);

  // A fresh Reading Mode follows the reading; leaving it forgets the Scene read.
  useEffect(() => {
    setReadingFocus(null);
    return () => setReadingAt(null);
  }, [setReadingAt, setReadingFocus]);

  // Block offsets, measured when first needed after any change of layout.
  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return [];
    if (tops.current) return tops.current;
    const base = body.getBoundingClientRect().top - body.scrollTop;
    tops.current = [...body.querySelectorAll<HTMLElement>("[data-reading-block]")].map(
      (el) => el.getBoundingClientRect().top - base,
    );
    return tops.current;
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const doc = body?.querySelector(".r2-reading-inner");
    if (!body || !doc) return;
    const observer = new ResizeObserver(() => {
      tops.current = null;
    });
    observer.observe(doc);
    observer.observe(body);
    return () => observer.disconnect();
  }, [ready]);

  /** The reading line: a quarter of the way down the text. */
  const line = () => (bodyRef.current?.clientHeight ?? 0) * 0.25;

  const track = useCallback(() => {
    frame.current = null;
    const body = bodyRef.current;
    if (!body) return;
    const offsets = measure();
    const y = body.scrollTop + line();
    const i = blockAt(offsets, y);
    setAt(i);
    const block = plan.blocks[Math.max(i, 0)];
    if (block) rememberReadingPosition(key, { anchor: block.id, offset: y - (offsets[Math.max(i, 0)] ?? 0) });
  }, [measure, plan.blocks, key, rememberReadingPosition]);

  const onScroll = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(track);
  };

  /**
   * Goes to a Group, Chapter or Scene — its top just below the bar, or with
   * `offset`, that far past its top on the reading line (a remembered
   * position). A glide when near; a jump across a long manuscript.
   */
  const go = useCallback((id: string, smooth = true, offset?: number) => {
    const body = bodyRef.current;
    const el = document.getElementById(readingAnchor(id));
    if (!body || !el || !body.contains(el)) return;
    const past = offset ?? line() - 24;
    const top = Math.max(
      0,
      el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - line() + past,
    );
    const near = Math.abs(top - body.scrollTop) < body.clientHeight * 2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top, behavior: smooth && near && !reduced ? "smooth" : "auto" });
    if (smooth) el.focus({ preventScroll: true });
  }, []);

  // Once the text is shown: go where the writer asked (from a Scene, "Read"),
  // else back to where they were, else the start.
  useEffect(() => {
    if (!ready || placed.current) return;
    // Marked placed only once it has happened: a frame cancelled by a re-run
    // (or React's double effects in development) is simply scheduled again.
    const frameId = requestAnimationFrame(() => {
      placed.current = true;
      if (readingJump?.key === key) {
        go(readingJump.anchor, false);
        clearReadingJump();
      } else {
        const position = readingPositionOf(key);
        if (position) go(position.anchor, false, position.offset);
      }
      track();
    });
    return () => cancelAnimationFrame(frameId);
  }, [ready, readingJump, key, go, clearReadingJump, readingPositionOf, track]);

  // A later "Read from here" while this tab is already showing.
  useEffect(() => {
    if (!ready || !placed.current || readingJump?.key !== key) return;
    go(readingJump.anchor, false);
    clearReadingJump();
  }, [ready, readingJump, key, go, clearReadingJump]);

  const currentScene = sceneAt(plan.blocks, at);
  const currentRow = navRowFor(plan, at);

  // The Inspector follows the reading once it settles on a Scene.
  useEffect(() => {
    const timer = setTimeout(() => setReadingAt(currentScene), 400);
    return () => clearTimeout(timer);
  }, [currentScene, setReadingAt]);

  // Keep the rail's current row in view — scrolling the rail alone.
  useEffect(() => {
    const rail = railRef.current;
    const row = currentRow ? rail?.querySelector<HTMLElement>(`[data-row="${CSS.escape(currentRow)}"]`) : null;
    if (!rail || !row) return;
    const top = row.offsetTop - rail.offsetTop;
    if (top < rail.scrollTop + 24 || top > rail.scrollTop + rail.clientHeight - 48) {
      rail.scrollTop = Math.max(0, top - rail.clientHeight / 3);
    }
  }, [currentRow, railOpen]);

  function openNote(sceneId: string) {
    setReadingFocus(sceneId);
    if (panel !== "inspector") togglePanel("inspector");
    focusSceneNote(sceneId);
  }
  const edit = (sceneId: string) => openInNewTab(openableId(index, sceneId));
  // The margin buttons reach the latest handlers without re-rendering the text.
  const actions = useRef({ openNote, edit });
  useEffect(() => {
    actions.current = { openNote, edit };
  });

  const document_ = useMemo(() => {
    const sceneAside = (sceneId: string) => {
      const note = notes.get(sceneId);
      const where = readingLocation(index, sceneId) ?? "this scene";
      return (
        <>
          {workspace.sceneNotable && (
            <button
              type="button"
              tabIndex={-1}
              className="r2-reading-mark"
              data-has-note={note ? "" : undefined}
              title={note ? `Revision note: ${noteExcerpt(note.body)}` : `Add a revision note to ${where}`}
              aria-label={note ? `Revision note for ${where}` : `Add a revision note to ${where}`}
              onClick={() => actions.current.openNote(sceneId)}
            >
              <StickyNote size={13} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            className="r2-reading-mark r2-reading-mark--edit"
            title={`Edit ${where}`}
            aria-label={`Edit ${where}`}
            onClick={() => actions.current.edit(sceneId)}
          >
            <PenLine size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </>
      );
    };
    return (
      <ReadingDocument
        plan={plan}
        texts={texts}
        failed={failed}
        sceneAside={sceneAside}
        labelOf={(id) => readingLocation(index, id)}
      />
    );
  }, [plan, texts, failed, notes, index, workspace.sceneNotable]);

  // What is being read, said plainly.
  const filters = view ? describeViewFilters(view, properties, (id) => index.get(id)?.title ?? null) : [];
  const title = source.kind === "manuscript" ? manuscript.project.title : (view?.name ?? "Scene view");
  const summary =
    source.kind === "manuscript"
      ? [plural(manuscript.chapterCount, "chapter"), plural(plan.words, "word")].join(" · ")
      : [
          filters.length > 0 ? filters.join(" · ") : "Every scene",
          plural(plan.sceneIds.length, "scene"),
          sorted ? "in the view’s order" : "in manuscript order",
        ].join(" · ");
  const location = currentScene ? readingLocation(index, currentScene) : null;
  const currentNote = currentScene ? notes.get(currentScene) : undefined;

  if (source.kind === "view" && !view) {
    return (
      <div className="r2-reading r2-reading--empty">
        <p>This scene view no longer exists.</p>
      </div>
    );
  }

  return (
    <div className="r2-reading" data-rail={railOpen || undefined}>
      <header className="r2-reading-bar">
        <div className="r2-reading-what">
          <p className="r2-reading-eyebrow">
            <BookOpen size={12} strokeWidth={1.75} aria-hidden />
            {source.kind === "manuscript" ? "Reading the manuscript" : "Reading a scene view"}
          </p>
          <h1 className="r2-reading-title">{title}</h1>
          <p className="r2-reading-summary">{summary}</p>
        </div>
        <div className="r2-reading-actions">
          {location && (
            <span className="r2-reading-location" aria-live="polite">
              {location}
            </span>
          )}
          {currentScene && workspace.sceneNotable && (
            <button
              type="button"
              className="r2-action"
              data-has-note={currentNote ? "" : undefined}
              onClick={() => openNote(currentScene)}
              title={
                currentNote ? `Revision note: ${noteExcerpt(currentNote.body)}` : "Add a revision note to this scene"
              }
            >
              <StickyNote size={14} strokeWidth={1.75} aria-hidden />
              Note
            </button>
          )}
          {currentScene && (
            <button
              type="button"
              className="r2-action"
              onClick={() => edit(currentScene)}
              title="Open this scene in the editor, in a new tab"
            >
              <PenLine size={14} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
          )}
          {plan.nav.length > 1 && (
            <button
              type="button"
              className="r2-action r2-action--icon"
              aria-pressed={railOpen}
              aria-label={railOpen ? "Hide contents" : "Show contents"}
              title={railOpen ? "Hide contents" : "Show contents"}
              onClick={() => setRailOpen((v) => !v)}
            >
              <ListTree size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div className="r2-reading-layout">
        {railOpen && plan.nav.length > 1 && (
          <nav ref={railRef} className="r2-reading-rail" aria-label="Contents">
            <ul role="list">
              {plan.nav.map((row) => (
                <li key={`${row.kind}:${row.id}`}>
                  <button
                    type="button"
                    data-row={row.id}
                    data-kind={row.kind}
                    className="r2-reading-rail-item"
                    aria-current={row.id === currentRow ? "location" : undefined}
                    style={{ paddingLeft: 8 + row.depth * 12 }}
                    onClick={() => go(row.id)}
                  >
                    <span className="r2-reading-rail-label">{row.label}</span>
                    {row.kind !== "group" && row.kind !== "unplacedHeading" && notes.has(row.id) && (
                      <StickyNote
                        className="r2-reading-rail-note"
                        size={11}
                        strokeWidth={1.75}
                        aria-label="Has a revision note"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div
          ref={bodyRef}
          className="r2-reading-body"
          tabIndex={0}
          aria-label={`${title}, read-only`}
          aria-busy={!ready || undefined}
          onScroll={onScroll}
        >
          <div className="r2-reading-inner">
            {source.kind === "manuscript" && manuscript.unplaced.length > 0 && ready && (
              <p className="r2-reading-caption r2-reading-note-unplaced">
                Unplaced Scenes aren’t part of the manuscript and aren’t shown here.
              </p>
            )}
            {!ready ? (
              <p className="r2-reading-empty r2-reading-opening">Opening…</p>
            ) : plan.blocks.length === 0 ? (
              <p className="r2-reading-empty r2-reading-opening">
                {source.kind === "manuscript" ? "Nothing to read yet." : "No scenes match this view."}
              </p>
            ) : (
              document_
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A Reading tab's label, kept current with its Scene View's name. */
export function ReadingTabLabel({ source }: { source: ReadingSource }) {
  return <>{useReadingTitle(source)}</>;
}
