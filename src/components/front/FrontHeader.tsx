"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

// The landing page's header (front.css: "Header"): the wordmark, one link,
// Sign in and the one action, on the same container as the hero. It is
// part of the hero: while the hero is in view it is only type on the
// page's tone — no bar, no hairline, no shadow. Once the reader has
// scrolled past the hero it takes a hairline and a hint of the page's
// tone, so it reads as pinned over what follows (data-scrolled).
//
// One action, one wording — "Start writing free" — on the public page. A
// signed-in writer is sent to their Projects by the same action.

const LINKS = [{ href: "#features", label: "Features" }] as const;

export function FrontHeader({ member }: { member: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      // Past the hero: its bottom edge has gone up behind the header.
      const hero = document.querySelector<HTMLElement>(".r2-lp-hero");
      const past = hero ? hero.getBoundingClientRect().bottom <= el.offsetHeight + 1 : window.scrollY > 8;
      el.toggleAttribute("data-scrolled", past);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
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
          {!member && (
            <Link href="/login" className="r2-lp-nav-link">
              Sign in
            </Link>
          )}
          <Link href={member ? "/projects" : "/signup"} className="r2-button r2-button--primary r2-lp-cta">
            Start writing free
          </Link>
        </nav>
      </div>
    </header>
  );
}
