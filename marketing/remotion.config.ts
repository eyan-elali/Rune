// Remotion configuration for Sutura's marketing compositions.
//
// The compositions draw the real Sutura shell with the application's own
// stylesheet (src/app/(rune2)/rune2.css), theme registry (src/lib/rune2/
// themes.ts) and pure product rules, so the bundle reaches into the
// repository's `src/` through the same `@/` alias the app uses, and React is
// pinned to the application's single copy (scripts/webpack.mjs). Brand
// assets come from the app's own public directory, so the wordmark is the
// approved file, never a copy.

import path from "node:path";
import { Config } from "@remotion/cli/config";
// @ts-expect-error — a plain ES module shared with scripts/stills.mjs.
import { webpackOverride } from "./scripts/webpack.mjs";

Config.setPublicDir(path.resolve(process.cwd(), "../public"));
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(16);
Config.setChromiumOpenGlRenderer("angle");
Config.overrideWebpackConfig(webpackOverride);
