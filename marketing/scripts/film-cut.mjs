// The product film's first complete cut (SuturaProductFilm): its strips, its
// review stills and its previews, from one bundle.
//
//   node scripts/film-cut.mjs [--strips] [--stills] [--mp4] [--small]   (npm run film:cut; default: everything)
//   → product-film/film/strip-{film,growth,canvas,ending}.png, product-film/film/review/*.png,
//     out/film/sutura-product-film-1080p.mp4, out/film/sutura-product-film-540p.mp4

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const args = new Set(process.argv.slice(2));
const all = ![...args].some((a) => a.startsWith("--"));
const want = (flag) => all || args.has(flag);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };
await mkdir("product-film/film/review", { recursive: true });
await mkdir("out/film", { recursive: true });

if (want("--strips")) {
  const only = process.env.STRIPS ? process.env.STRIPS.split(",") : null;
  for (const id of ["film", "opening", "thinking", "entryCanvas", "canvas", "ending"]) {
    if (only && !only.includes(id)) continue;
    const composition = await selectComposition({ serveUrl, id: `SuturaProductFilm-Strip-${id}` });
    const out = path.join("product-film/film", `strip-${id.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}.png`);
    await renderStill({ serveUrl, composition, frame: 0, output: out, chromiumOptions });
    console.log(out);
  }
}

/** The review moments (seconds), named. */
const REVIEW = [
  ["01-opening-medium-wide", 0.0], ["02-push-into-prose", 0.6], ["03-normal-typing", 1.7], ["04-growth-begins", 2.6],
  ["05-growth-peak", 3.31], ["06-growth-deceleration", 4.1], ["07-growth-rest", 5.1], ["08-cursor-return", 5.6], ["09-key-cabinet", 6.5],
  ["10-second-tick", 8.1], ["11-human-voice", 8.8], ["12-revision-notes", 10.6], ["13-inspector", 11.85], ["14-b-midpoint", 12.85],
  ["15-full-reveal", 14.7], ["16-research-contradiction", 15.95], ["17-board", 17.65], ["18-entry-dad-gave-him-the-key", 20.8],
  ["19-intentional-canvas-click", 21.71], ["20-canvas-grows-from-thomas", 22.3], ["21-three-objects-travel", 22.75], ["22-cards-landed", 23.2],
  ["23-entry-canvas-midpoint", 23.94], ["24-row-relationships", 24.4], ["25-opening-wide", 25.2], ["26-wide-canvas", 26.6],
  ["27-cluster-1998", 28.39], ["28-paper-trail", 29.2], ["29-plant-it", 30.24], ["30-scene-card", 30.99], ["31-manuscript-return", 32.25],
  ["32-final-typed-sentence", null], ["33-retreat-medium", null], ["34-small-bright-workspace", null], ["35-disappearance-mid", null], ["36-empty-stage", null], ["37-brand", null],
];
if (want("--stills")) {
  const composition = await selectComposition({ serveUrl, id: "SuturaProductFilm" });
  const end = composition.durationInFrames / composition.fps;
  for (const [name, at] of REVIEW) {
    // Computed from the end: the payoff (just after the last key), the retreat, the brand's last frame.
    const t = at ?? { "32-final-typed-sentence": end - 4.95, "33-retreat-medium": end - 4.2, "34-small-bright-workspace": end - 3.15, "35-disappearance-mid": end - 2.67, "36-empty-stage": end - 2.35, "37-brand": end - 0.1 }[name];
    const output = path.join("product-film/film/review", `${name}.png`);
    await renderStill({ serveUrl, composition, frame: Math.round(t * composition.fps), output, chromiumOptions });
    console.log(output, t.toFixed(2));
  }
  // Pass 6: the refined moments, frame by frame.
  const PASS6 = [
    ["open-frame-0", 0], ["ec-first-canvas-logic", 22.25], ["ec-25pct", 22.815], ["ec-50pct", 23.94], ["ec-75pct", 25.065], ["ec-first-full-canvas", 26.19],
    ["trail-b-1998-row", 28.33], ["trail-c-plant-it", 29.95],
    ["end-last-bright", 37.533], ["end-fade-start", 37.567], ["end-midpoint", 37.6], ["end-final-visible", 37.633], ["end-first-empty", 37.667],
  ];
  await mkdir("product-film/film/pass6", { recursive: true });
  for (const [name, at] of PASS6) {
    const output = path.join("product-film/film/pass6", `${name}.png`);
    await renderStill({ serveUrl, composition, frame: Math.round(at * composition.fps), output, chromiumOptions });
    console.log(output, at);
  }
  // The Entry → Canvas midpoint, chosen (the 1998 row composed, its first relationship drawing): exported on its own.
  await renderStill({ serveUrl, composition, frame: Math.round(23.94 * composition.fps), output: "product-film/film/entry-canvas-midpoint.png", chromiumOptions });
  console.log("product-film/film/entry-canvas-midpoint.png");
}

if (want("--mp4")) {
  const composition = await selectComposition({ serveUrl, id: "SuturaProductFilm" });
  await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: "out/film/sutura-product-film-1080p.mp4", crf: 16, chromiumOptions });
  console.log("out/film/sutura-product-film-1080p.mp4");
}
if (want("--small")) {
  const composition = await selectComposition({ serveUrl, id: "SuturaProductFilm" });
  await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: "out/film/sutura-product-film-540p.mp4", scale: 0.5, crf: 22, chromiumOptions });
  console.log("out/film/sutura-product-film-540p.mp4");
}
