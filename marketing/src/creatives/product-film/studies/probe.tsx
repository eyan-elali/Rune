import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { continueRender, delayRender } from "remotion";
import type { Rect } from "./motion";

// Probes: where an authentic state puts things, read from the DOM rather than
// written by hand. Each probe is a real product state (the shell, drawn by
// ui/*) rendered once at 1:1, hidden, before the study's first frame; the
// study asks for named anchors in it — a text run (an exact DOM Range around
// the words), an element's box, or a title field's line — and gets their
// logical rects in the window's own pixels plus the type they are set in.
// Carriers (Carrier.tsx) use those to begin and end pixel-identical to the
// real element, so the hand-off to the authentic state is invisible.

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  letterSpacing: string;
  lineHeight: number;
  color: string;
  textDecorationLine: string;
  textDecorationColor: string;
  textUnderlineOffset: string;
};

export type Measured = {
  /** The element's box (for "text": the run's first line). */
  box: Rect;
  /** The text's first line: left edge, vertical centre and width. */
  text: { x: number; cy: number; w: number };
  style: TypeStyle;
};

export type Anchor = {
  key: string;
  /** CSS selector for the element(s) to search. */
  selector: string;
  /** "text": a run of `text` inside the element; "box": the element itself; "field": a textarea's first line. */
  mode?: "text" | "box" | "field";
  text?: string;
};

export type ProbeSpec = { id: string; node: ReactNode; anchors: Anchor[] };
export type Probes = Record<string, Record<string, Measured>>;

const FACES = ['400 16px "Inter"', '500 16px "Inter"', '600 16px "Inter"', '400 16px "EB Garamond"', '500 16px "EB Garamond"'];

/**
 * The type as drawn: computed sizes times the element's own on-screen scale
 * (a Canvas card sits under its viewport's transform — 14px computed, drawn
 * at 14 × the zoom), with the probe's preview scale `k` divided out.
 */
function styleOf(el: Element, k = 1): TypeStyle {
  const cs = getComputedStyle(el);
  const h = el as HTMLElement;
  const drawn = h.offsetWidth > 0 ? h.getBoundingClientRect().width / h.offsetWidth / k : 1;
  const fontSize = parseFloat(cs.fontSize) * drawn;
  const lh = parseFloat(cs.lineHeight) * drawn;
  const ls = parseFloat(cs.letterSpacing);
  return {
    fontFamily: cs.fontFamily,
    fontSize,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    letterSpacing: Number.isFinite(ls) ? `${ls * drawn}px` : cs.letterSpacing,
    lineHeight: Number.isFinite(lh) ? lh : fontSize * 1.2,
    color: cs.color,
    textDecorationLine: cs.textDecorationLine,
    textDecorationColor: cs.textDecorationColor,
    textUnderlineOffset: cs.textUnderlineOffset,
  };
}

function measureOne(root: HTMLElement, a: Anchor, k: number): Measured {
  const origin = root.getBoundingClientRect();
  const rel = (r: DOMRect): Rect => ({ x: (r.left - origin.left) / k, y: (r.top - origin.top) / k, w: r.width / k, h: r.height / k });
  const els = Array.from(root.querySelectorAll(a.selector));
  if (els.length === 0) throw new Error(`probe: nothing matches ${a.selector}`);
  const mode = a.mode ?? (a.text ? "text" : "box");

  if (mode === "text") {
    for (const el of els) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const i = node.data.indexOf(a.text!);
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + a.text!.length);
        const line = rel(range.getClientRects()[0]);
        const style = styleOf(node.parentElement!, k);
        return { box: line, text: { x: line.x, cy: line.y + line.h / 2, w: line.w }, style };
      }
    }
    throw new Error(`probe: "${a.text}" not found in ${a.selector}`);
  }

  const el = (a.text ? els.find((e) => (e as HTMLElement).textContent?.includes(a.text!) || (e as HTMLTextAreaElement).value?.includes(a.text!)) : els[0]) as HTMLElement | undefined;
  if (!el) throw new Error(`probe: no ${a.selector} holding "${a.text}"`);
  const box = rel(el.getBoundingClientRect());
  const style = styleOf(el, k);
  if (mode === "box") return { box, text: { x: box.x, cy: box.y + box.h / 2, w: box.w }, style };

  // A title field: its first line starts inside its padding; its width is the text's own.
  const cs = getComputedStyle(el);
  const padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const padT = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const value = (el as HTMLTextAreaElement).value ?? el.textContent ?? "";
  const w = ctx.measureText(value).width + parseFloat(cs.letterSpacing || "0") * value.length;
  return { box, text: { x: box.x + padL, cy: box.y + padT + style.lineHeight / 2, w }, style };
}

/**
 * Renders the probes hidden, measures them once (holding the render until
 * every face is loaded), then renders `children` with the measurements.
 * Measured once per mount: the authentic states never change with time.
 */
export function WithProbes({ probes, children }: { probes: ProbeSpec[]; children: (m: Probes) => ReactNode }) {
  const [measured, setMeasured] = useState<Probes | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [handle] = useState(() => delayRender("Measuring the study's authentic states"));

  useLayoutEffect(() => {
    let live = true;
    Promise.all(FACES.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(() => {
        if (!live) return;
        const out: Probes = {};
        for (const p of probes) {
          const root = refs.current[p.id]!;
          // The probe's own scale on screen (Studio's preview scales the canvas): measurements are logical.
          const k = root.getBoundingClientRect().width / (root.offsetWidth || 1) || 1;
          out[p.id] = {};
          for (const a of p.anchors) out[p.id][a.key] = measureOne(root, a, k);
        }
        setMeasured(out);
        continueRender(handle);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      });
    return () => {
      live = false;
    };
    // Measured once: the probes are authentic, static states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (measured) return <>{children(measured)}</>;
  return (
    <>
      {probes.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            refs.current[p.id] = el;
          }}
          style={{ position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none" }}
          aria-hidden
        >
          {p.node}
        </div>
      ))}
    </>
  );
}
