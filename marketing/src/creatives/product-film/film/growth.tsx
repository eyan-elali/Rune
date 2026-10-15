import type { CSSProperties } from "react";
import { PART_I, PART_II, SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE, TIMELAPSE_PROSE, WORKSPACE } from "../../../data/salt-house";
import { ManuscriptDoc } from "../../../ui/Manuscript";
import { PLANS, ShellFor, Window, type Plan } from "../Keyframes";
import type { Anchor, ProbeSpec, Probes } from "../studies/probe";
import { clamp01 } from "../studies/motion";
import { T } from "./timeline";

// THE BOOK GROWS — the time-compression layer (film-only).
//
// The idea is months of writing passing through one manuscript, not a writer
// browsing it. So the editor column becomes a TEMPORAL LAYER: one continuous
// stream of the book's prose, Chapter after Chapter, beginning exactly on the
// authentic Key Cabinet the opening shows and ending exactly on the authentic
// last Chapter. The stream runs up through the editor while a fixed WRITING
// FRONT reveals it line by line (a mask in the column's own coordinates): text
// only ever appears at the front, so the page reads as being written, never
// scrolled through. Its speed follows one inertial curve (accelerate → peak →
// long deceleration → a few pixels of residual drift → rest); a vertical blur
// tracks that speed and is zero at rest. The navigator is the structural
// anchor: sharp, still, its rows arriving as the front reaches what they hold.
//
// Everything that the stream starts and ends on is the product's own markup
// (ManuscriptDoc). In the app one Scene is one editor; the continuous stream
// exists only in the film.

/** More of the book, for the stream (the film's data; other chapters, being written). */
const MORE = [
  "Room seventeen had been the last door on the east stair, the one the maids left until after lunch because nobody ever asked for it.",
  "June kept the ledger in a drawer that did not lock. “Nobody steals a book about other people sleeping,” she said.",
  "By the second week Mara had stopped writing to Elias and started writing to the address, as if the house might answer for him.",
  "The coroner’s clerk had a cold, and read the times aloud as if they were a list of trains: 23:10, 23:40, 00:15, 02:30.",
  "The cliff path was shorter than she remembered. Children remember distances the way they remember adults: larger, and kinder.",
  "She found the fire brigade’s plan folded inside a parish newsletter, the east wing drawn in red pencil, the stair in blue.",
  "Nobody in Greyhaven said the hotel’s name. They said the house, or up there, or that place, and looked at the sea instead.",
  "There were forty hooks. She had counted them so often now that she could see them with her eyes closed, a brass constellation.",
];
const POOL = [...TIMELAPSE_PROSE, ...MORE];
const paras = (...ix: number[]) => ix.map((i) => POOL[i]);
/** The last Chapter of the draft: where the lapse comes to rest, so its prose is its own. */
const SEVENTEEN = [
  "Seventeen was not on the plan. It was not in the brigade’s report. It was in her brother’s mouth at half past two in the morning, and in nobody’s ledger at all.",
  "She went back up the east stair with the torch off. Sixteen, the wall, eighteen. She put her palm flat on the wall between them and it was warm.",
  "Somewhere below her the house settled, the way old houses do at night, as if it had been holding its breath and had decided she could be trusted.",
];

/** The stream, in the order the book was written: the Key Cabinet, then the rest of Part I, then Part II. */
export const SEGMENTS = [
  { id: SCENE.id, eyebrow: "The East Stair", title: SCENE.title, words: SCENE.words, paragraphs: [...SCENE_PROSE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED] },
  { id: "s-room-17", eyebrow: "The East Stair", title: "Room 17", words: 2102, paragraphs: paras(8, 6) },
  { id: "c-june", eyebrow: PART_I.title, title: "June", words: 5904, paragraphs: paras(0, 13) },
  { id: "c-low-tide", eyebrow: PART_I.title, title: "Low Tide", words: 6371, paragraphs: paras(3, 10) },
  { id: "c-inquest", eyebrow: PART_II.title, title: "The Inquest", words: 7020, paragraphs: paras(2, 11) },
  { id: "c-ledger", eyebrow: PART_II.title, title: "What the Ledger Kept", words: 6488, paragraphs: paras(7, 1) },
  { id: "c-cliff", eyebrow: PART_II.title, title: "The Cliff Path", words: 5817, paragraphs: paras(9, 4) },
  { id: "c-seventeen", eyebrow: PART_II.title, title: "Seventeen", words: 4366, paragraphs: SEVENTEEN },
] as const;
export const LAST = SEGMENTS.length - 1;
const tail = (s: string) => s.slice(-10);

/** The stream itself: each Chapter the editor's own document, one after another. */
export function Stream({ caret = 0 }: { caret?: number }) {
  return (
    <div className="pf-stream">
      {SEGMENTS.map((s, i) => (
        <div key={s.id} className="pf-seg" data-seg={i}>
          {i === LAST ? (
            <ManuscriptDoc eyebrow={s.eyebrow} title={s.title} paragraphs={s.paragraphs.slice(0, -1)} openLine={s.paragraphs[s.paragraphs.length - 1]} typed="" caret={caret} />
          ) : (
            <ManuscriptDoc eyebrow={s.eyebrow} title={s.title} paragraphs={s.paragraphs} />
          )}
        </div>
      ))}
    </div>
  );
}

