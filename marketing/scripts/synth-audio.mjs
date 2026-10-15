// Sutura's marketing sound, synthesised: every sound the creatives use is
// generated here from nothing but arithmetic and a seeded PRNG — no samples,
// no downloads, no licence to track — and written as 48 kHz mono WAVs into
// src/audio/. Deterministic: the same files on every run.
//
//   node scripts/synth-audio.mjs        (npm run audio)
//
// The interface sounds (keys, ticks, clicks, the move, the air) are meant to
// be final-quality restraint. The music bed is a PLACEHOLDER: a synthesised
// pad and felt-piano sketch timed to Creative A's 9:16 cut, so pacing can be
// reviewed with sound. Replace it with a licensed track before release
// (CreativeAVertical's `music` prop).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RATE = 48000;
const OUT = path.resolve("src/audio");

// ── Primitives ─────────────────────────────────────────────────────────────

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
const noise = (n, seed) => {
  const r = prng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
};

/** RBJ biquad, run over a signal; `f` may be a number or a function of the sample index. */
function biquad(type, input, f, q = 0.707) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0, b1, b2, a1, a2;
  const coeffs = (freq) => {
    const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (type === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (type === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass, 0 dB peak
    [b0, b1, b2] = [b0 / a0, b1 / a0, b2 / a0];
    a1 = (-2 * cos) / a0;
    a2 = (1 - alpha) / a0;
  };
  const varying = typeof f === "function";
  if (!varying) coeffs(f);
  for (let i = 0; i < input.length; i++) {
    if (varying && i % 32 === 0) coeffs(f(i));
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Adds `src` × `gain` into `dst` from sample `at`. */
function mixInto(dst, src, at = 0, gain = 1) {
  for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * gain;
  return dst;
}

/** An exponential decay with a short linear attack, as a gain per sample. */
const hit = (t, attack, tau) => (t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / tau));

function normalize(x, peak) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

/** A few ms of fade at the end, so nothing clicks off. */
function tail(x, ms = 6) {
  const n = Math.round((ms / 1000) * RATE);
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
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
  console.log(`src/audio/${name}.wav  ${(x.length / RATE).toFixed(2)}s`);
}

// ── Interface sounds ───────────────────────────────────────────────────────

/** A laptop key: a soft top transient, a little body, and the key's return. */
function key(seed, { body = 0.3, bright = 1, tauBody = 0.018, release = 0.22 } = {}) {
  const r = prng(seed);
  const x = buffer(0.11);
  const n = noise(x.length, seed * 7 + 1);
  const top = biquad("bandpass", n, (2300 + r() * 700) * bright, 1.1);
  const knock = biquad("bandpass", n, 700 + r() * 250, 1.8);
  const f = 140 + r() * 50;
  const back = 0.042 + r() * 0.012;
  const backTone = biquad("bandpass", n, 3000 + r() * 500, 1.4);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    x[i] =
      top[i] * hit(t, 0.0006, 0.0055) +
      0.55 * knock[i] * hit(t, 0.0008, 0.011) +
      body * Math.sin(2 * Math.PI * f * t) * hit(t, 0.001, tauBody) +
      release * backTone[i] * hit(t - back, 0.0005, 0.0035);
  }
  return tail(normalize(biquad("lowpass", x, 6500), 0.9));
}

/** A row arriving: a small, dry wooden tick. */
function tick(pitch, seed) {
  const x = buffer(0.07);
  const n = noise(x.length, seed);
  const click = biquad("bandpass", n, 3800 * pitch, 2);
  const f = 1250 * pitch;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    x[i] =
      Math.sin(2 * Math.PI * f * t) * hit(t, 0.001, 0.011) +
      0.32 * Math.sin(2 * Math.PI * f * 2.74 * t) * hit(t, 0.001, 0.005) +
      0.5 * click[i] * hit(t, 0.0004, 0.0018);
  }
  return tail(normalize(x, 0.8));
}

/** A trackpad click: the press, then the lighter release. */
function click(seed) {
  const x = buffer(0.14);
  const n = noise(x.length, seed);
  const press = biquad("bandpass", n, 2100, 2.6);
  const lift = biquad("bandpass", n, 2700, 2.6);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    x[i] =
      press[i] * hit(t, 0.0004, 0.0028) +
      0.35 * Math.sin(2 * Math.PI * 520 * t) * hit(t, 0.0008, 0.007) +
      0.5 * lift[i] * hit(t - 0.072, 0.0004, 0.0022);
  }
  return tail(normalize(x, 0.9));
}

