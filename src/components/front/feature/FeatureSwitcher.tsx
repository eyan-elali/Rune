"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { NavigatorMenu, type NavigatorMenuItem } from "@/components/rune2/NavigatorMenu";
import { FeatureLink } from "./FeatureLink";
import { useFeatureShell } from "./FeatureShell";
import { FEATURE_NAV, featureNavItem } from "./featureNav";

// The feature shell where the navigator does not fit (feature.css: "The
// switcher"): one row at the top of the content in three zones — the
// wordmark, home, at the left; the current page's name on the row's centre
// as a control, "Pages ▾"; and in the peek the close at the right (drawn
// by FeatureShell, placed by the stylesheet) — the name opening
// the product's own menu (NavigatorMenu: the same surface the navigator's
// rows open, with its keyboard: arrows, Enter, Escape) listing the same
// places the navigator does: Features, Principles, and the way home.
// Choosing one goes there as the navigator's links do: a soft navigation
// that replaces the peek's entry inside the peek, a full one on a page of
// its own; home closes the peek.
// The row is the same on the server and the client; the menu exists only
// while it is open.

const MENU_MIN_WIDTH = 196;

export function FeatureSwitcher() {
  const router = useRouter();
  const { current, mode, close } = useFeatureShell();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const page = featureNavItem(current);

  // The menu opens centred under the name (its narrowest width, rune2.css:
  // .r2-menu; NavigatorMenu keeps it on screen).
  function open() {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left + r.width / 2 - MENU_MIN_WIDTH / 2, y: r.bottom + 4 });
  }

  function go(href: string) {
    if (mode === "peek") router.replace(href, { scroll: false });
    else window.location.assign(href);
  }

  const items: NavigatorMenuItem[] = [
    ...FEATURE_NAV.flatMap((group) =>
      group.items.map((item, i): NavigatorMenuItem => ({
        label: item.title,
        icon: item.icon,
        section: i === 0 ? group.label : undefined,
        checked: item.slug === current,
        onSelect: () => go(item.href),
      }))
    ),
    {
      label: mode === "peek" ? "Back to the front door" : "Back to home",
      icon: ArrowLeft,
      separator: true,
      onSelect: () => (mode === "peek" ? close?.() : go("/")),
    },
  ];

  return (
    <div className="r2-fp-switch">
      <FeatureLink href="/" className="r2-wordmark" aria-label="Sutura — home">
        <Wordmark label={false} />
      </FeatureLink>
      <button
        ref={button}
        type="button"
        className="r2-nav-project r2-fp-switch-current"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={`${page.title} — explore Sutura`}
        onClick={() => (at ? setAt(null) : open())}
      >
        <span className="r2-nav-project-title">{page.title}</span>
        <ChevronDown {...ICON_SM_BOLD} aria-hidden />
      </button>
      {at && <NavigatorMenu label="Explore Sutura" at={at} items={items} onClose={() => setAt(null)} />}
    </div>
  );
}
