// The writing timer (the Timer widget, components/rune2/Widgets.tsx): a
// quiet countdown — "I'm going to write for twenty-five minutes" — and
// nothing more. Not a session, not a score, not a streak, not a Pomodoro:
// it never touches writing credit, Today's Words, goals or analytics, and it
// never makes a sound. Pure rules, no React, no storage, no clock of its
// own: every transition takes `now` (epoch ms), so the tests are
// deterministic and the app can resolve the timer from timestamps.
//
// TIMESTAMPS ARE THE TRUTH. A running timer is "ends at T"; what remains is
// T − now, read whenever the screen draws — never a counter decremented
// every second. A tab throttled in the background, a laptop asleep, a
// writer away for an hour: on return, `resolve(state, now)` says what the
// timer is, including "it finished while you were gone".

export type TimerState =
  | { status: "idle"; durationMs: number }
  | { status: "running"; durationMs: number; startedAt: number; endsAt: number }
  | { status: "paused"; durationMs: number; startedAt: number; remainingMs: number }
  | {
      status: "complete";
      durationMs: number;
      startedAt: number;
      completedAt: number;
      /** The writer has seen that it finished (Widgets was opened since): the control's mark is cleared. */
      acknowledged: boolean;
      /**
       * The quiet completion notice has been shown for this finish (in any
       * window on this device): it is never shown twice. Absent on a timer
       * stored before the notice existed: read as shown.
       */
      notified: boolean;
    };

export const MINUTE_MS = 60_000;

export const TIMER_DEFAULT_MIN = 25;
export const TIMER_MIN_MINUTES = 1;
export const TIMER_MAX_MINUTES = 120;

export const DEFAULT_TIMER: TimerState = { status: "idle", durationMs: TIMER_DEFAULT_MIN * MINUTE_MS };

/** A duration in minutes, kept within the timer's range and whole. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return TIMER_DEFAULT_MIN;
  return Math.min(TIMER_MAX_MINUTES, Math.max(TIMER_MIN_MINUTES, Math.round(minutes)));
}

/** Chooses a duration: only while idle (a running or paused timer keeps its own; reset first). */
export function setDuration(state: TimerState, minutes: number): TimerState {
  if (state.status !== "idle") return state;
  const durationMs = clampMinutes(minutes) * MINUTE_MS;
  return durationMs === state.durationMs ? state : { status: "idle", durationMs };
}

/** Starts an idle timer (or starts a finished one again, for its duration). */
export function start(state: TimerState, now: number): TimerState {
  if (state.status !== "idle" && state.status !== "complete") return state;
  return { status: "running", durationMs: state.durationMs, startedAt: now, endsAt: now + state.durationMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  const remainingMs = state.endsAt - now;
  if (remainingMs <= 0) return complete(state, now);
  return { status: "paused", durationMs: state.durationMs, startedAt: state.startedAt, remainingMs };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== "paused") return state;
  return { status: "running", durationMs: state.durationMs, startedAt: state.startedAt, endsAt: now + state.remainingMs };
}

/** Back to idle, keeping the duration chosen. */
export function reset(state: TimerState): TimerState {
  return state.status === "idle" ? state : { status: "idle", durationMs: state.durationMs };
}

/** The writer has seen that it finished (Widgets opened): the control's mark goes, and no notice is owed any more. */
export function acknowledge(state: TimerState): TimerState {
  if (state.status !== "complete" || (state.acknowledged && state.notified)) return state;
  return { ...state, acknowledged: true, notified: true };
}

/** The completion notice has been shown for this finish. */
export function markNotified(state: TimerState): TimerState {
  if (state.status !== "complete" || state.notified) return state;
  return { ...state, notified: true };
}

/** Whether a finish still owes the writer its quiet notice. */
export function owesNotice(state: TimerState): boolean {
  return state.status === "complete" && !state.notified && !state.acknowledged;
}

function complete(state: { durationMs: number; startedAt: number; endsAt?: number }, now: number): TimerState {
  return {
    status: "complete",
    durationMs: state.durationMs,
    startedAt: state.startedAt,
    completedAt: state.endsAt !== undefined ? Math.min(state.endsAt, now) : now,
    acknowledged: false,
    notified: false,
  };
}

/**
 * The state as it stands at `now`: a running timer past its end is
 * complete (as of the moment it ended, not the moment anyone looked).
 * Everything else is itself. Call this before showing or storing.
 */
export function resolve(state: TimerState, now: number): TimerState {
  if (state.status === "running" && now >= state.endsAt) return complete(state, now);
  return state;
}

/** Milliseconds left, never negative; the whole duration while idle, none once complete. */
export function remainingMs(state: TimerState, now: number): number {
  switch (state.status) {
    case "idle":
      return state.durationMs;
    case "running":
      return Math.max(0, state.endsAt - now);
    case "paused":
      return state.remainingMs;
    case "complete":
      return 0;
  }
}

/** How much of the duration is still to run, 0..1 (the hairline's length). */
export function remainingShare(state: TimerState, now: number): number {
  if (state.durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, remainingMs(state, now) / state.durationMs));
}

