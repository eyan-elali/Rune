import type { ReactNode } from "react";
import Link from "next/link";
import { buildThemeCss } from "@/lib/rune2/themes";
import "@/app/(rune2)/rune2.css";
import { Wordmark } from "@/components/brand/Wordmark";
import { SUPPORT_EMAIL } from "@/lib/brand";

// The frame of Sutura's public pages (Beta Completion E): the front door, sign
// in, sign up and the pen name. Rune 2.0's own tokens and themes, following
// the operating system's light or dark setting (no account preference exists
// yet), with the wordmark at the top and the quiet trust links at the foot.

const THEME_CSS = buildThemeCss();

export function PublicFrame({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  return (
    <div className="r2 r2-public" data-theme="system" data-accent="blue">
      <style id="r2-themes" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      <header className="r2-public-head">
        <Link href="/" className="r2-wordmark" aria-label="Sutura — home">
          <Wordmark label={false} />
        </Link>
        {nav && <nav className="r2-public-nav">{nav}</nav>}
      </header>
      <main className="r2-public-main">{children}</main>
      <footer className="r2-public-foot">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a>
      </footer>
    </div>
  );
}
