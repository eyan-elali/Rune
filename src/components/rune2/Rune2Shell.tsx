"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { ProjectManuscript } from "@/lib/rune2/projectManuscript";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import { ProjectNavigator } from "./ProjectNavigator";
import { Rune2ContextBar, Rune2SelectionView } from "./Rune2Content";
import { Rune2Panel } from "./Rune2Panel";
import { ProjectExportDialogs, ProjectExportProvider } from "./ProjectExport";
import { ProjectSearch } from "./ProjectSearch";
import { PropertyStoreProvider } from "./PropertyStore";
import { ReferenceStoreProvider } from "./ReferenceStore";
import { RevisionNoteStoreProvider } from "./RevisionNoteStore";
import { Rune2SelectionProvider, useRune2Selection } from "./Rune2Selection";
import { Rune2Tabs } from "./Rune2Tabs";
import { ViewStoreProvider } from "./ViewStore";
import { TrashProvider, TrashView } from "./WorkspaceTrash";
import { useWritingChrome } from "./useWritingChrome";

// The Rune 2.0 application shell:
//   navigator | (working-set tabs, context bar, content) | optional panel
// The navigator and the panel are columns beside the content, never over it,
// and both stay in the tree whether open or retracted: retracting either
// only changes its width, so the content column simply widens or narrows and
// its editors are never remounted. While the writer is typing, the shell
// carries `data-writing` (useWritingChrome) and the top chrome fades in place.
//
// Both side columns can be dragged wider or narrower (Resizer): the widths are
// session-local presentation state (Rune2Selection) and reach the CSS as the
// shell's --r2-nav-full / --r2-panel-width. Dragging sets `data-resizing`,
// which turns the columns' width transitions off for the duration.
//
// The content has priority. Below NARROW_PX the navigator no longer takes a
// column of its own: it retracts once as the window gets that narrow, and
// when the writer opens it again it lies over the content's left edge (as the
// panel already does over the right, rune2.css) and retracts again on a
// press outside it. The shell carries `data-narrow` meanwhile.
//
// Trash (a project-level utility, not an object) takes the content column's
// place while it is open: the selection's layer — tabs, context bar and every
// mounted editor — stays in the tree exactly as it was, but is hidden and
// inert (visibility, not unmounting, so editors, unsaved writing and scroll
// positions are kept), and the right-hand panel, which belongs to that
// selection, is hidden with it. Closing Trash shows the layer again.

export const NAV_DEFAULT = 252;
export const NAV_MIN = 200;
export const NAV_MAX = 400;
export const PANEL_MIN = 260;
export const PANEL_MAX = 520;
const NARROW_PX = 900;