/** The camera moving: filtered air that opens and closes, no pitch. */
function whoosh(seconds, seed, top = 2000) {
  const x = buffer(seconds);
  const n = noise(x.length, seed);
  const shape = (i) => {
    const p = i / x.length;
    return Math.pow(Math.sin(Math.PI * Math.pow(p, 0.75)), 2);
  };
  const lp = biquad("lowpass", n, (i) => 220 + top * shape(i), 0.9);
  const hp = biquad("highpass", lp, 120);
  for (let i = 0; i < x.length; i++) x[i] = hp[i] * shape(i);
  return tail(normalize(x, 0.7), 20);
}

/** Open air for the Canvas: a high, breathy band and two faint partials. */
function air(seconds, seed) {
  const x = buffer(seconds);
  const n = noise(x.length, seed);
  const band = biquad("lowpass", biquad("bandpass", n, 5200, 0.6), 9000);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.55) * Math.min(1, (seconds - t) / 0.9);
    const shimmer = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2.6 * t);
    x[i] =
      env *
      (band[i] +
        0.05 * shimmer * Math.sin(2 * Math.PI * 1318.5 * t) +
        0.035 * (1 - shimmer) * Math.sin(2 * Math.PI * 1975.5 * t));
  }
  return tail(normalize(x, 0.5), 20);
}

// ── The placeholder bed ────────────────────────────────────────────────────

const NOTE = { D2: 73.42, G2: 98.0, A2: 110.0, B2: 123.47, D3: 146.83, E3: 164.81, "F#3": 185.0, G3: 196.0, A3: 220.0, B3: 246.94, D4: 293.66, E4: 329.63, "F#4": 369.99, G4: 392.0, A4: 440.0, B4: 493.88, E5: 659.25 };

/** A felt piano note: inharmonic partials, the higher ones dying first, a muffled hammer. */
function piano(freq, seconds, seed) {
  const x = buffer(seconds);
  const r = prng(seed);
  const thump = biquad("lowpass", noise(x.length, seed), 380);
  for (let k = 1; k <= 9; k++) {
    const f = k * freq * Math.sqrt(1 + 0.00035 * k * k);
    if (f > 6000) break;
    const amp = 1 / Math.pow(k, 1.6);
    const tau = 2.4 / Math.pow(k, 0.75);
    const phase = r() * Math.PI * 2;
    for (let i = 0; i < x.length; i++) {
      const t = i / RATE;
      x[i] += amp * Math.sin(2 * Math.PI * f * t + phase) * hit(t, 0.004, tau);
    }
  }
  for (let i = 0; i < x.length; i++) x[i] += 0.25 * thump[i] * hit(i / RATE, 0.001, 0.012);
  return tail(biquad("lowpass", x, 2400), 30);
}

/** A soft pad voice: two slightly detuned triangle-ish tones. */
function padVoice(freq, seconds) {
  const x = buffer(seconds);
  for (const detune of [1, 1.0035]) {
    for (const [k, a] of [[1, 1], [3, 1 / 9], [5, 1 / 25]]) {
      const f = freq * detune * k;
      for (let i = 0; i < x.length; i++) x[i] += a * Math.sin((2 * Math.PI * f * i) / RATE);
    }
  }
  return x;
}

function bed(seconds) {
  const out = buffer(seconds);
  // [start, end, notes, level] — the pad's chords, crossfading.
  const chords = [
    [0, 1.7, ["D3", "A3", "E4", "F#4"], 0.7],
    [1.4, 4.2, ["G2", "D3", "B3", "F#4", "A4"], 1.0],
    [3.9, 5.5, ["D3", "A3", "F#4"], 0.75],
    [5.1, 7.0, ["E3", "B3", "D4", "G4"], 0.85],
    [6.7, 8.7, ["G2", "D3", "A3", "B3", "F#4"], 0.85],
    [8.3, 10.3, ["D3", "A3", "E4", "F#4"], 0.6],
    [9.9, seconds, ["D2", "A2", "F#3", "E4"], 0.75],
  ];
  for (const [a, b, notes, level] of chords) {
    const len = b - a;
    const chord = buffer(len);
    for (const n of notes) mixInto(chord, padVoice(NOTE[n], len), 0, 1 / notes.length);
    for (let i = 0; i < chord.length; i++) {
      const t = i / RATE;
      chord[i] *= level * Math.min(1, t / 0.5) * Math.min(1, (len - t) / 0.5);
    }
    mixInto(out, biquad("lowpass", chord, 1500), Math.round(a * RATE), 0.16);
  }
  // The felt piano: one quiet note at each turn of the cut, and the close rolled.
  const notes = [
    [0.05, "A4", 0.5], [1.52, "B4", 0.55], [4.02, "F#4", 0.6], [5.28, "G4", 0.5],
    [6.82, "A4", 0.5], [8.42, "F#4", 0.55], [10.1, "D3", 0.55], [10.15, "A3", 0.5], [10.2, "F#4", 0.5], [10.26, "E4", 0.45],
  ];
  notes.forEach(([at, n, v], i) => mixInto(out, piano(NOTE[n], Math.min(3.2, seconds - at), 900 + i), Math.round(at * RATE), v * 0.22));
  // Out: the last second and a half falls away.
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] *= Math.min(1, t / 0.08) * Math.min(1, Math.max(0, (seconds - t) / 1.4));
  }
  return normalize(out, 0.9);
}

