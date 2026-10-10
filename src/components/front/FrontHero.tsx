"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { HeroOrbit, placeLines } from "@/components/front/HeroOrbit";

// The hero (front.css: "Hero"). Two states of one idea:
//
//   at the top       Your manuscript at the center.   — the headline alone,
//                    one line under it, one action.
//   scrolled through Everything around it.             — the second line
//                    arrives, hairlines draw outward from the headline, and
//                    the workspace emerges at their ends. The headline
//                    never moves.
//
// The section is taller than the viewport; its stage is pinned while the
// reader scrolls through it. This component reports how far — --lp-p,
// 0 to 1 — and the stylesheet does everything else. Reduced motion and
// phones land on the finished state (the stylesheet decides that; the
// script only steps aside).

export function FrontHero({ member }: { member: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const stage = stageRef.current;
    const title = titleRef.current;
    const column = columnRef.current;
    if (!el || !stage || !title || !column) return;
    // Where the stylesheet settles on the finished state (reduced motion, a
    // narrow screen), the script leaves --lp-p alone.
    const still = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px)");
    let raf = 0;
    const update = () => {
      raf = 0;
      if (still.matches) {
        el.style.removeProperty("--lp-p");
        return;
      }
      const track = el.getBoundingClientRect();
      const pinned = stage.getBoundingClientRect();
      const travel = track.height - pinned.height;
      const p = travel > 1 ? Math.min(1, Math.max(0, (pinned.top - track.top) / travel)) : 1;
      el.style.setProperty("--lp-p", p.toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // The lines are laid out from the headline's measured box — again when
    // the stage changes size (a resize, a font arriving).
    const place = () => placeLines(stage, title, column);
    const sized = new ResizeObserver(place);
    sized.observe(stage);
    sized.observe(title);
    place();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    still.addEventListener("change", schedule);
    return () => {
      sized.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      still.removeEventListener("change", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={ref} className="r2-lp-hero" aria-labelledby="lp-title">
      <div ref={stageRef} className="r2-lp-stage">
        <div ref={columnRef} className="r2-lp-centre">
          <h1 ref={titleRef} id="lp-title" className="r2-lp-title">
            {/* Always two lines: the headline's footprint is what the orbit is laid around. */}
            <span>
              Your manuscript
              <br />
              at the center.
            </span>
            <span className="r2-lp-title-2">Everything around it.</span>
          </h1>
          <p className="r2-lp-lede">A writing workspace that grows around the manuscript only when you need it.</p>
          <div className="r2-lp-actions">
            {member ? (
              <Link href="/projects" className="r2-button r2-button--primary r2-button--lg">
                Open Sutura
              </Link>
            ) : (
              <>
                <Link href="/signup" className="r2-button r2-button--primary r2-button--lg">
                  Start writing free
                </Link>
                <p className="r2-lp-note">Free in Early Access. Your words remain your own.</p>
              </>
            )}
          </div>
        </div>
        <HeroOrbit />
        <div className="r2-lp-foot" aria-hidden="true">
          <span>A home for writing novels</span>
          <span className="r2-lp-cue">Scroll</span>
        </div>
      </div>
    </section>
  );
}