export function Rune2Shell({
  manuscript,
  workspace,
  children,
}: {
  manuscript: ProjectManuscript;
  workspace: ProjectWorkspace;
  children: ReactNode;
}) {
  return (
    <Rune2SelectionProvider manuscript={manuscript} workspace={workspace}>
      <ReferenceStoreProvider workspace={workspace}>
        <PropertyStoreProvider workspace={workspace}>
          <ViewStoreProvider workspace={workspace}>
            <RevisionNoteStoreProvider>
              <TrashProvider>
                <ProjectExportProvider>
                  <Frame>{children}</Frame>
                </ProjectExportProvider>
              </TrashProvider>
            </RevisionNoteStoreProvider>
          </ViewStoreProvider>
        </PropertyStoreProvider>
      </ReferenceStoreProvider>
    </Rune2SelectionProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { navCollapsed, setNavCollapsed, navWidth, setNavWidth, trashOpen, panel } = useRune2Selection();
  const root = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const narrow = useNarrow();
  useWritingChrome(root);

  // Getting narrow retracts the navigator once; the writer may reopen it (over the content).
  const wasNarrow = useRef(narrow);
  useEffect(() => {
    if (narrow && !wasNarrow.current) setNavCollapsed(true);
    wasNarrow.current = narrow;
  }, [narrow, setNavCollapsed]);

  // Narrow and open, the navigator lies over the content: a press outside it closes it.
  useEffect(() => {
    if (!narrow || navCollapsed) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(".r2-nav-column, .r2-menu, .r2-popover, .r2-dialog")) return;
      setNavCollapsed(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [narrow, navCollapsed, setNavCollapsed]);

  const style = navWidth !== null ? ({ "--r2-nav-full": `${navWidth}px` } as CSSProperties) : undefined;

  return (
    <div
      ref={root}
      className="r2 r2-shell"
      style={style}
      data-nav={navCollapsed ? "collapsed" : undefined}
      data-narrow={narrow || undefined}
      data-resizing={resizing || undefined}
      data-trash={trashOpen || undefined}
    >
      {/* The column retracts by width; the navigator inside keeps its own. */}
      <div className="r2-nav-column">
        <ProjectNavigator />
        {!navCollapsed && (
          <Resizer
            label="Navigator width"
            edge="right"
            value={navWidth ?? NAV_DEFAULT}
            min={NAV_MIN}
            max={NAV_MAX}
            onChange={setNavWidth}
            onReset={() => setNavWidth(null)}
            onResizing={setResizing}
          />
        )}
      </div>

      <div className="r2-content">
        <div className="r2-content-layer" inert={trashOpen || undefined} aria-hidden={trashOpen || undefined}>
          <Rune2Tabs />
          <Rune2ContextBar />
          <main className="r2-main min-h-0 flex-1 overflow-y-auto">
            <Rune2SelectionView>{children}</Rune2SelectionView>
          </main>
        </div>
        {trashOpen && <TrashView />}
      </div>

      <Rune2Panel resizer={panel ? <PanelResizer onResizing={setResizing} /> : null} />
      <ProjectSearch />
      <ProjectExportDialogs />
    </div>
  );
}

function PanelResizer({ onResizing }: { onResizing: (on: boolean) => void }) {
  const { panelWidth, setPanelWidth } = useRune2Selection();
  const read = useCallback(() => {
    const el = document.querySelector<HTMLElement>(".r2-panel");
    return el ? el.getBoundingClientRect().width : PANEL_MIN;
  }, []);
  return (
    <Resizer
      label="Panel width"
      edge="left"
      value={panelWidth}
      readValue={read}
      min={PANEL_MIN}
      max={PANEL_MAX}
      onChange={setPanelWidth}
      onReset={() => setPanelWidth(null)}
      onResizing={onResizing}
    />
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_PX}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * A column's draggable edge: a thin zone the pointer finds without seeing it,
 * showing a hairline only while hovered or dragged. From the keyboard it is a
 * separator (arrow keys step it, Home/End go to the limits); a double-click
 * returns the column to its default width.
 *
 * `edge` is which edge of its column the handle sits on — dragging away from
 * the column makes it wider.
 */
function Resizer({
  label,
  edge,
  value,
  readValue,
  min,
  max,
  onChange,
  onReset,
  onResizing,
}: {
  label: string;
  edge: "left" | "right";
  /** The current width, or null when the column is at a default the CSS decides. */
  value: number | null;
  /** How to measure the column when `value` is null. */
  readValue?: () => number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  onReset: () => void;
  onResizing: (on: boolean) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)));
  const current = () => value ?? readValue?.() ?? min;
  const sign = edge === "right" ? 1 : -1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width: current() };
    setDragging(true);
    onResizing(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    onChange(clamp(start.current.width + sign * (e.clientX - start.current.x)));
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    onResizing(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    switch (e.key) {
      case "ArrowLeft":
        onChange(clamp(current() - sign * step));
        break;
      case "ArrowRight":
        onChange(clamp(current() + sign * step));
        break;
      case "Home":
        onChange(min);
        break;
      case "End":
        onChange(max);
        break;
      case "Enter":
      case "Backspace":
        onReset();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className="r2-resizer"
      data-edge={edge}
      data-active={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
