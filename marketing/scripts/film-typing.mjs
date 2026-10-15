// The typing-sound experiment (SuturaProductFilm-TypingTest): three alternate
// keyboards under the final film's exact picture. The control film is never
// rendered, renamed or written here — its video stream is copied, bit for bit,
// and only a new audio track is laid under it.
//
//   node scripts/film-typing.mjs --stems <dir>     typing-only stems (control, A, B, C) + the control mix, for measuring
//   node scripts/film-typing.mjs --mix             out/film/typing-{A,B,C}.wav → sutura-product-film-typing-{A,B,C}-{1080p,540p}.mp4
//   node scripts/film-typing.mjs --compare         out/film/sutura-typing-comparison.mp4 (needs --mix first)
//   node scripts/film-typing.mjs --mix --versions D --sizes 1080p --test <scratch dir>
//                                                  the real keyboard: typing-D-real.wav, sutura-product-film-typing-D-real-1080p.mp4,
//                                                  sutura-typing-D-real-test.mp4 (opening + final typing only; COMPARE=0,5,32,36)
//   add --replace to re-render experiment files that already exist (never the control)

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const OUT = path.resolve("out/film");
/** The control and everything else already approved in out/film: never an output. */
const PROTECTED = new Set([
  "sutura-product-film-1080p.mp4", "sutura-product-film-540p.mp4",
  // The rejected synthesised experiments, kept as they are.
  ...["A", "B", "C"].flatMap((v) => [`typing-${v}.wav`, `sutura-product-film-typing-${v}-1080p.mp4`, `sutura-product-film-typing-${v}-540p.mp4`]),
  "sutura-typing-comparison.mp4",
].map((f) => path.join(OUT, f)));
const CONTROL_1080 = path.join(OUT, "sutura-product-film-1080p.mp4");
const CONTROL_540 = path.join(OUT, "sutura-product-film-540p.mp4");
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const VERSIONS = opt("--versions", "A,B,C").split(",");
const SIZES = opt("--sizes", "1080p,540p").split(",");
/** File label: D is the real keyboard. */
const label = (v) => (v === "D" ? "D-real" : v);

const BIN = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const env = { ...process.env, DYLD_LIBRARY_PATH: BIN };
const ffmpeg = (...a) => execFileSync(path.join(BIN, "ffmpeg"), ["-hide_banner", "-loglevel", "error", "-y", ...a], { env, stdio: "inherit" });

function claim(file) {
  const p = path.resolve(file);
  if (PROTECTED.has(p)) throw new Error(`refusing to write the control: ${p}`);
  if (existsSync(p) && !has("--replace")) throw new Error(`exists (pass --replace to re-render an experiment file): ${p}`);
  return p;
}

let serveUrl;
async function wav(typing, stem, output) {
  serveUrl ??= await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
  const inputProps = { typing, stem };
  const composition = await selectComposition({ serveUrl, id: "SuturaProductFilm-TypingTest", inputProps });
  const started = Date.now();
  await renderMedia({ serveUrl, composition, inputProps, codec: "wav", outputLocation: output, chromiumOptions: { gl: "angle" } });
  console.log(output, `${((Date.now() - started) / 1000).toFixed(0)}s`);
}

if (has("--stems")) {
  const dir = path.resolve(argv[argv.indexOf("--stems") + 1]);
  await mkdir(dir, { recursive: true });
  for (const v of ["control", ...VERSIONS]) await wav(v, true, path.join(dir, `stem-${v}.wav`));
  await wav("control", false, path.join(dir, "mix-control.wav"));
}

if (has("--mix")) {
  // Claim every path before rendering anything.
  const plan = VERSIONS.map((v) => ({
    v,
    wav: claim(path.join(OUT, `typing-${label(v)}.wav`)),
    films: SIZES.map((size) => [size === "1080p" ? CONTROL_1080 : CONTROL_540, claim(path.join(OUT, `sutura-product-film-typing-${label(v)}-${size}.mp4`))]),
  }));
  for (const p of plan) {
    await wav(p.v, false, p.wav);
    // The control's own video, copied; the new mix as AAC at the control's bitrate.
    for (const [video, out] of p.films) {
      ffmpeg("-i", video, "-i", p.wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "libfdk_aac", "-b:a", "320k", "-movflags", "+faststart", out);
      console.log(out);
    }
  }
}

