"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { ICON } from "@/components/rune2/icons";
import { PublicFootLinks } from "@/components/front/PublicFrame";
import { startPath } from "@/components/front/publicRoutes";
import { FrontAnalytics } from "@/components/front/FrontAnalytics";
import { FeatureNavigator } from "./FeatureNavigator";
import { FeatureSwitcher } from "./FeatureSwitcher";
import type { FeatureSlug } from "./featureNav";

// The feature shell (feature.css): a simplified Sutura workspace — the
// navigator at the left and, where the writing would be, a Page — read in
// one of two ways:
//
//   page  the feature's own route, visited directly: the shell is the
//         whole window, the navigator pinned beside the scrolling Page.
//         Its links are full navigations, so a page never opens a peek
//         over itself.
//   peek  the Center Peek over the landing page (FeaturePeek): the shell
//         fills the dialog, the Page scrolls inside it, and the links are
//         soft navigations that swap the article in place. "Home" closes.
//
// What the pieces inside need to know — the mode, the current page, how to
// close — travels by context (useFeatureShell), so the navigator, the
// switcher and a cross-link in the prose (FeatureLink) are one component
// each, whichever way the shell is read.

export type FeatureShellMode = "page" | "peek";

type ShellContext = {
  mode: FeatureShellMode;
  current: FeatureSlug;
  /** Closes the peek (peek mode only). */
  close?: () => void;
};

const Ctx = createContext<ShellContext>({ mode: "page", current: "pages" });

export function useFeatureShell() {
  return useContext(Ctx);
}

export function FeatureShell({
  mode,
  current,
  member,
  onClose,
  children,
}: {
  mode: FeatureShellMode;
  current: FeatureSlug;
  member: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // A new article in the peek starts at its top, as a new Page would.
  useEffect(() => {
    if (mode === "peek") scroller.current?.scrollTo({ top: 0 });
  }, [mode, current]);

  return (
    <Ctx.Provider value={{ mode, current, close: onClose }}>
      <div className="r2-fp" data-mode={mode}>
        {mode === "peek" && (
          // First in the Tab order, as the dialog's own control; drawn at its top right.
          <button type="button" className="r2-icon-button r2-icon-button--md r2-fp-close" aria-label="Close" onClick={onClose}>
            <X {...ICON} aria-hidden />
          </button>
        )}
        {/* "Start writing free" clicks (data-cta="feature"), signed-out only; a peek is over the
            front door, whose own FrontAnalytics already listens. */}
        {!member && mode !== "peek" && <FrontAnalytics />}
        <FeatureNavigator />
        <div className="r2-fp-content" ref={scroller}>
          <FeatureSwitcher />
          <main className="r2-fp-main">
            <article className="r2-fp-doc r2-page">
              {children}
              <FeatureEnd member={member} />
            </article>
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/**
 * The end of the Page: a hairline, one quiet line, the one action — the
 * front door's, with the same destination (Projects for a signed-in writer,
 * Create account for a visitor) — and the trust links underneath. Not a
 * second landing page: in the peek the landing is already there, beneath.
 */
function FeatureEnd({ member }: { member: boolean }) {
  return (
    <footer className="r2-fp-end">
      <div className="r2-fp-end-row">
        <p className="r2-fp-end-line">Sutura is open to anyone, and free during the public beta.</p>
        <Link href={startPath(member)} className="r2-button r2-button--primary r2-fp-end-action" data-cta="feature">
          Start writing free
        </Link>
      </div>
      <nav className="r2-fp-foot" aria-label="Legal">
        <PublicFootLinks />
      </nav>
    </footer>
  );
}
