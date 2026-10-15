import type { ReactNode } from "react";
import { EASE } from "./time";

// The camera: the product treated as footage. The surface underneath (the
// shell, at its own logical size) is never fitted to the canvas; the camera
// chooses one region of it and fills the frame with that, letting the rest
// run off every edge.
//
// A camera key names a logical point (x, y — the shell's own pixels), the
// screen point it is pinned to (ax, ay — the composition's pixels) and the
// scale. Between keys the point and anchor travel on an eased line and the
// scale in log space, so a push in and a pull out feel equal. Every key
// carries the ease of the move that arrives at it.

export type CameraKey = {
  /** Seconds. */
  t: number;
  x: number;
  y: number;
  s: number;
  /** The screen point (x, y) lands on. Defaults to the camera's anchor. */
  ax?: number;
  ay?: number;
  /** The curve of the move arriving at this key. */
  ease?: (t: number) => number;
};

export type CameraState = { x: number; y: number; s: number; ax: number; ay: number };

/** A symmetric ease for travel: leaves gently, arrives gently, no overshoot. */
export const TRAVEL = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function cameraAt(keys: readonly CameraKey[], now: number, anchor: { ax: number; ay: number }): CameraState {
  const full = (k: CameraKey): CameraState => ({ x: k.x, y: k.y, s: k.s, ax: k.ax ?? anchor.ax, ay: k.ay ?? anchor.ay });
  if (now <= keys[0].t) return full(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const a = full(keys[i - 1]);
    const b = keys[i];
    if (now <= b.t) {
      const p = (b.ease ?? EASE)((now - keys[i - 1].t) / Math.max(b.t - keys[i - 1].t, 1e-6));
      const B = full(b);
      return {
        x: a.x + (B.x - a.x) * p,
        y: a.y + (B.y - a.y) * p,
        s: Math.exp(Math.log(a.s) + (Math.log(B.s) - Math.log(a.s)) * p),
        ax: a.ax + (B.ax - a.ax) * p,
        ay: a.ay + (B.ay - a.ay) * p,
      };
    }
  }
  return full(keys[keys.length - 1]);
}

/** The surface, placed so the camera's point sits on its anchor at its scale. */
export function Camera({ state, children }: { state: CameraState; children: ReactNode }) {
  const { x, y, s, ax, ay } = state;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "0 0",
        transform: `translate(${ax - x * s}px, ${ay - y * s}px) scale(${s})`,
      }}
    >
      {children}
    </div>
  );
}
