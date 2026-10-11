"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/brand";
import { FeatureShell } from "./FeatureShell";
import { featureNavItem, featureSlugForPath } from "./featureNav";

// The Center Peek (feature.css: "The Center Peek"): a feature page opened
// from the landing page, as a large Sutura document layered over it —
// the feature shell inside a native <dialog>, shown modal. Being a modal
// dialog gives the layer its semantics for free: everything behind it is
// inert and unreachable by the keyboard, Escape asks to close (`cancel`),
// and focus has nowhere to go but inside. What this component adds:
//
//   · the page underneath keeps its place: while the peek is open the
//     document's scroll is locked with its gutter kept, so nothing shifts
//     and nothing scrolls behind the dialog; releasing it leaves the scroll
//     position exactly where it was;
//   · Tab and Shift-Tab wrap inside the dialog, as the product's dialogs do
//     (useModalFocus), rather than leaving for the browser's chrome;
//   · the peek is one history entry deep — opening it pushed one, and
//     switching features inside it replaces that one (FeatureLink,
//     FeatureSwitcher) — so closing is one step back, the same step as the
//     browser's Back: the landing's own entry, already rendered beneath,
//     with nothing fetched and nothing rebuilt;
//   · focus returns to whatever opened the peek, after it is gone;
//   · the document's title names the page while it is open.
//
// The landing's own links open the peek; the links inside it are
// FeatureLink's. Which page is open is the pathname's: this frame persists
// across the features (the (open) layout), so switching swaps only the
// article inside the shell.

export function FeaturePeek({ member, children }: { member: boolean; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const current = featureSlugForPath(pathname) ?? "pages";
  // What had focus when the peek was asked for — the landing's link — taken
  // before the dialog takes it, and before any effect (which development
  // runs twice) could see the dialog instead.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  const close = useCallback(() => router.back(), [router]);

  // Open as a modal over the page; lock the page's scroll with its gutter
  // kept; give the dialog itself focus, so the page is announced before its
  // controls; wrap Tab; and when the peek goes, hand focus back.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    el.focus();

    const html = document.documentElement;
    const body = document.body;
    const was = { gutter: html.style.scrollbarGutter, overflow: html.style.overflow, bodyOverflow: body.style.overflow };
    html.style.scrollbarGutter = "stable";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes through the route (the dialog's own `cancel` is also
      // handled; a browser may withhold it without a user gesture).
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const controls = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((c) => c.offsetParent !== null || c === document.activeElement);
      if (controls.length === 0) {
        e.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKeyDown);

    return () => {
      el.removeEventListener("keydown", onKeyDown);
      html.style.scrollbarGutter = was.gutter;
      html.style.overflow = was.overflow;
      body.style.overflow = was.bodyOverflow;
      // After the dialog is gone, so focus never lands on a control that left
      // with it. (A timeout, not an animation frame: the frame after a
      // history navigation may never come for the unmounted tree.)
      setTimeout(() => {
        const now = document.activeElement;
        const lost = !now || now === document.body || !now.isConnected;
        if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
      }, 0);
    };
  }, [close, opener]);

  // The title names the open page; the landing's returns when it closes.
  useEffect(() => {
    const before = document.title;
    document.title = `${featureNavItem(current).title} | ${PRODUCT_NAME}`;
    return () => {
      document.title = before;
    };
  }, [current]);

  return (
    <dialog
      ref={dialog}
      className="r2 r2-fpk"
      data-theme="light"
      data-accent="blue"
      aria-labelledby="fp-title"
      tabIndex={-1}
      onCancel={(e) => {
        // Escape: close through the route, so the URL and the dialog agree.
        e.preventDefault();
        close();
      }}
      onClose={close}
      onClick={(e) => {
        // A click on the backdrop reaches the dialog itself, and nothing inside it.
        if (e.target === dialog.current) close();
      }}
    >
      <FeatureShell mode="peek" current={current} member={member} onClose={close}>
        {children}
      </FeatureShell>
    </dialog>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
