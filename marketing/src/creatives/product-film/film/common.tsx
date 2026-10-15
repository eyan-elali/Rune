import type { CSSProperties } from "react";
import type { CameraState } from "../../../foundation/Camera";
import { lerp, logLerp, type Rect } from "../studies/motion";

// Small pieces every sequence shares.

/** The cursor at a readable size whatever the camera's scale: ~30px on screen. */
export const CURSOR = 30 / 20;

/** Two framings blended by their centres (scale in log space): for moves that are not about one point. */
export const blendCam = (a: CameraState, b: CameraState, p: number): CameraState => {
  // Express both as "this world point at the screen centre".
  const centre = (c: CameraState) => ({ x: c.x + (960 - c.ax) / c.s, y: c.y + (540 - c.ay) / c.s });
  const A = centre(a);
  const B = centre(b);
  return { x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p), s: logLerp(a.s, b.s, p), ax: 960, ay: 540 };
};

/** The product's anchor tone (::highlight(r2-anchor)), over a run of text. */
export function AnchorTone({ box, amount }: { box: Rect; amount: number }) {
  if (amount <= 0.001) return null;
  const style: CSSProperties = { position: "absolute", left: box.x - 2, top: box.y, width: box.w + 4, height: box.h, borderRadius: 2, background: "var(--r2-accent-soft-hover)", mixBlendMode: "multiply", opacity: amount, pointerEvents: "none" };
  return <div style={style} />;
}

/** The app's soft accent over a few boxes at once (one object, lit where it appears). */
export function Glow({ boxes, amount }: { boxes: Rect[]; amount: number }) {
  if (amount <= 0.001) return null;
  return (
    <>
      {boxes.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 5, background: "var(--r2-accent-soft-hover)", mixBlendMode: "multiply", opacity: amount, pointerEvents: "none" }} />
      ))}
    </>
  );
}

export const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ── The writing chrome (authentic) ─────────────────────────────────────────

/** rune2.css's --r2-fade-out / --r2-fade-in: the chrome leaves slowly and comes back a little faster. */
export const FADE_OUT = 0.46;
export const FADE_IN = 0.2;
/** useWritingChrome's settle: writing must be sustained this long before the chrome goes. */
export const WRITING_SETTLE = 0.7;

/**
 * The app's own "Sutura gets quieter when the writer writes" (useWritingChrome
 * + rune2.css `.r2-shell[data-writing]`), at progress w (0 = interface, 1 =
 * writing): the tab band takes the writing surface and loses its hairline; the
 * tabs, breadcrumb and actions go to nothing; the status to half. Nothing
 * moves. Drawn per frame (the stage has no CSS transitions), so the film
 * interpolates exactly what the transition would.
 */
export function writingCss(scope: string, w: number, manuscript = true): string {
  if (w <= 0.001) return "";
  const pct = (w * 100).toFixed(1);
  const sel = (s: string) => s.split(",").map((x) => `[data-pf="${scope}"] ${x.trim()}`).join(", ");
  return `
    ${sel(".r2-tabs")} { background: color-mix(in srgb, ${manuscript ? "var(--r2-ms-bg)" : "var(--r2-bg)"} ${pct}%, var(--r2-shell-bg)) !important; border-bottom-color: color-mix(in srgb, transparent ${pct}%, var(--r2-border)) !important; }
    ${sel(".r2-tabs ul, .r2-tabs-nav-toggle, .r2-tabs-add, .r2-tabs-widgets, .r2-contextbar > *")} { opacity: ${1 - w} !important; }
    ${sel(".r2-doc-status")} { opacity: ${1 - 0.5 * w} !important; }
  `;
}
