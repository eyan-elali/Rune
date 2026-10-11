"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { PUBLIC_ROUTES, startPath } from "./publicRoutes";
import { advanceHeaderScrollState, initialHeaderScrollState, type HeaderScrollState } from "./headerScrollIntent";

// The landing page's header (front.css: "Header"): three zones — the
// wordmark at the left, the links (Features, Sign in) centred, the one
// action at the right. One sticky element that keeps the same
// in-flow box whatever it shows (the hero's height is measured against
// it), so nothing below ever reflows; the visible object is the row inside
// it, which has two forms on one DOM node, following the Opius landing
// header's model (headerScrollIntent.ts):
//
//   · FLAT     at the top of the page: the full-width row on the hero's
//              container, only type on the page's tone — no bar, no edge.
//   · FLOATING anywhere below: the same row closed into a pill over the
//              row's own span (wordmark to action) — a hairline rim, a
//              light translucent surface, a soft lift — one placed object
//              over the page (data-floating).
//
// Scrolling down hides the header (data-hidden: a pure transform, slid up
// and faded); scrolling back up brings it in as the pill; and arriving at
// the top again, the pill opens back into the flat row in place. Both are
// transitions of the mounted element, never a swap of components. Without
// JavaScript the header is simply the flat row at the top of the page.
//
// One action, one wording — "Start writing free" — on the public page. A
// signed-in writer is sent to their Projects by the same action.

// Where each control leads is publicRoutes.ts's, shared with the hero, the
// close and the feature shell. "Features" is an in-page anchor: the
// manuscript section (FrontManuscript, id="features"), where the product
// first shows itself and the tour of its parts begins.
const LINKS = [{ href: PUBLIC_ROUTES.features, label: "Features" }] as const;

export function FrontHeader({ member }: { member: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A reload can restore a scroll position, so the form is settled up front.
    let state: HeaderScrollState = initialHeaderScrollState(window.scrollY);
    const draw = () => {
      el.toggleAttribute("data-hidden", state.hidden);
      el.toggleAttribute("data-floating", state.floating);
    };
    draw();
    const onScroll = () => {
      const next = advanceHeaderScrollState(state, window.scrollY);
      const changed = next.hidden !== state.hidden || next.floating !== state.floating;
      state = next;
      if (changed) draw();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header ref={ref} className="r2-lp-head">
      <div className="r2-lp-head-in">
        <Link href={PUBLIC_ROUTES.home} className="r2-wordmark" aria-label="Sutura — home">
          <Wordmark label={false} />
        </Link>
        <nav className="r2-lp-nav" aria-label="Site">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="r2-lp-nav-link">
              {link.label}
            </a>
          ))}
          {!member && (
            <Link href={PUBLIC_ROUTES.signIn} className="r2-lp-nav-link">
              Sign in
            </Link>
          )}
        </nav>
        <Link href={startPath(member)} className="r2-button r2-button--primary r2-lp-cta">
          Start writing free
        </Link>
      </div>
    </header>
  );
}
