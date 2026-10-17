"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  acknowledge as acknowledgeTimer,
  markNotified as markTimerNotified,
  owesNotice,
  msUntilNextSecond,
  pause as pauseTimer,
  reset as resetTimer,
  resolve,
  resume as resumeTimer,
  setDuration as setTimerDuration,
  start as startTimer,
  DEFAULT_FLOAT,
  DEFAULT_TIMER,
  type TimerFloat,
  type TimerState,
} from "@/lib/rune2/timer";
import { floatKey, readStoredFloat, readStoredTimer, timerKey, writeStoredFloat, writeStoredTimer } from "@/lib/rune2/timerStorage";

// The one writing timer of this device, for this writer — held outside
// React, so the Widgets control (its small mark), the Timer widget and any
// later surface read the same state, across every Project shell mounted in
// this window. The state is read from the device once the writer is known
// and written on every change; another tab's change arrives through the
// storage event. What runs here is a TICK, not a count: while the timer
// runs, a timeout fires at each whole second so the display redraws, and
// whenever anything looks (a tick, a tab coming back to the front, a
// mount), the state is resolved from the clock — a timer that ended while
// the tab was in the background is complete the moment the app resumes.

type Store = {
  userId: string | null;
  state: TimerState;
  /** Clock time at the last tick, so a render reads a consistent "now". */
  now: number;
  /** Set when this window saw the timer finish (a live transition): the control's one gentle attention. */
  finishedHere: boolean;
  /**
   * The completion note on screen in this window (TimerNotice.tsx), kept
   * here rather than in the component so a remount of the page (the device
   * gate settling, a route change) never loses a note already marked shown.
   */
  notice: TimerNoticeShown | null;
  /** Whether the timer shows on screen outside Widgets, and where (TimerFloat.tsx). */
  float: TimerFloat;
  /** Whether the Widgets drawer is open in this window: the on-screen card steps aside while it is. */
  drawerOpen: boolean;
};

export type TimerNoticeShown = { completedAt: number; durationMs: number };

const EMPTY: Store = { userId: null, state: DEFAULT_TIMER, now: 0, finishedHere: false, notice: null, float: DEFAULT_FLOAT, drawerOpen: false };
let store: Store = EMPTY;
const listeners = new Set<() => void>();
let tick: ReturnType<typeof setTimeout> | null = null;
let wired = false;

function emit() {
  for (const fn of listeners) fn();
}

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  emit();
}

/** Resolves the state from the clock; a running timer past its end finishes here, and the device copy is updated. */
function settle() {
  const now = Date.now();
  const resolved = resolve(store.state, now);
  if (resolved !== store.state) {
    const finished = resolved.status === "complete" && store.state.status === "running";
    if (store.userId) writeStoredTimer(store.userId, resolved);
    set({ state: resolved, now, finishedHere: finished || store.finishedHere });
  } else if (store.state.status === "running") {
    set({ now });
  }
  schedule();
}

function schedule() {
  if (tick) clearTimeout(tick);
  tick = null;
  if (store.state.status !== "running") return;
  tick = setTimeout(settle, msUntilNextSecond(store.state, Date.now()));
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("storage", (e) => {
    if (!store.userId) return;
    if (e.key === floatKey(store.userId)) {
      set({ float: readStoredFloat(store.userId) });
      return;
    }
    if (e.key !== timerKey(store.userId)) return;
    set({ state: readStoredTimer(store.userId), now: Date.now() });
    schedule();
  });
  // Back to the front (a background tab's timers are throttled; a sleeping device's stop): read the clock.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") settle();
  });
  window.addEventListener("focus", settle);
}

function adopt(userId: string | null) {
  if (userId === store.userId) return;
  const state = userId ? resolve(readStoredTimer(userId), Date.now()) : DEFAULT_TIMER;
  const float = userId ? readStoredFloat(userId) : DEFAULT_FLOAT;
  set({ userId, state, now: Date.now(), finishedHere: false, notice: null, float });
  schedule();
}

function apply(next: TimerState) {
  if (next === store.state) return;
  if (store.userId) writeStoredTimer(store.userId, next);
  set({ state: next, now: Date.now(), finishedHere: next.status === "complete" ? store.finishedHere : false });
  schedule();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  wire();
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => store;
const serverSnapshot = (): Store => EMPTY;

function applyFloat(next: TimerFloat) {
  if (next.on === store.float.on && next.x === store.float.x && next.y === store.float.y) return;
  if (store.userId) writeStoredFloat(store.userId, next);
  set({ float: next });
}

export type WritingTimer = {
  state: TimerState;
  /** The clock as of the last tick (a stable "now" for the render). */
  now: number;
  finishedHere: boolean;
  setMinutes: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** The writer has seen that it finished: clears the control's mark. */
  acknowledge: () => void;
  /** The finish has been seen elsewhere (the Timer card open on the board): no note, never again. */
  markNotified: () => void;
  /** The note this window shows, or null. */
  notice: TimerNoticeShown | null;
  /** Shows the note for a finish that owes one, and marks it shown (here and in every other window). */
  showNotice: () => void;
  /** The note goes (dismissed, or its time is up); the Widgets dot stays. */
  dismissNotice: () => void;
  /** Whether the timer shows on screen, and where. */
  float: TimerFloat;
  drawerOpen: boolean;
  /** The switch: the running timer shown on screen, outside Widgets, or not. */
  setFloatOn: (on: boolean) => void;
  /** Where the on-screen card was put (its top-left in the window). */
  moveFloat: (x: number, y: number) => void;
  /** The Widgets drawer opened or closed (WidgetsControl). */
  setDrawerOpen: (open: boolean) => void;
};

/** The writer's timer. `userId` adopts the device copy for that writer (null before the profile is known). */
export function useWritingTimer(userId: string | null | undefined): WritingTimer {
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    adopt(userId ?? null);
  }, [userId]);

  const setMinutes = useCallback((minutes: number) => apply(setTimerDuration(store.state, minutes)), []);
  const start = useCallback(() => apply(startTimer(resolve(store.state, Date.now()), Date.now())), []);
  const pause = useCallback(() => apply(pauseTimer(store.state, Date.now())), []);
  const resume = useCallback(() => apply(resumeTimer(store.state, Date.now())), []);
  const reset = useCallback(() => apply(resetTimer(store.state)), []);
  const ack = useCallback(() => apply(acknowledgeTimer(store.state)), []);
  const notified = useCallback(() => apply(markTimerNotified(store.state)), []);
  const showNotice = useCallback(() => {
    const st = store.state;
    if (!owesNotice(st) || st.status !== "complete") return;
    apply(markTimerNotified(st));
    set({ notice: { completedAt: st.completedAt, durationMs: st.durationMs } });
  }, []);
  const dismissNotice = useCallback(() => {
    if (store.notice) set({ notice: null });
  }, []);
  const setFloatOn = useCallback((on: boolean) => applyFloat({ ...store.float, on }), []);
  const moveFloat = useCallback((x: number, y: number) => applyFloat({ ...store.float, x, y }), []);
  const setDrawerOpen = useCallback((open: boolean) => {
    if (store.drawerOpen !== open) set({ drawerOpen: open });
  }, []);

  return {
    state: s.state,
    now: s.now,
    finishedHere: s.finishedHere,
    setMinutes,
    start,
    pause,
    resume,
    reset,
    acknowledge: ack,
    markNotified: notified,
    notice: s.notice,
    showNotice,
    dismissNotice,
    float: s.float,
    drawerOpen: s.drawerOpen,
    setFloatOn,
    moveFloat,
    setDrawerOpen,
  };
}
