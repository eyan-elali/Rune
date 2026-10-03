"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { placeFloating, type FloatingAlign, type FloatingSide } from "@/lib/rune2/floating";

// Hangs a floating surface from its control, over the page: fixed-positioned,
// so it never widens, scrolls or reflows whatever it was opened inside (an
// Inspector's column, a Table cell, a toolbar), and placed by the one rule in
// lib/rune2/floating.ts, so it stays whole inside the window at any width or
// zoom. It follows its control while the page scrolls or the window resizes,
// re-places itself when its own content grows (a filtered list), and gives
// `onAway` the chance to close it once the control has scrolled out of sight.
//
// The surface is placed before the first paint (a layout effect): it never
// shows anywhere else first.

export function useFloating(
  ref: RefObject<HTMLElement | null>,
  {
    anchor,
    side,
    align,
    gap,
    inset,
    onAway,
    open = true,
  }: {
    /** The control it hangs from. Defaults to the surface's parent element. */
    anchor?: () => Element | null | undefined;
    side?: FloatingSide;
    align?: FloatingAlign;
    gap?: number;
    inset?: number;
    /** The control has scrolled out of sight (or out of its scroll container). */
    onAway?: () => void;
    /** For a surface rendered conditionally inside an always-mounted component: whether it is shown. */
    open?: boolean;
  } = {}
) {
  const opts = useRef({ anchor, side, align, gap, inset, onAway });
  useEffect(() => {
    opts.current = { anchor, side, align, gap, inset, onAway };
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    let frame = 0;

    const place = () => {
      const o = opts.current;
      const a = o.anchor ? o.anchor() : el.parentElement;
      if (!a) return;
      const r = a.getBoundingClientRect();
      if (!inSight(a, r)) {
        o.onAway?.();
        return;
      }
      el.style.position = "fixed";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.maxHeight = "";
      el.style.maxWidth = "";
      const p = placeFloating({
        anchor: r,
        // Layout sizes, not the box an arrival animation is scaling.
        size: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
        side: o.side,
        align: o.align,
        gap: o.gap,
        inset: o.inset,
      });
      // A transformed or filtered ancestor makes itself the fixed surface's
      // frame of reference instead of the window: measure where that frame
      // starts and place relative to it.
      const origin = frameOrigin(el);
      el.style.left = `${p.x - origin.x}px`;
      el.style.top = `${p.y - origin.y}px`;
      if (p.maxHeight !== null) {
        el.style.maxHeight = `${p.maxHeight}px`;
        el.style.overflowY = "auto";
      }
      if (p.maxWidth !== null) el.style.maxWidth = `${p.maxWidth}px`;
      el.dataset.side = p.side;
      el.style.visibility = "visible";
    };
    const schedule = (e?: Event) => {
      if (e && e.target instanceof Node && el.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    const sizes = new ResizeObserver(() => schedule());
    sizes.observe(el);
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [ref, open]);
}

/** Whether the control can still be seen: inside the window and every container that clips it. */
function inSight(el: Element, r: DOMRect): boolean {
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    const c = p.getBoundingClientRect();
    if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) return false;
  }
  return true;
}

/** Where a fixed element's left/top of 0 actually lands (the window's corner, unless an ancestor reframes it). */
function frameOrigin(el: HTMLElement): { x: number; y: number } {
  const parent = el.parentElement;
  if (!parent) return { x: 0, y: 0 };
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none";
  parent.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { x: r.left, y: r.top };
}
