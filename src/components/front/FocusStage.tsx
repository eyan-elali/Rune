"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The manuscript section's one movement (front.css: "The focus"): as the
// reader scrolls on past the statement, the shell's structure — navigator,
// tabs, breadcrumb — recedes and the writing surface is left with the room.
// It is the product's own behaviour (rune2.css: "Chrome that recedes while
// writing"), shown once, and the reader's scroll is the only thing driving
// it.
//
// Mechanics: the stage is taller than the shell by a stretch of the
// viewport; the shell is sticky inside it, so while the stage scrolls
// through, the shell holds its place on screen and its progress through
// the stage — 0 at the top, 1 at the bottom — is written to --lp-focus.
// Everything else is the stylesheet reading that one number. Scrolling
// faster finishes it faster; scrolling back runs it back. Nothing is
// locked, nothing plays on its own, and the page's scroll is never taken
// from the reader.
//
// The stage takes its height, and the shell its stickiness, only once this
// has started (data-scrub): without JavaScript, under reduced motion, or on
// a phone, there is no stretch and no movement — the shell sits in the
// page as it is.

export function FocusStage({ children, className }: { children: ReactNode; className?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const sticky = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    const inner = sticky.current;
    if (!el || !inner) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 640px)");
    let raf = 0;
    let last = -1;

    const update = () => {
      raf = 0;
      const outer = el.getBoundingClientRect();
      const run = el.offsetHeight - inner.offsetHeight;
      const travelled = inner.getBoundingClientRect().top - outer.top;
      const p = run > 0 ? Math.min(1, Math.max(0, travelled / run)) : 0;
      // Two decimals: enough for a smooth fade, and no style writes for a
      // scroll that moved nothing worth painting.
      const q = Math.round(p * 100) / 100;
      if (q === last) return;
      last = q;
      el.style.setProperty("--lp-focus", String(q));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const start = () => {
      el.setAttribute("data-scrub", "");
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      update();
    };
    const stop = () => {
      el.removeAttribute("data-scrub");
      el.style.removeProperty("--lp-focus");
      last = -1;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const apply = () => (still.matches ? stop() : start());
    apply();
    still.addEventListener("change", apply);
    return () => {
      still.removeEventListener("change", apply);
      stop();
    };
  }, []);

  return (
    <div ref={stage} className={className}>
      <div ref={sticky} className="r2-lp-ms-sticky">
        {children}
      </div>
    </div>
  );
}
