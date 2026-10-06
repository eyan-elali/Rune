import type { ReactNode } from "react";
import Link from "next/link";
import { buildThemeCss } from "@/lib/rune2/themes";
import "@/app/(rune2)/rune2.css";
import { Wordmark } from "@/components/brand/Wordmark";
import { SUPPORT_EMAIL } from "@/lib/brand";

// The frame of Sutura's public pages (Beta Completion E): the front door, sign
// in, sign up and the pen name. Rune 2.0's own tokens and themes, following
// the operating system's light or dark setting (no account preference exists
// yet), with the quiet trust links at the foot.
//
// Two compositions on the page tone (--r2-page-bg):
//   front  a wide head — the wordmark and the nav at its edges — the page
//          centred under it, the trust links centred at the foot.
//   auth   no head: the wordmark leads the card it belongs to, the pair at
//          the viewport's true centre, the trust links at the foot.

const THEME_CSS = buildThemeCss();

export function PublicFrame({
  children,
  nav,
  variant = "front",
}: {
  children: ReactNode;
  nav?: ReactNode;
  variant?: "front" | "auth";
}) {
  const home = (
    <Link href="/" className="r2-wordmark" aria-label="Sutura — home">
      <Wordmark label={false} />
    </Link>
  );
  return (
    <div className="r2 r2-public" data-variant={variant} data-theme="system" data-accent="blue">
      <style id="r2-themes" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      {variant === "front" && (
        <header className="r2-public-head">
          {home}
          {nav && <nav className="r2-public-nav">{nav}</nav>}
        </header>
      )}
      <main className="r2-public-main">
        {variant === "auth" && <div className="r2-public-mark">{home}</div>}
        {children}
      </main>
      <footer className="r2-public-foot">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a>
      </footer>
    </div>
  );
}
