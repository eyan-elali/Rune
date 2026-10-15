// Alternate typing sounds for the product film (a sound-only experiment):
// three synthesised keyboards, each a bank of distinct keys, written as
// 48 kHz mono WAVs into src/audio/typing/ with an index.ts manifest. The
// control film keeps its own keys (synth-audio.mjs); nothing here touches them.
//
//   node scripts/synth-typing.mjs
//
// A key is three physical events, not one sample of noise: the fingertip
// meeting the cap (soft, dark), the cap bottoming out (an impact pulse whose
// width sets how hard it sounds, driving a few damped resonances of cap, plate
// and chassis), and the cap returning (lighter, later). Every key in a bank
// differs in impact width, resonance tuning and balance, and return timing.
//
//   A · soft low-profile laptop   — narrow mids, minimal click, short
//   B · deeper tactile keyboard   — a soft tactile bump, lower body, firmer return
//   C · natural writer-room       — softer, less even, with a desk and a small room

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RATE = 48000;
const OUT = path.resolve("src/audio/typing");

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));
const noise = (n, r) => Float32Array.from({ length: n }, () => r() * 2 - 1);
const db = (g) => 10 ** (g / 20);

/** RBJ biquad (lowpass, highpass, bandpass, peaking with `gainDb`). */
function biquad(type, input, f, q = 0.707, gainDb = 0) {
  const out = new Float32Array(input.length);
  const w = (2 * Math.PI * Math.min(f, RATE * 0.45)) / RATE;
  const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === "highpass") [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === "bandpass") [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  else [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** A damped resonance (two-pole), excited by `x`: frequency f, decay time constant tau (s). */
function mode(x, f, tau) {
  const out = new Float32Array(x.length);
  const r = Math.exp(-1 / (tau * RATE)), w = (2 * Math.PI * f) / RATE;
  const c1 = 2 * r * Math.cos(w), c2 = -r * r, g = 1 - r;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = g * x[i] + c1 * y1 + c2 * y2;
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** A contact: a raised-cosine force pulse of `width` seconds at `at`, with a little friction noise under it. The wider, the softer. */
function contact(n, at, width, gain, grit, r) {
  const x = new Float32Array(n);
  const s = Math.round(at * RATE), w = Math.max(2, Math.round(width * RATE));
  for (let i = 0; i < w && s + i < n; i++) {
    const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / w);
    x[s + i] = gain * env * (1 + grit * (r() * 2 - 1));
  }
  return x;
}

const add = (dst, src, g = 1, at = 0) => {
  for (let i = 0; i < src.length && i + at < dst.length; i++) if (i + at >= 0) dst[i + at] += src[i] * g;
  return dst;
};
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function fadeOut(x, ms) {
  const n = Math.round((ms / 1000) * RATE);
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= (i / n) ** 2;
  return x;
}

/** A few ms of fine grain where the cap meets the plate: what makes a close recording close. Scaled to the body it sits on. */
function grain(n, at, tau, r, against, level) {
  const x = biquad("highpass", noise(n, r), 3200, 0.7);
  const s = Math.round(at * RATE);
  for (let i = 0; i < n; i++) x[i] *= i < s ? 0 : Math.exp(-(i - s) / (tau * RATE));
  const k = (level * peak(against)) / Math.max(1e-9, peak(x));
  return x.map((v) => v * k);
}

/** Resonances excited by an impulse train, each detuned and re-weighted for this key's place on the deck. */
function ring(exc, modes, r, spread) {
  const out = new Float32Array(exc.length);
  for (const [f, tau, g] of modes) {
    const ff = f * (1 + (r() * 2 - 1) * spread);
    const gg = g * db((r() * 2 - 1) * 2.5);
    add(out, mode(exc, ff, tau * (0.85 + r() * 0.3)), gg * ff / 1000);
  }
  return out;
}

// ── The three keyboards ────────────────────────────────────────────────────

/** A · a good modern laptop keyboard, close, in a quiet room. */
function laptopKey(seed, kind = "key") {
  const r = prng(seed);
  const space = kind === "space", end = kind === "end";
  const x = buffer(0.15);
  const n = x.length;
  // The fingertip, then the cap at the bottom ~1.5–3 ms later.
  const touchAt = 0.0005, bottom = 0.0016 + r() * 0.0014;
  const width = (space ? 0.6 : end ? 0.5 : 0.38) * (0.8 + r() * 0.4) / 1000;
  const press = contact(n, bottom, width, 1, 0.25, r);
  if (space) add(press, contact(n, bottom + 0.0012 + r() * 0.0015, width * 1.3, 0.55, 0.3, r)); // the bar's far end meets the plate a moment later
  const modes = space
    ? [[300, 0.014, 0.9], [610, 0.011, 1], [980, 0.008, 0.8], [1550, 0.005, 0.6], [2400, 0.0025, 0.35]]
    : [[420, 0.011, 0.8], [760, 0.009, 1], [1180, 0.007, 0.9], [1750, 0.0045, 0.8], [2600, 0.0028, 0.5], [3500, 0.0018, 0.2]];
  const body = ring(press, modes, r, 0.06);
  // Felt more than heard: a soft, dark tap of skin on the cap.
  const touch = biquad("lowpass", contact(n, touchAt, 0.0026, 0.5, 0.8, r), 1400);
  // The return: lighter, a touch higher, 55–85 ms on (later on the bar).
  const back = (space ? 0.075 : 0.055) + r() * 0.03;
  const lift = contact(n, back, (0.45 + r() * 0.2) / 1000, (space ? 0.42 : 0.3) * (0.7 + r() * 0.5), 0.3, r);
  const liftBody = ring(lift, modes.map(([f, t, g]) => [f * 1.12, t * 0.7, g]), r, 0.05);
  const air = grain(n, bottom, 0.0012, r, body, 0.25);
  for (let i = 0; i < n; i++) x[i] = body[i] + air[i] + 0.012 * touch[i] + 0.55 * liftBody[i];
  let y = biquad("lowpass", biquad("lowpass", x, 6200, 0.6), 8000);
  y = biquad("peak", y, 3200, 0.9, -2.5); // less tick, more key
  y = biquad("highpass", y, 95);
  return fadeOut(y, 12);
}

/** B · a quieter, deeper, more tactile board: a soft bump on the way down, a fuller bottom, a firmer return. */
function tactileKey(seed, kind = "key") {
  const r = prng(seed);
  const space = kind === "space", end = kind === "end";
  const x = buffer(0.17);
  const n = x.length;
  // The tactile bump (small, high, soft) at the onset; the bottom 5–8 ms later.
  const bump = contact(n, 0.0004, 0.0005, 0.22 + r() * 0.08, 0.4, r);
  const bottom = 0.005 + r() * 0.003;
  const width = (space ? 0.6 : end ? 0.5 : 0.42) * (0.8 + r() * 0.4) / 1000;
  const press = contact(n, bottom, width, 1, 0.2, r);
  if (space) add(press, contact(n, bottom + 0.0015 + r() * 0.002, width * 1.2, 0.6, 0.25, r));
  const modes = space
    ? [[175, 0.02, 1.2], [330, 0.016, 1.1], [600, 0.011, 0.8], [1000, 0.007, 0.5], [1700, 0.004, 0.3]]
    : [[230, 0.014, 1.1], [420, 0.012, 1.1], [690, 0.01, 0.95], [1080, 0.007, 0.8], [1700, 0.0042, 0.6], [2600, 0.0024, 0.3], [3400, 0.0015, 0.08]];
  const body = ring(press, modes, r, 0.06);
  const click = ring(bump, [[1400, 0.003, 0.5], [2300, 0.002, 0.3]], r, 0.08);
  const back = (space ? 0.09 : 0.07) + r() * 0.035;
  const lift = contact(n, back, (0.8 + r() * 0.3) / 1000, (space ? 0.4 : 0.32) * (0.7 + r() * 0.5), 0.25, r);
  const liftBody = ring(lift, modes.map(([f, t, g]) => [f * 1.25, t * 0.6, g]), r, 0.05);
  const air = grain(n, bottom, 0.001, r, body, 0.14);
  for (let i = 0; i < n; i++) x[i] = body[i] + air[i] + click[i] + 0.5 * liftBody[i];
  let y = biquad("lowpass", biquad("lowpass", x, 5000, 0.6), 7000);
  y = biquad("peak", y, 150, 0.8, -2); // body, not thock
  y = biquad("highpass", y, 80);
  return fadeOut(y, 14);
}

/** C · a person at a desk: softer, less even, the desk under the laptop and a small room around it. */
function roomKey(seed, kind = "key") {
  const r = prng(seed);
  const space = kind === "space", end = kind === "end";
  const x = buffer(0.2);
  const n = x.length;
  const firm = 0.75 + r() * 0.5; // how hard this finger lands
  const bottom = 0.0018 + r() * 0.0025;
  const width = (space ? 0.55 : end ? 0.45 : 0.38) * (0.75 + r() * 0.6) / 1000;
  const press = contact(n, bottom, width, firm, 0.35, r);
  // Off-centre: sometimes a corner meets the plate a hair later.
  if (space || r() < 0.35) add(press, contact(n, bottom + 0.0008 + r() * 0.002, width * 1.2, 0.25 + r() * 0.35, 0.35, r));
  const modes = space
    ? [[290, 0.015, 1], [580, 0.011, 1], [940, 0.008, 0.7], [1500, 0.0045, 0.45], [2300, 0.0024, 0.25]]
    : [[400, 0.011, 0.9], [730, 0.009, 1], [1130, 0.007, 0.85], [1700, 0.0045, 0.8], [2500, 0.0026, 0.5], [3300, 0.0016, 0.15]];
  const body = ring(press, modes, r, 0.1);
  const touch = biquad("lowpass", contact(n, 0.0004, 0.003, 0.6, 0.9, r), 1200);
  // The desk under the laptop, on firmer presses only.
  const desk = mode(contact(n, bottom, 0.002, firm > 1 ? (firm - 0.9) * 2 : 0, 0, r), 95 + r() * 25, 0.018);
  // Not every return is heard: a light finger rides the key back up.
  const back = (space ? 0.08 : 0.06) + r() * 0.045;
  const lifted = r() < 0.8;
  const lift = contact(n, back, (0.5 + r() * 0.35) / 1000, lifted ? (space ? 0.4 : 0.26) * (0.5 + r() * 0.7) : 0, 0.35, r);
  const liftBody = ring(lift, modes.map(([f, t, g]) => [f * 1.1, t * 0.7, g]), r, 0.08);
  const dry = new Float32Array(n);
  const air = grain(n, bottom, 0.0012, r, body, 0.18);
  for (let i = 0; i < n; i++) dry[i] = body[i] + air[i] + 0.016 * touch[i] + 0.25 * desk[i] + 0.55 * liftBody[i];
  // The room: the desk's near reflection, a few walls, and a short dark tail (~30 ms).
  const wet = new Float32Array(n);
  const darkDry = biquad("lowpass", dry, 3000);
  for (const [ms, g] of [[1.3, 0.22], [6.8, 0.07], [10.5, 0.05], [15.5, 0.035], [22, 0.025]]) add(wet, darkDry, g * (0.85 + r() * 0.3), Math.round((ms / 1000) * RATE));
  const ir = noise(Math.round(0.12 * RATE), r).map((v, k) => (k < 0.006 * RATE ? 0 : v * Math.exp(-k / RATE / 0.03)));
  const diffuse = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = darkDry[k];
    if (Math.abs(d) < 1e-6) continue;
    for (let j = 0; j < ir.length && k + j < n; j += 2) diffuse[k + j] += d * ir[j];
  }
  const room = biquad("lowpass", diffuse, 2200);
  const roomGain = 0.012 / Math.max(1e-9, peak(room) / Math.max(1e-9, peak(dry)));
  for (let i = 0; i < n; i++) x[i] = dry[i] + wet[i] + room[i] * roomGain * 1.0;
  let y = biquad("lowpass", biquad("lowpass", x, 5400, 0.6), 7000);
  y = biquad("peak", y, 2700, 0.9, -2.5);
  y = biquad("highpass", y, 70);
  return fadeOut(y, 25);
}

// ── Banks ──────────────────────────────────────────────────────────────────

/** Each bank is normalised as one instrument: its keys average a 0.7 peak (no file above 0.95); spaces and ends keep their level relative to them. */
function bank(make, seed, count) {
  const keys = Array.from({ length: count }, (_, i) => make(seed + i * 31, "key"));
  const space = Array.from({ length: 3 }, (_, i) => make(seed + 1000 + i * 37, "space"));
  const end = Array.from({ length: 2 }, (_, i) => make(seed + 2000 + i * 41, "end"));
  const all = [...keys, ...space, ...end];
  const k = Math.min(0.7 / (keys.reduce((s, x) => s + peak(x), 0) / keys.length), 0.95 / Math.max(...all.map(peak)));
  for (const x of all) for (let i = 0; i < x.length; i++) x[i] *= k;
  return { keys, space, end };
}

async function write(name, x) {
  const data = Buffer.alloc(44 + x.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + x.length * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  await writeFile(path.join(OUT, `${name}.wav`), data);
}

await mkdir(OUT, { recursive: true });
const BANKS = { a: bank(laptopKey, 5101, 10), b: bank(tactileKey, 6203, 10), c: bank(roomKey, 7307, 12) };
const lines = [
  "// Generated by scripts/synth-typing.mjs — the alternate typing banks (sound-only experiment).",
  "// A · soft low-profile laptop · B · deeper tactile · C · natural writer-room.",
];
const manifest = {};
for (const [id, b] of Object.entries(BANKS)) {
  manifest[id] = { keys: [], space: [], end: [], seconds: 0 };
  for (const part of ["keys", "space", "end"]) {
    for (const [i, x] of b[part].entries()) {
      const name = `${id}-${part === "keys" ? "key" : part}-${i + 1}`;
      await write(name, x);
      const v = name.replace(/-/g, "_");
      lines.push(`import ${v} from "./${name}.wav";`);
      manifest[id][part].push(v);
      manifest[id].seconds = Math.max(manifest[id].seconds, x.length / RATE);
      console.log(`src/audio/typing/${name}.wav  ${(x.length / RATE).toFixed(3)}s  peak ${peak(x).toFixed(2)}`);
    }
  }
}
lines.push("", "export type TypingBankFiles = { keys: string[]; space: string[]; end: string[]; seconds: number };", "export const TYPING_BANKS: Record<\"A\" | \"B\" | \"C\", TypingBankFiles> = {");
for (const [id, m] of Object.entries(manifest)) lines.push(`  ${id.toUpperCase()}: { keys: [${m.keys.join(", ")}], space: [${m.space.join(", ")}], end: [${m.end.join(", ")}], seconds: ${m.seconds.toFixed(3)} },`);
lines.push("};", "");
await writeFile(path.join(OUT, "index.ts"), lines.join("\n"));
console.log("src/audio/typing/index.ts");