/** "25:00", "4:07", "1:00:00" — whole seconds, rounded up so a timer never shows 0:00 while it still runs. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "25 minutes", "1 hour 15 minutes": the duration in words. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m > 0 || h === 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
}

/**
 * The duration written out, as a sentence would: "Twenty-five minutes",
 * "One minute", "An hour", "An hour and ten minutes", "Two hours". The
 * completion notice's line (a whole number of minutes, at most 120).
 */
export function durationInWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mins = m > 0 ? `${numberWords(m)} ${m === 1 ? "minute" : "minutes"}` : "";
  const hours = h === 0 ? "" : h === 1 ? "an hour" : `${numberWords(h)} hours`;
  const text = hours && mins ? `${hours} and ${mins}` : hours || mins;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── The scale ───────────────────────────────────────────────────────────────
// The duration is set on a hairline scale of minutes (the Timer widget):
// ticks every five, the marker at the duration. A press or drag sets it in
// steps of five; the keyboard steps by five, or by one with Shift. Pure, so
// the widget and the tests share the rule.

export const SCALE_MAX_MINUTES = TIMER_MAX_MINUTES;
export const SCALE_STEP_MINUTES = 5;

/** Where a duration sits on the scale, 0..1. */
export function scaleShare(minutes: number): number {
  return Math.max(0, Math.min(1, minutes / SCALE_MAX_MINUTES));
}

/** The duration a press at `share` (0..1 along the scale) chooses: the nearest five, never below five. */
export function minutesAtShare(share: number): number {
  const raw = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0)) * SCALE_MAX_MINUTES;
  return Math.max(SCALE_STEP_MINUTES, Math.min(SCALE_MAX_MINUTES, Math.round(raw / SCALE_STEP_MINUTES) * SCALE_STEP_MINUTES));
}

/** A keyboard step from `minutes`: by five (to the next multiple of five), or by one when `fine`. */
export function stepMinutes(minutes: number, direction: 1 | -1, fine = false): number {
  if (fine) return clampMinutes(minutes + direction);
  const next = direction > 0
    ? Math.floor(minutes / SCALE_STEP_MINUTES) * SCALE_STEP_MINUTES + SCALE_STEP_MINUTES
    : Math.ceil(minutes / SCALE_STEP_MINUTES) * SCALE_STEP_MINUTES - SCALE_STEP_MINUTES;
  return clampMinutes(next);
}

/**
 * What a screen reader is told of the remaining time: minutes while there
 * are minutes (the same text for a whole minute, so it is never re-read
 * every second), then "under a minute".
 */
export function describeRemaining(ms: number): string {
  if (ms <= 0) return "Finished";
  const minutes = Math.ceil(ms / MINUTE_MS);
  if (ms < MINUTE_MS) return "Under a minute remaining";
  return `${formatDuration(minutes * MINUTE_MS)} remaining`;
}

/** The next moment the display changes: the next whole second boundary of the remaining time, for a precise tick. */
export function msUntilNextSecond(state: TimerState, now: number): number {
  if (state.status !== "running") return 0;
  const left = state.endsAt - now;
  if (left <= 0) return 0;
  const frac = left % 1000;
  return frac === 0 ? 1000 : frac;
}

// ── Stored shape ────────────────────────────────────────────────────────────
// Kept on the device per writer (lib/rune2/timerStorage.ts). Read
// defensively: anything odd is the default timer. Never anything but these
// numbers and flags — no Project, no text.

export const TIMER_STORAGE_VERSION = 1;

export type StoredTimer = { v: number } & TimerState;

export function serializeTimer(state: TimerState): StoredTimer {
  return { v: TIMER_STORAGE_VERSION, ...state };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function readTimer(stored: unknown): TimerState {
  if (!stored || typeof stored !== "object") return DEFAULT_TIMER;
  const s = stored as Record<string, unknown>;
  const durationMs = finite(s.durationMs) ? s.durationMs : NaN;
  if (!(durationMs >= TIMER_MIN_MINUTES * MINUTE_MS && durationMs <= TIMER_MAX_MINUTES * MINUTE_MS)) return DEFAULT_TIMER;
  switch (s.status) {
    case "idle":
      return { status: "idle", durationMs };
    case "running":
      if (!finite(s.startedAt) || !finite(s.endsAt) || s.endsAt < s.startedAt) return { status: "idle", durationMs };
      return { status: "running", durationMs, startedAt: s.startedAt, endsAt: s.endsAt };
    case "paused":
      if (!finite(s.startedAt) || !finite(s.remainingMs) || s.remainingMs <= 0 || s.remainingMs > durationMs) return { status: "idle", durationMs };
      return { status: "paused", durationMs, startedAt: s.startedAt, remainingMs: s.remainingMs };
    case "complete":
      if (!finite(s.startedAt) || !finite(s.completedAt)) return { status: "idle", durationMs };
      return {
        status: "complete",
        durationMs,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        acknowledged: s.acknowledged === true,
        // Stored before the notice existed: treated as shown, so an old finish never surfaces.
        notified: s.notified !== false,
      };
    default:
      return { status: "idle", durationMs };
  }
}
