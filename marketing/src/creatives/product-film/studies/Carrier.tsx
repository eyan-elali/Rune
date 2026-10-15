import type { CSSProperties, ReactNode } from "react";
import { arc, clamp01, lerp, level, logLerp, type Point, type Rect } from "./motion";
import type { Measured, TypeStyle } from "./probe";

// FILM-ONLY representations (MOTION_LANGUAGE_EXPLORATION.md §5). Nothing in
// this file draws product UI: these are the surrogates that carry a semantic
// object between two authentic states, and the lens effects around them.
// Every carrier begins and ends pixel-identical to a measured real element.

// ── Text carrier ───────────────────────────────────────────────────────────

/** One replica of the text, in one endpoint's own type, scaled to the shared box. */
function Replica({ text, style, at, size, opacity, extra }: { text: string; style: TypeStyle; at: Point; size: number; opacity: number; extra?: CSSProperties }) {
  if (opacity <= 0.001) return null;
  const k = size / style.fontSize;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate(${at.x}px, ${at.y}px) scale(${k})`,
        transformOrigin: "0 0",
        opacity,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: -style.lineHeight / 2,
          whiteSpace: "pre",
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight as CSSProperties["fontWeight"],
          fontStyle: style.fontStyle,
          letterSpacing: style.letterSpacing,
          lineHeight: `${style.lineHeight}px`,
          color: style.color,
          textDecorationLine: style.textDecorationLine,
          textDecorationColor: style.textDecorationColor,
          textUnderlineOffset: style.textUnderlineOffset,
          fontKerning: "normal",
          ...extra,
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** How a carrier travels: a lifted arc (a hand), or level out and level in (a line leaving its row in reading direction). */
export type Path = { kind: "arc"; lift?: number } | { kind: "level"; out?: number; into?: number };

/** The carrier's box at p: its left edge and vertical centre along its path, its type size in log space. */
export function carrierAt(from: Measured, to: Measured, p: number, path: Path = { kind: "arc" }): { at: Point; size: number } {
  const a = { x: from.text.x, y: from.text.cy };
  const b = { x: to.text.x, y: to.text.cy };
  const at = path.kind === "arc" ? arc(a, b, p, path.lift ?? 0.08) : level(a, b, p, path.out, path.into);
  return { at, size: logLerp(from.style.fontSize, to.style.fontSize, p) };
}

/**
 * A run of text travelling from one representation to the next. `p` moves it;
 * `swap` (0 → 1) cross-dissolves the source's type into the destination's —
 * drawn so the ink never dips (each replica at full until the other passes
 * half). Where both endpoints share a face, the replicas are identical but for
 * colour and size, and the swap is invisible by construction.
 */
export function TextCarrier({
  text,
  toText,
  from,
  to,
  p,
  swap,
  path,
  scale = 1,
  fromExtra,
  toExtra,
}: {
  text: string;
  /** The destination's wording, if it differs (a title field shows the same name). */
  toText?: string;
  from: Measured;
  to: Measured;
  p: number;
  swap: number;
  path?: Path;
  /** Extra scale about the run's left edge (a lift toward the viewer). */
  scale?: number;
  fromExtra?: CSSProperties;
  toExtra?: CSSProperties;
}) {
  const { at, size: base } = carrierAt(from, to, p, path);
  const size = base * scale;
  const s = clamp01(swap);
  return (
    <>
      <Replica text={text} style={from.style} at={at} size={size} opacity={clamp01(2 * (1 - s))} extra={fromExtra} />
      <Replica text={toText ?? text} style={to.style} at={at} size={size} opacity={clamp01(2 * s)} extra={toExtra} />
    </>
  );
}

// ── The slip ───────────────────────────────────────────────────────────────

/**
 * A quotation lifted as a clipping: a slip of the writing surface (its own
 * --r2-ms-bg) with the product's own lifted-surface shadow (--r2-shadow-pop),
 * travelling under the carried words. Its box is the source run (padded) at
 * the start and the destination's own container at the end, held relative to
 * the words and scaled with them, so the container persists as well as the
 * text. Draw it inside the light window, where the tokens resolve.
 */
export function Slip({ from, to, fromBox, toBox, at, size, opacity }: { from: Measured; to: Measured; fromBox: Rect; toBox: Rect; at: Point; size: number; opacity: number; }) {
  if (opacity <= 0.001) return null;
  // The box's edges as offsets from the words' anchor, in ems of each endpoint.
  const em = (box: Rect, m: Measured) => ({
    l: (box.x - m.text.x) / m.style.fontSize,
    r: (box.x + box.w - m.text.x) / m.style.fontSize,
    t: (box.y - m.text.cy) / m.style.fontSize,
    b: (box.y + box.h - m.text.cy) / m.style.fontSize,
  });
  const a = em(fromBox, from);
  const b = em(toBox, to);
  // How far along: by size (log), so the box and the words agree exactly.
  const q = from.style.fontSize === to.style.fontSize ? 0 : Math.log(size / from.style.fontSize) / Math.log(to.style.fontSize / from.style.fontSize);
  const e = (k: "l" | "r" | "t" | "b") => lerp(a[k], b[k], clamp01(q)) * size;
  return (
    <div
      style={{
        position: "absolute",
        left: at.x + e("l"),
        top: at.y + e("t"),
        width: e("r") - e("l"),
        height: e("b") - e("t"),
        borderRadius: 3,
        background: "var(--r2-ms-bg)",
        boxShadow: "var(--r2-shadow-pop)",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ── A surface held to its words ────────────────────────────────────────────

/**
 * A container travelling WITH a carried run (a link's chip becoming a card):
 * its edges are held as offsets from the words' anchor, in ems of each
 * endpoint, interpolated by p and scaled with the words — so the words never
 * leave their surface, whatever path they take. (V2: a surrogate interpolated
 * on its own straight line drifted off an arcing title.)
 */
export function HeldSurface({ from, to, fromBox, toBox, at, size, p, radius, background, shadow, opacity = 1 }: { from: Measured; to: Measured; fromBox: Rect; toBox: Rect; at: Point; size: number; p: number; radius: [number, number]; background: string; shadow?: string; opacity?: number }) {
  if (opacity <= 0.001) return null;
  const em = (box: Rect, m: Measured) => ({
    l: (box.x - m.text.x) / m.style.fontSize,
    r: (box.x + box.w - m.text.x) / m.style.fontSize,
    t: (box.y - m.text.cy) / m.style.fontSize,
    b: (box.y + box.h - m.text.cy) / m.style.fontSize,
  });
  const a = em(fromBox, from);
  const b = em(toBox, to);
  const e = (k: "l" | "r" | "t" | "b") => lerp(a[k], b[k], clamp01(p)) * size;
  return (
    <div
      style={{
        position: "absolute",
        left: at.x + e("l"),
        top: at.y + e("t"),
        width: e("r") - e("l"),
        height: e("b") - e("t"),
        borderRadius: lerp(radius[0], radius[1], clamp01(p)),
        background,
        boxShadow: shadow,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ── Shape surrogate ────────────────────────────────────────────────────────

export type Surface = { rect: Rect; radius: number; background: string; shadow?: string };

/** A container growing from one representation's bounds to another's (a pill into a card). */
export function Surrogate({ from, to, p, fill = p }: { from: Surface; to: Surface; p: number; fill?: number }) {
  const r = { x: lerp(from.rect.x, to.rect.x, p), y: lerp(from.rect.y, to.rect.y, p), w: lerp(from.rect.w, to.rect.w, p), h: lerp(from.rect.h, to.rect.h, p) };
  const base: CSSProperties = { position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: lerp(from.radius, to.radius, p), pointerEvents: "none" };
  return (
    <>
      <div style={{ ...base, background: from.background, boxShadow: from.shadow, opacity: 1 - clamp01(fill) }} />
      <div style={{ ...base, background: to.background, boxShadow: to.shadow, opacity: clamp01(fill) }} />
    </>
  );
}

// ── Masks ──────────────────────────────────────────────────────────────────

/** Clips to a rounded rect in the children's own (world) coordinates: an unfold, not a wipe. */
export function RectMask({ rect, radius, size, children }: { rect: Rect; radius: number; size: { width: number; height: number }; children: ReactNode }) {
  const top = rect.y;
  const left = rect.x;
  const right = size.width - (rect.x + rect.w);
  const bottom = size.height - (rect.y + rect.h);
  return <div style={{ position: "absolute", left: 0, top: 0, width: size.width, height: size.height, clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)` }}>{children}</div>;
}

