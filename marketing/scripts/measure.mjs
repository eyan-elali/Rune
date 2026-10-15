// Reads where the vertical cut's shell puts things (navigator rows, the last
// paragraph, the Board's first lane, the Canvas), in the shell's logical
// pixels, at the frames given — the numbers creatives/creative-a/vertical/
// geometry.ts is written from.
//
//   node scripts/measure.mjs 120 300 360    (npm run measure:a -- 120 …)

import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const composition = await selectComposition({ serveUrl, id: "CreativeA-Vertical-Measure" });
for (const frame of frames.length ? frames : [0]) {
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: path.join(process.env.TMPDIR ?? "/tmp", `measure-${frame}.png`),
    chromiumOptions: { gl: "angle" },
    onBrowserLog: (log) => {
      if (log.text.startsWith("MEASURE ")) console.log(`frame ${frame}`, JSON.stringify(JSON.parse(log.text.slice(8)), null, 1));
    },
  });
}
