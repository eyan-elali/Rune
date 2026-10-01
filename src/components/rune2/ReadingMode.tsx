"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ListTree, Maximize2, Minimize2, PenLine, StickyNote, X } from "lucide-react";
import { ICON, ICON_SM } from "./icons";
import { Tooltip } from "./Tooltip";
import { getReadingScenes, getReadingVersions } from "@/lib/actions/reading";
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
import { noteCountsByTarget } from "@/lib/rune2/revisionNotes";
import type { SavedView } from "@/lib/types";
import { useSceneItems } from "./ManuscriptScenes";
import { usePropertyStore } from "./PropertyStore";
import { ReadingDocument, readingAnchor } from "./ReadingDocument";
import { useRune2Selection, type ReadingMode as Mode } from "./Rune2Selection";
import { NoteComposer } from "./RevisionNotes";
import { useRevisionNotes } from "./RevisionNoteStore";
import { useViewStore } from "./ViewStore";

// Reading Mode (Milestone 18; two stages since 21C): the live manuscript, or
// the Scenes one Scene View selects, read continuously and read-only. It is a
// way of reading, not another editor and not another manuscript, and it lies
// over the writer's context rather than replacing it:
//
//   * the Reading Peek — "Read" — is a centred reading surface over the shell,
//     which dims behind it: a quick look at the manuscript, with the few
//     controls a reader needs (where they are, a note, the way to Full
//     Reading Mode, Close) and no second set of Rune chrome;
//   * Full Reading Mode takes the whole frame: the shell's navigator, tabs
//     and context bar are hidden (never unmounted — Rune2Shell), the text is
//     the viewport, and a quiet contents rail of its own goes straight to any
//     Group, Chapter or Scene. Escape steps back to the Peek; Close returns to
//     the context the writer left, exactly as it was;
//   * the text is each Scene's own current text, read from the live Scene
//     rows whenever the reader opens (only Scenes changed since it last read
//     them are read again), with the writer's own unsynced typing on this
//     device taken over the server's copy, as the editor does. Nothing here
//     writes: no Scene, no cache, no writing credit;
//   * "Note" is a small transient composer for the Scene being read (or, from
//     a margin mark, the Scene beside it): ordinary Revision Notes on that
//     Scene, one after another, without leaving the text and without any
//     panel. There is no reading note: they appear at once in that Scene's,
//     its Chapter's, its Groups' and the Manuscript's Revision Notes. Scenes
//     with notes carry a quiet mark;
//   * a margin "Edit" leaves the reader and opens the Scene in the editor.
//
// One instance is kept across the two stages, so the text read and the place
// reached carry over; only the surface around it changes.

type Texts = Map<string, Record<string, unknown> | null>;

/** What the reader last read of each Scene, by version, for this session. Never written anywhere. */
const readCache = new Map<string, { version: number; content: Record<string, unknown> | null }>();

