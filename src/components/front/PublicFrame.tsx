import type { ReactNode } from "react";
import Link from "next/link";
import { buildThemeCss } from "@/lib/rune2/themes";
import "@/app/(rune2)/rune2.css";
import { Wordmark } from "@/components/brand/Wordmark";
import { PUBLIC_ROUTES } from "./publicRoutes";

// The frame of Sutura's public pages (Beta Completion E): the front door, sign
// in, sign up, the pen name and the legal pages. Rune 2.0's own tokens, always
// in Sutura Light: a public page has one art-directed appearance. It never
// follows the operating system, Dark, Candlelight or a signed-in writer's
// saved theme (that belongs to the app, behind sign-in), and since the theme
// is in the server-rendered markup there is no flash of another one.
//
// Two compositions on the page tone (--r2-page-bg):
//   front  a wide head — the wordmark and the nav at its edges — the page
//          centred under it, the trust links centred at the foot.
//   auth   no head: the wordmark leads the card it belongs to, the pair at
//          the viewport's true centre, the trust links at the foot.
//   landing  the front door itself: no head here — the page brings its own
//          pinned header (FrontHeader) and its hero fills the width — only
//          the tone, the themes and the trust links at the foot.
//   feature  the feature pages (components/front/feature): a simplified
//          Sutura workspace — a navigator beside a Page — that is its own
//          navigation. No head, no footer: the shell brings the trust
//          links at the foot of its Page.

const THEME_CSS = buildThemeCss();

export function PublicFrame({
  children,
  nav,
  variant = "front",
}: {
  children: ReactNode;
  nav?: ReactNode;
  variant?: "front" | "auth" | "landing" | "feature";
  /** Accepted for callers that still pass it; every public page is Sutura Light. */
  theme?: "light";
}) {
  const home = (
    <Link href={PUBLIC_ROUTES.home} className="r2-wordmark" aria-label="Sutura — home">
      <Wordmark label={false} />
    </Link>
  );
  return (
    <div className="r2 r2-public" data-variant={variant} data-theme="light" data-accent="blue">
      <style id="r2-themes" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      {variant === "front" && (
        <header className="r2-public-head">
          {home}
          {nav && <nav className="r2-public-nav">{nav}</nav>}
        </header>
      )}
      {variant === "landing" || variant === "feature" ? (
        children
      ) : (
        <main className="r2-public-main">
          {variant === "auth" && <div className="r2-public-mark">{home}</div>}
          {children}
        </main>
      )}
      {variant !== "feature" && (
        <footer className="r2-public-foot">
          <PublicFootLinks />
        </footer>
      )}
    </div>
  );
}

/** The quiet trust links at the foot of every public page (publicRoutes.ts): Privacy, Terms, and Support by mail. */
export function PublicFootLinks() {
  return (
    <>
      <Link href={PUBLIC_ROUTES.privacy}>Privacy</Link>
      <Link href={PUBLIC_ROUTES.terms}>Terms</Link>
      <a href={PUBLIC_ROUTES.support}>Support</a>
    </>
  );
}
