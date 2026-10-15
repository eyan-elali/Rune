// The product film's storyboard: every keyframe as a named 1920×1080 PNG,
// and the contact sheet — one bundle, rendered in order.
//
//   node scripts/film-storyboard.mjs     # → product-film/frames/ and product-film/contact-sheet.png
//
// Keyframe n is frame n − 1 of ProductFilm-Storyboard (creatives/product-film).

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const NAMES = [
  "writing",
  "toward-structure",
  "the-book-grows",
  "back-to-revise",
  "the-pause",
  "revision-notes",
  "inspector",
  "reveal",
  "research-page",
  "collection",
  "entry",
  "canvas",
  "return",
  "brand",
];

const out = path.resolve("product-film");
await mkdir(path.join(out, "frames"), { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };

const board = await selectComposition({ serveUrl, id: "ProductFilm-Storyboard" });
for (const [i, name] of NAMES.entries()) {
  const output = path.join(out, "frames", `${String(i + 1).padStart(2, "0")}-${name}.png`);
  await renderStill({ serveUrl, composition: board, frame: i, output, chromiumOptions });
  console.log(output);
}

const sheet = await selectComposition({ serveUrl, id: "ProductFilm-ContactSheet" });
const output = path.join(out, "contact-sheet.png");
await renderStill({ serveUrl, composition: sheet, frame: 0, output, chromiumOptions });
console.log(output);
