import { Composition } from "remotion";
import { FPS } from "../../../foundation/formats";
import { FILM } from "../frames";
import { StudyComposition, StudyStrip, stripSize, type Cue, type Phase, type StudyDef } from "../studies/Study";
import type { Probes } from "../studies/probe";
import { seeded } from "../../../foundation/time";
import { frame1, OPEN_KEYS } from "./seq1";
import { REST, writingRate } from "./growth";
import { frame2 } from "./seq2";
import { frame3, ARRIVE_WIDE } from "./seq3";
import { frame4, AT_B, RD, RT } from "./seq4";
import { frame5, AWAY, BRAND, END, FADE_GO, TYPED_TEXT, TYPE_TIMES } from "./seq5";
import { PROBES } from "./states";
import { T } from "./timeline";
import keyA from "../../../audio/key-1.wav";
import keyB from "../../../audio/key-2.wav";
import keyC from "../../../audio/key-3.wav";
import keyD from "../../../audio/key-4.wav";
import keySpace from "../../../audio/key-space.wav";
import keyEnd from "../../../audio/key-end.wav";
import pulseA from "../../../audio/pulse-1.wav";
import pulseB from "../../../audio/pulse-2.wav";
import clickSound from "../../../audio/click.wav";
import sheetSound from "../../../audio/sheet.wav";
import whooshSoft from "../../../audio/whoosh-soft.wav";
import resolveTone from "../../../audio/resolve.wav";
import settleSound from "../../../audio/settle.wav";
import airSound from "../../../audio/air.wav";
import voiceSound from "../../../audio/voice-mmh.wav";
import { TYPING_BANKS } from "../../../audio/typing";
import { TYPING_REAL } from "../../../audio/typing-real";

// SuturaProductFilm — the first complete cut of the product film (16:9).
// One continuous composition in five sequences (film/seq1–5.tsx) on one
// clock (timeline.ts), drawn as a pure function of time over the product's
// own markup; the approved motion vocabulary only (MOTION_LANGUAGE_
// EXPLORATION.md §9). No music, no voiceover: writing, silence, tactile UI
// sounds, the thinking motif, one resolving tone.

function frame(t: number, m: Probes) {
  if (t < T.toPause + T.toPauseDur + 0.02) return frame1(t, m);
  if (t < T.ledger) return frame2(t, m);
  if (t < T.characters) return frame3(t, m);
  if (t < T.pointer - 0.05) return frame4(t, m);
  return frame5(t, m);
}

// ── Sound: a quiet room, a tactile product, a person thinking ──────────────

const KEYS = [keyA, keyB, keyC, keyD];
const key = (ch: string, i: number) => (ch === " " ? keySpace : ch === "." || ch === "," || ch === ":" ? keyEnd : KEYS[(i * 7 + 3) % 4]);
const typed = (text: string, times: number[], volume: number, note: string): Cue[] =>
  [...text].map((ch, i) => ({ at: times[i] - 0.012, src: key(ch, i), volume, seconds: 0.12, note }));

/** The lapse: months of typing as a soft texture whose density follows the page's own speed — thick at the peak, thinning as time slows, silent before the page is still (seeded: every render the same). */
function lapseTexture(): Cue[] {
  const r = seeded(77);
  const out: Cue[] = [];
  for (let at = T.grow + 0.18; at < REST - 0.3; ) {
    const rate = writingRate(at);
    if (rate > 0.08) out.push({ at, src: KEYS[Math.floor(r() * 4)], volume: 0.07 + 0.08 * rate + r() * 0.03, seconds: 0.1, note: "the lapse: typing compressed" });
    at += 0.042 / Math.max(rate, 0.12) + r() * 0.03;
  }
  return out;
}

