"use client";

import { useEffect, type RefObject } from "react";

// A modal dialog's keyboard contract, in one place: focus goes into it when it
// opens (its own autoFocus field wins; otherwise its first control, or the
// dialog itself), Tab and Shift-Tab stay inside it while it is open, and when
// it closes focus goes back to whatever opened it — unless the writer has
// already put focus somewhere on purpose. Escape is the dialog's own business
// (each says when it may close: never mid-save).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function useModalFocus(ref: RefObject<HTMLElement | null>, open = true) {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.contains(document.activeElement)) {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
        dialog.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (controls.length === 0) {
        e.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !dialog.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !dialog.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);

    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      // Back to the opener — after the dialog is gone, so a control that
      // unmounted with it never leaves focus stranded on <body>.
      requestAnimationFrame(() => {
        const now = document.activeElement;
        const lost = !now || now === document.body || !now.isConnected || dialog.contains(now);
        if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [ref, open]);
}
