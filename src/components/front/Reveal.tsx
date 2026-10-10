"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A gentle reveal as a landing section enters (front.css: "The reveal"): the
// block is laid out in place and, once it has scrolled into view, rises a
// touch and fades in. Content is never hidden by default — the attribute that
// holds it back is set only once the observer is ready, so without JavaScript,
// or under reduced motion (the stylesheet), everything simply shows.

export function Reveal({ children, className, delay }: { children: ReactNode; className?: string; delay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen (a reload mid-page): no motion.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    el.setAttribute("data-reveal", "pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.setAttribute("data-reveal", "in");
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-reveal-delay={delay || undefined}>
      {children}
    </div>
  );
}
