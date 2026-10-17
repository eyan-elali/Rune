// Ad #1, Variant B (Ad01StartSimpleVariantB): the full MP4, a review MP4,
// the contact sheet, the middle-transformation strip, the phone sheet, the
// Control-vs-B sheet and the organisation stills — into
// ads/ad-01-start-simple-variant-b/. Never writes into the Control's folder.
//
//   node scripts/ad01b.mjs [--mp4] [--small] [--sheets] [--stills]   (npm run ad:01b; default: everything)
//   node scripts/ad01b.mjs --frames 3.5 5.2                            (full-size stills at those seconds)

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const argv = process.argv.slice(2);
const args = new Set(argv.filter((a) => a.startsWith("--")));
const all = args.size === 0;
const want = (flag) => all || args.has(flag);
const OUT = path.resolve("ads/ad-01-start-simple-variant-b");
await mkdir(path.join(OUT, "frames"), { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };
const main = await selectComposition({ serveUrl, id: "Ad01StartSimpleVariantB" });
console.log(`Ad01StartSimpleVariantB: ${main.durationInFrames} frames = ${(main.durationInFrames / main.fps).toFixed(2)} s`);
const still = async (t, output) => {
  await renderStill({ serveUrl, composition: main, frame: Math.min(main.durationInFrames - 1, Math.max(0, Math.round(t * main.fps))), output, chromiumOptions });
  console.log(output, t.toFixed(2));
};

if (args.has("--frames")) {
  const times = argv.slice(argv.indexOf("--frames") + 1).filter((a) => !a.startsWith("--")).map(Number);
  for (const t of times) await still(t, path.join(OUT, "frames", `ad01b-${t.toFixed(2)}s.png`));
}
if (want("--sheets")) {
  for (const [id, file] of [["Ad01B-Sheet-contact", "contact-sheet.png"], ["Ad01B-Sheet-middle", "strip-middle-transformation.png"], ["Ad01B-Phone", "phone-sheet.png"], ["Ad01B-ControlVsB", "control-vs-variant-b.png"]]) {
    const composition = await selectComposition({ serveUrl, id });
    const output = path.join(OUT, file);
    await renderStill({ serveUrl, composition, frame: 0, output, chromiumOptions });
    console.log(output);
  }
}
if (want("--stills")) {
  // The organisation moment: before (three thoughts beside the still page), during (the second on its way), after (the Workspace the writer made).
  const ORG = Number(process.env.ORG_START ?? 5.15);
  await still(ORG - 0.15, path.join(OUT, "organisation-1-before.png"));
  await still(ORG + 0.72, path.join(OUT, "organisation-2-during.png"));
  await still(ORG + 2.0, path.join(OUT, "organisation-3-after.png"));
  await still(main.durationInFrames / main.fps - 0.05, path.join(OUT, "cta-final.png"));
  await still(0, path.join(OUT, "first-frame.png"));
}
if (want("--mp4")) {
  const output = path.join(OUT, "ad-01-variant-b-1080x1920.mp4");
  await renderMedia({ serveUrl, composition: main, codec: "h264", outputLocation: output, crf: 16, chromiumOptions });
  console.log(output);
}
if (want("--small")) {
  const output = path.join(OUT, "ad-01-variant-b-540x960-review.mp4");
  await renderMedia({ serveUrl, composition: main, codec: "h264", outputLocation: output, scale: 0.5, crf: 22, chromiumOptions });
  console.log(output);
}
