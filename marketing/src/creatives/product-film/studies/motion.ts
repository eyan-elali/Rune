import { Easing } from "remotion";
import type { CameraState } from "../../../foundation/Camera";

// The motion studies' arithmetic (MOTION_LANGUAGE_EXPLORATION.md §4–5).
// Everything is a pure function of time in seconds: a study's frame is
// `Frame({ t })`, so the composition, the contact strip and the subframe
// motion blur all draw the same picture for the same t.

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Curve = (p: number) => number;

// ── Curves ─────────────────────────────────────────────────────────────────
// Product transitions run on the product's own curves (foundation/time: EASE,
// EASE_FRAME — rune2.css's --r2-ease and --r2-ease-frame). Film choreography
// runs on these: none overshoots, none bounces.

/** A carried object: leaves with intent, arrives long and soft, no overshoot — peak speed ≈ 2.6× the average, so a carried line stays legible at its fastest. */
export const CARRY: Curve = Easing.bezier(0.38, 0.04, 0.22, 1);
/** The camera travelling: a long symmetric ease, the head following the eye. */
export const CAMERA: Curve = Easing.bezier(0.45, 0, 0.2, 1);
/** The pull-back: barely leaves, then a long, decelerating arrival into the wide. */
export const DOLLY: Curve = Easing.bezier(0.62, 0, 0.1, 1);
/** A small settle at the end of a move: quick to commit, slow to rest. */
export const SETTLE: Curve = Easing.bezier(0.2, 0, 0, 1);
/** Linear (constant-speed strokes). */
export const LINEAR: Curve = (p) => p;

/** A critically damped spring's step response, normalised to reach exactly 1 at p = 1 (ω: stiffness in "per-duration" units). */
export const damped =
  (omega = 8): Curve =>
  (p) => {
    const c = Math.min(1, Math.max(0, p));
    const end = 1 - (1 + omega) * Math.exp(-omega);
    return (1 - (1 + omega * c) * Math.exp(-omega * c)) / end;
  };

// ── Time ───────────────────────────────────────────────────────────────────

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0 → 1 over [at, at + dur] seconds, through `curve`. */
export function span(t: number, at: number, dur: number, curve: Curve = LINEAR): number {
  if (dur <= 0) return t >= at ? 1 : 0;
  return curve(clamp01((t - at) / dur));
}

/** A value between keyframes in seconds: [[t, v], …], each segment on `curve`. */
export function keyed(t: number, keys: readonly (readonly [number, number])[], curve: Curve = CAMERA): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * curve((t - t0) / Math.max(t1 - t0, 1e-6));
  }
  return keys[keys.length - 1][1];
}

// ── Space ──────────────────────────────────────────────────────────────────

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** Scale in log space: ×2 and ×½ take the same time (principle 5). */
export const logLerp = (a: number, b: number, p: number) => Math.exp(lerp(Math.log(a), Math.log(b), p));

export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });

/**
 * A point on a shallow arc from `a` to `b` (a quadratic Bézier whose control
 * point is lifted perpendicular to the chord by `lift` × its length, toward
 * the top of the frame) — how a hand carries something (principle 7).
 */
export function arc(a: Point, b: Point, p: number, lift = 0.08): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // The normal that points up the screen.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const c = { x: (a.x + b.x) / 2 + nx * len * lift, y: (a.y + b.y) / 2 + ny * len * lift };
  const u = 1 - p;
  return { x: u * u * a.x + 2 * u * p * c.x + p * p * b.x, y: u * u * a.y + 2 * u * p * c.y + p * p * b.y };
}

/**
 * A point on a reading-direction S-curve from `a` to `b`: it leaves level
 * (along its own line, so a sentence slides out of its row instead of
 * crossing the lines above it) and arrives level (into its destination's
 * row). A cubic Bézier with horizontal tangents; `out` and `into` set how far
 * each tangent reaches, as fractions of the horizontal travel.
 */
export function level(a: Point, b: Point, p: number, out = 0.55, into = 0.3): Point {
  const dx = b.x - a.x;
  const c1 = { x: a.x + dx * out, y: a.y };
  const c2 = { x: b.x - dx * into, y: b.y };
  const u = 1 - p;
  return {
    x: u * u * u * a.x + 3 * u * u * p * c1.x + 3 * u * p * p * c2.x + p * p * p * b.x,
    y: u * u * u * a.y + 3 * u * u * p * c1.y + 3 * u * p * p * c2.y + p * p * p * b.y,
  };
}

/** Screen speed of a world point under a moving camera, px per frame (for motion blur's sample count). */
export function screenSpeed(at: (t: number) => Point, t: number, fps = 30): number {
  const a = at(t - 0.5 / fps);
  const b = at(t + 0.5 / fps);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ── Cameras ────────────────────────────────────────────────────────────────

/** A camera re-expressed as pinning world point P (same picture, different pin) — so two framings interpolate about one point. */
export const repin = (c: CameraState, P: Point): CameraState => ({ x: P.x, y: P.y, s: c.s, ax: c.ax + (P.x - c.x) * c.s, ay: c.ay + (P.y - c.y) * c.s });

/** Two framings, interpolated about one world point: P travels a straight line on screen, scale in log space. */
export const cameraAbout = (a: CameraState, b: CameraState, P: Point, p: number): CameraState => {
  const A = repin(a, P);
  const B = repin(b, P);
  return { x: P.x, y: P.y, s: logLerp(A.s, B.s, p), ax: lerp(A.ax, B.ax, p), ay: lerp(A.ay, B.ay, p) };
};

/** Where a world point is drawn on screen. */
export const toScreen = (c: CameraState, q: Point): Point => ({ x: c.ax + (q.x - c.x) * c.s, y: c.ay + (q.y - c.y) * c.s });

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
