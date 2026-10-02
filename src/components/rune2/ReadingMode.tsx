"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  BookOpen,
  Check,
  ListTree,
  Maximize2,
  MessageSquare,
  MessageSquareCheck,
  MessageSquarePlus,
  MessageSquareText,
  Minimize2,
  PenLine,
  X,
} from "lucide-react";
import { ICON, ICON_SM, ICON_SM_BOLD } from "./icons";
import { Tooltip } from "./Tooltip";
import { anchorExcerpt, locateAnchor, makeAnchor, type NoteAnchor } from "@/lib/rune2/noteAnchors";
import { rangeBox, rangeFor, readPlain, selectionOffsets, setActiveHighlight } from "./readingAnchors";
import { useRevisionNotePrefs } from "./revisionNotePrefs";
import { useProfileStore } from "@/store/profileStore";
import type { ShownNote } from "@/lib/rune2/revisionNoteSync";
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
//   * revision capture here is a COMMENT — Reading Mode's word for an
//     ordinary Scene Revision Note made while reading (there is no reading
//     note of its own: they appear at once in that Scene's, its Chapter's,
//     its Groups' and the Manuscript's Revision Notes). One interaction for
//     both kinds: selecting a passage offers "Add comment" beside it, and the
//     comment remembers the passage (an anchor, noteAnchors.ts — never a mark
//     in the prose); "Add comment" with nothing selected makes an UNANCHORED
//     comment on the Scene being read, kept at the Scene's head — no passage
//     is faked, and nothing manuscript-wide is made. The composer opens where
//     the comment will sit, and may take optional details before saving;
//   * comments show in the right margin (Comments) in one of two ways the
//     writer chooses and the device remembers: EXPANDED, compact cards beside
//     their passage (or the Scene's head), a few lines each; or COLLAPSED,
//     small markers. The open comment reads whole; an anchored one lights its
//     passage softly (the CSS highlight API: nothing in the document changes),
//     an unanchored one only its own card. A passage that can no longer be
//     found keeps its comment at the Scene's head, saying so. Resolved
//     comments stay stored and hide behind "Show resolved";
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
  const [railOpen, setRailOpen] = useState(true);
  const [at, setAt] = useState(-1);
  const { items } = useRevisionNotes();
  const userId = useProfileStore((s) => s.profile?.id);
  const { comments: display, setComments: setDisplay, showResolved, setShowResolved } = useRevisionNotePrefs(userId);
  // The comment open in its card, and the comment being written.
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  // Set by Comments: how a new comment is begun from the bar or a margin mark.
  const commentsApi = useRef<{ add: (sceneId: string) => void } | null>(null);
  // Bumped whenever the text's layout may have moved: markers measure again.
  const [layoutTick, setLayoutTick] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

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

  // The text's layout moved (a resize, text arriving): block offsets are
  // measured again when next needed, and the comments measure again.
  const onLayout = useCallback(() => {
    tops.current = null;
    setLayoutTick((n) => n + 1);
  }, []);
  useEffect(() => {
    const body = bodyRef.current;
    const doc = body?.querySelector(".r2-reader-inner");
    if (!body || !doc) return;
    const observer = new ResizeObserver(onLayout);
    observer.observe(doc);
    observer.observe(body);
    return () => observer.disconnect();
  }, [ready, onLayout]);

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
        if (readingJump.noteId) setActiveNoteId(readingJump.noteId);
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
    const { anchor, noteId } = readingJump;
    const frameId = requestAnimationFrame(() => {
      go(anchor, false);
      if (noteId) setActiveNoteId(noteId);
      clearReadingJump();
    });
    return () => cancelAnimationFrame(frameId);
  }, [ready, readingJump, key, go, clearReadingJump]);

  // The comments of the Scenes read here — anchored or not — the done ones only on request.
  const sceneNotes = useMemo(() => {
    if (!notable) return [];
    const inPlan = new Set(plan.sceneIds);
    return notes.filter((n) => n.target_type === "scene" && inPlan.has(n.target_id));
  }, [notable, notes, plan.sceneIds]);
  const comments = useMemo(() => sceneNotes.filter((n) => showResolved || !n.resolved), [sceneNotes, showResolved]);
  const resolvedCount = useMemo(() => sceneNotes.filter((n) => n.resolved).length, [sceneNotes]);
  /** The Scene version a new anchor is taken against: what was read, else what the structure says. */
  const versionOf = useCallback(
    (sceneId: string) => readCache.get(sceneId)?.version ?? index.get(sceneId)?.version ?? 1,
    [index],
  );

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

  /** Begins a comment: on the selected passage if there is one, else unanchored on `sceneId`. */
  function addComment(sceneId: string) {
    commentsApi.current?.add(sceneId);
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
  const actions = useRef({ addComment, edit });
  useEffect(() => {
    actions.current = { addComment, edit };
  });

  const document_ = useMemo(() => {
    const sceneAside = (sceneId: string) => {
      const where = readingLocation(index, sceneId) ?? "this scene";
      return (
        <>
          {notable && (
            <button
              type="button"
              tabIndex={-1}
              className="r2-reading-mark"
              title={`Add a comment on ${where}`}
              aria-label={`Add a comment on ${where}`}
              onClick={() => actions.current.addComment(sceneId)}
            >
              <MessageSquarePlus {...ICON} aria-hidden />
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
  }, [plan, texts, failed, index, notable]);

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
  const label = `${title}, read-only`;

  // Escape steps back a stage — Full to Peek, Peek to the shell — from
  // anywhere in the reader, and from nowhere in particular (focus on the body
  // after a control went away). Anything that handles Escape itself (the
  // composer clearing its draft, a menu) stops it before it gets here.
  const stepBack = useRef(() => {});
  useEffect(() => {
    stepBack.current = () => {
      if (draft) setDraft(null);
      else if (activeNoteId) setActiveNoteId(null);
      else if (mode === "full") setReadingMode("peek");
      else closeReading();
    };
  }, [mode, setReadingMode, closeReading, draft, activeNoteId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      stepBack.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // The composer gone, the keyboard returns to the text.
  useEffect(() => {
    if (draft === null) bodyRef.current?.focus({ preventScroll: true });
  }, [draft]);

  const gone = source.kind === "view" && !view;

  return (
    <div
      ref={rootRef}
      className="r2-reader"
      data-mode={mode}
      data-rail={(mode === "full" && railOpen && plan.nav.length > 1) || undefined}
      data-comments={notable && comments.length > 0 ? display : undefined}
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
              <Tooltip label="Comment on the selected passage, or on this scene">
                <button
                  type="button"
                  className="r2-action"
                  aria-expanded={draft !== null}
                  onClick={() => addComment(currentScene)}
                >
                  <MessageSquarePlus {...ICON} aria-hidden />
                  Add comment
                </button>
              </Tooltip>
            )}
            {notable && comments.length > 0 && (
              <Tooltip label={display === "expanded" ? "Collapse comments to markers" : `Expand comments (${comments.length})`}>
                <button
                  type="button"
                  className="r2-action r2-action--icon"
                  aria-pressed={display === "expanded"}
                  aria-label={display === "expanded" ? "Collapse comments" : `Expand ${comments.length} comments`}
                  onClick={() => setDisplay(display === "expanded" ? "collapsed" : "expanded")}
                >
                  <MessageSquareText {...ICON} aria-hidden />
                </button>
              </Tooltip>
            )}
            {notable && resolvedCount > 0 && (
              <Tooltip label={showResolved ? "Hide resolved comments" : `Show resolved comments (${resolvedCount})`}>
                <button
                  type="button"
                  className="r2-action r2-action--icon"
                  aria-pressed={showResolved}
                  aria-label={showResolved ? "Hide resolved comments" : `Show ${resolvedCount} resolved comments`}
                  onClick={() => setShowResolved(!showResolved)}
                >
                  <MessageSquareCheck {...ICON} aria-hidden />
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
                        <MessageSquare className="r2-reading-rail-note" {...ICON_SM} aria-label="Has comments" />
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
            <div ref={innerRef} className="r2-reader-inner">
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
                  {notable && (
                    <Comments
                      innerRef={innerRef}
                      notes={comments}
                      display={display}
                      canResolve={items}
                      canAnchor={items}
                      activeNoteId={activeNoteId}
                      onActivate={setActiveNoteId}
                      layoutTick={layoutTick}
                      mode={mode}
                      draft={draft}
                      onDraft={setDraft}
                      versionOf={versionOf}
                      labelOf={(id) => readingLocation(index, id) ?? "this scene"}
                      onOpenNotes={showNotes}
                      apiRef={commentsApi}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comments ────────────────────────────────────────────────────────────────

/** A comment being written: on a passage (anchor) or unanchored on the Scene. */
type CommentDraft = { sceneId: string; anchor: NoteAnchor | null };
type Placed = {
  note: ShownNote;
  sceneId: string;
  /** The passage's place in the column — or the Scene's head for an unanchored or stale comment. */
  top: number;
  bottom: number;
  range: Range | null;
  /** An anchored comment whose passage can't be found now. */
  stale: boolean;
};
type Offer = { sceneId: string; from: number; to: number; top: number; bottom: number; left: number };

/** Cards in the margin keep this much air between them. */
const CARD_GAP = 8;
/** Markers near one another step down by this much. */
const MARK_STEP = 22;

/** The place of a Scene's head in the column: its first line of text, else its top. */
function sceneHead(inner: HTMLElement, section: HTMLElement): number {
  const base = inner.getBoundingClientRect().top;
  const first = section.querySelector<HTMLElement>(".r2-snapshot, .r2-reading-empty");
  return (first ?? section).getBoundingClientRect().top - base;
}

/**
 * The comment layer over the reading column: every comment of the Scenes on
 * the surface, in the right margin — beside its passage when it can be found
 * (locateAnchor), at the Scene's head when it can't or when it has none —
 * either as compact cards (expanded) or as small markers (collapsed), with
 * the open comment read whole; the "Add comment" offer beside a selection;
 * and the composer, under a chosen passage or at the Scene's head. Everything
 * is measured from the rendered text and placed absolutely: the prose never
 * moves or changes.
 */
function Comments({
  innerRef,
  notes,
  display,
  canResolve,
  canAnchor,
  activeNoteId,
  onActivate,
  layoutTick,
  mode,
  draft,
  onDraft,
  versionOf,
  labelOf,
  onOpenNotes,
  apiRef,
}: {
  innerRef: RefObject<HTMLDivElement | null>;
  notes: ShownNote[];
  display: "expanded" | "collapsed";
  canResolve: boolean;
  canAnchor: boolean;
  activeNoteId: string | null;
  onActivate: (id: string | null) => void;
  layoutTick: number;
  mode: Mode;
  draft: CommentDraft | null;
  onDraft: (d: CommentDraft | null) => void;
  versionOf: (sceneId: string) => number;
  labelOf: (sceneId: string) => string;
  onOpenNotes: (sceneId: string) => void;
  apiRef: RefObject<{ add: (sceneId: string) => void } | null>;
}) {
  const { sync } = useRevisionNotes();
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);
  // Where the composer sits while it is open: under the passage, or at the Scene's head.
  const [draftView, setDraftView] = useState<{ top: number; bottom: number; range: Range | null } | null>(null);
  // Whether the column has a margin wide enough for cards (set by the stylesheet's container query).
  const [roomy, setRoomy] = useState(true);
  const expanded = display === "expanded" && roomy;

  /** The rendered text of a Scene on the surface. */
  const sceneRoot = useCallback(
    (sceneId: string) =>
      innerRef.current?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(sceneId)}"] .r2-snapshot .ProseMirror`) ?? null,
    [innerRef],
  );
  const sectionOf = useCallback(
    (sceneId: string) => innerRef.current?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(sceneId)}"]`) ?? null,
    [innerRef],
  );

  // Where each comment sits now: measured after every change of notes, text or layout.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    setRoomy(getComputedStyle(inner).getPropertyValue("--r2-comments-room").trim() !== "0");
    const byScene = new Map<string, ShownNote[]>();
    for (const n of notes) byScene.set(n.target_id, [...(byScene.get(n.target_id) ?? []), n]);
    const out: Placed[] = [];
    for (const [sceneId, list] of byScene) {
      const section = sectionOf(sceneId);
      if (!section) continue;
      const root = sceneRoot(sceneId);
      const plain = root ? readPlain(root) : null;
      const head = sceneHead(inner, section);
      for (const note of list) {
        const match = plain && note.anchor ? locateAnchor(plain.text, note.anchor) : null;
        const range = match && root && plain ? rangeFor(root, plain.segments, match.from, match.to) : null;
        const box = range ? rangeBox(range, inner) : null;
        out.push(
          box
            ? { note, sceneId, top: box.top, bottom: box.bottom, range, stale: false }
            : { note, sceneId, top: head, bottom: head, range: null, stale: Boolean(note.anchor) },
        );
      }
    }
    // Earlier passages first; at one place, older comments first.
    out.sort((a, b) => a.top - b.top || a.note.created_at.localeCompare(b.note.created_at));
    // Painted on the next frame: measured now, placed without re-entering this render.
    const frame = requestAnimationFrame(() => setPlaced(out));
    return () => cancelAnimationFrame(frame);
  }, [notes, layoutTick, innerRef, sceneRoot, sectionOf, mode, display]);

  // The open anchored comment's passage — or the one chosen for a new comment — softly lit; nothing otherwise.
  const active = placed.find((p) => p.note.id === activeNoteId) ?? null;
  useEffect(() => {
    setActiveHighlight(draft ? (draftView?.range ?? null) : (active?.range ?? null));
    return () => setActiveHighlight(null);
  }, [active, draft, draftView]);
  // Opened from the panel: bring the comment into view.
  useEffect(() => {
    if (!active) return;
    const body = innerRef.current?.closest(".r2-reader-body");
    const el = innerRef.current;
    if (!body || !el) return;
    const top = active.top + el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - body.clientHeight * 0.3;
    if (top < body.scrollTop || top > body.scrollTop + body.clientHeight - 160) body.scrollTo({ top: Math.max(0, top) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId, placed.length > 0]);

  // Clicking away — into the text, or anywhere outside the comments — closes the open comment.
  useEffect(() => {
    const body = innerRef.current?.closest<HTMLElement>(".r2-reader-body");
    if (!body) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest(".r2-comments")) return;
      onActivate(null);
    };
    body.addEventListener("mousedown", onDown);
    return () => body.removeEventListener("mousedown", onDown);
  }, [innerRef, onActivate]);

  // A selection inside one Scene's text: offer a comment on it.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || !canAnchor) return;
    let frame: number | null = null;
    const read = () => {
      frame = null;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || draft) {
        setOffer(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const start = (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as Element))?.closest("[data-scene]");
      const end = (range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : (range.endContainer as Element))?.closest("[data-scene]");
      const sceneId = start?.getAttribute("data-scene");
      if (!sceneId || !start || start !== end || !inner.contains(start)) {
        setOffer(null);
        return;
      }
      const root = sceneRoot(sceneId);
      if (!root) return setOffer(null);
      const plain = readPlain(root);
      const offsets = selectionOffsets(root, plain.segments, plain.text, range);
      const box = offsets ? rangeBox(range, inner) : null;
      if (!offsets || !box || !/\S/.test(plain.text.slice(offsets.from, offsets.to))) return setOffer(null);
      const last = range.getClientRects();
      const base = inner.getBoundingClientRect();
      const right = last.length > 0 ? last[last.length - 1].right - base.left : 0;
      // Beside the selection's end, kept inside the text column.
      const left = Math.max(0, Math.min(right - 40, root.getBoundingClientRect().right - base.left - 150));
      setOffer({ sceneId, ...offsets, top: box.top, bottom: box.bottom, left });
    };
    const onChange = () => {
      if (frame === null) frame = requestAnimationFrame(read);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [innerRef, sceneRoot, draft, canAnchor]);

  /** Takes the offered selection as a comment's passage and opens the composer under it. */
  const takeOffer = useCallback(() => {
    if (!offer) return;
    const inner = innerRef.current;
    const root = sceneRoot(offer.sceneId);
    if (!root || !inner) return;
    const plain = readPlain(root);
    const anchor = makeAnchor(plain.text, offer.from, offer.to, versionOf(offer.sceneId));
    if (!anchor) return;
    const range = rangeFor(root, plain.segments, anchor.from, anchor.to);
    const box = range ? rangeBox(range, inner) : null;
    setDraftView({ top: box?.top ?? offer.top, bottom: box?.bottom ?? offer.bottom, range });
    onActivate(null);
    onDraft({ sceneId: offer.sceneId, anchor });
    setOffer(null);
    document.getSelection()?.removeAllRanges();
  }, [offer, innerRef, sceneRoot, versionOf, onActivate, onDraft]);

  /** Opens the composer at a Scene's head for an unanchored comment on it — no passage is faked. */
  const startUnanchored = useCallback(
    (sceneId: string) => {
      const inner = innerRef.current;
      const section = sectionOf(sceneId);
      if (!inner || !section) return;
      const head = sceneHead(inner, section);
      setDraftView({ top: head, bottom: head, range: null });
      onActivate(null);
      onDraft({ sceneId, anchor: null });
      // The head out of view: bring it in, so the composer is where the writer looks.
      const body = inner.closest<HTMLElement>(".r2-reader-body");
      if (body) {
        const y = head + inner.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
        if (y < body.scrollTop + 16 || y > body.scrollTop + body.clientHeight - 220) {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          body.scrollTo({ top: Math.max(0, y - body.clientHeight * 0.25), behavior: reduced ? "auto" : "smooth" });
        }
      }
    },
    [innerRef, sectionOf, onActivate, onDraft],
  );

  // The one way to begin a comment, for the bar and the margin marks: the selection if there is one, else the Scene.
  useEffect(() => {
    apiRef.current = {
      add: (sceneId) => {
        if (draft) return onDraft(null);
        if (offer) takeOffer();
        else startUnanchored(sceneId);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, draft, offer, takeOffer, startUnanchored, onDraft]);

  // ── Layout of the margin ──
  // Expanded: cards, each at its passage when it can be, pushed down past the
  // one before it. Their heights are read from the rendered cards; a change
  // of height (a comment opened, text arriving) lays them out again.
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  /** Holds a card's element and watches its height (one observer, made on the first card). */
  const cardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (observer.current === null && typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(() => {
        const next = new Map<string, number>();
        for (const [cardId, card] of cardEls.current) next.set(cardId, card.offsetHeight);
        setHeights((prev) => (prev.size === next.size && [...next].every(([k, h]) => prev.get(k) === h) ? prev : next));
      });
    }
    const held = cardEls.current.get(id);
    if (el) {
      cardEls.current.set(id, el);
      observer.current?.observe(el);
    } else {
      cardEls.current.delete(id);
      if (held) observer.current?.unobserve(held);
    }
  }, []);
  const cards = placed.reduce<(Placed & { offsetTop: number })[]>((acc, p) => {
    const prev = acc[acc.length - 1];
    const floor = prev ? prev.offsetTop + (heights.get(prev.note.id) ?? 0) + CARD_GAP : 0;
    acc.push({ ...p, offsetTop: Math.max(p.top - 2, floor) });
    return acc;
  }, []);
  // Collapsed: markers near one another step down so each stays its own.
  const markers = placed.reduce<(Placed & { offsetTop: number })[]>((acc, p) => {
    const prev = acc[acc.length - 1];
    const offsetTop = prev && p.top < prev.offsetTop + MARK_STEP ? prev.offsetTop + MARK_STEP : p.top;
    acc.push({ ...p, offsetTop });
    return acc;
  }, []);

  const toggle = (id: string) => {
    onDraft(null);
    onActivate(id === activeNoteId ? null : id);
  };

  return (
    <div className="r2-comments" data-display={expanded ? "expanded" : "collapsed"} aria-label="Comments on this text">
      {expanded
        ? cards.map((c) => (
            <CommentCard
              key={c.note.id}
              ref={(el) => cardRef(c.note.id, el)}
              placed={c}
              style={{ top: c.offsetTop }}
              open={c.note.id === activeNoteId}
              compact
              canResolve={canResolve}
              onToggle={() => toggle(c.note.id)}
              onClose={() => onActivate(null)}
              labelOf={labelOf}
              onOpenNotes={onOpenNotes}
              sync={sync}
            />
          ))
        : markers.map((m) => (
            <button
              key={m.note.id}
              type="button"
              className="r2-comment-mark"
              style={{ top: m.offsetTop }}
              data-active={m.note.id === activeNoteId || undefined}
              data-stale={m.stale || undefined}
              data-unanchored={!m.note.anchor || undefined}
              data-resolved={m.note.resolved || undefined}
              aria-label={`${m.note.resolved ? "Resolved comment" : "Comment"}${m.stale ? " (passage not found)" : m.note.anchor ? "" : " on the scene"}: ${m.note.body.slice(0, 80)}`}
              aria-expanded={m.note.id === activeNoteId}
              onClick={() => toggle(m.note.id)}
            >
              <MessageSquare {...ICON_SM} aria-hidden />
            </button>
          ))}

      {!expanded && active && (
        <CommentCard
          placed={active}
          style={{ top: active.bottom + 8 }}
          open
          popover
          canResolve={canResolve}
          onToggle={() => onActivate(null)}
          onClose={() => onActivate(null)}
          labelOf={labelOf}
          onOpenNotes={onOpenNotes}
          sync={sync}
        />
      )}

      {offer && !draft && (
        <button
          type="button"
          className="r2-comment-offer"
          style={{ top: offer.top - 34, left: offer.left }}
          // Mousedown, not click: a click would first collapse the selection.
          onMouseDown={(e) => {
            e.preventDefault();
            takeOffer();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              takeOffer();
            }
          }}
        >
          <MessageSquarePlus {...ICON_SM} aria-hidden />
          Add comment
        </button>
      )}

      {draft && draftView && (
        <div
          className="r2-comment-composer"
          data-unanchored={!draft.anchor || undefined}
          style={{ top: draft.anchor ? draftView.bottom + 8 : draftView.top }}
          role="group"
          aria-label={draft.anchor ? "Add a comment on this passage" : `Add a comment on ${labelOf(draft.sceneId)}`}
        >
          {draft.anchor ? (
            <p className="r2-comment-composer-quote">“{anchorExcerpt(draft.anchor, 120)}”</p>
          ) : (
            <p className="r2-comment-composer-head">Comment on {labelOf(draft.sceneId)}</p>
          )}
          <NoteComposer
            key={`${draft.sceneId}:${draft.anchor?.from ?? "scene"}`}
            target={{ type: "scene", id: draft.sceneId }}
            anchor={draft.anchor}
            placeholder={draft.anchor ? "What to look at here…" : "What to look at in this scene…"}
            label={draft.anchor ? `New comment on this passage of ${labelOf(draft.sceneId)}` : `New comment on ${labelOf(draft.sceneId)}`}
            autoFocus
            hint
            onAdded={() => onDraft(null)}
            onEscape={() => onDraft(null)}
          />
          <p className="r2-comment-composer-foot">
            {draft.anchor && <span>{labelOf(draft.sceneId)}</span>}
            <button type="button" className="r2-panel-link" onClick={() => onDraft(null)}>
              Cancel
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One comment: compact in the margin (its text to a few lines, a sign of
 * details, its passage or Scene), whole when open — details, a stale
 * passage's words, the way to Revision Notes — and, as a popover under a
 * marker, the same card on a floating surface.
 */
function CommentCard({
  ref,
  placed,
  style,
  open,
  compact,
  popover,
  canResolve,
  onToggle,
  onClose,
  labelOf,
  onOpenNotes,
  sync,
}: {
  ref?: (el: HTMLDivElement | null) => void;
  placed: Placed;
  style: CSSProperties;
  open: boolean;
  compact?: boolean;
  popover?: boolean;
  canResolve: boolean;
  onToggle: () => void;
  onClose: () => void;
  labelOf: (sceneId: string) => string;
  onOpenNotes: (sceneId: string) => void;
  sync: ReturnType<typeof useRevisionNotes>["sync"];
}) {
  const { offline } = useRevisionNotes();
  const { note, sceneId, stale } = placed;
  const hasDetails = Boolean(note.details?.trim());
  const waiting = note.pending === "conflict" || note.pending === "missing";
  // As the panel says it: kept on the device until the server has it.
  const flag = note.pending === "pending" && offline ? "Not saved yet" : note.pending === "unavailable" ? "Waiting to be saved" : null;
  return (
    <div
      ref={ref}
      className="r2-comment"
      style={style}
      data-open={open || undefined}
      data-popover={popover || undefined}
      data-resolved={note.resolved || undefined}
      data-unanchored={!note.anchor || undefined}
      data-stale={stale || undefined}
      role={popover ? "dialog" : undefined}
      aria-label={popover ? "Comment" : undefined}
    >
      <div className="r2-comment-row">
        <button
          type="button"
          role="checkbox"
          aria-checked={note.resolved}
          aria-label={note.resolved ? "Resolved — mark open" : "Mark resolved"}
          className="r2-rnote-check"
          disabled={!canResolve || !sync || waiting}
          onClick={() => sync?.setResolved(note.id, !note.resolved)}
        >
          {note.resolved && <Check {...ICON_SM_BOLD} aria-hidden />}
        </button>
        <div className="r2-comment-main">
          {flag && <p className="r2-comment-flag">{flag}</p>}
          {compact && !open ? (
            <button type="button" className="r2-comment-body r2-comment-body--button" aria-expanded={false} onClick={onToggle}>
              <span className="r2-comment-text">{note.body}</span>
              {hasDetails && <span className="r2-comment-has-details">· details</span>}
            </button>
          ) : (
            <p className="r2-comment-body">{note.body}</p>
          )}
          {open && hasDetails && <p className="r2-comment-details">{note.details}</p>}
          {open && stale && note.anchor && (
            <p className="r2-comment-stale">
              This passage can’t be found in the scene any more. It read: “{anchorExcerpt(note.anchor, 100)}”
            </p>
          )}
          {!open && compact && (
            <p className="r2-comment-where">
              {note.anchor ? (stale ? `Passage not found · ${labelOf(sceneId)}` : `“${anchorExcerpt(note.anchor, 60)}”`) : labelOf(sceneId)}
            </p>
          )}
          {open && (
            <p className="r2-comment-foot">
              <span>{note.anchor ? labelOf(sceneId) : `On ${labelOf(sceneId)}`}</span>
              <button type="button" className="r2-panel-link" onClick={() => onOpenNotes(sceneId)}>
                Open in Revision Notes
              </button>
            </p>
          )}
        </div>
        {open && (
          <Tooltip label="Close">
            <button type="button" className="r2-icon-button r2-icon-button--xs" aria-label="Close comment" onClick={onClose}>
              <X {...ICON_SM} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