/** The voice file's own lead (breath, room) before the "mm" is audible; and its level, under the keys. */
const VOICE_LEAD = 0.17;
const VOICE_VOLUME = 0.14;
const OPEN_TEXT = " long after there was any reason to.".slice(6);
const cues: Cue[] = [
  // 1 · THE BOOK GROWS
  ...typed(OPEN_TEXT, OPEN_KEYS, 0.4, "natural typing: the line finishes"),
  ...lapseTexture(),
  { at: T.revise - 0.03, src: clickSound, volume: 0.42, seconds: 0.15, note: "The Key Cabinet: everything stops" },
  // 2 · THE WRITER THINKS
  { at: T.tick1, src: pulseA, volume: 0.55, seconds: 0.16, note: "tick" },
  { at: T.tick2, src: pulseB, volume: 0.5, seconds: 0.16, note: "tick" },
  { at: T.hum - VOICE_LEAD, src: voiceSound, volume: VOICE_VOLUME, seconds: 0.86, note: "the real voice: one quiet \"mm\", a person thinking (src/audio/voice-mmh.wav, lightly trimmed)" },
  { at: T.notes - 0.03, src: clickSound, volume: 0.45, seconds: 0.15, note: "Revision Notes" },
  { at: T.notes + 0.02, src: sheetSound, volume: 0.2, seconds: 0.24, note: "the panel opens" },
  { at: T.insp - 0.03, src: clickSound, volume: 0.34, seconds: 0.15, note: "the Inspector (restrained)" },
  // 3 · THE WORLD OPENS
  { at: T.ledger - 0.03, src: clickSound, volume: 0.48, seconds: 0.15, note: "⌘-click: 1998 Guest Ledger" },
  { at: T.ledger + 0.4, src: whooshSoft, volume: 0.07, seconds: 0.8, note: "one restrained spatial movement" },
  { at: ARRIVE_WIDE, src: resolveTone, volume: 0.3, seconds: 3.6, note: "the motif resolves: the whole window (and is let ring out)" },
  { at: T.characters - 0.03, src: clickSound, volume: 0.34, seconds: 0.15, note: "Characters" },
  // 4 · THE WORKSPACE BECOMES THE THINKING SPACE
  { at: T.elias - 0.03, src: clickSound, volume: 0.42, seconds: 0.15, note: "Elias Vale's card" },
  { at: T.elias + 0.08 + 1.0, src: settleSound, volume: 0.32, seconds: 0.5, note: "one tactile settle: the card is the Entry" },
  { at: T.canvas - 0.03, src: clickSound, volume: 0.36, seconds: 0.15, note: "The Night of the Fire" },
  { at: RT.ground, src: airSound, volume: 0.08, seconds: 2.2, note: "one soft spatial opening as the Canvas's surface comes up beneath the relationship, then quiet" },
  // 5 · BACK TO THE BOOK
  { at: T.open - 0.03, src: clickSound, volume: 0.42, seconds: 0.15, note: "the Scene card" },
  { at: T.morph + T.morphDur - 0.04, src: settleSound, volume: 0.15, seconds: 0.5, note: "quiet settle: back in the Scene" },
  // The same quiet room as the opening: ~3.4 dB under it (closer, faster and denser, it would otherwise read louder).
  ...typed(TYPED_TEXT, TYPE_TIMES, 0.27, "the writer types"),
  // The close: silence.
];

// ── What is the product, and what is the film ──────────────────────────────

