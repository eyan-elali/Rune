"use client";

import { useEffect, type RefObject } from "react";
import { AUTO_SCROLL_DEFAULTS, AUTO_SCROLL_REDUCED, createAutoScroll } from "@/lib/rune2/dragAutoScroll";

/**
 * Scrolls `ref`'s element — only it — while a drag is in progress
 * (`dragging`) and the pointer is held near its top or bottom edge (see
 * lib/rune2/dragAutoScroll.ts). The pointer is followed through the
 * document's own dragover events, so it keeps working over the list's header
 * or just beyond its edge; the drag's end, a drop, or the pointer leaving the
 * window stops it at once. Any scrolling list with draggable rows can use it.
 */
export function useDragAutoScroll(ref: RefObject<HTMLElement | null>, dragging: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!dragging || !el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controller = createAutoScroll(
      {
        box: () => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        },
        scrollTop: () => el.scrollTop,
        maxScrollTop: () => el.scrollHeight - el.clientHeight,
        scrollBy: (dy) => {
          el.scrollTop += dy;
        },
      },
      { request: (cb) => requestAnimationFrame(cb), cancel: (h) => cancelAnimationFrame(h) },
      reduced ? AUTO_SCROLL_REDUCED : AUTO_SCROLL_DEFAULTS
    );
    const onOver = (e: DragEvent) => controller.update(e.clientY);
    const onEnd = () => controller.stop();
    // relatedTarget null: the pointer left the window.
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) controller.stop();
    };
    document.addEventListener("dragover", onOver, true);
    document.addEventListener("drop", onEnd, true);
    document.addEventListener("dragend", onEnd, true);
    document.addEventListener("dragleave", onLeave, true);
    return () => {
      controller.stop();
      document.removeEventListener("dragover", onOver, true);
      document.removeEventListener("drop", onEnd, true);
      document.removeEventListener("dragend", onEnd, true);
      document.removeEventListener("dragleave", onLeave, true);
    };
  }, [ref, dragging]);
}
