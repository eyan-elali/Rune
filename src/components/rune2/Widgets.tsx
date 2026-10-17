"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, LayoutGrid, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listManuscriptMilestones } from "@/lib/actions/manuscriptMilestones";
import { createGoal, deleteGoal, updateGoal } from "@/lib/actions/writingStats";
import { readWritingActivity, type WritingActivityRead } from "@/lib/actions/writingActivity";
import { getOfflineDB } from "@/lib/offline/db";
import {
  ACTIVITY_WEEKS,
  activityCalendar,
  dailyGoalProgress,
  dailyTotals,
  daysEnding,
  shortDate,
  shortMonth,
  writingStreak,
  type ActivityLevel,
} from "@/lib/rune2/writingActivity";
import { getLocalDateString } from "@/lib/utils";
import { reconcileWritingCredits, useLoggedWritingCredits } from "@/components/editor/writingCreditLog";
import { historyTime, wordsLabel, type MilestoneSummary } from "@/lib/rune2/history";
import { isSelectable, isWorkspaceKind, type NavEntry, type NavKind } from "@/lib/rune2/navigatorModel";
import {
  activityDisplayOf,
  addWidget,
  availableWidgets,
  setActivityDisplay,
  DEFAULT_WIDGET_LAYOUT,
  goalProgress,
  moveWidget,
  parseGoalTarget,
  pushRecent,
  removeWidget,
  reorderWidget,
  setWidgetSize,
  WIDGET_GROUP_LABEL,
  widgetDefinition,
  type ActivityDisplay,
  type WidgetGroup,
  type WidgetId,
  type WidgetLayout,
  type WidgetPlacement,
  type WidgetSize,
} from "@/lib/rune2/widgets";
import {
  readStoredRecent,
  readStoredWidgetLayout,
  writeStoredRecent,
  writeStoredWidgetLayout,
} from "@/lib/rune2/widgetStorage";
import { useProfileStore } from "@/store/profileStore";
import { ICON, ICON_SM, ICON_SM_BOLD } from "./icons";
import { useRunePreferences } from "./RunePreferences";
import {
  DAILY_GOAL_PRESETS,
  dailyGoalOn,
  hasDailyGoalHistory,
  setDailyGoal,
  type DailyGoalHistory,
} from "@/lib/rune2/preferences";
import { useLiveWords } from "./liveWords";
import { TimerFigures } from "./TimerFloat";
import { useWritingTimer } from "./useWritingTimer";
import {
  describeRemaining,
  formatDuration,
  MINUTE_MS,
  minutesAtShare,
  parseDuration,
  remainingMs,
  remainingShare,
  SCALE_MAX_MINUTES,
  SCALE_STEP_MINUTES,
  scaleShare,
  stepMinutes,
} from "@/lib/rune2/timer";
import { useRevisionNotes } from "./RevisionNoteStore";
import { useRune2Selection } from "./Rune2Selection";
import { Tooltip } from "./Tooltip";

// Widgets: the shell's global glance surface. "How is my writing going?" —
// beside the Inspector ("What am I looking at?") and Revision Notes ("What
// must I remember while revising?"), and deliberately not a third right-hand
// drawer: it is opened from the tab band's far right (WidgetsControl), floats
// over the content from the top-right (WidgetsPanel), and closes to leave
// everything exactly as it was. Nothing beneath moves, remounts, navigates
// or saves because it opened: the editors keep their state, the panel keeps
// its view, the tabs keep their places.
//
// The board is the writer's, once, for every Project (lib/rune2/widgets.ts);
// what the widgets say is the current Project's. Values come from state the
// shell already holds — the manuscript read, the live word counts the
// editors report (liveWords.ts), the Revision Notes store — so opening is
// immediate; the two facts the shell doesn't hold (the goal, the latest
// Milestone) are read in parallel when the board opens, cached briefly per
// Project, and never on the save path. Widgets never block writing.
//
// Edit mode (inside the panel) rearranges the board: drag a widget (pointer
// or touch; the others shift as it goes), or focus its handle and use the
// arrow keys; remove one; choose Small or Wide where a widget allows both;
// add from the compact catalog underneath. No free placement, no resizing by
// hand, no custom data. Activity widgets are gated in the catalog and never
// offered (see lib/rune2/widgets.ts).

const FACTS_FRESH_MS = 30_000;

// ── Entry: the control in the tab band ───────────────────────────────────────

