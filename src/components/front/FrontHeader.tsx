"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

// The landing page's header (front.css: "Header"): the wordmark, two links,
// Sign in and the one action. Pinned to the top; it takes a hairline once
// the reader has scrolled, so at the top of the page it is only type on
// the page's tone. A signed-in writer sees the way back in instead.

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
] as const;

export function FrontHeader({ member }: { member: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (window.scrollY > 8) el.setAttribute("data-scrolled", "");
      else el.removeAttribute("data-scrolled");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header ref={ref} className="r2-lp-head">
      <div className="r2-lp-head-in">
        <Link href="/" className="r2-wordmark" aria-label="Sutura — home">
          <Wordmark label={false} />
        </Link>
        <nav className="r2-lp-nav" aria-label="Site">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="r2-lp-nav-link">
              {link.label}
            </a>
          ))}
          {member ? (
            <Link href="/projects" className="r2-button r2-button--primary r2-lp-cta">
              Open Sutura
            </Link>
          ) : (
            <>
              <span className="r2-lp-nav-sep" aria-hidden="true" />
              <Link href="/login" className="r2-lp-nav-link">
                Sign in
              </Link>
              <Link href="/signup" className="r2-button r2-button--primary r2-lp-cta">
                Start writing free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
