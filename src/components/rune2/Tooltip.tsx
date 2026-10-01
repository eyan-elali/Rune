"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// The shell's one tooltip: a short line of text for a control whose label is
// hidden (an icon button) or whose effect wants a word more than its label
// gives ("Read" — read-only, in a tab of its own). It replaces the native
// `title`, which is slow, unstyled and invisible to the keyboard.
//
// Restraint is the point. It waits before showing (a pointer crossing the
// chrome never leaves a trail of tooltips), opens at once while the writer is
// moving from one control to the next, never shows for a touch, hides on
// press, Escape, scroll and blur, and is never used for a control whose
// visible text already says everything.
//
// Accessibility: it shows for keyboard focus (focus-visible only) as it does
// for hover. A control that already has an accessible name (aria-label or
// visible text) keeps it; the tooltip is a visual aid, so it is not wired in
// as a description — a screen reader would otherwise hear the name twice.
// When the tooltip says more than the name does, pass `describes` and it
// becomes the control's aria-describedby while shown.
//
// It is rendered at the end of the document (a portal), inside the clipping
// of nothing, and carries the shell's theme so its tokens resolve.

const SHOW_MS = 480;
/** After one tooltip closes, the next opens quickly: the writer is scanning. */
const WARM_MS = 320;
const GAP = 6;
const EDGE = 8;

let warmUntil = 0;

type Placement = "top" | "bottom" | "left" | "right";

type ChildProps = { "aria-describedby"?: string };

export function Tooltip({
  label,
  placement = "bottom",
  describes = false,
  children,
}: {
  /** The text shown. Null or empty shows nothing (the control is used as is). */
  label: ReactNode;
  placement?: Placement;
  /** The tooltip says more than the control's name: expose it as a description. */
  describes?: boolean;
  children: ReactElement<ChildProps>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const hide = useCallback(() => {
    clear();
    setAnchor((current) => {
      if (current) warmUntil = Date.now() + WARM_MS;
      return null;
    });
  }, [clear]);
  const schedule = useCallback(
    (el: HTMLElement) => {
      clear();
      const delay = Date.now() < warmUntil ? 0 : SHOW_MS;
      timer.current = setTimeout(() => {
        timer.current = null;
        setAnchor(el);
      }, delay);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);

  if (!label) return children;

  // The wrapper has no box of its own (display: contents): the control stays
  // exactly where and what it was, and the wrapper only hears its events.
  const anchorOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.firstElementChild as HTMLElement | null;
  return (
    <>
      <span
        className="r2-tooltip-anchor"
        onPointerEnter={(e) => {
          const el = anchorOf(e);
          if (el && e.pointerType !== "touch") schedule(el);
        }}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={(e) => {
          const el = anchorOf(e);
          if (el && e.target === el && el.matches(":focus-visible")) schedule(el);
        }}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide();
        }}
      >
        {describes && anchor ? cloneElement(children, { "aria-describedby": id }) : children}
      </span>
      {anchor && <Bubble id={id} anchor={anchor} placement={placement} onDismiss={hide}>{label}</Bubble>}
    </>
  );
}

function Bubble({
  id,
  anchor,
  placement,
  onDismiss,
  children,
}: {
  id: string;
  anchor: HTMLElement;
  placement: Placement;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    let x: number;
    let y: number;
    switch (placement) {
      case "top":
        x = a.left + a.width / 2 - b.width / 2;
        y = a.top - GAP - b.height;
        break;
      case "left":
        x = a.left - GAP - b.width;
        y = a.top + a.height / 2 - b.height / 2;
        break;
      case "right":
        x = a.right + GAP;
        y = a.top + a.height / 2 - b.height / 2;
        break;
      default:
        x = a.left + a.width / 2 - b.width / 2;
        y = a.bottom + GAP;
    }
    // Keep it on screen; flip top/bottom when there is no room.
    if (placement === "bottom" && y + b.height > window.innerHeight - EDGE) y = a.top - GAP - b.height;
    if (placement === "top" && y < EDGE) y = a.bottom + GAP;
    x = Math.max(EDGE, Math.min(x, window.innerWidth - b.width - EDGE));
    y = Math.max(EDGE, Math.min(y, window.innerHeight - b.height - EDGE));
    setPos({ x, y });
  }, [anchor, placement, children]);

  // Anything that moves the control away takes the tooltip with it.
  useEffect(() => {
    const dismiss = () => onDismiss();
    document.addEventListener("scroll", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("scroll", dismiss, { capture: true });
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [onDismiss]);

  const theme = anchor.closest<HTMLElement>(".r2")?.dataset.theme;
  return createPortal(
    <div className="r2 r2-tooltip-layer" data-theme={theme}>
      <div
        ref={ref}
        id={id}
        role="tooltip"
        className="r2-tooltip"
        data-placement={placement}
        data-shown={pos ? "" : undefined}
        style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
