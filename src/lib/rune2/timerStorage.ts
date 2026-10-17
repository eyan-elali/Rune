import { readTimer, serializeTimer, type TimerState } from "./timer";

// Where the writing timer is kept: on this device, per writer (lib/rune2/
// timer.ts decides what it means). A few timestamps and a duration — never
// Project data, never content — so switching Projects, closing Widgets or
// navigating within the app leaves it exactly where it was, and a reload
// resolves it from the clock. Nothing here is authoritative for anything
// but the timer itself; without storage the writer has a timer for this
// visit only. Not shared across devices (that would need server state; this
// pass deliberately adds no schema). Guarded like widgetStorage.ts: a
// browser without storage still works.

const TIMER_PREFIX = "rune:timer:";

export function timerKey(userId: string): string {
  return `${TIMER_PREFIX}${userId}`;
}

export function readStoredTimer(userId: string): TimerState {
  try {
    const raw = window.localStorage.getItem(timerKey(userId));
    return readTimer(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return readTimer(null);
  }
}

export function writeStoredTimer(userId: string, state: TimerState): void {
  try {
    window.localStorage.setItem(timerKey(userId), JSON.stringify(serializeTimer(state)));
  } catch {
    // Storage unavailable: the timer lives for this visit only.
  }
}
