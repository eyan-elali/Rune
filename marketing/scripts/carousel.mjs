// The Instagram carousel: six 1080×1350 PNGs, the contact sheet and the
// swipe strip — one bundle, rendered in order.
//
//   node scripts/carousel.mjs            # → carousel/slides/, carousel/contact-sheet.png, carousel/strip.png
//   node scripts/carousel.mjs 2 5        # only those slides (no sheets)
//
// Slide n is frame n − 1 of Carousel-Slides (src/creatives/carousel).

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "./webpack.mjs";

const NAMES = ["thesis", "manuscript", "book-grows", "workspace", "thinking", "close"];
const only = process.argv.slice(2).map(Number).filter(Boolean);

const out = path.resolve("carousel");
await mkdir(path.join(out, "slides"), { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("../public"), webpackOverride });
const chromiumOptions = { gl: "angle" };

const slides = await selectComposition({ serveUrl, id: "Carousel-Slides" });
for (const [i, name] of NAMES.entries()) {
  if (only.length && !only.includes(i + 1)) continue;
  const output = path.join(out, "slides", `${String(i + 1).padStart(2, "0")}-${name}.png`);
  await renderStill({ serveUrl, composition: slides, frame: i, output, chromiumOptions });
  console.log(output);
}

if (!only.length) {
  for (const [id, file] of [["Carousel-ContactSheet", "contact-sheet.png"], ["Carousel-Phone", "phone-sheet.png"], ["Carousel-Strip", "strip.png"]]) {
    const composition = await selectComposition({ serveUrl, id });
    const output = path.join(out, file);
    await renderStill({ serveUrl, composition, frame: 0, output, chromiumOptions });
    console.log(output);
  }
}
