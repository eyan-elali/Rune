"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { AUTO_SCROLL_DEFAULTS, AUTO_SCROLL_REDUCED, createAutoScroll, type AutoScrollController } from "@/lib/rune2/dragAutoScroll";
import {
  chapterHtml,
  chapterKeyAction,
  chapterText,
  isCollapsed,
  orderedEnds,
  sceneSpans,
  spannedScenes,
  wholeChapter,
  type ChapterRange,
  type ClipboardPart,
  type ScenePoint,
} from "@/lib/rune2/chapterSelection";

// The Chapter-wide selection controller (see lib/rune2/chapterSelection.ts
// for the model and why it exists). It watches the writing surface for:
//
//   ⌘A / Ctrl+A   in any Scene: the whole Chapter — title and every Scene —
//                 is selected, not the one editor.
//   a drag        that starts in one Scene and leaves it: the selection
//                 follows the pointer into the Scenes above or below, the
//                 column auto-scrolling at its edges, until the pointer
//                 returns or the button is released.
//   ⌘C / Ctrl+C   (and Edit → Copy) with a Chapter selection: the range is
//                 put on the clipboard as HTML and plain text, in manuscript
//                 order, from the Scenes' own documents.
//
// One Scene — where ⌘A was pressed or the drag began — keeps a real native
// selection (so the browser fires copy and the writer's focus stays where it
// was); every Scene in the range, that one included, paints the highlight
// through a ProseMirror decoration (chapterSelectionPlugin), and the native
// paint is hidden meanwhile, so the Chapter reads as one selection rather
// than two kinds of highlight. A Chapter selection is not editable:
// a key that would type or delete collapses it and is dropped, so a highlight
// that spans Scenes can never become an edit that spans them. Escape and the
// arrows collapse it to a caret; a click anywhere clears it; opening
// something else clears it.

const KEY = new PluginKey<DecorationSet>("r2ChapterSelection");
const DECORATION_CLASS = "r2-xsel";

/** Registered on every Scene editor of the surface: paints its part of a Chapter selection. */
export function chapterSelectionPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: KEY,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const meta = tr.getMeta(KEY) as { from: number; to: number } | null | undefined;
        if (meta === undefined) return set.map(tr.mapping, tr.doc);
        if (meta === null || meta.to <= meta.from) return DecorationSet.empty;
        return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: DECORATION_CLASS })]);
      },
    },
    props: {
      decorations(state) {
        return KEY.getState(state);
      },
    },
  });
}

function paint(editor: Editor, span: { from: number; to: number } | null) {
  if (editor.isDestroyed) return;
  const current = KEY.getState(editor.state);
  if (span === null && (!current || current === DecorationSet.empty)) return;
  editor.view.dispatch(editor.state.tr.setMeta(KEY, span).setMeta("addToHistory", false));
}

export type ChapterSelectionState = {
  /** "all" after ⌘A; "drag" while or after a cross-Scene drag; null otherwise. */
  mode: "all" | "drag" | null;
  titleSelected: boolean;
  /** For assistive technology: what was just selected. */
  announcement: string | null;
};

type Options = {
  /** The writing column (the article); events are read here. */
  rootRef: RefObject<HTMLElement | null>;
  /** The shown Scenes, in order, with a way to reach each one's editor. */
  sceneIds: readonly string[];
  editorOf: (sceneId: string) => Editor | null | undefined;
  /** The document's title, as shown above the prose. */
  title: string;
  /** The column's scroll container. */
  scroller: () => HTMLElement | null;
  /** Changes when the writer opens something else; the selection clears. */
  viewKey: string | null;
};