if (has("--compare")) {
  // Opening typing (the line, then the lapse) and the closing typing, for the control and each version, each set introduced by a card.
  const [openFrom, openTo, endFrom, endTo] = (process.env.COMPARE ?? "").split(",").map(Number);
  if (![openFrom, openTo, endFrom, endTo].every(Number.isFinite)) throw new Error("COMPARE=openFrom,openTo,endFrom,endTo (seconds) required");
  const out = claim(path.join(OUT, "sutura-typing-comparison.mp4"));
  const cards = path.resolve(argv[argv.indexOf("--compare") + 1] ?? "");
  const tmp = path.join(cards, "segments");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const parts = [];
  const sets = [["control", CONTROL_1080], ...VERSIONS.map((v) => [v, path.join(OUT, `sutura-product-film-typing-${v}-1080p.mp4`)])];
  for (const [v, film] of sets) {
    const card = path.join(tmp, `${v}-card.mp4`);
    ffmpeg("-loop", "1", "-framerate", "30", "-t", "1.2", "-i", path.join(cards, `card-${v}.png`), "-f", "lavfi", "-t", "1.2", "-i", "anullsrc=r=48000:cl=stereo",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-c:a", "libfdk_aac", "-b:a", "320k", "-shortest", card);
    parts.push(card);
    for (const [name, from, to] of [["open", openFrom, openTo], ["end", endFrom, endTo]]) {
      const seg = path.join(tmp, `${v}-${name}.mp4`);
      ffmpeg("-ss", String(from), "-i", film, "-t", String(to - from), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-c:a", "libfdk_aac", "-b:a", "320k", seg);
      parts.push(seg);
    }
  }
  const inputs = parts.flatMap((p) => ["-i", p]);
  const graph = parts.map((_, i) => `[${i}:v][${i}:a]`).join("") + `concat=n=${parts.length}:v=1:a=1[v][a]`;
  ffmpeg(...inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-c:a", "libfdk_aac", "-b:a", "320k", "-movflags", "+faststart", out);
  console.log(out);
}

if (has("--test")) {
  // One version only: its opening typing, a breath of black, its final typing. Pieces are cut, then joined (no setpts in this ffmpeg).
  const [openFrom, openTo, endFrom, endTo] = (process.env.COMPARE ?? "0,5,32,36").split(",").map(Number);
  const tmp = path.resolve(opt("--test", ""));
  if (!opt("--test", "").startsWith("/")) throw new Error("--test <scratch dir> (absolute) required");
  await mkdir(tmp, { recursive: true });
  const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-c:a", "libfdk_aac", "-b:a", "320k"];
  const black = path.join(tmp, "black.png");
  await writeFile(black, blackPng(1920, 1080));
  for (const v of VERSIONS) {
    const film = path.join(OUT, `sutura-product-film-typing-${label(v)}-1080p.mp4`);
    const out = claim(path.join(OUT, `sutura-typing-${label(v)}-test.mp4`));
    const parts = [path.join(tmp, `${v}-open.mp4`), path.join(tmp, `${v}-gap.mp4`), path.join(tmp, `${v}-end.mp4`)];
    ffmpeg("-ss", String(openFrom), "-i", film, "-t", String(openTo - openFrom), ...enc, parts[0]);
    ffmpeg("-loop", "1", "-framerate", "30", "-t", "0.6", "-i", black, "-f", "lavfi", "-t", "0.6", "-i", "anullsrc=r=48000:cl=stereo", ...enc, "-shortest", parts[1]);
    ffmpeg("-ss", String(endFrom), "-i", film, "-t", String(endTo - endFrom), ...enc, parts[2]);
    ffmpeg(...parts.flatMap((x) => ["-i", x]), "-filter_complex", "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]", ...enc, "-movflags", "+faststart", out);
    console.log(out);
  }
}

/** An all-black RGB PNG (no image library needed). */
function blackPng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb)); return Buffer.concat([len, tb, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
