import { useCurrentFrame } from "remotion";
import { Stage } from "../../foundation/Stage";
import { FILM, KEYFRAMES } from "./frames";
import { Keyframe } from "./Keyframes";

// The product film's storyboard as a composition: frame n is keyframe n + 1
// (npm run film:storyboard renders all fourteen). The stage is Sutura's Dark
// theme — the outer field the light window stands on — taken a step deeper
// and a breath toward Sutura's ink blue (the theme's own --r2-palette-blue):
// still near-black, never visibly blue, flat.
export const STAGE_INK = "color-mix(in oklab, color-mix(in oklab, var(--r2-page-bg), black 24%), rgb(var(--r2-palette-blue)) 6%)";

export function ProductFilmStoryboard({ debug = false }: { debug?: boolean }) {
  const frame = useCurrentFrame();
  const k = KEYFRAMES[Math.min(frame, KEYFRAMES.length - 1)];
  return (
    <Stage appearance={{ theme: "dark", surface: "theme", accent: "blue" }} background={STAGE_INK}>
      <Keyframe id={k.id} debug={debug} />
    </Stage>
  );
}

/** Every keyframe in order, numbered: the contact sheet. */
export function ProductFilmContactSheet() {
  const scale = 0.5;
  const w = FILM.width * scale;
  const h = FILM.height * scale;
  return (
    <Stage appearance={{ theme: "dark", surface: "theme", accent: "blue" }} background={STAGE_INK}>
      <div style={{ position: "absolute", inset: 0, padding: "72px 80px", fontFamily: "var(--r2-font-ui)" }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 44 }}>
          <h1 style={{ fontFamily: "var(--r2-prose-font)", fontSize: 44, fontWeight: 400, color: "var(--r2-ink-1)" }}>The Salt House — product film storyboard</h1>
          <p style={{ fontSize: 20, color: "var(--r2-ink-3)" }}>Fourteen keyframes · 1920 × 1080 · composition only, no motion</p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(4, ${w}px)`, columnGap: 40, rowGap: 36 }}>
          {KEYFRAMES.map((k) => (
            <figure key={k.id}>
              <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 6, boxShadow: "0 0 0 1px rgba(var(--r2-palette-ink) / 0.14)" }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: FILM.width, height: FILM.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                  <Keyframe id={k.id} />
                </div>
              </div>
              <figcaption style={{ display: "flex", gap: 14, alignItems: "baseline", marginTop: 14 }}>
                <span style={{ fontSize: 24, fontWeight: 600, color: "var(--r2-ink-1)", fontVariantNumeric: "tabular-nums" }}>{String(k.n).padStart(2, "0")}</span>
                <span style={{ fontSize: 22, color: "var(--r2-ink-2)" }}>{k.title}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Stage>
  );
}

/** The contact sheet's size: four columns of half-size frames. */
export const SHEET = { width: 80 * 2 + 4 * 960 + 3 * 40, height: 72 * 2 + 44 + 60 + 4 * (540 + 14 + 32) + 3 * 36 } as const;
