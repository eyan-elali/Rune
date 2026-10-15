import { Html5Audio, interpolate, Sequence } from "remotion";
import { FPS } from "../../../foundation/formats";
import { CHAPTER_1_LAST_TYPED, CHAPTER_1_RETURN_TYPED } from "../../../data/hollow";
import keyA from "../../../audio/key-1.wav";
import keyB from "../../../audio/key-2.wav";
import keyC from "../../../audio/key-3.wav";
import keyD from "../../../audio/key-4.wav";
import keySpace from "../../../audio/key-space.wav";
import keyEnd from "../../../audio/key-end.wav";
import tickA from "../../../audio/tick-1.wav";
import tickB from "../../../audio/tick-2.wav";
import tickC from "../../../audio/tick-3.wav";
import clickSound from "../../../audio/click.wav";
import whoosh from "../../../audio/whoosh.wav";
import whooshSoft from "../../../audio/whoosh-soft.wav";
import airSound from "../../../audio/air.wav";
import bedPlaceholder from "../../../audio/bed-placeholder.wav";
import { BOARD, CLOSE, CROSS, DURATION, GROWTH, MAP, RETURN, SETTLE } from "./script";
import { CLICKS, TYPING } from "./beats";

// The 9:16 cut's sound, as a cue sheet drawn from the same script as the
// picture: a keystroke on every character the writer types (the period that
// ends the chapter a little heavier), a tick as each thing arrives in the
// navigator — closer together and a shade higher as the book accelerates —
// the pointer's clicks, the camera's two real moves, open air over the
// Canvas, and a quiet bed under all of it that settles, thins for the
// return to writing and resolves on the close. Nothing here is needed to
// understand the creative; it is mixed to sit well under a phone's speaker.
//
// Every sound is synthesised by scripts/synth-audio.mjs (no third-party
// media). The bed is a placeholder for a licensed track: pass `music`.

type Cue = { at: number; src: string; volume: number; seconds: number };

const KEYS = [keyA, keyB, keyC, keyD];
const TICKS = [tickA, tickB, tickC];

function typingCues(text: string, times: readonly number[], volume: number, fade?: (t: number) => number): Cue[] {
  return [...text].map((ch, i) => ({
    at: times[i] - 0.012,
    src: ch === " " ? keySpace : ch === "." ? keyEnd : KEYS[(i * 7 + 3) % KEYS.length],
    volume: (ch === "." ? volume * 1.25 : volume) * (fade ? fade(times[i]) : 1),
    seconds: 0.12,
  }));
}

/** The writing after the return fades with the footage into the close. */
const intoClose = (t: number) => interpolate(t, [CLOSE.footageOut, CLOSE.footageOut + CLOSE.footageDur + 0.3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const CUES: Cue[] = [
  ...typingCues(CHAPTER_1_LAST_TYPED, TYPING.ending, 0.5),
  { at: CROSS.at - 0.04, src: whoosh, volume: 0.42, seconds: 0.7 },
  ...GROWTH.map((g, i) => ({
    at: g.at,
    src: TICKS[Math.min(TICKS.length - 1, Math.floor((i / GROWTH.length) * TICKS.length))],
    volume: 0.3 + 0.03 * i,
    seconds: 0.08,
  })),
  { at: SETTLE.at - 0.02, src: whooshSoft, volume: 0.24, seconds: 0.8 },
  ...CLICKS.map((at) => ({ at: at - 0.05, src: clickSound, volume: 0.55, seconds: 0.15 })),
  { at: BOARD.pushAt - 0.02, src: whooshSoft, volume: 0.14, seconds: 0.8 },
  { at: MAP.pushAt, src: airSound, volume: 0.42, seconds: 2.2 },
  ...typingCues(CHAPTER_1_RETURN_TYPED, TYPING.return, 0.42, intoClose).filter((c) => c.volume > 0.01),
];

/** The bed's level over the cut: in under the first words, up a little as the book grows, down for the writing, out with the close. */
function bedLevel(t: number): number {
  return interpolate(
    t,
    [0, 0.4, 1.5, 3.9, 4.6, 8.3, 9.0, 10.0, DURATION],
    [0, 0.5, 0.62, 0.8, 0.62, 0.62, 0.42, 0.62, 0.62],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
}

export function Soundtrack({ music }: { music?: string }) {
  return (
    <>
      <Html5Audio src={music ?? bedPlaceholder} volume={(f) => bedLevel(f / FPS)} />
      {CUES.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} durationInFrames={Math.ceil(c.seconds * FPS) + 1} layout="none">
          <Html5Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
}
