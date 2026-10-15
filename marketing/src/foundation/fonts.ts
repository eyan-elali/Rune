import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

// Sutura's two faces, bundled (Fontsource), so a render never depends on the
// network and every machine sets the same glyphs: Inter, the interface sans
// (the app's next/font Inter, read as --font-inter), and EB Garamond, the
// manuscript serif (rune2.css: --r2-prose-font). Weights are the ones the
// shell and the captions use.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";

const FACES = [
  '400 16px "Inter"',
  '500 16px "Inter"',
  '600 16px "Inter"',
  '400 16px "EB Garamond"',
  'italic 400 16px "EB Garamond"',
  '500 16px "EB Garamond"',
];

/** Holds the frame until every face is loaded, so no frame is set in a fallback. */
export function useFontsReady(): boolean {
  const [handle] = useState(() => delayRender("Loading Sutura's fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(FACES.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => {
        if (!live) return;
        setReady(true);
        continueRender(handle);
      });
    return () => {
      live = false;
    };
  }, [handle]);
  return ready;
}
