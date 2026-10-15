// Real keystrokes for the product film's typing test (version D): cut from a
// real recording of a physical mechanical keyboard, never synthesised.
//
//   node scripts/extract-typing-real.mjs <path to 399603_dustin-davis_typing.wav>
//
// Source: "Typing.wav" by Dustin_Davis (Rode NT1 over a mechanical keyboard,
// "No edits"), CC0 1.0 — https://freesound.org/people/Dustin_Davis/sounds/399603/,
// mirrored at https://commons.wikimedia.org/wiki/File:399603_dustin-davis_typing.wav
// (the file downloaded from Commons; SHA-1 checked below). See src/audio/typing-real/SOURCE.md.
//
// Each sample is one whole keystroke as recorded — the press, the key's own
// release 63–135 ms later, and its natural decay — chosen where nothing else
// sounds around it. Processing is deliberately light: a 100 Hz high-pass (the
// room's 22 Hz rumble and low hum), a gentle −4 dB dip around 8.5 kHz and a
// 15 kHz low-pass (crisp, not sharp), short fades, and levels drawn halfway
// toward the bank's median (half of each key's natural difference kept).
// No pitch change, no layering, no synthesis.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const SHA1 = "35b9888564d62e8a67e0ad4fa9e9668c977a33ed";
const OUT = path.resolve("src/audio/typing-real");

/** Seconds in the source: [press, release]. Letters: warm rather than bright; Space: the most body and the longest ring (a stabilised key). */
const LETTERS = [
  [142.019, 142.099], [169.549, 169.624], [263.007, 263.103], [338.392, 338.46], [346.315, 346.441], [478.021, 478.116],
  [555.437, 555.572], [574.523, 574.606], [586.248, 586.311], [681.621, 681.734], [696.656, 696.783], [725.967, 726.089],
];
const SPACE = [[75.269, 75.373], [440.839, 440.941], [448.107, 448.203]];

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/extract-typing-real.mjs <source wav>");
const raw = await readFile(src);
const sha = createHash("sha1").update(raw).digest("hex");
if (sha !== SHA1) throw new Error(`not the expected recording (sha1 ${sha})`);

// RIFF, IEEE float 32-bit, stereo (both channels identical: a mono microphone).
let o = 12, fmt, data;
while (o < raw.length) {
  const id = raw.toString("ascii", o, o + 4), size = raw.readUInt32LE(o + 4);
  if (id === "fmt ") fmt = { tag: raw.readUInt16LE(o + 8), ch: raw.readUInt16LE(o + 10), rate: raw.readUInt32LE(o + 12), bits: raw.readUInt16LE(o + 22) };
  if (id === "data") { data = { at: o + 8, size }; break; }
  o += 8 + size + (size & 1);
}
if (fmt.tag !== 3 || fmt.bits !== 32) throw new Error("expected 32-bit float");
const RATE = fmt.rate;
const read = (t0, t1) => {
  const a = Math.round(t0 * RATE), b = Math.round(t1 * RATE), x = new Float64Array(b - a);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += raw.readFloatLE(data.at + ((a + i) * fmt.ch + c) * 4);
    x[i] = s / fmt.ch;
  }
  return x;
};

function biquad(type, input, f, q = 0.707, gainDb = 0) {
  const out = new Float64Array(input.length);
  const w = (2 * Math.PI * f) / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === "highpass") [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** One keystroke: 60 ms of lead-in for the filters to settle (discarded), then press −4 ms … release +90 ms. */
function keystroke([press, release]) {
  const LEAD = 0.06;
  let x = read(press - 0.004 - LEAD, release + 0.09);
  x = biquad("highpass", biquad("highpass", x, 100, 0.541), 100, 1.307); // 4th-order Butterworth
  x = biquad("peak", x, 8500, 0.7, -4);
  x = biquad("lowpass", x, 15000);
  x = x.subarray(Math.round(LEAD * RATE));
  const fin = Math.round(0.003 * RATE), fout = Math.round(0.04 * RATE);
  for (let i = 0; i < fin; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
  for (let i = 0; i < fout; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fout);
  return x;
}

const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const bank = [...LETTERS.map((t) => ["key", t]), ...SPACE.map((t) => ["space", t])].map(([kind, t]) => ({ kind, t, x: keystroke(t) }));
const db = bank.map((k) => 20 * Math.log10(peak(k.x)));
const median = [...db].sort((a, b) => a - b)[Math.floor(db.length / 2)];
const TARGET = -6; // the bank's median peak, dBFS
await mkdir(OUT, { recursive: true });
const lines = [
  "// Generated by scripts/extract-typing-real.mjs — real keystrokes (CC0, Dustin_Davis, Freesound 399603). See SOURCE.md.",
];
const files = { key: [], space: [] };
let seconds = 0;
for (const [i, k] of bank.entries()) {
  const gain = 10 ** ((TARGET - median - (db[i] - median) / 2) / 20); // halfway toward the median
  const n = files[k.kind].length + 1;
  const name = `d-${k.kind}-${n}`;
  const buf = Buffer.alloc(44 + k.x.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + k.x.length * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(k.x.length * 2, 40);
  for (let j = 0; j < k.x.length; j++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, k.x[j] * gain)) * 32767), 44 + j * 2);
  await writeFile(path.join(OUT, `${name}.wav`), buf);
  const v = name.replace(/-/g, "_");
  lines.push(`import ${v} from "./${name}.wav";`);
  files[k.kind].push(v);
  seconds = Math.max(seconds, k.x.length / RATE);
  console.log(`src/audio/typing-real/${name}.wav  source ${k.t[0].toFixed(3)}s  ${(k.x.length / RATE * 1000).toFixed(0)} ms  natural ${db[i].toFixed(1)} dBFS → ${(db[i] + 20 * Math.log10(gain)).toFixed(1)} dBFS`);
}
lines.push(
  "",
  "/** Version D: letters (punctuation is an ordinary key) and the Space bar. */",
  `export const TYPING_REAL = { keys: [${files.key.join(", ")}], space: [${files.space.join(", ")}], end: [${files.key.join(", ")}], seconds: ${seconds.toFixed(3)} };`,
  "",
);
await writeFile(path.join(OUT, "index.ts"), lines.join("\n"));
console.log("src/audio/typing-real/index.ts");