const EMPTY_PLAN: ReadingPlan = { blocks: [], nav: [], sceneIds: [], words: 0 };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The Scene View the reader reads, if it still exists. */
function useReadingView(source: ReadingSource): SavedView | null {
  const { manuscriptId } = usePropertyStore();
  const { viewsOf, viewById } = useViewStore();
  if (source.kind !== "view" || !manuscriptId) return null;
  const view = viewsOf(manuscriptId).find((v) => v.id === source.viewId) ?? viewById(source.viewId);
  return view && isSceneView(view) ? view : null;
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

export function ReadingMode({ source, mode }: { source: ReadingSource; mode: Mode }) {
  const {
    manuscript,
    index,
    select,
    panel,
    togglePanel,
    closeReading,
    setReadingMode,
    readingJump,
    clearReadingJump,
    readingPositionOf,
    rememberReadingPosition,
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
  const { available: notable, notes } = useRevisionNotes();
  const noteCounts = useMemo(() => noteCountsByTarget(notes), [notes]);
  // A Scene's own notes: what its Revision Notes show.
  const notesOf = useCallback((sceneId: string) => noteCounts.get(sceneId) ?? 0, [noteCounts]);
  // The Scene the quick add is open for, if any.
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const [at, setAt] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const tops = useRef<number[] | null>(null);
  const frame = useRef<number | null>(null);
  const placed = useRef(false);
  const held = useRef(new Set<string>());

  // Read the text of every Scene in the plan not yet read here; the first
  // read also re-reads Scenes changed since the reader last showed them.
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

  // The reader takes focus when it opens, and gives it back to what opened it
  // (the "Read" action) when it closes — so the keyboard is never stranded
  // in an inert shell.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    bodyRef.current?.focus({ preventScroll: true });
    return () => {
      const back =
        opener && opener.isConnected && opener !== document.body
          ? opener
          : document.querySelector<HTMLElement>("[data-read-action]");
      back?.focus({ preventScroll: true });
    };
  }, []);

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
    const doc = body?.querySelector(".r2-reader-inner");
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
    const glide = smooth && near && !reduced;
    body.scrollTo({ top, behavior: glide ? "smooth" : "auto" });
    if (smooth) el.focus({ preventScroll: true });
    // A jump lands at once: say where the reader now is before any scroll
    // event arrives, so a "Note" pressed straight after goes to the right Scene.
    if (!glide) track();
  }, [track]);

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

  // A later "Read from here" while the reader is already open.
  useEffect(() => {
    if (!ready || !placed.current || readingJump?.key !== key) return;
    go(readingJump.anchor, false);
    clearReadingJump();
  }, [ready, readingJump, key, go, clearReadingJump]);

  // Peek ↔ Full: the surface changes shape around the same text, so the
  // reading line is put back on the block it was on once the new layout has
  // been laid out. The first layout is the placement above, not this.
  const lastMode = useRef(mode);
  useLayoutEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    tops.current = null;
    const position = readingPositionOf(key);
    const frameId = requestAnimationFrame(() => {
      if (position) go(position.anchor, false, position.offset);
      track();
      bodyRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [mode, key, go, readingPositionOf, track]);

  const currentScene = sceneAt(plan.blocks, at);
  const currentRow = navRowFor(plan, at);

  // Keep the rail's current row in view — scrolling the rail alone.
  useEffect(() => {
    const rail = railRef.current;
    const row = currentRow ? rail?.querySelector<HTMLElement>(`[data-row="${CSS.escape(currentRow)}"]`) : null;
    if (!rail || !row) return;
    const top = row.offsetTop - rail.offsetTop;
    if (top < rail.scrollTop + 24 || top > rail.scrollTop + rail.clientHeight - 48) {
      rail.scrollTop = Math.max(0, top - rail.clientHeight / 3);
    }
  }, [currentRow, railOpen, mode]);

  function openNote(sceneId: string) {
    setAdded(0);
    setQuickAdd((open) => (open === sceneId ? null : sceneId));
  }
  /** Leaves the reader for the Scene's full Revision Notes, in the panel beside its text. */
  function showNotes(sceneId: string) {
    closeReading();
    select(openableId(index, sceneId));
    if (panel !== "notes") togglePanel("notes");
  }
  /** Leaves the reader and opens the Scene in the editor — the canonical Scene, where it is written. */
  const edit = (sceneId: string) => {
    closeReading();
    select(openableId(index, sceneId));
  };
  // The margin buttons reach the latest handlers without re-rendering the text.
  const actions = useRef({ openNote, edit });
  useEffect(() => {
    actions.current = { openNote, edit };
  });

  const document_ = useMemo(() => {
    const sceneAside = (sceneId: string) => {
      const count = notesOf(sceneId);
      const where = readingLocation(index, sceneId) ?? "this scene";
      const label = count > 0 ? `${plural(count, "revision note")} for ${where}` : `Add a revision note to ${where}`;
      return (
        <>
          {notable && (
            <button
              type="button"
              tabIndex={-1}
              className="r2-reading-mark"
              data-has-note={count > 0 ? "" : undefined}
              title={label}
              aria-label={label}
              onClick={() => actions.current.openNote(sceneId)}
            >
              <StickyNote {...ICON} aria-hidden />
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
            <PenLine {...ICON} aria-hidden />
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
  }, [plan, texts, failed, notesOf, index, notable]);

  // What is being read, said plainly.
  const filters = view ? describeViewFilters(view, properties, (id) => index.get(id)?.title ?? null) : [];
  const title = source.kind === "manuscript" ? manuscript.project.title : (view?.name ?? "Scene view");
  const eyebrow = source.kind === "manuscript" ? "Reading" : `Reading · ${title}`;
  // A Scene View: which Scenes these are, in one quiet line.
  const filterLine =
    source.kind === "view"
      ? [
          filters.length > 0 ? filters.join(" · ") : "Every scene",
          plural(plan.sceneIds.length, "scene"),
          sorted ? "in the view’s order" : "in manuscript order",
        ].join(" · ")
      : null;
  const location = currentScene ? readingLocation(index, currentScene) : null;
  const currentNotes = currentScene ? notesOf(currentScene) : 0;
  const label = `${title}, read-only`;

  // Escape steps back a stage — Full to Peek, Peek to the shell — from
  // anywhere in the reader, and from nowhere in particular (focus on the body
  // after a control went away). Anything that handles Escape itself (the
  // composer clearing its draft, a menu) stops it before it gets here.
  const stepBack = useRef(() => {});
  useEffect(() => {
    stepBack.current = () => (mode === "full" ? setReadingMode("peek") : closeReading());
  }, [mode, setReadingMode, closeReading]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      stepBack.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // The quick note gone, the keyboard returns to the text.
  useEffect(() => {
    if (quickAdd === null) bodyRef.current?.focus({ preventScroll: true });
  }, [quickAdd]);

  const gone = source.kind === "view" && !view;

  return (
    <div
      ref={rootRef}
      className="r2-reader"
      data-mode={mode}
      data-rail={(mode === "full" && railOpen && plan.nav.length > 1) || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {mode === "peek" && <div className="r2-reader-scrim" aria-hidden onMouseDown={closeReading} />}
      <div className="r2-reader-surface">
        <header className="r2-reader-bar">
          <div className="r2-reader-what">
            <p className="r2-reader-eyebrow">
              <BookOpen {...ICON_SM} aria-hidden />
              {eyebrow}
            </p>
            <p className="r2-reader-where" aria-live="polite">
              {location ?? (source.kind === "manuscript" ? title : plural(plan.sceneIds.length, "scene"))}
            </p>
            {filterLine && <p className="r2-reader-filter">{filterLine}</p>}
          </div>
          <div className="r2-reader-actions">
            {currentScene && notable && !gone && (
              <Tooltip
                label={
                  currentNotes > 0
                    ? `${plural(currentNotes, "revision note")} on this scene — add another`
                    : "Add a revision note to this scene"
                }
              >
                <button
                  type="button"
                  className="r2-action"
                  data-has-note={currentNotes > 0 ? "" : undefined}
                  aria-expanded={quickAdd === currentScene}
                  onClick={() => openNote(currentScene)}
                >
                  <StickyNote {...ICON} aria-hidden />
                  Note
                </button>
              </Tooltip>
            )}
            {mode === "full" && plan.nav.length > 1 && (
              <Tooltip label={railOpen ? "Hide contents" : "Show contents"}>
                <button
                  type="button"
                  className="r2-action r2-action--icon"
                  aria-pressed={railOpen}
                  aria-label={railOpen ? "Hide contents" : "Show contents"}
                  onClick={() => setRailOpen((v) => !v)}
                >
                  <ListTree {...ICON} aria-hidden />
                </button>
              </Tooltip>
            )}
            {!gone && (
              <Tooltip label={mode === "peek" ? "Full reading mode" : "Back to the peek"}>
                <button
                  type="button"
                  className="r2-action r2-action--icon"
                  aria-label={mode === "peek" ? "Enter full reading mode" : "Back to the reading peek"}
                  onClick={() => setReadingMode(mode === "peek" ? "full" : "peek")}
                >
                  {mode === "peek" ? <Maximize2 {...ICON} aria-hidden /> : <Minimize2 {...ICON} aria-hidden />}
                </button>
              </Tooltip>
            )}
            <Tooltip label={mode === "full" ? "Close reading mode" : "Close"}>
              <button
                type="button"
                className="r2-action r2-action--icon"
                aria-label={mode === "full" ? "Close reading mode" : "Close"}
                onClick={closeReading}
              >
                <X {...ICON} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </header>

        {quickAdd && notable && index.has(quickAdd) && (
          <div className="r2-reader-quicknote" role="group" aria-label="Add revision note">
            <p className="r2-reader-quicknote-head">Revision note · {readingLocation(index, quickAdd) ?? "this scene"}</p>
            <NoteComposer
              key={quickAdd}
              target={{ type: "scene", id: quickAdd }}
              placeholder="What to look at here next time…"
              label="New revision note for this scene"
              autoFocus
              hint
              onAdded={() => setAdded((n) => n + 1)}
              onEscape={() => setQuickAdd(null)}
            />
            <p className="r2-reader-quicknote-foot">
              <span role="status">{added > 0 ? `${plural(added, "note")} added` : ""}</span>
              {notesOf(quickAdd) > 0 && (
                <button type="button" className="r2-panel-link" onClick={() => showNotes(quickAdd)}>
                  {plural(notesOf(quickAdd), "note")} · Open in Revision Notes
                </button>
              )}
              <button type="button" className="r2-panel-link" onClick={() => setQuickAdd(null)}>
                Done
              </button>
            </p>
          </div>
        )}

        <div className="r2-reader-layout">
          {mode === "full" && railOpen && plan.nav.length > 1 && (
            <nav ref={railRef} className="r2-reader-rail" aria-label="Contents">
              <p className="r2-reader-rail-head">{title}</p>
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
                      {row.kind !== "group" && row.kind !== "unplacedHeading" && (noteCounts.get(row.id) ?? 0) > 0 && (
                        <StickyNote className="r2-reading-rail-note" {...ICON_SM} aria-label="Has revision notes" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div
            ref={bodyRef}
            className="r2-reader-body"
            tabIndex={0}
            aria-label={label}
            aria-busy={!ready || undefined}
            onScroll={onScroll}
          >
            <div className="r2-reader-inner">
              {gone ? (
                <p className="r2-reading-empty r2-reading-opening">This scene view no longer exists.</p>
              ) : !ready ? (
                <p className="r2-reading-empty r2-reading-opening">Opening…</p>
              ) : plan.blocks.length === 0 ? (
                <p className="r2-reading-empty r2-reading-opening">
                  {source.kind === "manuscript" ? "Nothing to read yet." : "No scenes match this view."}
                </p>
              ) : (
                <>
                  {source.kind === "manuscript" && manuscript.unplaced.length > 0 && (
                    <p className="r2-reading-caption r2-reading-note-unplaced">
                      Unplaced Scenes aren’t part of the manuscript and aren’t shown here.
                    </p>
                  )}
                  {document_}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
