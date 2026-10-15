// Full-size review stills of a product-film composition at chosen times (the
// study review: start, first movement, midpoint, fastest, hand-off, settle).
//
//   node scripts/film-frames.mjs <CompositionId> <outDir> <t1> <t2> …   (seconds)

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const [id, out, ...times] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const composition = await selectComposition({ serveUrl, id });
await mkdir(out, { recursive: true });
for (const t of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(t) * composition.fps));
  const output = path.join(out, `${id}-${t}.png`);
  await renderStill({ serveUrl, composition, frame, output, chromiumOptions: { gl: "angle" } });
  console.log(output);
}
