// The product film's motion studies (product-film/MOTION_LANGUAGE_EXPLORATION.md):
// each study's preview — 1280×720 MP4 with its cue sheet of sound — and its
// review strip, from one bundle.
//
//   node scripts/film-studies.mjs [ids…] [--strip-only]     (npm run film:studies)
//   → out/studies/study-<id>-preview.mp4, product-film/studies/study-<id>-strip.png
//   ids: A B C (first pass), AV2 BV2 CV2 D (final R&D pass); default: all.

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const ALL = ["A", "B", "C", "AV2", "BV2", "CV2", "D"];
const args = process.argv.slice(2);
const stripOnly = args.includes("--strip-only");
const STUDIES = args.filter((a) => !a.startsWith("--")).length ? args.filter((a) => !a.startsWith("--")) : ALL;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };
await mkdir("out/studies", { recursive: true });
await mkdir("product-film/studies", { recursive: true });

for (const id of STUDIES) {
  const lower = id.replace(/V2$/, "-v2").toLowerCase();
  const strip = await selectComposition({ serveUrl, id: `ProductFilmStudy${id}-Strip` });
  const stripOut = path.join("product-film/studies", `study-${lower}-strip.png`);
  await renderStill({ serveUrl, composition: strip, frame: 0, output: stripOut, chromiumOptions });
  console.log(stripOut);

  if (stripOnly) continue;
  const film = await selectComposition({ serveUrl, id: `ProductFilmStudy${id}` });
  const filmOut = path.join("out/studies", `study-${lower}-preview.mp4`);
  await renderMedia({ serveUrl, composition: film, codec: "h264", outputLocation: filmOut, scale: 0.6667, crf: 18, chromiumOptions });
  console.log(filmOut);
}