const phases: Phase[] = [
  { from: 0, to: T.grow, kind: "authentic", label: "1 · a session already under way: the Scene being written, the chrome already away (data-writing)" },
  { from: T.grow, to: REST, kind: "film-only", label: "1 · months compressed: the book written through the editor (stream · front · speed blur)" },
  { from: REST, to: T.tick1, kind: "authentic", label: "1 · rest · the hand returns · back to The Key Cabinet" },
  { from: T.tick1, to: T.hum, kind: "film-only", label: "2 · the motif: caret blink + the Scene steps down" },
  { from: T.hum, to: T.reachNotes, kind: "authentic", label: "2 · a person, thinking (a real \"mm\")" },
  { from: T.reachNotes, to: T.echo, kind: "authentic", label: "2 · Revision Notes (product speed)" },
  { from: T.echo, to: T.echo + 0.9, kind: "film-only", label: "2 · one shared anchor tone" },
  { from: T.echo + 0.9, to: T.ledger, kind: "authentic", label: "2 · the Inspector; Research → 1998 Guest Ledger" },
  { from: T.ledger, to: T.ledger + 1.3, kind: "film-only", label: "3 · identity expansion: the title travels" },
  { from: T.ledger + 1.3, to: ARRIVE_WIDE, kind: "authentic", label: "3 · the Page in its tab · the camera pulls back" },
  { from: ARRIVE_WIDE, to: ARRIVE_WIDE + 1.4, kind: "film-only", label: "3 · one Scene, lit in its three places" },
  { from: ARRIVE_WIDE + 1.4, to: T.elias, kind: "authentic", label: "3–4 · the contradiction read · Characters, wide" },
  { from: T.elias, to: T.elias + 1.4, kind: "film-only", label: "4 · object expansion: the card becomes the Entry" },
  { from: T.elias + 1.4, to: T.canvas, kind: "authentic", label: "4 · \"Dad gave him the key\" · Thomas Vale · the Canvas, chosen" },
  { from: T.canvas, to: RT.wide + RT.wideDur, kind: "film-only", label: "4 · Entry → Canvas: the relationship lifts · the page lets go · three objects become cards · the 1998 row · then wide" },
  { from: RT.wide + RT.wideDur, to: T.dive, kind: "authentic", label: "4 · A · the whole Canvas (56%), held" },
  { from: T.dive, to: T.pointer, kind: "film-only", label: "4 · one push (B · the 1998 row) · one paper trail (the rest recedes) → C · Plant it" },
  { from: T.pointer, to: T.morph, kind: "authentic", label: "4 · Plant it, registered · the hand to the Scene card (D)" },
  { from: T.morph, to: T.morph + T.morphDur, kind: "film-only", label: "5 · the Scene card opens into the Scene" },
  { from: T.morph + T.morphDur, to: AWAY, kind: "authentic", label: "5 · the caret; the writer types (the chrome away)" },
  { from: AWAY, to: BRAND, kind: "film-only", label: "5 · leaving the writing space: the window recedes, light, then goes" },
  { from: BRAND, to: END + 1, kind: "authentic", label: "Sutura" },
];

export const SUTURA_FILM: StudyDef = { id: "SuturaProductFilm", duration: END, probes: PROBES, phases, cues, frame };

// ── Typing alternates: a sound-only experiment ─────────────────────────────
// The same keystroke cues at the same frames (opening, the lapse, the close);
// only the keyboard changes: A–C synthesised (src/audio/typing/, rejected),
// D real keystrokes from a recording (src/audio/typing-real/SOURCE.md). The
// control film above is untouched. Rendered by scripts/film-typing.mjs;
// `stem` keeps the typing alone, for measuring.

type Typing = "control" | "A" | "B" | "C" | "D";
const TYPING_CUE = new Set([...KEYS, keySpace, keyEnd]);
/** Each bank's level, matched to the control's typing loudness (gain), and its per-keystroke variation in dB (±): C, the least even hand. */
const TYPING_MIX: Record<Exclude<Typing, "control">, { gain: number; jitterDb: number; seed: number }> = {
  A: { gain: 1.63, jitterDb: 1.2, seed: 2101 },
  B: { gain: 1.36, jitterDb: 1.2, seed: 2203 },
  C: { gain: 1.1, jitterDb: 2, seed: 2311 },
  // Real keystrokes: their own differences carry the variation; only a very small level difference is added.
  D: { gain: 1.91, jitterDb: 0.75, seed: 2437 },
};
const BANKS = { ...TYPING_BANKS, D: TYPING_REAL };