// ── Motion blur ────────────────────────────────────────────────────────────

/**
 * True motion blur: the frame drawn at `samples` subframe times across the
 * shutter (centred on t, so a still frame is unchanged) and averaged — layer
 * k at opacity 1/(k + 1) over the ones beneath is their mean. Every layer must
 * be opaque (the study draws its stage in each). One sample when slow: blur
 * means speed, never decoration (principle 11).
 */
export function MotionBlur({ t, samples, shutter, render }: { t: number; samples: number; shutter: number; render: (t: number) => ReactNode }) {
  const n = Math.max(1, Math.round(samples));
  if (n === 1) return <>{render(t)}</>;
  return (
    <>
      {Array.from({ length: n }, (_, k) => {
        const at = t - shutter / 2 + (shutter * k) / (n - 1);
        return (
          <div key={k} style={{ position: "absolute", inset: 0, opacity: 1 / (k + 1) }}>
            {render(at)}
          </div>
        );
      })}
    </>
  );
}

/** How many subframes a move needs: none below ~10 px/frame on screen, up to `max` as it gets fast. */
export const samplesFor = (pxPerFrame: number, max = 7) => (pxPerFrame < 10 ? 1 : Math.min(max, 2 + Math.floor(pxPerFrame / 10)));

/**
 * A blur along one direction (for a small transparent carrier, where averaged
 * layers would thin its ink): an SVG Gaussian along the outer element's x
 * axis, the outer rotated to the motion about the region's centre and the
 * content counter-rotated, so the smear runs along the path and nowhere else.
 * `region` is the world-space area the content occupies (padded, square-ish);
 * `amount` is in world px.
 */
export function DirectionalBlur({ id, angle, amount, region, children }: { id: string; angle: number; amount: number; region: Rect; children: ReactNode }) {
  if (amount < 0.35) return <>{children}</>;
  const deg = (angle * 180) / Math.PI;
  const side = Math.max(region.w, region.h);
  const box = { x: region.x + region.w / 2 - side / 2, y: region.y + region.h / 2 - side / 2, w: side, h: side };
  return (
    <>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${amount.toFixed(2)} 0`} />
        </filter>
      </svg>
      <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, transform: `rotate(${deg}deg)`, transformOrigin: "50% 50%", filter: `url(#${id})` }}>
        <div style={{ position: "absolute", left: -box.x, top: -box.y, width: 0, height: 0, transform: `rotate(${-deg}deg)`, transformOrigin: `${box.x + side / 2}px ${box.y + side / 2}px` }}>{children}</div>
      </div>
    </>
  );
}
