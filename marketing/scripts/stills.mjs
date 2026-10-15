// Contact sheet: renders chosen frames of a composition as PNGs, bundling
// once — the quick way to review a cut's key moments without a full render.
//
//   node scripts/stills.mjs <compositionId> <outDir> <frame> [frame…]
//   node scripts/stills.mjs CreativeA-Vertical out/stills 0 60 150 240 330 420
//
// Uses remotion.config.ts's webpack override, so stills match renders.

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const [id, outDir, ...frames] = process.argv.slice(2);
if (!id || !outDir || frames.length === 0) {
  console.error("usage: node scripts/stills.mjs <compositionId> <outDir> <frame> [frame…]");
  process.exit(1);
}

const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  publicDir: path.resolve("../public"),
  webpackOverride,
});
const composition = await selectComposition({ serveUrl, id });
await mkdir(outDir, { recursive: true });
for (const f of frames) {
  const frame = Number(f);
  const output = path.join(outDir, `${id}-${String(frame).padStart(3, "0")}.png`);
  await renderStill({ serveUrl, composition, frame, output, chromiumOptions: { gl: "angle" } });
  console.log(output);
}