// ── The product film's thinking motif ─────────────────────────────────────

/**
 * The thinking motif's pulse: tactile, not a clock — a felt-tipped low knock
 * (a damped sine falling a few hertz) with a breath of contact, no ring.
 */
function pulse(seed, pitch = 1) {
  const x = buffer(0.16);
  const n = noise(x.length, seed);
  const contact = biquad("bandpass", n, 1400 * pitch, 1.2);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    const f = 196 * pitch * (1 + 0.08 * Math.exp(-t / 0.01));
    x[i] =
      Math.sin(2 * Math.PI * f * t) * hit(t, 0.002, 0.03) +
      0.22 * Math.sin(2 * Math.PI * f * 2.01 * t) * hit(t, 0.002, 0.014) +
      0.18 * contact[i] * hit(t, 0.0006, 0.004);
  }
  return tail(normalize(biquad("lowpass", x, 2600), 0.8), 12);
}

/** The motif resolving: one restrained tonal step — a rolled open fifth on the felt piano, nothing after it. */
function resolve() {
  // The chord as it was (identical to 2.35s), then allowed to finish: the strings keep their own decay
  // while a soft release (a damper settling, Gaussian so it begins with no audible bend) takes them
  // down over ~1.1s to far below hearing — so the ear notices the chord arrive, never the file end.
  const LEN = 3.6;
  const RELEASE_AT = 2.35;
  const out = buffer(LEN);
  mixInto(out, piano(NOTE.D3, LEN, 951), 0, 0.5);
  mixInto(out, piano(NOTE.A3, LEN - 0.05, 952), Math.round(0.045 * RATE), 0.42);
  mixInto(out, piano(NOTE.E4, LEN - 0.1, 953), Math.round(0.09 * RATE), 0.26);
  for (let i = Math.round(RELEASE_AT * RATE); i < out.length; i++) out[i] *= Math.exp(-Math.pow((i / RATE - RELEASE_AT) / 0.42, 2));
  return tail(normalize(out, 0.7), 40);
}

// ── The final R&D pass: two quiet interface sounds ─────────────────────────

/** A sheet sliding open beside the page: a short, soft brush of paper — band-limited noise, no tone, no swell. */
function sheet(seed) {
  const x = buffer(0.24);
  const n = noise(x.length, seed);
  const brush = biquad("bandpass", n, (i) => 900 + 700 * (i / x.length), 0.8);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    x[i] = brush[i] * (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.05));
  }
  return tail(normalize(biquad("lowpass", x, 3200), 0.5), 20);
}

/** An object set down: a felt-soft low touch (a damped sine, a breath of contact) — tactile, not a boom. */
function settle(seed) {
  const x = buffer(0.5);
  const n = noise(x.length, seed);
  const contact = biquad("lowpass", n, 900);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    x[i] = Math.sin(2 * Math.PI * 92 * t) * hit(t, 0.006, 0.07) + 0.4 * Math.sin(2 * Math.PI * 184.5 * t) * hit(t, 0.004, 0.03) + 0.25 * contact[i] * hit(t, 0.002, 0.02);
  }
  return tail(normalize(biquad("lowpass", x, 1800), 0.7), 30);
}

// ── The product film's one human sound ─────────────────────────────────────

/**
 * A person thinking at their desk: a short, low, closed-mouth "hm" — a breath
 * of /h/ through the nose, then a relaxed nasal murmur falling about two
 * semitones and letting go. Synthesised, so it is deterministic and carries no
 * recording rights; a PLACEHOLDER for a real recorded "hm" (see
 * PRODUCT_FILM_FIRST_CUT.md). The voice: a glottal pulse train (harmonics
 * tilted ~-10 dB/octave, with jitter and shimmer so it is not a tone), shaped
 * by the nasal murmur — one strong resonance near 270 Hz, faint nasal ones
 * near 1.3 and 2.4 kHz (~4% of the energy: a voice, not a tone) — and an
 * asymmetric breath envelope.
 */