export function WidgetsControl() {
  const userId = useProfileStore((s) => s.profile?.id);
  const { manuscript, selected } = useRune2Selection();
  const projectId = manuscript.project.id;
  const button = useRef<HTMLButtonElement>(null);
  // Open: the shell element the panel is carried to (a portal), so it lies
  // over the whole frame rather than inside the tab band's own layout.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const open = host !== null;
  const panelId = useId();

  // The board: read from this device once the writer is known (adjusted
  // during render, so the first board shown is the remembered one), written
  // on every change.
  const [board, setBoard] = useState<{ userId: string | null; layout: WidgetLayout }>({
    userId: null,
    layout: DEFAULT_WIDGET_LAYOUT,
  });
  if (userId && board.userId !== userId) setBoard({ userId, layout: readStoredWidgetLayout(userId) });
  const layout = board.layout;
  const setLayout = useCallback(
    (next: WidgetLayout, persist = true) => {
      setBoard((prev) => ({ ...prev, layout: next }));
      if (persist && userId) writeStoredWidgetLayout(userId, next);
    },
    [userId]
  );

  // Recent: the objects opened in this Project, logged as they are opened
  // (device storage; the Recent widget reads the log when the board opens).
  useEffect(() => {
    if (!userId || !selected || !isSelectable(selected)) return;
    writeStoredRecent(userId, projectId, pushRecent(readStoredRecent(userId, projectId), selected.id));
  }, [userId, projectId, selected]);

  const close = useCallback((returnFocus: boolean) => {
    setHost(null);
    if (returnFocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  }, []);

  // The writing timer's mark on the control (lib/rune2/timer.ts; the Timer
  // widget below): a small dot while it runs; when it reaches zero, one
  // gentle attention in the warm completion tone and a dot that stays until
  // Widgets is opened — opening is the acknowledgement, whatever is looked
  // at inside. The writer is told of the finish itself by a quiet note
  // (TimerNotice.tsx); this mark is the trace it leaves. Never a sound,
  // never a dialog, never the editor's focus.
  const timer = useWritingTimer(userId ?? null);
  const timerMark = timer.state.status === "running" ? "running" : timer.state.status === "complete" && !timer.state.acknowledged ? "complete" : undefined;
  const show = () => {
    timer.acknowledge();
    setHost(button.current?.closest<HTMLElement>(".r2-shell") ?? button.current?.parentElement ?? null);
  };
  // Finished while the board is open: the writer is looking at it — seen (the note stays away).
  const { acknowledge, setDrawerOpen } = timer;
  const finishedUnseen = timer.state.status === "complete" && !timer.state.acknowledged;
  useEffect(() => {
    if (open && finishedUnseen) acknowledge();
  }, [open, finishedUnseen, acknowledge]);
  // The on-screen timer (TimerFloat.tsx) steps aside while the drawer is open: the widget is there.
  useEffect(() => {
    setDrawerOpen(open);
    return () => setDrawerOpen(false);
  }, [open, setDrawerOpen]);

  return (
    <>
      <Tooltip label={timerMark === "complete" ? "Widgets · Timer finished" : timerMark === "running" ? "Widgets · Timer running" : "Widgets"}>
        <button
          ref={button}
          type="button"
          className="r2-icon-button r2-tabs-widgets"
          aria-label="Widgets"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={timerMark ? `${panelId}-timer` : undefined}
          data-open={open || undefined}
          data-timer={timerMark}
          data-timer-finished={(timerMark === "complete" && timer.finishedHere) || undefined}
          onClick={() => (open ? close(false) : show())}
        >
          <LayoutGrid {...ICON} aria-hidden />
          {timerMark && <span className="r2-tabs-widgets-mark" aria-hidden />}
        </button>
      </Tooltip>
      {timerMark && (
        <span id={`${panelId}-timer`} className="sr-only">
          {timerMark === "complete" ? "Timer finished." : `Timer running, ${describeRemaining(remainingMs(timer.state, timer.now)).toLowerCase()}.`}
        </span>
      )}
      {host &&
        createPortal(
          <WidgetsPanel id={panelId} userId={userId ?? null} layout={layout} onLayout={setLayout} onClose={close} />,
          host
        )}
    </>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

const OWN_SURFACES = ".r2-widgets, .r2-tabs-widgets, .r2-menu, .r2-popover, .r2-dialog-backdrop, .r2-tooltip";

function WidgetsPanel({
  id,
  userId,
  layout,
  onLayout,
  onClose,
}: {
  id: string;
  userId: string | null;
  layout: WidgetLayout;
  onLayout: (next: WidgetLayout, persist?: boolean) => void;
  onClose: (returnFocus: boolean) => void;
}) {
  const { manuscript, index, selected } = useRune2Selection();
  // The Recent log as it stood when the board opened (opening a place closes the board).
  const [recent] = useState(() => (userId ? readStoredRecent(userId, manuscript.project.id) : []));
  const root = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  const titleId = `${id}-title`;
  const facts = useProjectFacts(manuscript.project.id);

  // Focus comes in on opening (the surface itself, so the first Tab lands on
  // its first control) and goes back to the Widgets control on closing.
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  // Non-modal: a press outside closes it, as does focus leaving it for the
  // page. Its own floating surfaces (a menu, a dialog, a tooltip) are its own.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(OWN_SURFACES)) return;
      onClose(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target || target.closest(OWN_SURFACES)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [onClose]);

  // Escape closes — from anywhere, since a control inside may have unmounted
  // under the keyboard (Done, Remove) — unless something inside handled it
  // (a field) or a dialog is over everything. In edit mode it ends editing.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".r2-dialog-backdrop, .r2-menu")) return;
      e.preventDefault();
      if (editing) setEditing(false);
      else onClose(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  // Entering or leaving edit mode replaces the foot's control under the
  // keyboard: the surface takes focus so the next Tab or Escape still works.
  const setEditMode = (on: boolean) => {
    setEditing(on);
    requestAnimationFrame(() => {
      if (!root.current?.contains(document.activeElement)) root.current?.focus({ preventScroll: true });
    });
  };

  const say = (message: string) => setAnnounce(message);

  const update = (next: WidgetLayout) => onLayout(next);
  const move = (widgetId: WidgetId, direction: "earlier" | "later") => {
    const next = moveWidget(layout, widgetId, direction);
    if (next === layout) return;
    update(next);
    const at = next.widgets.findIndex((w) => w.id === widgetId) + 1;
    say(`${widgetDefinition(widgetId).name} moved to position ${at} of ${next.widgets.length}.`);
  };
  const remove = (widgetId: WidgetId) => {
    update(removeWidget(layout, widgetId));
    say(`${widgetDefinition(widgetId).name} removed.`);
  };
  const add = (widgetId: WidgetId) => {
    update(addWidget(layout, widgetId));
    say(`${widgetDefinition(widgetId).name} added.`);
  };
  const resize = (widgetId: WidgetId, size: WidgetSize) => update(setWidgetSize(layout, widgetId, size));
  const display = (d: ActivityDisplay) => update(setActivityDisplay(layout, d));
  const { dailyGoal } = useRunePreferences();
  const goalEver = hasDailyGoalHistory(dailyGoal);

  const drag = useWidgetDrag(layout, (next, persist) => onLayout(next, persist));

  const additions = availableWidgets(layout);
  // A Recent with nothing to show is not a card worth looking at: shown only while editing.
  const shown = editing
    ? layout.widgets
    : layout.widgets.filter((w) => w.id !== "recent" || recentRows(recent, index, selected).length > 0);
  const empty = shown.length === 0;

  return (
    <>
      {/* Only drawn at narrow widths (rune2.css), where the board is a sheet. */}
      <div className="r2-widgets-scrim" aria-hidden onPointerDown={() => onClose(false)} />
      <div
        ref={root}
        id={id}
        className="r2-widgets"
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-editing={editing || undefined}
        data-dragging={drag.dragging || undefined}
      >
        <header className="r2-widgets-head">
          <div className="r2-widgets-heading">
            <h2 id={titleId}>Widgets</h2>
            <span className="r2-widgets-project">{manuscript.project.title}</span>
          </div>
          <Tooltip label="Close">
            <button type="button" className="r2-icon-button" aria-label="Close Widgets" onClick={() => onClose(true)}>
              <X {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </header>

        <div className="r2-widgets-body">
          {editing && (
            <p className="r2-widgets-hint" id={`${id}-hint`}>
              Drag a widget to arrange the board, or focus its handle and use the arrow keys.
            </p>
          )}
          {empty ? (
            <p className="r2-widgets-empty">
              {editing ? "Nothing on the board. Add a widget below." : "Nothing on the board."}
            </p>
          ) : (
            <ul className="r2-widget-grid" role="list" aria-label="Widgets on the board">
              {shown.map((placement, i) => (
                <WidgetCard
                  key={placement.id}
                  placement={placement}
                  index={i}
                  count={shown.length}
                  editing={editing}
                  dragging={drag.dragging === placement.id}
                  hintId={editing ? `${id}-hint` : undefined}
                  onMove={(d) => move(placement.id, d)}
                  onRemove={() => remove(placement.id)}
                  onResize={(s) => resize(placement.id, s)}
                  onDisplay={placement.id === "writingActivity" ? display : undefined}
                  displayAvailable={goalEver}
                  onDragStart={(e) => drag.start(e, placement.id)}
                >
                  <WidgetBody placement={placement} facts={facts} recent={recent} onClose={onClose} />
                </WidgetCard>
              ))}
            </ul>
          )}

          {editing && (
            <section className="r2-widgets-catalog" aria-labelledby={`${id}-add`}>
              <h3 id={`${id}-add`} className="r2-label">
                Add a widget
              </h3>
              {additions.length === 0 ? (
                <p className="r2-widgets-empty">Everything is on the board.</p>
              ) : (
                <ul role="list">
                  {(["project", "writing", "activity"] as WidgetGroup[]).map((group) => {
                    const rows = additions.filter((w) => w.group === group);
                    if (rows.length === 0) return null;
                    return (
                      <li key={group} className="r2-widgets-catalog-group">
                        <span className="r2-widgets-catalog-section">{WIDGET_GROUP_LABEL[group]}</span>
                        <ul role="list">
                          {rows.map((w) => (
                            <li key={w.id}>
                              <button type="button" className="r2-widgets-catalog-item" onClick={() => add(w.id)}>
                                <span className="r2-widgets-catalog-preview" aria-hidden>
                                  <WidgetPreview id={w.id} />
                                </span>
                                <span className="r2-widgets-catalog-text">
                                  <span className="r2-widgets-catalog-name">{w.name}</span>
                                  <span className="r2-widgets-catalog-desc">{w.description}</span>
                                </span>
                                <span className="r2-widgets-catalog-sizes" aria-label={`Sizes: ${w.sizes.join(", ")}`}>
                                  {w.sizes.map((s) => (
                                    <span key={s} className="r2-widgets-size-mark" data-size={s} aria-hidden />
                                  ))}
                                </span>
                                <span className="r2-widgets-catalog-add">Add</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <footer className="r2-widgets-foot">
          {editing ? (
            <>
              <button
                type="button"
                className="r2-widgets-link"
                onClick={() => {
                  update(DEFAULT_WIDGET_LAYOUT);
                  say("The default board is back.");
                }}
              >
                Restore default board
              </button>
              <button type="button" className="r2-button" onClick={() => setEditMode(false)}>
                Done
              </button>
            </>
          ) : (
            <button type="button" className="r2-widgets-link" onClick={() => setEditMode(true)}>
              Edit widgets
            </button>
          )}
        </footer>
        <span role="status" className="sr-only">
          {announce}
        </span>
      </div>
    </>
  );
}

// ── Drag to arrange ──────────────────────────────────────────────────────────
// Pointer events (so mouse, pen and touch are one path): the widget under
// the pointer gives its place to the one being dragged, live, and the board
// is written once the pointer lifts. After each shift the pointer must move a
// little before another is considered, so two widgets of different sizes
// never trade places back and forth under a still hand.

const SHIFT_SETTLE_PX = 24;

function useWidgetDrag(layout: WidgetLayout, onLayout: (next: WidgetLayout, persist: boolean) => void) {
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const live = useRef(layout);
  useEffect(() => {
    live.current = layout;
  }, [layout]);
  const state = useRef<{ id: WidgetId; pointerId: number; settledAt: { x: number; y: number } | null } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (s.settledAt && Math.hypot(e.clientX - s.settledAt.x, e.clientY - s.settledAt.y) < SHIFT_SETTLE_PX) return;
      const under = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((el) => (el as HTMLElement).closest<HTMLElement>(".r2-widget[data-widget]"))
        .find((el): el is HTMLElement => el !== null && el !== undefined);
      if (!under) return;
      const overId = under.dataset.widget as WidgetId;
      if (overId === s.id) return;
      const to = live.current.widgets.findIndex((w) => w.id === overId);
      if (to === -1) return;
      const next = reorderWidget(live.current, s.id, to);
      if (next === live.current) return;
      s.settledAt = { x: e.clientX, y: e.clientY };
      onLayout(next, false);
    };
    const end = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      state.current = null;
      setDragging(null);
      onLayout(live.current, true);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
  }, [dragging, onLayout]);

  const start = useCallback((e: ReactPointerEvent<HTMLElement>, id: WidgetId) => {
    if (e.button !== 0) return;
    // (No preventDefault: the handle must still take focus, for the keyboard
    // after a press; the card's user-select: none keeps text from selecting.)
    state.current = { id, pointerId: e.pointerId, settledAt: null };
    setDragging(id);
  }, []);

  return { dragging, start };
}

// ── A widget's card ──────────────────────────────────────────────────────────

function WidgetCard({
  placement,
  index,
  count,
  editing,
  dragging,
  hintId,
  onMove,
  onRemove,
  onResize,
  onDisplay,
  displayAvailable = true,
  onDragStart,
  children,
}: {
  placement: WidgetPlacement;
  index: number;
  count: number;
  editing: boolean;
  dragging: boolean;
  hintId?: string;
  onMove: (direction: "earlier" | "later") => void;
  onRemove: () => void;
  onResize: (size: WidgetSize) => void;
  /** The Writing Activity calendar's display (only it has one). */
  onDisplay?: (display: ActivityDisplay) => void;
  /** Whether "Goal completion" can be chosen: a daily goal has existed. */
  displayAvailable?: boolean;
  onDragStart: (e: ReactPointerEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const def = widgetDefinition(placement.id);
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        onMove("earlier");
        break;
      case "ArrowRight":
      case "ArrowDown":
        onMove("later");
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  // In edit mode the card's own surface drags too; its controls keep their work.
  const onCardPointerDown = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!editing) return;
    if ((e.target as Element).closest("button, input, a")) return;
    onDragStart(e);
  };

  return (
    <li
      className="r2-widget"
      data-widget={placement.id}
      data-size={placement.size}
      data-dragging={dragging || undefined}
      aria-label={editing ? `${def.name}, position ${index + 1} of ${count}` : undefined}
      onPointerDown={onCardPointerDown}
    >
      {editing && (
        <div className="r2-widget-edit">
          <button
            type="button"
            className="r2-widget-handle"
            aria-label={`Move ${def.name}`}
            aria-describedby={hintId}
            onPointerDown={(e) => {
              onDragStart(e);
              // Pressed, it holds the keyboard too (not every browser focuses a pressed button).
              e.currentTarget.focus({ preventScroll: true });
            }}
            onKeyDown={onHandleKey}
          >
            <GripVertical {...ICON} aria-hidden />
          </button>
          <span className="r2-widget-edit-space" aria-hidden />
          {onDisplay && (
            <Tooltip label={displayAvailable ? null : "Set a daily goal first"} describes>
              <span className="r2-widget-sizes" role="group" aria-label="Writing activity shows">
                {(["words", "goal"] as ActivityDisplay[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="r2-widget-size"
                    aria-pressed={activityDisplayOf(placement) === d}
                    disabled={d === "goal" && !displayAvailable}
                    onClick={() => onDisplay(d)}
                  >
                    {d === "words" ? "Words" : "Goal"}
                  </button>
                ))}
              </span>
            </Tooltip>
          )}
          {def.sizes.length > 1 && (
            <span className="r2-widget-sizes" role="group" aria-label={`${def.name} size`}>
              {def.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="r2-widget-size"
                  aria-pressed={placement.size === s}
                  onClick={() => onResize(s)}
                >
                  {s === "small" ? "Small" : "Wide"}
                </button>
              ))}
            </span>
          )}
          <Tooltip label="Remove">
            <button
              type="button"
              className="r2-icon-button r2-icon-button--xs r2-widget-remove"
              aria-label={`Remove ${def.name}`}
              onClick={onRemove}
            >
              <X {...ICON_SM} aria-hidden />
            </button>
          </Tooltip>
        </div>
      )}
      <div className="r2-widget-content" inert={editing || undefined}>
        {children}
      </div>
    </li>
  );
}

// ── The widgets ──────────────────────────────────────────────────────────────

type ProjectFacts = {
  goal: { id: string; target: number } | null | undefined;
  milestone: MilestoneSummary | null | undefined;
  goalFailed: boolean;
  milestoneFailed: boolean;
};

// The facts, by Project, outside React: read when a board opens, kept
// briefly, and shared by every board opened since — the panel subscribes.
const factsCache = new Map<string, { facts: ProjectFacts; at: number }>();
const factsListeners = new Set<() => void>();
const LOADING: ProjectFacts = { goal: undefined, milestone: undefined, goalFailed: false, milestoneFailed: false };

function setCachedFacts(projectId: string, facts: ProjectFacts) {
  factsCache.set(projectId, { facts, at: Date.now() });
  for (const fn of factsListeners) fn();
}
const subscribeFacts = (fn: () => void) => {
  factsListeners.add(fn);
  return () => {
    factsListeners.delete(fn);
  };
};

async function loadGoal(projectId: string): Promise<{ goal: { id: string; target: number } | null; failed: boolean }> {
  const { data, error } = await createClient()
    .from("writing_goals")
    .select("id, target_words")
    .eq("project_id", projectId)
    .eq("type", "project_total")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { goal: null, failed: true };
  return { goal: data ? { id: data.id as string, target: data.target_words as number } : null, failed: false };
}

async function loadFacts(projectId: string): Promise<void> {
  try {
    const [g, m] = await Promise.all([
      loadGoal(projectId),
      listManuscriptMilestones(projectId).catch(() => ({ data: null, error: "failed" })),
    ]);
    setCachedFacts(projectId, {
      goal: g.goal,
      goalFailed: g.failed,
      milestone: m.error === null ? (m.data[0] ?? null) : null,
      milestoneFailed: m.error !== null,
    });
  } catch {
    // Offline, or the read threw: the widgets say so rather than wait forever.
    setCachedFacts(projectId, { goal: null, goalFailed: true, milestone: null, milestoneFailed: true });
  }
}

/**
 * The two Project facts the shell doesn't already hold — the goal and the
 * latest Milestone — read together when the board opens, kept briefly per
 * Project so reopening is immediate, and read again once that has aged.
 * Switching Projects never shows another Project's values: the cache is by
 * Project, and until this one's arrive the widgets show their loading state.
 */
function useProjectFacts(projectId: string): ProjectFacts & { setGoal: (goal: ProjectFacts["goal"]) => void } {
  const facts = useSyncExternalStore(
    subscribeFacts,
    () => factsCache.get(projectId)?.facts ?? LOADING,
    () => LOADING
  );
  useEffect(() => {
    const cached = factsCache.get(projectId);
    if (cached && Date.now() - cached.at < FACTS_FRESH_MS) return;
    void loadFacts(projectId);
  }, [projectId]);
  const setGoal = useCallback(
    (goal: ProjectFacts["goal"]) => {
      const current = factsCache.get(projectId)?.facts ?? LOADING;
      setCachedFacts(projectId, { ...current, goal, goalFailed: false });
    },
    [projectId]
  );
  return { ...facts, setGoal };
}

/**
 * The ordered manuscript's words as they stand this moment: the server's
 * total, with each open placed Scene's live count in place of its stored one.
 * The same arithmetic the document status does, over the whole manuscript.
 * Unplaced Scenes are not in it (they are never in the ordered total).
 */
function useProjectWords(): number {
  const { manuscript, index } = useRune2Selection();
  const live = useLiveWords();
  return useMemo(() => {
    let total = manuscript.manuscriptWords;
    for (const [id, words] of live) {
      const entry = index.get(id);
      if (entry?.kind === "scene") total += words - entry.words;
    }
    return total;
  }, [manuscript.manuscriptWords, index, live]);
}

function WidgetBody({
  placement,
  facts,
  recent,
  onClose,
}: {
  placement: WidgetPlacement;
  facts: ReturnType<typeof useProjectFacts>;
  recent: string[];
  onClose: (returnFocus: boolean) => void;
}) {
  const { id, size } = placement;
  switch (id) {
    case "projectWords":
      return <ProjectWordsWidget size={size} onClose={onClose} />;
    case "currentScene":
      return <CurrentSceneWidget size={size} onClose={onClose} />;
    case "goal":
      return <GoalWidget size={size} facts={facts} />;
    case "revisionNotes":
      return <RevisionNotesWidget onClose={onClose} />;
    case "milestone":
      return <MilestoneWidget size={size} facts={facts} onClose={onClose} />;
    case "recent":
      return <RecentWidget recent={recent} onClose={onClose} />;
    case "todayWords":
      return <TodayWordsWidget size={size} />;
    case "writingStreak":
      return <StreakWidget />;
    case "dailyGoal":
      return <DailyGoalWidget size={size} />;
    case "writingActivity":
      return <ActivityWidget display={activityDisplayOf(placement)} />;
    case "timer":
      return <TimerWidget size={size} />;
    default:
      return null;
  }
}

/** The glanceable face shared by the widgets: an eyebrow, the value, a quiet line under it. */
function Face({
  eyebrow,
  value,
  unit,
  meta,
  children,
}: {
  eyebrow: string;
  value: ReactNode;
  unit?: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="r2-widget-eyebrow">{eyebrow}</span>
      <span className="r2-widget-value">
        {value}
        {unit && <span className="r2-widget-unit"> {unit}</span>}
      </span>
      {meta && <span className="r2-widget-meta">{meta}</span>}
      {children}
    </>
  );
}

function Skeleton({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="r2-widget-face">
      <span className="r2-widget-eyebrow">{eyebrow}</span>
      <span className="r2-widget-skeleton" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}

const n = (v: number) => v.toLocaleString();
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

function ProjectWordsWidget({ size, onClose }: { size: WidgetSize; onClose: (returnFocus: boolean) => void }) {
  const { manuscript, select } = useRune2Selection();
  const words = useProjectWords();
  const meta =
    size === "wide"
      ? [plural(manuscript.chapterCount, "chapter"), plural(manuscript.placedSceneCount, "scene"), manuscript.unplacedWords > 0 ? `${n(manuscript.unplacedWords)} unplaced` : null]
          .filter(Boolean)
          .join(" · ")
      : plural(manuscript.chapterCount, "chapter");
  return (
    <button
      type="button"
      className="r2-widget-face r2-widget-face--action"
      aria-label={`Project words: ${plural(words, "word")}. Open the Manuscript.`}
      onClick={() => {
        select(null);
        onClose(false);
      }}
    >
      <Face eyebrow="Project" value={n(words)} unit="words" meta={meta} />
    </button>
  );
}

const KIND_LABEL: Record<NavKind, string> = {
  group: "Group",
  chapter: "Chapter",
  scene: "Scene",
  unplacedScene: "Unplaced Scene",
  workspacePage: "Page",
  workspaceFolder: "Folder",
  workspaceCollection: "Collection",
  collectionEntry: "Entry",
  workspaceCanvas: "Canvas",
};

function CurrentSceneWidget({ size, onClose }: { size: WidgetSize; onClose: (returnFocus: boolean) => void }) {
  const { manuscript, selected, index, select, requestSceneFocus } = useRune2Selection();
  const live = useLiveWords();
  const target =
    selected && (selected.kind === "scene" || selected.kind === "unplacedScene" || selected.kind === "chapter") ? selected : null;

  if (!target) {
    // No Scene open: the manuscript itself is the context.
    return (
      <button
        type="button"
        className="r2-widget-face r2-widget-face--action"
        aria-label="No scene open. Open the Manuscript."
        onClick={() => {
          select(null);
          onClose(false);
        }}
      >
        <Face
          eyebrow="Manuscript"
          value={plural(manuscript.chapterCount, "chapter")}
          meta={size === "wide" ? `${plural(manuscript.placedSceneCount, "scene")} · no scene open` : "No scene open"}
        />
      </button>
    );
  }

  const words =
    target.kind === "chapter"
      ? (target.sceneIds ?? []).reduce((sum, sid) => sum + (live.get(sid) ?? index.get(sid)?.words ?? 0), 0)
      : (live.get(target.id) ?? target.words);
  const chapter = target.kind === "scene" ? target.path[target.path.length - 1]?.title : null;
  const eyebrow = target.kind === "chapter" ? "Current chapter" : "Current scene";
  const where = target.kind === "unplacedScene" ? "Unplaced" : chapter;
  const meta = [plural(words, "word"), size === "wide" || !target.named ? where : null].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="r2-widget-face r2-widget-face--action"
      aria-label={`${eyebrow}: ${target.title}, ${plural(words, "word")}. Go to it.`}
      onClick={() => {
        select(target.id);
        if (target.kind !== "chapter") requestSceneFocus(target.id);
        onClose(false);
      }}
    >
      <Face eyebrow={eyebrow} value={<span className="r2-widget-title">{target.title}</span>} meta={meta} />
    </button>
  );
}

function GoalWidget({ size, facts }: { size: WidgetSize; facts: ReturnType<typeof useProjectFacts> }) {
  const { manuscript } = useRune2Selection();
  const words = useProjectWords();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const fieldId = useId();

  if (facts.goal === undefined) return <Skeleton eyebrow="Goal" />;
  if (facts.goalFailed) {
    return (
      <div className="r2-widget-face">
        <Face eyebrow="Goal" value={<span className="r2-widget-quiet">Couldn’t be read</span>} meta="Check your connection." />
      </div>
    );
  }
  const goal = facts.goal;

  const begin = () => {
    setDraft(goal ? String(goal.target) : "");
    setError(null);
    setEditing(true);
  };
  const finish = () => {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const checked = parseGoalTarget(draft);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    startSaving(async () => {
      let id: string | null = null;
      let failure: string | null = null;
      if (goal) {
        const r = await updateGoal(goal.id, checked.target);
        failure = r.error;
        id = goal.id;
      } else {
        const r = await createGoal("project_total", checked.target, manuscript.project.id);
        failure = r.error;
        id = r.data?.id ?? null;
      }
      if (failure !== null || id === null) {
        setError(
          failure === "This manuscript already has a goal."
            ? "This manuscript already has a goal — reopen Widgets to see it."
            : "The goal couldn’t be saved. Try again."
        );
        return;
      }
      facts.setGoal({ id, target: checked.target });
      finish();
    });
  };
  const remove = () => {
    if (!goal) return;
    startSaving(async () => {
      const r = await deleteGoal(goal.id);
      if (r.error) {
        setError("The goal couldn’t be removed. Try again.");
        return;
      }
      facts.setGoal(null);
      finish();
    });
  };

  if (editing) {
    return (
      <form className="r2-widget-face r2-widget-goal-form" onSubmit={submit}>
        <label className="r2-widget-eyebrow" htmlFor={fieldId}>
          {goal ? "Edit goal" : "Set a goal"}
        </label>
        <div className="r2-widget-goal-row">
          <input
            id={fieldId}
            className="r2-field r2-field--sm"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={draft}
            placeholder="80,000"
            aria-describedby={error ? `${fieldId}-error` : undefined}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                finish();
              }
            }}
            disabled={saving}
          />
          <span className="r2-widget-unit">words</span>
        </div>
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="r2-widget-error">
            {error}
          </p>
        )}
        <div className="r2-widget-goal-actions">
          <button type="submit" className="r2-button r2-button--primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="r2-button" onClick={finish} disabled={saving}>
            Cancel
          </button>
          {goal && (
            <button type="button" className="r2-widgets-link r2-widget-goal-remove" onClick={remove} disabled={saving}>
              Remove goal
            </button>
          )}
        </div>
      </form>
    );
  }

  if (!goal) {
    return (
      <button ref={editRef} type="button" className="r2-widget-face r2-widget-face--action" onClick={begin}>
        <Face eyebrow="Goal" value={<span className="r2-widget-quiet">Set a project goal</span>} meta="Words to finish this manuscript." />
      </button>
    );
  }

  const p = goalProgress(words, goal.target);
  const reached = words >= goal.target;
  const meta = reached
    ? `Goal reached · ${n(words - goal.target)} over`
    : size === "wide"
      ? `${p.percent}% · ${n(p.remaining)} to go`
      : `${p.percent}%`;
  return (
    <div className="r2-widget-face r2-widget-face--goal">
      <span className="r2-widget-eyebrow-row">
        <span className="r2-widget-eyebrow">Goal</span>
        <button ref={editRef} type="button" className="r2-widget-aside" aria-label="Edit goal" onClick={begin}>
          Edit
        </button>
      </span>
      <span className="r2-widget-value">
        {n(words)}
        <span className="r2-widget-unit"> / {n(goal.target)}</span>
      </span>
      <span
        className="r2-widget-progress"
        role="progressbar"
        aria-label="Progress toward the goal"
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={Math.min(words, goal.target)}
        aria-valuetext={`${n(words)} of ${n(goal.target)} words, ${p.percent} percent`}
        data-reached={reached || undefined}
      >
        <span className="r2-widget-progress-fill" style={{ width: `${p.share * 100}%` }} />
      </span>
      <span className="r2-widget-meta">{meta}</span>
    </div>
  );
}

function RevisionNotesWidget({ onClose }: { onClose: (returnFocus: boolean) => void }) {
  const { selected, panel, togglePanel } = useRune2Selection();
  const store = useRevisionNotes();
  const open = () => {
    if (panel !== "notes") togglePanel("notes");
    onClose(false);
  };
  if (!store.available) {
    return (
      <div className="r2-widget-face">
        <Face eyebrow="Revision Notes" value={<span className="r2-widget-quiet">Not available</span>} />
      </div>
    );
  }
  if (!store.loaded && !store.loadFailed) return <Skeleton eyebrow="Revision Notes" />;
  const openNotes = store.notes.filter((note) => !note.resolved && note.pending !== "missing");
  const here = selected ? openNotes.filter((note) => note.target_id === selected.id).length : 0;
  const meta = openNotes.length === 0 ? "Nothing waiting" : selected && here > 0 ? `${here} on this ${KIND_LABEL[selected.kind].toLowerCase()}` : "Across the manuscript";
  return (
    <button
      type="button"
      className="r2-widget-face r2-widget-face--action"
      aria-label={`Revision notes: ${plural(openNotes.length, "open note")}. Open Revision Notes.`}
      onClick={open}
    >
      <Face eyebrow="Revision Notes" value={n(openNotes.length)} unit="open" meta={meta} />
    </button>
  );
}

function MilestoneWidget({
  size,
  facts,
  onClose,
}: {
  size: WidgetSize;
  facts: ReturnType<typeof useProjectFacts>;
  onClose: (returnFocus: boolean) => void;
}) {
  const { select, panel, togglePanel } = useRune2Selection();
  const words = useProjectWords();
  const open = () => {
    // Milestones live in the Manuscript's Inspector.
    select(null);
    if (panel !== "inspector") togglePanel("inspector");
    onClose(false);
  };
  if (facts.milestone === undefined) return <Skeleton eyebrow="Milestone" />;
  if (facts.milestoneFailed) {
    return (
      <div className="r2-widget-face">
        <Face eyebrow="Milestone" value={<span className="r2-widget-quiet">Couldn’t be read</span>} meta="Check your connection." />
      </div>
    );
  }
  const m = facts.milestone;
  if (!m) {
    return (
      <button type="button" className="r2-widget-face r2-widget-face--action" onClick={open}>
        <Face eyebrow="Milestone" value={<span className="r2-widget-quiet">None yet</span>} meta="Save one in the Manuscript’s Inspector." />
      </button>
    );
  }
  const since = words - m.manuscript_words;
  const meta =
    size === "wide"
      ? `${historyTime(m.created_at)} · ${wordsLabel(m.manuscript_words)} · ${since >= 0 ? `${n(since)} since` : `${n(-since)} fewer since`}`
      : historyTime(m.created_at);
  return (
    <button
      type="button"
      className="r2-widget-face r2-widget-face--action"
      aria-label={`Latest milestone: ${m.name}, ${historyTime(m.created_at)}. Open Milestones.`}
      onClick={open}
    >
      <Face eyebrow="Milestone" value={<span className="r2-widget-title">{m.name}</span>} meta={meta} />
    </button>
  );
}

const RECENT_SHOWN = 4;

/** The Recent rows: the log's objects that still exist, other than the one in view. */
function recentRows(recent: readonly string[], index: ReadonlyMap<string, NavEntry>, selected: NavEntry | null): NavEntry[] {
  return recent
    .map((id) => index.get(id))
    .filter((e): e is NavEntry => e !== undefined && isSelectable(e) && e.id !== selected?.id)
    .slice(0, RECENT_SHOWN);
}

function RecentWidget({ recent, onClose }: { recent: string[]; onClose: (returnFocus: boolean) => void }) {
  const { index, selected, select, openInNewTab } = useRune2Selection();
  const rows = recentRows(recent, index, selected);
  if (rows.length === 0) {
    // Only in edit mode (the board hides an empty Recent otherwise): kept placeable.
    return (
      <div className="r2-widget-face">
        <Face eyebrow="Recent" value={<span className="r2-widget-quiet">Places you open gather here</span>} />
      </div>
    );
  }
  return (
    <div className="r2-widget-face r2-widget-face--list">
      <span className="r2-widget-eyebrow">Recent</span>
      <ul className="r2-widget-list" role="list">
        {rows.map((entry) => {
          const context =
            entry.kind === "scene"
              ? entry.path[entry.path.length - 1]?.title
              : entry.kind === "unplacedScene"
                ? "Unplaced"
                : isWorkspaceKind(entry.kind)
                  ? (entry.path[entry.path.length - 1]?.title ?? "Workspace")
                  : (entry.path[entry.path.length - 1]?.title ?? "Manuscript");
          return (
            <li key={entry.id}>
              <button
                type="button"
                className="r2-widget-row"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) openInNewTab(entry.id);
                  else select(entry.id);
                  onClose(false);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    openInNewTab(entry.id);
                    onClose(false);
                  }
                }}
              >
                <span className="r2-widget-row-kind">{KIND_LABEL[entry.kind]}</span>
                <span className="r2-widget-row-title">{entry.title}</span>
                {context && <span className="r2-widget-row-context">{context}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Writing activity ─────────────────────────────────────────────────────────
// Today's Words, the Writing Streak and the Writing Activity calendar, over
// the credit ledger (lib/rune2/writingActivity.ts has the rules). One read
// per Project when the board opens (readWritingActivity), kept briefly, and
// read again once the offline queue has replayed; between reads, the credits
// this tab has made (writingCreditLog.ts) are added on top — so Today moves
// with each save, with no request per keystroke, and a credit queued offline
// shows at once. Nothing here is XP, a level, an unlockable or Arena.

type ActivityFacts = { read: WritingActivityRead; today: string; at: number };

const activityCache = new Map<string, ActivityFacts>();
const activityListeners = new Set<() => void>();
const ACTIVITY_FRESH_MS = 30_000;

function setActivity(projectId: string, facts: ActivityFacts | null) {
  if (facts) activityCache.set(projectId, facts);
  else activityCache.delete(projectId);
  for (const fn of activityListeners) fn();
}
const subscribeActivity = (fn: () => void) => {
  activityListeners.add(fn);
  return () => {
    activityListeners.delete(fn);
  };
};

async function loadActivity(projectId: string): Promise<void> {
  const today = getLocalDateString();
  const at = Date.now();
  let r: Awaited<ReturnType<typeof readWritingActivity>>;
  try {
    r = await readWritingActivity(projectId, today);
  } catch {
    r = { data: null, error: "failed" };
  }
  if (r.error !== null) {
    // Offline or refused: what was read before stands, with the credits logged since.
    if (!activityCache.has(projectId)) setActivity(projectId, { read: { todayProject: 0, days: [], writingDates: [] }, today, at: 0 });
    return;
  }
  setActivity(projectId, { read: r.data, today, at });
  // Credits sent online before this read are in it; a queued one stays until the queue lets it go.
  let queued = new Set<string>();
  try {
    queued = new Set((await (await getOfflineDB()).getAll("pending_writing_credits")).map((c) => c.id));
  } catch {
    // Without the device store there is nothing queued to keep.
  }
  reconcileWritingCredits(at, (id) => queued.has(id));
}

type WritingActivityView = {
  /** Loaded at least once (a failed first read answers zeros, flagged). */
  loaded: boolean;
  failed: boolean;
  today: string;
  todayProject: number;
  /** Today's credited words across every Project (the Daily Goal's measure). */
  todayAll: number;
  streak: { current: number; best: number };
  calendar: ReturnType<typeof activityCalendar>;
};

function useWritingActivity(projectId: string): WritingActivityView {
  const facts = useSyncExternalStore(
    subscribeActivity,
    () => activityCache.get(projectId) ?? null,
    () => null
  );
  const logged = useLoggedWritingCredits();
  const { dailyGoal } = useRunePreferences();

  useEffect(() => {
    const cached = activityCache.get(projectId);
    const today = getLocalDateString();
    if (cached && cached.at > 0 && cached.today === today && Date.now() - cached.at < ACTIVITY_FRESH_MS) return;
    void loadActivity(projectId);
  }, [projectId]);

  // The offline queue has replayed (or a save confirmed): read again soon.
  useEffect(() => {
    const onQueue = () => {
      const cached = activityCache.get(projectId);
      if (cached) activityCache.set(projectId, { ...cached, at: 0 });
      void loadActivity(projectId);
    };
    window.addEventListener("rune-sync-queue-updated", onQueue);
    return () => window.removeEventListener("rune-sync-queue-updated", onQueue);
  }, [projectId]);

  return useMemo(() => {
    const today = getLocalDateString();
    const read = facts?.read ?? { todayProject: 0, days: [], writingDates: [] };
    const extra = logged.map((c) => ({ date: c.date, words: c.words, projectId: c.projectId }));
    const todayProject =
      read.todayProject + extra.filter((c) => c.projectId === projectId && c.date === today).reduce((n, c) => n + c.words, 0);
    const rows = [...read.days, ...extra];
    const window = daysEnding(today, ACTIVITY_WEEKS * 7);
    const days = dailyTotals(rows, window);
    const writingDates = [...read.writingDates, ...extra.map((c) => c.date)];
    return {
      loaded: facts !== null,
      failed: facts !== null && facts.at === 0,
      today,
      todayProject,
      todayAll: days[days.length - 1]?.words ?? 0,
      streak: writingStreak(writingDates, today),
      calendar: activityCalendar(days, today, ACTIVITY_WEEKS, dailyGoal),
    };
  }, [facts, logged, projectId, dailyGoal]);
}

function TodayWordsWidget({ size }: { size: WidgetSize }) {
  const { manuscript } = useRune2Selection();
  const a = useWritingActivity(manuscript.project.id);
  if (!a.loaded) return <Skeleton eyebrow="Today" />;
  const meta = a.failed
    ? "Couldn’t be read · check your connection"
    : a.todayProject === 0
      ? "Nothing yet today"
      : size === "wide"
        ? `Written today in ${manuscript.project.title}`
        : "This project";
  return (
    <div className="r2-widget-face" aria-label={`Today's words: ${plural(a.todayProject, "word")} in this project.`}>
      <Face eyebrow="Today" value={n(a.todayProject)} unit="words" meta={meta} />
    </div>
  );
}

function StreakWidget() {
  const { manuscript } = useRune2Selection();
  const a = useWritingActivity(manuscript.project.id);
  if (!a.loaded) return <Skeleton eyebrow="Streak" />;
  const { current, best } = a.streak;
  const meta = a.failed ? "Couldn’t be read" : best > current ? `Best ${plural(best, "day")}` : current > 0 ? "All projects" : "No writing yet";
  return (
    <div className="r2-widget-face" aria-label={`Writing streak: ${plural(current, "day")}.${best > 0 ? ` Best ${plural(best, "day")}.` : ""}`}>
      <Face eyebrow="Streak" value={n(current)} unit={current === 1 ? "day" : "days"} meta={meta} />
    </div>
  );
}

function ActivityWidget({ display }: { display: ActivityDisplay }) {
  const { manuscript } = useRune2Selection();
  const a = useWritingActivity(manuscript.project.id);
  const { dailyGoal } = useRunePreferences();
  if (!a.loaded) return <Skeleton eyebrow="Writing activity" />;
  // Goal completion needs a goal to have existed; without one the calendar shows words.
  const mode: ActivityDisplay = display === "goal" && hasDailyGoalHistory(dailyGoal) ? "goal" : "words";
  const cells = a.calendar.flatMap((w) => w.cells);
  const written = cells.filter((c) => c.words > 0).length;
  const hit = cells.filter((c) => c.goal?.hit).length;
  const meta = a.failed
    ? "Couldn’t be read"
    : written === 0
      ? "The last sixteen weeks · days you write will show here"
      : mode === "goal"
        ? `${plural(hit, "day")} at goal · ${plural(written, "writing day")} in the last sixteen weeks`
        : `${plural(written, "writing day")} in the last sixteen weeks · all projects`;
  return (
    <div className="r2-widget-face r2-widget-face--activity">
      <span className="r2-widget-eyebrow">Writing activity</span>
      <ActivityGrid calendar={a.calendar} mode={mode} />
      <span className="r2-widget-meta">{meta}</span>
    </div>
  );
}

/** What a day's cell says: its words, and against a goal, how it stood. */
function dayLabel(cell: { date: string; words: number; goal: { target: number; hit: boolean } | null }, mode: ActivityDisplay): string {
  const day = shortDate(cell.date);
  if (mode !== "goal") return `${day} · ${cell.words === 0 ? "no words" : plural(cell.words, "word")}`;
  if (!cell.goal) return `${day} · ${cell.words === 0 ? "no words" : plural(cell.words, "word")} · No daily goal`;
  const stood = `${n(cell.words)} of ${plural(cell.goal.target, "word")}`;
  return cell.goal.hit ? `${day} · ${stood} · Goal reached` : `${day} · ${stood}`;
}

/**
 * The calendar: a column a week, a cell a day, Monday at the top. Each cell
 * is a focusable item that says its day and words (the tooltip and the
 * accessible name), so the exact number is never only a shade. Months are
 * named over the week they begin in.
 */
function ActivityGrid({ calendar, mode }: { calendar: ReturnType<typeof activityCalendar>; mode: ActivityDisplay }) {
  return (
    <div
      className="r2-activity"
      role="group"
      aria-label={mode === "goal" ? "Writing activity against the daily goal, the last sixteen weeks" : "Writing activity, the last sixteen weeks"}
      data-mode={mode}
    >
      <div className="r2-activity-months" aria-hidden>
        {calendar.map((week, i) => (
          <span key={i} className="r2-activity-month">
            {week.month && (i === 0 || calendar[i - 1].month !== week.month) && (i < calendar.length - 1 || week.cells.length > 3)
              ? shortMonth(week.month)
              : ""}
          </span>
        ))}
      </div>
      <ul className="r2-activity-weeks" role="list">
        {calendar.map((week, i) => (
          <li key={i} className="r2-activity-week">
            {week.cells.map((cell) => {
              const label = dayLabel(cell, mode);
              // Against a goal: a reached day is the success tone with a tiny
              // check; a day under its goal keeps a quiet accent (at most the
              // second wash, so reached days stand apart); a day with no goal
              // reads as words.
              const goal = mode === "goal" ? (cell.goal ? (cell.goal.hit ? "hit" : cell.words > 0 ? "under" : "none") : "nogoal") : undefined;
              const level = goal === "under" ? Math.min(cell.level, 2) : cell.level;
              return (
                <Tooltip key={cell.date} label={label} placement="top">
                  <span
                    className="r2-activity-day"
                    data-level={level}
                    data-goal={goal}
                    tabIndex={0}
                    role="img"
                    aria-label={label}
                  >
                    {goal === "hit" && <Check className="r2-activity-check" size={9} strokeWidth={3} aria-hidden />}
                  </span>
                </Tooltip>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Catalog previews ─────────────────────────────────────────────────────────
// A miniature of each widget's face, so the catalog shows what it offers.

const PREVIEW_LEVELS: ActivityLevel[][] = [
  [0, 1, 0, 2, 1, 0, 0],
  [1, 2, 3, 0, 1, 2, 0],
  [0, 3, 4, 2, 0, 1, 1],
  [2, 1, 0, 3, 2, 0, 0],
  [1, 0, 2, 4, 3, 1, 0],
  [0, 2, 1, 0, 2, 3, 1],
];

function WidgetPreview({ id }: { id: WidgetId }) {
  switch (id) {
    case "projectWords":
      return <Mini eyebrow="Project" value="41,208" unit="words" />;
    case "todayWords":
      return <Mini eyebrow="Today" value="642" unit="words" />;
    case "writingStreak":
      return <Mini eyebrow="Streak" value="6" unit="days" />;
    case "dailyGoal":
      return (
        <Mini eyebrow="Daily goal" value="424" unit="/ 750">
          <span className="r2-ring r2-ring--mini" aria-hidden>
            <Ring share={424 / 750} size={18} stroke={2.5} />
          </span>
        </Mini>
      );
    case "goal":
      return (
        <Mini eyebrow="Goal" value="41,208" unit="/ 80,000">
          <span className="r2-widget-progress r2-widget-progress--mini">
            <span className="r2-widget-progress-fill" style={{ width: "52%" }} />
          </span>
        </Mini>
      );
    case "revisionNotes":
      return <Mini eyebrow="Revision Notes" value="4" unit="open" />;
    case "milestone":
      return <Mini eyebrow="Milestone" value="First draft" />;
    case "currentScene":
      return <Mini eyebrow="Current scene" value="The ferry" />;
    case "recent":
      return <Mini eyebrow="Recent" value="Mara · Locations" />;
    case "timer":
      return (
        <Mini eyebrow="Timer">
          <span className="r2-timer-mini" aria-hidden>
            <span className="r2-timer-mini-count">25:00</span>
            <span className="r2-timer-mini-scale">
              <span className="r2-timer-mini-knob" />
            </span>
          </span>
        </Mini>
      );
    case "writingActivity":
      return (
        <Mini eyebrow="Writing activity">
          <span className="r2-activity-mini">
            {PREVIEW_LEVELS.map((week, i) => (
              <span key={i} className="r2-activity-week">
                {week.map((level, j) => (
                  <span key={j} className="r2-activity-day" data-level={level} />
                ))}
              </span>
            ))}
          </span>
        </Mini>
      );
    default:
      return null;
  }
}

function Mini({ eyebrow, value, unit, children }: { eyebrow: string; value?: string; unit?: string; children?: ReactNode }) {
  return (
    <span className="r2-widget-mini">
      <span className="r2-widget-mini-eyebrow">{eyebrow}</span>
      {value && (
        <span className="r2-widget-mini-value">
          {value}
          {unit && <span className="r2-widget-mini-unit"> {unit}</span>}
        </span>
      )}
      {children}
    </span>
  );
}

// ── Timer ────────────────────────────────────────────────────────────────────
// A small writing instrument (lib/rune2/timer.ts): the countdown, set large
// in the serif, over a hairline scale of minutes. Idle, the scale is the
// dial — press or drag its marker to a duration (steps of five; the keyboard
// steps by five, or one with Shift) — and the count itself can be typed
// into: a click on it, then "40", "1:30", "1h 15". Started, the scale's
// ticks fade and the marker glides to the end of the line, then travels back
// toward zero as the time runs: one line is both the dial and the progress.
// One quiet verb at a time (Start, Pause, Resume, Start again) and Reset
// only when there is something to reset. Underneath, one switch keeps the
// running timer on screen outside Widgets (TimerFloat.tsx). Finished, the
// count rests in the warm completion tone; the writer is told by a quiet
// note wherever they are (TimerNotice.tsx). Device-local and the same in
// every Project (useWritingTimer.ts). It is a tool: it records nothing and
// counts nothing toward anything.

/** The scale's ticks: one every five minutes, a longer one every thirty (labelled). */
const SCALE_TICKS = Array.from({ length: SCALE_MAX_MINUTES / SCALE_STEP_MINUTES + 1 }, (_, i) => i * SCALE_STEP_MINUTES);
const SCALE_LABELS = [30, 60, 90, 120];

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function TimerWidget({ size }: { size: WidgetSize }) {
  const userId = useProfileStore((s) => s.profile?.id);
  const timer = useWritingTimer(userId ?? null);
  const { state, now } = timer;
  const idle = state.status === "idle";
  const minutes = Math.round(state.durationMs / MINUTE_MS);
  // A drag in progress: shown at once, saved when the press ends.
  const [draft, setDraft] = useState<number | null>(null);
  // The count typed into (idle only): the text as typed, and why it was refused.
  const [typed, setTyped] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const shownMinutes = idle ? (draft ?? minutes) : minutes;
  const left = idle ? shownMinutes * MINUTE_MS : remainingMs(state, now);
  const at = idle ? scaleShare(shownMinutes) : remainingShare(state, now);
  const scale = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const countButton = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const typing = idle && typed !== null;

  const aside = typing
    ? (typeError ?? "minutes, or 1:30")
    : state.status === "running"
      ? `until ${clock(state.endsAt)}`
      : state.status === "paused"
        ? "Paused"
        : state.status === "complete"
          ? `Ended ${clock(state.completedAt)}`
          : null;

  const minutesAt = (clientX: number) => {
    const r = scale.current?.getBoundingClientRect();
    if (!r || r.width === 0) return shownMinutes;
    return minutesAtShare((clientX - r.left) / r.width);
  };
  const onScaleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!idle || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    knob.current?.focus({ preventScroll: true });
    setDraft(minutesAt(e.clientX));
  };
  const onScaleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draft === null || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setDraft(minutesAt(e.clientX));
  };
  const onScaleUp = () => {
    if (draft === null) return;
    timer.setMinutes(draft);
    setDraft(null);
  };
  const onKnobKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = stepMinutes(minutes, 1, e.shiftKey);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = stepMinutes(minutes, -1, e.shiftKey);
    else if (e.key === "Home") next = SCALE_STEP_MINUTES;
    else if (e.key === "End") next = SCALE_MAX_MINUTES;
    else if (e.key === "Enter") {
      e.preventDefault();
      timer.start();
      requestAnimationFrame(() => primary.current?.focus({ preventScroll: true }));
      return;
    }
    if (next === null) return;
    e.preventDefault();
    timer.setMinutes(next);
  };
  // A verb that replaces itself under the keyboard keeps the focus on the one that takes its place.
  const refocus = () => requestAnimationFrame(() => (primary.current ?? knob.current)?.focus({ preventScroll: true }));

  // Typing a time: the count becomes a field in its own type; Enter (or
  // leaving it) sets the time, Escape keeps the one there was. A time that
  // can't be read keeps the field open and says why, quietly, at the top.
  const beginTyping = () => {
    setTyped(String(minutes));
    setTypeError(null);
  };
  const endTyping = (commit: boolean, refocusCount: boolean) => {
    if (commit && typed !== null) {
      const r = parseDuration(typed);
      if (r.error !== null) {
        setTypeError(r.error);
        return false;
      }
      timer.setMinutes(r.minutes);
    }
    setTyped(null);
    setTypeError(null);
    if (refocusCount) requestAnimationFrame(() => countButton.current?.focus({ preventScroll: true }));
    return true;
  };

  return (
    <div
      className="r2-widget-face r2-widget-face--timer"
      data-size={size}
      data-state={state.status}
      data-dragging={draft !== null || undefined}
      data-typing={typing || undefined}
    >
      <span className="r2-widget-eyebrow-row r2-timer-head">
        <span className="r2-widget-eyebrow">Timer</span>
        {aside && (
          <span className="r2-timer-aside" id={typing ? hintId : undefined} data-error={(typing && typeError !== null) || undefined}>
            {aside}
          </span>
        )}
      </span>
      {typing ? (
        <input
          className="r2-timer-count r2-timer-count--input"
          aria-label="Duration"
          aria-describedby={hintId}
          aria-invalid={typeError !== null || undefined}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          autoFocus
          value={typed ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setTyped(e.target.value);
            setTypeError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              endTyping(true, true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              endTyping(false, true);
            }
          }}
          onBlur={() => {
            // Leaving with a time that can't be read keeps the one there was.
            if (!endTyping(true, false)) endTyping(false, false);
          }}
        />
      ) : idle ? (
        <button
          ref={countButton}
          type="button"
          className="r2-timer-count r2-timer-count--set"
          aria-label={`Duration, ${formatDuration(shownMinutes * MINUTE_MS)}. Type a time`}
          onClick={beginTyping}
        >
          <TimerFigures ms={left} />
        </button>
      ) : (
        <span className="r2-timer-count" role="timer" aria-label={describeRemaining(left)}>
          <TimerFigures ms={left} />
        </span>
      )}
      <div
        ref={scale}
        className="r2-timer-scale"
        onPointerDown={onScaleDown}
        onPointerMove={onScaleMove}
        onPointerUp={onScaleUp}
        onPointerCancel={onScaleUp}
      >
        <span className="r2-timer-ticks" aria-hidden>
          {SCALE_TICKS.map((m) => (
            <span key={m} className="r2-timer-tick" data-major={m % 30 === 0 || undefined} style={{ left: `${scaleShare(m) * 100}%` }} />
          ))}
        </span>
        <span className="r2-timer-rail" aria-hidden />
        <span className="r2-timer-fill" style={{ width: `${at * 100}%` }} aria-hidden />
        <span
          ref={knob}
          className="r2-timer-knob"
          style={{ left: `${at * 100}%` }}
          {...(idle
            ? {
                role: "slider",
                tabIndex: 0,
                "aria-label": "Duration",
                "aria-valuemin": 1,
                "aria-valuemax": SCALE_MAX_MINUTES,
                "aria-valuenow": shownMinutes,
                "aria-valuetext": formatDuration(shownMinutes * MINUTE_MS),
                onKeyDown: onKnobKey,
              }
            : { "aria-hidden": true })}
        />
        <span className="r2-timer-labels" aria-hidden>
          {SCALE_LABELS.map((m) => (
            <span key={m} className="r2-timer-label" style={{ left: `${scaleShare(m) * 100}%` }}>
              {m}
            </span>
          ))}
        </span>
      </div>
      <span className="r2-timer-actions">
        {state.status === "idle" && (
          <button ref={primary} type="button" className="r2-timer-verb" data-primary onClick={() => { timer.start(); refocus(); }}>
            Start
          </button>
        )}
        {state.status === "running" && (
          <button ref={primary} type="button" className="r2-timer-verb" data-primary onClick={() => { timer.pause(); refocus(); }}>
            Pause
          </button>
        )}
        {state.status === "paused" && (
          <button ref={primary} type="button" className="r2-timer-verb" data-primary onClick={() => { timer.resume(); refocus(); }}>
            Resume
          </button>
        )}
        {state.status === "complete" && (
          <button ref={primary} type="button" className="r2-timer-verb" data-primary onClick={() => { timer.start(); refocus(); }}>
            Start again
          </button>
        )}
        {state.status !== "idle" && (
          <button type="button" className="r2-timer-verb" onClick={() => { timer.reset(); refocus(); }}>
            Reset
          </button>
        )}
      </span>
      <label className="r2-timer-foot">
        <span className="r2-timer-foot-label">Show on screen</span>
        <button
          type="button"
          role="switch"
          className="r2-switch r2-timer-switch"
          aria-checked={timer.float.on}
          aria-label="Show the running timer on screen"
          onClick={() => timer.setFloatOn(!timer.float.on)}
        />
      </label>
    </div>
  );
}

// ── Daily Goal ───────────────────────────────────────────────────────────────
// Today's credited words, every Project, against the writer's Daily Writing
// Goal (lib/rune2/preferences.ts: account-wide, with its history). Its
// grammar is a ring — the Project goal's is a line — thin, quiet, the number
// first: the words, the target, the words to go. Reached, the stroke takes
// the success tone and a small check sits in the ring; past the target the
// ring stays whole and the number keeps counting. Set, changed or turned
// off here, in the card, with a few presets and a field.

function DailyGoalWidget({ size }: { size: WidgetSize }) {
  const { manuscript } = useRune2Selection();
  const a = useWritingActivity(manuscript.project.id);
  const { dailyGoal, update } = useRunePreferences();
  const today = getLocalDateString();
  const target = dailyGoalOn(dailyGoal, today);
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);

  if (editing) {
    return (
      <DailyGoalEditor
        history={dailyGoal}
        today={today}
        current={target}
        onSave={(history) => update({ dailyGoal: history })}
        onDone={() => {
          setEditing(false);
          requestAnimationFrame(() => editRef.current?.focus());
        }}
      />
    );
  }

  if (target === null) {
    return (
      <button ref={editRef} type="button" className="r2-widget-face r2-widget-face--action" onClick={() => setEditing(true)}>
        <Face eyebrow="Daily goal" value={<span className="r2-widget-quiet">Set a daily goal</span>} meta="Words to write each day, every Project." />
      </button>
    );
  }

  if (!a.loaded) return <Skeleton eyebrow="Daily goal" />;
  const words = a.todayAll;
  const p = dailyGoalProgress(words, target);
  const meta = a.failed
    ? "Couldn’t be read"
    : p.reached
      ? words > target
        ? `Goal reached · ${n(words - target)} over`
        : "Goal reached"
      : `${n(p.remaining)} words to go`;
  const text = `${n(words)} of ${n(target)} words today, ${p.percent} percent${p.reached ? ", goal reached" : ""}`;
  return (
    <div className="r2-widget-face r2-widget-face--daily" data-size={size} data-reached={p.reached || undefined}>
      <span className="r2-widget-eyebrow-row">
        <span className="r2-widget-eyebrow">Daily goal</span>
        <button ref={editRef} type="button" className="r2-widget-aside" aria-label="Edit daily goal" onClick={() => setEditing(true)}>
          Edit
        </button>
      </span>
      <div className="r2-daily">
        <span
          className="r2-ring"
          role="progressbar"
          aria-label="Progress toward the daily goal"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(words, target)}
          aria-valuetext={text}
          data-reached={p.reached || undefined}
        >
          <Ring share={p.share} size={size === "wide" ? 56 : 44} stroke={3} />
          {p.reached && <Check className="r2-ring-check" {...ICON_SM_BOLD} aria-hidden />}
        </span>
        <span className="r2-daily-text">
          <span className="r2-widget-value">
            {n(words)}
            <span className="r2-widget-unit"> / {n(target)}</span>
          </span>
          <span className="r2-widget-meta">{meta}</span>
        </span>
      </div>
    </div>
  );
}

/** The ring itself: a track and the progress stroke, capped at the whole. */
function Ring({ share, size, stroke }: { share: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(1, share));
  return (
    <svg className="r2-ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="r2-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className="r2-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function DailyGoalEditor({
  history,
  today,
  current,
  onSave,
  onDone,
}: {
  history: DailyGoalHistory;
  today: string;
  current: number | null;
  onSave: (history: DailyGoalHistory) => Promise<string | null>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const fieldId = useId();

  const save = (target: number | null) => {
    startSaving(async () => {
      const err = await onSave(setDailyGoal(history, today, target));
      if (err) {
        setError(err);
        return;
      }
      onDone();
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = draft.replace(/[\s,._']/g, "");
    const value = Number(digits);
    if (!/^\d+$/.test(digits) || value < 1) {
      setError("A daily goal is a whole number of words.");
      return;
    }
    if (value > 100_000) {
      setError("A daily goal is at most 100,000 words.");
      return;
    }
    save(value);
  };

  return (
    <form className="r2-widget-face r2-widget-goal-form" onSubmit={submit}>
      <label className="r2-widget-eyebrow" htmlFor={fieldId}>
        {current === null ? "Set a daily goal" : "Daily goal"}
      </label>
      <span className="r2-daily-presets" role="group" aria-label="Presets">
        {DAILY_GOAL_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="r2-chip r2-daily-preset"
            aria-pressed={Number(draft.replace(/[\s,._']/g, "")) === preset}
            disabled={saving}
            onClick={() => setDraft(String(preset))}
          >
            {n(preset)}
          </button>
        ))}
      </span>
      <div className="r2-widget-goal-row">
        <input
          id={fieldId}
          className="r2-field r2-field--sm"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={draft}
          placeholder="500"
          aria-describedby={error ? `${fieldId}-error` : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onDone();
            }
          }}
          disabled={saving}
        />
        <span className="r2-widget-unit">words a day</span>
      </div>
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="r2-widget-error">
          {error}
        </p>
      )}
      <div className="r2-widget-goal-actions">
        <button type="submit" className="r2-button r2-button--primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="r2-button" onClick={onDone} disabled={saving}>
          Cancel
        </button>
        {current !== null && (
          <button type="button" className="r2-widgets-link r2-widget-goal-remove" onClick={() => save(null)} disabled={saving}>
            Turn off
          </button>
        )}
      </div>
    </form>
  );
}
