import { Easing, interpolate } from "remotion";
import { FPS } from "./formats";

// Time, in one place. A creative's script is written in seconds and every
// value on screen is a pure function of the current frame: nothing animates
// by itself (CSS transitions and animations are off on the stage), nothing
// reads the clock, and nothing is random — so any frame renders the same
// every time, in any order, on any machine.

/** Seconds → frames at the composition's rate. */
export const sec = (s: number) => Math.round(s * FPS);

/** Sutura's two motion curves (rune2.css: --r2-ease, --r2-ease-frame). */
export const EASE = Easing.bezier(0.2, 0, 0, 1);
export const EASE_FRAME = Easing.bezier(0.32, 0.72, 0, 1);

/** 0 → 1 over [at, at + dur] seconds (clamped, eased). */
export function progress(frame: number, at: number, dur: number, easing = EASE): number {
  if (dur <= 0) return frame >= sec(at) ? 1 : 0;
  return interpolate(frame, [sec(at), sec(at + dur)], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Linear blend of two numbers by t. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Presence over a span: rises over `fadeIn` from `inAt`, holds, and falls over
 * `fadeOut` ending at `outAt`. `inAt <= 0` means already present at frame 0.
 */
export function presence(frame: number, inAt: number, outAt: number, fadeIn = 0.45, fadeOut = 0.3): number {
  const rise = inAt <= 0 ? 1 : progress(frame, inAt, fadeIn);
  const fall = 1 - progress(frame, outAt - fadeOut, fadeOut, Easing.bezier(0.4, 0, 1, 1));
  return Math.min(rise, fall);
}

/** A small deterministic PRNG (mulberry32), for anything that should look human but render identically. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * When each character of `text` lands, in seconds after `start`: an unhurried,
 * uneven hand — a breath after a word, a longer one after a comma — with the
 * same rhythm as the landing page's manuscript demo, but seeded.
 */
export function typingSchedule(text: string, start: number, seed: number, pace = 1): number[] {
  const rand = seeded(seed);
  const times: number[] = [];
  let t = start;
  for (const ch of text) {
    const base = ch === "," ? 0.15 : ch === "." ? 0.12 : ch === " " ? 0.076 : 0.044;
    t += (base + rand() * 0.036) * pace;
    times.push(t);
  }
  return times;
}

/** How many characters of a typing schedule have landed by `frame`. */
export function typedCount(frame: number, schedule: readonly number[]): number {
  const now = frame / FPS;
  let n = 0;
  while (n < schedule.length && schedule[n] <= now) n++;
  return n;
}