/**
 * TEMPORARY HUMAN VOCAL PLACEHOLDER — "mmh…": a person alone at a desk, thinking,
 * not meaning to make a sound. Replace with a real close-miked recording
 * (one take, 0.7–1.0 s, same start time). Built as a voice, not a tone:
 *   · a glottal source (Rosenberg pulses: soft open phase, so few highs) with
 *     jitter, shimmer and turbulent air riding each cycle (breathiness);
 *   · a closed-lip nasal tract: the /m/ murmur near 260 Hz, weak nasal
 *     formants near 1.0 / 2.25 / 3.1 kHz, and the antiresonance near 1.3 kHz
 *     that makes a hum sound like a hum and not a vowel;
 *   · a falling, unhurried pitch (≈118 → 126 → 96 Hz) that breaks into a few
 *     irregular creaky cycles as it dies, and a nasal exhale that outlasts it;
 *   · a small room: a few early reflections and a short diffuse tail.
 */
function resonator(input, f, bw, gain = 1) {
  // A two-pole resonance (Klatt): unity at DC-normalised peak × gain.
  const out = new Float32Array(input.length);
  const r = Math.exp((-Math.PI * bw) / RATE);
  const c = -r * r;
  const b = 2 * r * Math.cos((2 * Math.PI * f) / RATE);
  const a = (1 - b - c) * gain;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = a * input[i] + b * y1 + c * y2;
    y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
function antiresonator(input, f, bw) {
  const out = new Float32Array(input.length);
  const r = Math.exp((-Math.PI * bw) / RATE);
  const c0 = -r * r;
  const b0 = 2 * r * Math.cos((2 * Math.PI * f) / RATE);
  const a0 = 1 - b0 - c0;
  const a = 1 / a0, b = -b0 / a0, c = -c0 / a0;
  let x1 = 0, x2 = 0;
  for (let i = 0; i < input.length; i++) {
    out[i] = a * input[i] + b * x1 + c * x2;
    x2 = x1; x1 = input[i];
  }
  return out;
}
function hum(seed) {
  const dur = 0.94;
  const x = buffer(dur);
  const r = prng(seed);
  const n = noise(x.length, seed + 1);
  const smooth = (u) => u * u * (3 - 2 * u);
  // Pitch: a small lift into the hum, then a long, thinking fall.
  const f0At = (t) => {
    if (t < 0.16) return 118 + 8 * smooth(t / 0.16);
    const u = Math.min(1, (t - 0.16) / 0.5);
    return 126 - 30 * smooth(u);
  };
  // Voice amplitude: soft attack (~110ms from 60ms), a gentle swell, a long let-go (gone by ~0.74s).
  const voiceAt = (t) => {
    if (t < 0.06) return 0;
    if (t < 0.17) return 0.5 - 0.5 * Math.cos((Math.PI * (t - 0.06)) / 0.11);
    if (t < 0.34) return 1 + 0.06 * Math.sin((Math.PI * (t - 0.17)) / 0.17);
    return Math.max(0, Math.exp(-(t - 0.34) / 0.16) - Math.exp(-(0.74 - 0.34) / 0.16)) / (1 - Math.exp(-(0.74 - 0.34) / 0.16));
  };
  // Source: Rosenberg pulses, cycle by cycle.
  const src = new Float32Array(x.length);
  const asp = new Float32Array(x.length);
  let i = 0;
  let jit = 0;
  while (i < x.length) {
    const t = i / RATE;
    const creak = t > 0.56; // the voice breaks into a few slow, irregular cycles as it dies
    jit += (r() - 0.5) * 0.012 - jit * 0.3;
    let f0 = f0At(t) * (1 + jit + 0.004 * Math.sin(2 * Math.PI * 5.1 * t));
    if (creak) f0 *= 0.55 + r() * 0.35;
    const period = Math.max(8, Math.round(RATE / f0));
    const shimmer = 1 + (r() - 0.5) * (creak ? 0.5 : 0.14);
    const open = Math.round(period * (creak ? 0.35 : 0.62));
    const rise = Math.round(open * 0.7);
    for (let k = 0; k < period && i + k < x.length; k++) {
      let g = 0;
      if (k < rise) g = 0.5 * (1 - Math.cos((Math.PI * k) / rise));
      else if (k < open) g = Math.cos(((Math.PI / 2) * (k - rise)) / (open - rise));
      const v = voiceAt((i + k) / RATE);
      src[i + k] = g * v * shimmer;
      // Breath rides the open phase.
      asp[i + k] = n[i + k] * (0.08 + 0.32 * g) * v;
    }
    i += period;
  }
  // Differentiate (lip radiation, gentle), then the nasal tract.
  const glottal = new Float32Array(x.length);
  for (let k = 1; k < x.length; k++) glottal[k] = src[k] - 0.8 * src[k - 1];
  const excite = new Float32Array(x.length);
  for (let k = 0; k < x.length; k++) excite[k] = glottal[k] + 0.55 * asp[k];
  const murmur = resonator(excite, 262, 70, 1);
  const n1 = resonator(excite, 1010, 160, 0.16);
  const n2 = resonator(excite, 2250, 260, 0.022);
  const n3 = resonator(excite, 3100, 340, 0.008);
  let voice = new Float32Array(x.length);
  for (let k = 0; k < x.length; k++) voice[k] = murmur[k] + n1[k] + n2[k] + n3[k];
  voice = biquad("lowpass", biquad("lowpass", antiresonator(voice, 1300, 220), 2600, 0.6), 3400, 0.6);
  // The nasal exhale: air before the voice, under it, and outlasting it.
  const airBand = biquad("lowpass", biquad("bandpass", n, 700, 0.6), 1600);
  const airAt = (t) => (t < 0.07 ? 0.6 * Math.sin((Math.PI * t) / 0.14) : 0) + 0.12 * voiceAt(t) + (t > 0.5 ? 0.55 * Math.sin(Math.PI * Math.min(1, (t - 0.5) / 0.42)) * Math.exp(-(t - 0.5) / 0.22) : 0);
  let peakV = 0;
  for (const v of voice) peakV = Math.max(peakV, Math.abs(v));
  let peakA = 0;
  for (const v of airBand) peakA = Math.max(peakA, Math.abs(v));
  const dry = new Float32Array(x.length);
  for (let k = 0; k < x.length; k++) dry[k] = voice[k] / peakV + 0.07 * (airBand[k] / peakA) * airAt(k / RATE);
  // A small room at a desk: early reflections and a short, dark diffuse tail.
  const room = new Float32Array(x.length);
  mixInto(room, dry, 0, 1);
  for (const [ms, g] of [[6.5, 0.16], [11, 0.11], [17.5, 0.08], [26, 0.05]]) mixInto(room, biquad("lowpass", dry, 3000), Math.round((ms / 1000) * RATE), g);
  const rn = noise(Math.round(0.16 * RATE), seed + 9);
  const ir = rn.map((v, k) => v * Math.exp(-k / RATE / 0.045));
  const diffuse = new Float32Array(x.length);
  for (let k = 0; k < x.length; k += 1) {
    const d = dry[k];
    if (Math.abs(d) < 1e-4) continue;
    for (let j = 0; j < ir.length && k + j < x.length; j += 3) diffuse[k + j] += d * ir[j] * 0.006;
  }
  const dark = biquad("lowpass", diffuse, 1800);
  for (let k = 0; k < x.length; k++) x[k] = room[k] + dark[k];
  return tail(normalize(biquad("highpass", biquad("lowpass", x, 5200, 0.6), 70), 0.6), 40);
}

// ── Out ────────────────────────────────────────────────────────────────────

await mkdir(OUT, { recursive: true });
for (let v = 0; v < 4; v++) await write(`key-${v + 1}`, key(101 + v * 17));
await write("key-space", key(211, { body: 0.42, bright: 0.72, tauBody: 0.024, release: 0.3 }));
await write("key-end", key(307, { body: 0.5, bright: 0.85, tauBody: 0.03, release: 0.18 }));
for (let v = 0; v < 3; v++) await write(`tick-${v + 1}`, tick(1 + v * 0.06, 401 + v));
await write("click", click(503));
await write("whoosh", whoosh(0.7, 601, 2200));
await write("whoosh-soft", whoosh(0.8, 607, 1100));
await write("air", air(2.2, 701));
await write("bed-placeholder", bed(12));
await write("pulse-1", pulse(811, 1));
await write("pulse-2", pulse(812, 0.94));
await write("resolve", resolve());
await write("sheet", sheet(1201));
await write("settle", settle(1301));
await write("hum", hum(1401));
