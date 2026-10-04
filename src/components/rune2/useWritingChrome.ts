"use client";

import { useEffect, type RefObject } from "react";

// "Rune gets quieter when the writer starts writing."
//
// While the writer is typing prose, the top chrome (tabs, breadcrumb, actions)
// fades; reaching for the interface brings it back. The model is deliberately
// small and lives outside React state: it only toggles a `data-writing`
// attribute on the shell root, which rune2.css turns into opacity. Nothing
// re-renders, no editor is touched, and the layout never changes — the chrome
// keeps its space and simply becomes visually absent.
//
// Writing starts:  a printable/editing key inside manuscript prose, sustained
//                  for a short settle period (so one keystroke never blinks
//                  the chrome away).
// Writing ends:    the pointer moves a meaningful distance from where it was
//                  when the chrome faded, any pointer press, Escape or Tab
//                  (reaching for controls by keyboard), or focus landing on
//                  anything that is not prose — a tab, the navigator, a panel.
//
// Keys typed anywhere else (the Notes composer, a rename field) never count.

const SETTLE_MS = 700;
const REVEAL_DISTANCE = 14;

const PROSE = ".r2-prose .ProseMirror";

function isProseTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PROSE) !== null;
}

/** A key that writes or edits prose (not a bare modifier, navigation or escape). */
function isWritingKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key.length === 1) return true;
  return e.key === "Enter" || e.key === "Backspace" || e.key === "Delete";
}

export function useWritingChrome(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let writing = false;
    let anchor: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;

    const set = (next: boolean) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (writing === next) return;
      writing = next;
      anchor = next ? last : null;
      if (next) el.setAttribute("data-writing", "");
      else el.removeAttribute("data-writing");
    };

    const settle = () => {
      if (writing || timer) return;
      timer = setTimeout(() => {
        timer = null;
        set(true);
      }, SETTLE_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        set(false);
        return;
      }
      if (isProseTarget(e.target) && isWritingKey(e)) settle();
    };

    // Text arriving without a keydown of its own (an IME, dictation, or
    // another input method) is writing too.
    const onInput = (e: Event) => {
      if (isProseTarget(e.target)) settle();
    };

    const onPointerMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!writing && !timer) return;
      if (!anchor) {
        anchor = last;
        return;
      }
      if (Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y) >= REVEAL_DISTANCE) set(false);
    };

    const onPointerDown = () => set(false);

    const onFocusIn = (e: FocusEvent) => {
      if (!isProseTarget(e.target)) set(false);
    };

    el.addEventListener("keydown", onKeyDown, true);
    el.addEventListener("input", onInput, true);
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("focusin", onFocusIn);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("keydown", onKeyDown, true);
      el.removeEventListener("input", onInput, true);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("focusin", onFocusIn);
      el.removeAttribute("data-writing");
    };
  }, [root]);
}
