import type { CSSProperties } from "react";
import { ManuscriptDoc } from "../../ui/Manuscript";
import type { Anchor, Probes } from "../product-film/studies/probe";
import { clamp01 } from "../product-film/studies/motion";
import { ARRIVALS, LAST, SEGMENTS } from "./content";
import { T } from "./timeline";

// THE BOOK GROWS — the time-compression layer (film-only), after the product
// film's growth.tsx, re-cut for a tall narrow column.
//
// The editor column becomes a TEMPORAL LAYER: one continuous stream of the
// book's prose, Chapter after Chapter, beginning exactly on the authentic
// Chapter 1 the opening shows and ending exactly on the authentic Flat A the
// writer returns to. The stream runs up through the column while a fixed
// WRITING FRONT reveals it (a mask in the column's own coordinates): text
// only ever appears at the front, so the page reads as being written, never
// scrolled through. Its speed follows one inertial curve (accelerate → peak
// → long deceleration → a few pixels of drift → rest); a vertical blur
// tracks that speed and is zero at rest. The navigator beside it is the
// anchor: sharp, still, its rows arriving as the front reaches what they
// hold. In the app one Scene is one editor; the stream exists only here.

const tail = (s: string) => s.slice(-10);

/** The stream itself: each Chapter or Scene the editor's own document, one after another. */
export function Stream({ caret = 0 }: { caret?: number }) {
  return (
    <div className="ad-stream">
      {SEGMENTS.map((s, i) => (
        <div key={s.id} className="ad-seg" data-seg={i}>
          {i === LAST ? (
            <ManuscriptDoc eyebrow={s.eyebrow} title={s.title} paragraphs={s.paragraphs} openLine="" typed="" caret={caret} />
          ) : (
            <ManuscriptDoc eyebrow={s.eyebrow} title={s.title} paragraphs={s.paragraphs} />
          )}
        </div>
      ))}
    </div>
  );
}

export const STREAM_ANCHORS: Anchor[] = [
  { key: "main", selector: ".r2-main", mode: "box" },
  ...SEGMENTS.map((_, i): Anchor => ({ key: `seg${i}`, selector: `.ad-seg[data-seg="${i}"]`, mode: "box" })),
  ...SEGMENTS.map((s, i): Anchor => ({ key: `end${i}`, selector: `.ad-seg[data-seg="${i}"] .r2-prose p`, text: tail(s.paragraphs[s.paragraphs.length - 1]) })),
];

// ── Time ───────────────────────────────────────────────────────────────────

/** The inertial curve: a beta-shaped speed (rises, peaks early, long tail), integrated. */
const A_ = 2.0;
const B_ = 2.6;
const N = 2000;
const CUM = (() => {
  const out = [0];
  for (let i = 1; i <= N; i++) {
    const u = (i - 0.5) / N;
    out.push(out[i - 1] + Math.pow(u, A_) * Math.pow(1 - u, B_));
  }
  return out.map((v) => v / out[N]);
})();
const inertia = (u: number) => {
  const x = clamp01(u) * N;
  const i = Math.min(N - 1, Math.floor(x));
  return CUM[i] + (CUM[i + 1] - CUM[i]) * (x - i);
};

/** 0 → 1: how much of the book has been written (drives the front, the rows and the count). */
export const written = (t: number) => inertia((t - T.grow) / T.growDur);

/** The residual drift: a few pixels past rest, and a slower return. */
const DRIFT = { px: 7, at: T.grow + T.growDur * 0.86, dur: 0.62 };
const drift = (t: number) => {
  const s = clamp01((t - DRIFT.at) / DRIFT.dur);
  return DRIFT.px * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.7)), 2);
};
/** When the page is wholly still again. */
export const REST = DRIFT.at + DRIFT.dur;

/** How fast the book is being written at t, relative to the lapse's peak (0 at rest, 1 at the peak): for the sound. */
export function writingRate(t: number) {
  const u = (t - T.grow) / T.growDur;
  if (u <= 0 || u >= 1) return 0;
  const peakU = A_ / (A_ + B_);
  const f = (x: number) => Math.pow(x, A_) * Math.pow(1 - x, B_);
  return f(u) / f(peakU);
}