const streamPlan: Plan = { ...PLANS.writing, cursor: undefined, mainNode: <Stream /> };
export const STREAM_PROBE: ProbeSpec = {
  id: "stream",
  node: (
    <Window>
      <ShellFor plan={streamPlan} />
    </Window>
  ),
  anchors: [
    { key: "main", selector: ".r2-main", mode: "box" },
    ...SEGMENTS.map((_, i): Anchor => ({ key: `seg${i}`, selector: `.pf-seg[data-seg="${i}"]`, mode: "box" })),
    ...SEGMENTS.map((s, i): Anchor => ({ key: `end${i}`, selector: `.pf-seg[data-seg="${i}"] .r2-prose p`, text: tail(s.paragraphs[s.paragraphs.length - 1]) })),
  ],
};

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

/** 0 → 1: how much of the book has been written (no overshoot; drives the front, the rows and the count). */
export const written = (t: number) => inertia((t - T.grow) / T.growDur);

/** The residual drift: a few pixels past rest, and a slower return (sin², skewed). */
const DRIFT = { px: 7, at: T.grow + T.growDur * 0.86, dur: 0.62 };
const drift = (t: number) => {
  const s = clamp01((t - DRIFT.at) / DRIFT.dur);
  return DRIFT.px * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.7)), 2);
};
/** When the page is wholly still again. */
export const REST = DRIFT.at + DRIFT.dur;

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

/** The column's offset (px, column coordinates): the book running up, then its last few pixels of drift. */
export const offsetAt = (t: number, g: StreamGeometry) => g.rest * written(t) + drift(t);
/** The writing front in the column's viewport: from below the Key Cabinet's last line to below the last Chapter's. */
const frontView = (t: number, g: StreamGeometry) => g.front0 + (g.frontEnd - g.front0) * written(t);
/** Where the front is in the stream (column coordinates): everything above it has been written. */
export const frontAt = (t: number, g: StreamGeometry) => g.rest * written(t) + frontView(t, g);
/** Which Chapter the front is in. */
export const segmentAt = (t: number, g: StreamGeometry) => {
  const f = frontAt(t, g);
  let i = 0;
  for (let k = 0; k < SEGMENTS.length; k++) if (f > g.tops[k] + 40) i = k;
  return i;
};
/** Speed of the page, column px per frame. */
export const speedAt = (t: number, g: StreamGeometry) => Math.abs(offsetAt(t + 0.5 / 30, g) - offsetAt(t - 0.5 / 30, g));

/** The time the front first reaches column y (inverse of frontAt, by table). */
const TABLE = 1 / 240;
export function timeFrontReaches(y: number, g: StreamGeometry) {
  for (let t = T.grow; t <= T.grow + T.growDur; t += TABLE) if (frontAt(t, g) >= y) return t;
  return T.grow + T.growDur;
}

// ── The layer ──────────────────────────────────────────────────────────────

/**
 * The editor's column as the temporal layer: the stream, offset; revealed only
 * above the writing front (a soft mask fixed in the column); blurred along its
 * motion in proportion to its speed (σ in the column's pixels; none at rest).
 */
export function TemporalColumn({ t, g, scope, caret = 0 }: { t: number; g: StreamGeometry; scope: string; caret?: number }) {
  const off = offsetAt(t, g);
  const front = frontView(t, g);
  const v = speedAt(t, g);
  const sigma = v < 0.8 ? 0 : Math.min(11, v * 0.16);
  const id = `pf-vblur-${scope}`;
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

/** The rows that arrive as the book is written, and where in the stream each arrives (segment, fraction of it). */
export const ARRIVALS: [string, number, number][] = [
  ["s-room-17", 1, 0],
  ["c-june", 2, 0],
  ["c-low-tide", 3, 0],
  [PART_II.id, 4, -0.08],
  ["c-inquest", 4, 0],
  [WORKSPACE.ledger.id, 4, 0.55],
  ["c-ledger", 5, 0],
  ["unplaced", 5, 0.6],
  ["c-cliff", 6, 0],
  [WORKSPACE.harbour.id, 6, 0.5],
  ["c-seventeen", 7, 0],
  [WORKSPACE.canvas.id, 7, 0.5],
];
let arrivals: Map<string, number> | null = null;
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

/** How fast the book is being written at t, relative to the lapse's peak (0 at rest, 1 at the peak): for the sound. */
export function writingRate(t: number) {
  const u = (t - T.grow) / T.growDur;
  if (u <= 0 || u >= 1) return 0;
  const peakU = A_ / (A_ + B_);
  const f = (x: number) => Math.pow(x, A_) * Math.pow(1 - x, B_);
  return f(u) / f(peakU);
}