export function typingCues(typing: Typing, stem: boolean): Cue[] {
  if (typing === "control") return stem ? cues.filter((c) => TYPING_CUE.has(c.src)) : cues;
  const bank = BANKS[typing];
  const mix = TYPING_MIX[typing];
  const r = seeded(mix.seed);
  const recent: Record<"keys" | "space" | "end", string[]> = { keys: [], space: [], end: [] };
  const out: Cue[] = [];
  for (const c of cues) {
    if (!TYPING_CUE.has(c.src)) {
      if (!stem) out.push(c);
      continue;
    }
    const part = c.src === keySpace ? "space" : c.src === keyEnd ? "end" : "keys";
    const pool = bank[part];
    // Rotated, never one of the last half-pool's picks: no key heard twice running, no pattern.
    const avoid = recent[part].slice(-Math.floor(pool.length / 2) || pool.length);
    let src = pool[Math.floor(r() * pool.length)];
    while (pool.length > 1 && avoid.includes(src)) src = pool[Math.floor(r() * pool.length)];
    recent[part].push(src);
    const db = (r() * 2 - 1) * mix.jitterDb;
    out.push({ ...c, src, volume: c.volume * mix.gain * 10 ** (db / 20), seconds: bank.seconds });
  }
  return out;
}

/** The review strips: the film at one frame a second, and its five passages under review. */
const range = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => +(from + (i * (to - from)) / (n - 1)).toFixed(2));
const at = (...ts: number[]) => ts.map((x) => +x.toFixed(2));
export const STRIPS = {
  film: Array.from({ length: Math.floor(END) + 1 }, (_, i) => Math.min(i + 0.02, END - 0.05)),
  opening: range(0, 2.2, 23),
  thinking: at(T.revise + 0.3, T.tick1 - 0.25, T.tick1 + 0.05, T.tick1 + 0.4, T.tick2 + 0.05, T.tick2 + 0.35, T.hum + 0.1, T.hum + 0.35, T.hum + 0.62, T.reachNotes + 0.15, T.notes + 0.05, T.notes + 0.5),
  entryCanvas: range(T.canvas - 0.2, RT.wide + RT.wideDur + 0.3, 44),
  canvas: range(T.dive - 0.3, T.open + 0.1, 28),
  ending: range(FADE_GO - 0.2, FADE_GO + 0.3, 16),
} as const;
type StripId = keyof typeof STRIPS;
function Film({ annotate, sound }: { annotate: boolean; sound: boolean }) {
  return <StudyComposition def={SUTURA_FILM} annotate={annotate} sound={sound} />;
}
function TypingTest({ typing, stem }: { typing: Typing; stem: boolean }) {
  return <StudyComposition def={{ ...SUTURA_FILM, id: `SuturaProductFilm-Typing-${typing}`, cues: typingCues(typing, stem) }} annotate={false} sound />;
}
function Strip({ which }: { which: StripId }) {
  return <StudyStrip def={SUTURA_FILM} times={[...STRIPS[which]]} />;
}

export function SuturaProductFilmCompositions() {
  const frames = Math.round(END * FPS);
  return (
    <>
      <Composition id="SuturaProductFilm" component={Film} width={FILM.width} height={FILM.height} fps={FPS} durationInFrames={frames} defaultProps={{ annotate: false, sound: true }} />
      <Composition id="SuturaProductFilm-TypingTest" component={TypingTest} width={FILM.width} height={FILM.height} fps={FPS} durationInFrames={frames} defaultProps={{ typing: "A" as Typing, stem: false }} />
      <Composition id="SuturaProductFilm-Annotated" component={Film} width={FILM.width} height={FILM.height} fps={FPS} durationInFrames={frames} defaultProps={{ annotate: true, sound: false }} />
      {(Object.keys(STRIPS) as StripId[]).map((id) => (
        <Composition key={id} id={`SuturaProductFilm-Strip-${id}`} component={Strip} {...stripSize(STRIPS[id].length)} fps={FPS} durationInFrames={1} defaultProps={{ which: id }} />
      ))}
    </>
  );
}
