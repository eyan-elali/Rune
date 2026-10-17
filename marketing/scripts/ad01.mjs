// Performance Ad #1 (Ad01StartSimple): the full MP4, a review MP4, the
// contact sheet, the first-2-seconds strip, the growth strip, the phone sheet
// and the CTA still — one bundle, into ads/ad-01-start-simple/.
//
//   node scripts/ad01.mjs [--mp4] [--small] [--sheets] [--still]   (npm run ad:01; default: everything)
//   node scripts/ad01.mjs --frames 0.6 2.25 3.9                      (full-size stills at those seconds)

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const argv = process.argv.slice(2);
const args = new Set(argv.filter((a) => a.startsWith("--")));
const all = args.size === 0;
const want = (flag) => all || args.has(flag);
const OUT = path.resolve("ads/ad-01-start-simple");
await mkdir(path.join(OUT, "frames"), { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };
const main = await selectComposition({ serveUrl, id: "Ad01StartSimple" });
console.log(`Ad01StartSimple: ${main.durationInFrames} frames = ${(main.durationInFrames / main.fps).toFixed(2)} s`);

if (args.has("--frames")) {
  const times = argv.slice(argv.indexOf("--frames") + 1).filter((a) => !a.startsWith("--")).map(Number);
  for (const t of times) {
    const output = path.join(OUT, "frames", `ad01-${t.toFixed(2)}s.png`);
    await renderStill({ serveUrl, composition: main, frame: Math.min(main.durationInFrames - 1, Math.round(t * main.fps)), output, chromiumOptions });
    console.log(output);
  }
}
if (want("--sheets")) {
  for (const [id, file] of [["Ad01-Sheet-contact", "contact-sheet.png"], ["Ad01-Sheet-first2s", "strip-first-2-seconds.png"], ["Ad01-Sheet-growth", "strip-growth.png"], ["Ad01-Phone", "phone-sheet.png"]]) {
    const composition = await selectComposition({ serveUrl, id });
    const output = path.join(OUT, file);
    await renderStill({ serveUrl, composition, frame: 0, output, chromiumOptions });
    console.log(output);
  }
}
if (want("--still")) {
  const output = path.join(OUT, "cta-final.png");
  await renderStill({ serveUrl, composition: main, frame: main.durationInFrames - 1, output, chromiumOptions });
  const first = path.join(OUT, "first-frame.png");
  await renderStill({ serveUrl, composition: main, frame: 0, output: first, chromiumOptions });
  console.log(output, first);
}
if (want("--mp4")) {
  const output = path.join(OUT, "ad-01-start-simple-1080x1920.mp4");
  await renderMedia({ serveUrl, composition: main, codec: "h264", outputLocation: output, crf: 16, chromiumOptions });
  console.log(output);
}
if (want("--small")) {
  const output = path.join(OUT, "ad-01-start-simple-540x960-review.mp4");
  await renderMedia({ serveUrl, composition: main, codec: "h264", outputLocation: output, scale: 0.5, crf: 22, chromiumOptions });
  console.log(output);
}