export function useChapterSelection({ rootRef, sceneIds, editorOf, title, scroller, viewKey }: Options): ChapterSelectionState {
  const [state, setState] = useState<ChapterSelectionState>({ mode: null, titleSelected: false, announcement: null });
  const range = useRef<ChapterRange | null>(null);
  // The Scene whose highlight is the browser's own.
  const nativeIndex = useRef<number | null>(null);
  // Where the caret was before ⌘A: where it returns when the selection collapses.
  const caretBefore = useRef<number | null>(null);
  const sceneKey = sceneIds.join(",");
  const ids = useMemo(() => sceneKey.split(",").filter(Boolean), [sceneKey]);
  const editorsRef = useRef(editorOf);
  const titleRef = useRef(title);
  useEffect(() => {
    editorsRef.current = editorOf;
    titleRef.current = title;
  }, [editorOf, title]);

  const editors = useCallback(() => ids.map((id) => editorsRef.current(id) ?? null), [ids]);

  const clear = useCallback(
    (collapse: boolean) => {
      if (!range.current) return;
      const native = nativeIndex.current;
      const caret = caretBefore.current;
      range.current = null;
      nativeIndex.current = null;
      caretBefore.current = null;
      editors().forEach((editor, i) => {
        if (!editor) return;
        paint(editor, null);
        if (collapse && i === native && !editor.state.selection.empty) {
          const pos = Math.min(caret ?? editor.state.selection.anchor, editor.state.doc.content.size);
          editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
        }
      });
      setState({ mode: null, titleSelected: false, announcement: null });
    },
    [editors]
  );

  const apply = useCallback(
    (next: ChapterRange, mode: "all" | "drag", native: number) => {
      range.current = next;
      nativeIndex.current = native;
      const list = editors();
      const spans = sceneSpans(
        next,
        list.map((e) => e?.state.doc.content.size ?? 0)
      );
      // Every Scene paints its part the same way — the native Scene's own
      // selection is kept for the clipboard but not shown (rune2.css).
      list.forEach((editor, i) => {
        if (!editor) return;
        paint(editor, spans[i]);
      });
      const n = spannedScenes(next);
      setState({
        mode,
        titleSelected: next.title,
        announcement:
          mode === "all"
            ? n > 1
              ? `Whole chapter selected, across ${n} scenes.`
              : "Whole document selected."
            : n > 1
              ? `Selection spans ${n} scenes.`
              : null,
      });
    },
    [editors]
  );

  const selectAll = useCallback(
    (preferred: number) => {
      const list = editors();
      if (list.length === 0 || list.some((e) => !e)) return false;
      const sizes = list.map((e) => e!.state.doc.content.size);
      // The native selection lives in the Scene the writer is in — or, when
      // that one is empty, the first with text, so the browser always has a
      // real selection to copy.
      let native = preferred;
      if (!(list[native]!.state.doc.textContent.length > 0)) {
        const found = list.findIndex((e) => e!.state.doc.textContent.length > 0);
        native = found === -1 ? preferred : found;
      }
      const editor = list[native]!;
      caretBefore.current = native === preferred ? editor.state.selection.head : 0;
      if (!editor.isFocused) editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 0, editor.state.doc.content.size)));
      apply(wholeChapter(sizes), "all", native);
      return true;
    },
    [editors, apply]
  );

  // Where the pointer is, as a point in the Chapter: a position inside a
  // Scene, the end of the Scene above when between two, the Chapter's ends
  // beyond its first and last.
  const pointAt = useCallback(
    (x: number, y: number): { point: ScenePoint; title: boolean } | null => {
      const list = editors();
      if (list.length === 0 || list.some((e) => !e)) return null;
      const rects = list.map((e) => e!.view.dom.getBoundingClientRect());
      const titleEl = rootRef.current?.querySelector<HTMLElement>(".r2-doc-title");
      const titleBottom = titleEl ? titleEl.getBoundingClientRect().bottom : rects[0].top;
      if (y < rects[0].top) return { point: { index: 0, pos: 0 }, title: y < titleBottom };
      const last = list.length - 1;
      if (y >= rects[last].bottom) return { point: { index: last, pos: list[last]!.state.doc.content.size }, title: false };
      for (let i = 0; i < list.length; i++) {
        const r = rects[i];
        if (y < r.top) return { point: { index: i - 1, pos: list[i - 1]!.state.doc.content.size }, title: false };
        if (y < r.bottom) {
          const left = Math.min(Math.max(x, r.left + 1), r.right - 1);
          const found = list[i]!.view.posAtCoords({ left, top: y });
          const size = list[i]!.state.doc.content.size;
          const pos = found ? found.pos : y - r.top < r.bottom - y ? 0 : size;
          return { point: { index: i, pos: Math.min(Math.max(pos, 0), size) }, title: false };
        }
      }
      return null;
    },
    [editors, rootRef]
  );

  const copy = useCallback(
    (data: DataTransfer | null) => {
      const current = range.current;
      if (!current || !data) return false;
      const list = editors();
      if (list.some((e) => !e)) return false;
      const spans = sceneSpans(
        current,
        list.map((e) => e!.state.doc.content.size)
      );
      const parts: ClipboardPart[] = [];
      list.forEach((editor, i) => {
        const span = spans[i];
        if (span) parts.push({ doc: editor!.state.doc, span });
      });
      const t = current.title ? titleRef.current : null;
      data.clearData();
      data.setData("text/plain", chapterText(t, parts));
      data.setData("text/html", chapterHtml(t, parts, document));
      return true;
    },
    [editors]
  );

  // Place the caret at one end of the selection (arrows, Escape).
  const collapseTo = useCallback(
    (end: "from" | "to" | "anchor") => {
      const current = range.current;
      if (!current) return;
      const target = end === "anchor" ? current.anchor : orderedEnds(current)[end];
      const list = editors();
      clear(false);
      const editor = list[target.index];
      if (!editor) return;
      const pos = Math.min(target.pos, editor.state.doc.content.size);
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)).scrollIntoView());
    },
    [editors, clear]
  );

  // Opening something else, or the Chapter's Scenes changing, drops the selection.
  useEffect(() => {
    clear(false);
  }, [viewKey, sceneKey, clear]);
  useEffect(() => () => clear(false), [clear]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const sceneIndexOf = (target: EventTarget | null): number => {
      const el = target instanceof Node ? (target.nodeType === 3 ? target.parentElement : (target as Element)) : null;
      const section = el?.closest<HTMLElement>(".r2-scene[data-scene-id]");
      if (!section || !el?.closest(".ProseMirror")) return -1;
      if (el.closest("[role='dialog']")) return -1;
      return ids.indexOf(section.dataset.sceneId ?? "");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const active = range.current !== null;
      const inScene = sceneIndexOf(e.target);
      if (!active && inScene === -1) return;
      const action = chapterKeyAction(e, isMac);
      if (action === "select-all") {
        if (inScene === -1 && nativeIndex.current === null) return;
        const index = inScene !== -1 ? inScene : (nativeIndex.current ?? 0);
        if (selectAll(index)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (!active) return;
      switch (action) {
        case "copy":
          // The copy event serialises the Chapter; ⌘X copies too and deletes nothing.
          return;
        case "collapse":
          e.preventDefault();
          e.stopPropagation();
          collapseTo(e.key === "Escape" ? "anchor" : e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home" ? "from" : "to");
          return;
        case "swallow":
          e.preventDefault();
          e.stopPropagation();
          clear(true);
          return;
        case "pass":
          if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete") clear(true);
          return;
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!range.current) return;
      if (copy(e.clipboardData)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // A drag that begins in a Scene.
    let dragFrom = -1;
    let auto: AutoScrollController | null = null;
    const endDrag = () => {
      dragFrom = -1;
      auto?.stop();
      auto = null;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      if (range.current && isCollapsed(range.current)) clear(false);
    };
    const onMove = (e: MouseEvent) => {
      if (dragFrom === -1) return;
      if (!(e.buttons & 1)) {
        endDrag();
        return;
      }
      const list = editors();
      const origin = list[dragFrom];
      if (!origin) return;
      const r = origin.view.dom.getBoundingClientRect();
      const inside = e.clientY >= r.top && e.clientY < r.bottom;
      if (inside) {
        // Back in the Scene it began in: the browser's own selection takes over again.
        if (range.current) clear(false);
        auto?.update(e.clientY);
        return;
      }
      const at = pointAt(e.clientX, e.clientY);
      if (!at) return;
      // The drag's anchor, from the browser's own selection in the Scene it
      // began in (the editor's state can lag a pointer that has left it).
      let anchorPos = origin.state.selection.anchor;
      const domSel = window.getSelection();
      if (domSel?.anchorNode && origin.view.dom.contains(domSel.anchorNode)) {
        try {
          anchorPos = origin.view.posAtDOM(domSel.anchorNode, domSel.anchorOffset);
        } catch {
          // Not a position in this editor: keep the editor's own anchor.
        }
      }
      const anchor: ScenePoint = { index: dragFrom, pos: anchorPos };
      apply({ anchor, head: at.point, title: at.title }, "drag", dragFrom);
      if (!auto) {
        const el = scroller();
        if (el) {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          auto = createAutoScroll(
            {
              box: () => {
                const b = el.getBoundingClientRect();
                return { top: b.top, bottom: b.bottom };
              },
              scrollTop: () => el.scrollTop,
              maxScrollTop: () => el.scrollHeight - el.clientHeight,
              scrollBy: (dy) => {
                el.scrollTop += dy;
              },
            },
            { request: (cb) => requestAnimationFrame(cb), cancel: (h) => cancelAnimationFrame(h) },
            reduced ? AUTO_SCROLL_REDUCED : AUTO_SCROLL_DEFAULTS
          );
        }
      }
      auto?.update(e.clientY);
    };
    const onUp = () => endDrag();
    const onMouseDown = (e: MouseEvent) => {
      // Any press clears a Chapter selection; a press in a Scene may begin a drag.
      if (range.current) clear(false);
      if (e.button !== 0 || e.shiftKey) return;
      const index = sceneIndexOf(e.target);
      if (index === -1) return;
      dragFrom = index;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    };

    root.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("copy", onCopy, true);
    root.addEventListener("cut", onCopy, true);
    root.addEventListener("mousedown", onMouseDown, true);
    return () => {
      root.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("copy", onCopy, true);
      root.removeEventListener("cut", onCopy, true);
      root.removeEventListener("mousedown", onMouseDown, true);
      endDrag();
    };
  }, [rootRef, ids, editors, selectAll, collapseTo, clear, copy, pointAt, apply, scroller]);

  return state;
}
