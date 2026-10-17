"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { clampFloat, describeRemaining, floatShows, formatRemaining, remainingMs, remainingShare } from "@/lib/rune2/timer";
import type { WritingTimer } from "./useWritingTimer";

// The timer on screen (the Timer widget's "Show on screen" switch): while
// the writing timer runs or is paused, a small card holds the countdown
// outside Widgets — in the same material and type as the completion note
// (TimerNotice.tsx), wherever the writer last put it (drag it; or focus it
// and use the arrow keys). At rest it is the count and its hairline; reached
// for (hover, keyboard focus) it offers Pause or Resume and Reset. While the
// writer types it fades to a faint presence and comes back when they stop or
// move the pointer. When the time runs out it gives way to the completion
// note, which takes its place. It steps aside while the Widgets drawer is
// open (the widget itself is there). Never focus taken: a press on it, a
// drag, a Pause, all leave the caret where it was.

/** How long after the last keystroke the card comes back from its faint presence. */
export const FLOAT_TYPING_MS = 2_500;
/** A keyboard nudge, in pixels (Shift: four times as far). */
const NUDGE = 8;
/** How far a press must travel before it is a drag rather than a click. */
const DRAG_SLOP = 3;

/** The count's figures, each colon set apart so it can sit a shade lighter (the widget's and the card's). */
export function TimerFigures({ ms }: { ms: number }) {
  const parts = formatRemaining(ms).split(":");
  return (
    <span aria-hidden>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="r2-timer-colon">:</span>}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

const viewport = () => ({ width: document.documentElement.clientWidth, height: window.innerHeight });

export function TimerFloat({ timer }: { timer: WritingTimer }) {
  if (!floatShows(timer.float, timer.state) || timer.drawerOpen) return null;
  return <FloatCard timer={timer} />;
}

function FloatCard({ timer }: { timer: WritingTimer }) {
  const { state, now, float } = timer;
  const ref = useRef<HTMLDivElement>(null);
  // Where it is drawn: the stored place, kept inside the window (null: the default corner, in CSS).
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [faint, setFaint] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null>(null);

  // The stored place, kept whole inside the window as the window changes.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || float.x === null || float.y === null) {
        setAt(null);
        return;
      }
      setAt(clampFloat({ x: float.x, y: float.y }, { width: el.offsetWidth, height: el.offsetHeight }, viewport()));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [float.x, float.y]);

  // Typing anywhere else: a faint presence until the writer stops or reaches for the pointer.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setFaint(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setFaint(false), FLOAT_TYPING_MS);
    };
    const onPointer = () => {
      if (timeout) clearTimeout(timeout);
      setFaint(false);
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  const rectNow = () => {
    const r = ref.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    // Never the caret's: a press here leaves focus where the writer was.
    e.preventDefault();
    const r = rectNow();
    if (!r) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, dx: e.clientX - r.x, dy: e.clientY - r.y, x0: e.clientX, y0: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const r = rectNow();
    if (!d || d.id !== e.pointerId || !r) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_SLOP) return;
    d.moved = true;
    setDragging(true);
    setAt(clampFloat({ x: e.clientX - d.dx, y: e.clientY - d.dy }, r, viewport()));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    const r = rectNow();
    if (d.moved && r) timer.moveFloat(r.x, r.y);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const delta =
      e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
    const r = rectNow();
    if (!delta || !r) return;
    e.preventDefault();
    const next = clampFloat({ x: r.x + delta[0], y: r.y + delta[1] }, r, viewport());
    setAt(next);
    timer.moveFloat(next.x, next.y);
  };

  const left = remainingMs(state, now);
  const share = remainingShare(state, now);
  const paused = state.status === "paused";

  return (
    <div
      ref={ref}
      className="r2-timer-float"
      role="group"
      aria-label={`Timer, ${describeRemaining(left).toLowerCase()}${paused ? ", paused" : ""}. Arrow keys move it.`}
      tabIndex={0}
      data-state={state.status}
      data-faint={(faint && !dragging) || undefined}
      data-dragging={dragging || undefined}
      data-placed={at ? true : undefined}
      style={at ? { left: at.x, top: at.y } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <span className="r2-timer-float-row">
        <span className="r2-timer-float-count" role="timer" aria-label={describeRemaining(left)}>
          <TimerFigures ms={left} />
        </span>
        {paused && <span className="r2-timer-float-state">Paused</span>}
        <span className="r2-timer-float-actions">
          {paused ? (
            <button type="button" className="r2-timer-verb" data-primary onMouseDown={(e) => e.preventDefault()} onClick={timer.resume}>
              Resume
            </button>
          ) : (
            <button type="button" className="r2-timer-verb" data-primary onMouseDown={(e) => e.preventDefault()} onClick={timer.pause}>
              Pause
            </button>
          )}
          <button type="button" className="r2-timer-verb" onMouseDown={(e) => e.preventDefault()} onClick={timer.reset}>
            Reset
          </button>
        </span>
      </span>
      <span className="r2-timer-float-line" aria-hidden>
        <span className="r2-timer-float-fill" style={{ width: `${share * 100}%` }} />
        <span className="r2-timer-float-bead" style={{ left: `${share * 100}%` }} />
      </span>
    </div>
  );
}
