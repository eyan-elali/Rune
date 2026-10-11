"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { NavigatorMenu, type NavigatorMenuItem } from "@/components/rune2/NavigatorMenu";
import { FEATURE_NAV, featureNavItem, type FeatureSlug } from "./featureNav";

// The feature shell on a phone (feature.css: "A phone"): no navigator at the
// left, but one compact row at the top of the content — the wordmark, home,
// and the current page's name as a control, "Pages ▾" — which opens the
// product's own menu (NavigatorMenu: the same surface the navigator's rows
// open, with its keyboard: arrows, Enter, Escape) listing the same places
// the navigator does: Features, Principles, and Back to home. Choosing one
// goes there like any link would. The row is the same on the server and
// the client; the menu exists only while it is open.

export function FeatureSwitcher({ current }: { current: FeatureSlug }) {
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const page = featureNavItem(current);

  function open() {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left, y: r.bottom + 4 });
  }

  const items: NavigatorMenuItem[] = [
    ...FEATURE_NAV.flatMap((group) =>
      group.items.map((item, i): NavigatorMenuItem => ({
        label: item.title,
        icon: item.icon,
        section: i === 0 ? group.label : undefined,
        checked: item.slug === current,
        onSelect: () => router.push(item.href),
      }))
    ),
    { label: "Back to home", icon: ArrowLeft, separator: true, onSelect: () => router.push("/") },
  ];

  return (
    <div className="r2-fp-switch">
      <Link href="/" className="r2-wordmark" aria-label="Sutura — home">
        <Wordmark label={false} />
      </Link>
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