// ── Geometry ───────────────────────────────────────────────────────────────

export type StreamGeometry = { tops: number[]; ends: number[]; height: number; rest: number; front0: number; frontEnd: number };
let geo: StreamGeometry | null = null;
/** The stream's measured geometry, in the column's own coordinates (0 = the top of the editor column). */
export function geometry(m: Probes): StreamGeometry {
  if (geo) return geo;
  const s = m.stream;
  const top = s.main.box.y;
  const tops = SEGMENTS.map((_, i) => s[`seg${i}`].box.y - top);
  const ends = SEGMENTS.map((_, i) => s[`end${i}`].box.y + s[`end${i}`].box.h - top);
  const rest = tops[LAST];
  geo = { tops, ends, height: s.main.box.h, rest, front0: ends[0] + 30, frontEnd: ends[LAST] - rest + 30 };
  return geo;
}

/** The column's offset (px): the book running up, then its last few pixels of drift. */
export const offsetAt = (t: number, g: StreamGeometry) => g.rest * written(t) + drift(t);
const frontView = (t: number, g: StreamGeometry) => g.front0 + (g.frontEnd - g.front0) * written(t);
/** Where the front is in the stream (column coordinates): everything above it has been written. */
export const frontAt = (t: number, g: StreamGeometry) => g.rest * written(t) + frontView(t, g);
export const segmentAt = (t: number, g: StreamGeometry) => {
  const f = frontAt(t, g);
  let i = 0;
  for (let k = 0; k < SEGMENTS.length; k++) if (f > g.tops[k] + 40) i = k;
  return i;
};
export const speedAt = (t: number, g: StreamGeometry) => Math.abs(offsetAt(t + 0.5 / 30, g) - offsetAt(t - 0.5 / 30, g));

const TABLE = 1 / 240;
function timeFrontReaches(y: number, g: StreamGeometry) {
  for (let t = T.grow; t <= T.grow + T.growDur; t += TABLE) if (frontAt(t, g) >= y) return t;
  return T.grow + T.growDur;
}

let arrivals: Map<string, number> | null = null;
/** When each row arrives, from where its segment sits in the measured stream. */
export function arrivalTimes(g: StreamGeometry) {
  if (arrivals) return arrivals;
  arrivals = new Map(
    ARRIVALS.map(([id, seg, f]) => {
      const len = (seg < LAST ? g.tops[seg + 1] : g.ends[seg]) - g.tops[seg];
      return [id, timeFrontReaches(g.tops[seg] + 30 + f * len, g)];
    })
  );
  return arrivals;
}

// ── The layer ──────────────────────────────────────────────────────────────

/**
 * The editor column as the temporal layer: the stream, offset; revealed only
 * above the writing front; blurred along its motion in proportion to speed.
 */
export function TemporalColumn({ t, g, scope, caret = 0 }: { t: number; g: StreamGeometry; scope: string; caret?: number }) {
  const off = offsetAt(t, g);
  const front = frontView(t, g);
  const v = speedAt(t, g);
  // Only real speed blurs: the first, slow frames of the lapse stay sharp, so the line just written is still readable as time begins.
  const sigma = v < 6 ? 0 : Math.min(10, (v - 6) * 0.17);
  const id = `ad-vblur-${scope}`;
  const settled = t >= REST;
  const mask = settled ? undefined : `linear-gradient(to bottom, #000 0px, #000 ${front - 26}px, transparent ${front + 22}px)`;
  const wrap: CSSProperties = { position: "relative", height: "100%", overflow: "hidden", WebkitMaskImage: mask, maskImage: mask };
  return (
    <div style={wrap}>
      {sigma > 0 && (
        <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
          <filter id={id} x="0" y="-5%" width="100%" height="110%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`0 ${sigma.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      <div style={{ transform: `translateY(${-off}px)`, filter: sigma > 0 ? `url(#${id})` : undefined, willChange: "transform" }}>
        <Stream caret={caret} />
      </div>
    </div>
  );
}
