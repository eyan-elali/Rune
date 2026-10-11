"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { useFeatureShell } from "./FeatureShell";

// A link between the feature pages, or home, that knows how the shell is
// being read (useFeatureShell):
//   · in the peek, a feature link is a soft navigation that replaces the
//     peek's one history entry, with the scroll left alone — the route
//     changes, the article swaps inside the same dialog, the landing
//     underneath never moves, and Back still closes the peek in one step;
//     a link home closes the peek, which is where home already is;
//   · on a page of its own, every link is a full navigation, so a feature
//     page never opens a peek over itself.
export function FeatureLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const shell = useFeatureShell();
  if (shell.mode === "peek") {
    if (href === "/" || href.startsWith("/#")) {
      return (
        <a
          href={href}
          {...rest}
          onClick={(e) => {
            rest.onClick?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            shell.close?.();
          }}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} replace scroll={false} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
