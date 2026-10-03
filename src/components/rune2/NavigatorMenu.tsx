"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "./icons";
import { placeFloating, pointRect } from "@/lib/rune2/floating";

// A small contextual menu for the navigator (row "+" and "⋯" buttons, right
// click). Fixed-positioned at a point so the navigator's scroll container
// never clips it. Keyboard: arrows move, Enter/Space choose, Escape or Tab
// closes. An item may ask for confirmation, shown in place of the list.

export type NavigatorMenuItem = {
  label: string;
  /** Needed when two items can share a label (e.g. two untitled Folders). */
  key?: string;
  /** Nesting depth, for a list of places (e.g. "Move to"). */
  inset?: number;
  /** A keyboard shortcut for the same action, shown quietly. */
  hint?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "danger";
  /** Shown in place of the menu before onSelect runs. */
  confirm?: { message: string; action: string };
  /** A small label above this item, naming the group of choices it starts (parted from what precedes it). */
  section?: string;
  /** A hairline above this item. */
  separator?: boolean;
  /** One of a set of choices: the chosen one carries a mark. */
  checked?: boolean;
};

export function NavigatorMenu({
  label,
  at,
  above = false,
  items,
  onClose,
}: {
  /** Accessible name, e.g. "Chapter 3 actions". */
  label: string;
  /** Viewport point to open at (the menu's top-left, clamped on screen). */
  at: { x: number; y: number };
  /** Open upwards from the point instead (its bottom-left): for a control at the foot of the screen. */
  above?: boolean;
  items: NavigatorMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const confirmId = useId();
  const [pos, setPos] = useState<{ x: number; y: number; side: "top" | "bottom"; maxHeight: number | null }>({
    ...at,
    side: above ? "top" : "bottom",
    maxHeight: null,
  });
  const [confirming, setConfirming] = useState<NavigatorMenuItem | null>(null);

  // Keep the menu whole on screen (lib/rune2/floating.ts): it flips when
  // there is no room on its side, and a long list ("Move to") is capped to
  // the window and scrolls — at any window height or browser zoom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.maxHeight = "";
    const p = placeFloating({
      anchor: pointRect(at.x, at.y),
      size: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      side: above ? "top" : "bottom",
      gap: 0,
    });
    el.style.maxHeight = p.maxHeight === null ? "" : `${p.maxHeight}px`;
    setPos({ x: p.x, y: p.y, side: p.side, maxHeight: p.maxHeight });
  }, [at, above, confirming]);

  // Give focus back to whatever opened the menu, unless the chosen item moved
  // it somewhere on purpose (e.g. a rename field).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const menu = ref.current;
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || menu?.contains(now)) opener?.focus();
    };
  }, []);

  // Focus the first control whenever the content changes.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
  }, [confirming]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onScrollOrResize = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("blur", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("blur", onScrollOrResize);
    };
  }, [onClose]);

  function onKeyDown(e: React.KeyboardEvent) {
    const controls = [...(ref.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [])];
    const at = controls.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (confirming) setConfirming(null);
      else onClose();
    } else if (e.key === "Tab") {
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      controls[(at + step + controls.length) % controls.length]?.focus();
    }
  }

  function choose(item: NavigatorMenuItem) {
    if (item.confirm && !confirming) {
      setConfirming(item);
      return;
    }
    onClose();
    item.onSelect();
  }

  return (
    <div
      ref={ref}
      role={confirming ? "alertdialog" : "menu"}
      aria-label={confirming ? confirming.label : label}
      aria-describedby={confirming ? confirmId : undefined}
      className="r2-menu"
      data-side={pos.side}
      style={{ left: pos.x, top: pos.y, maxHeight: pos.maxHeight ?? undefined, overflowY: pos.maxHeight === null ? undefined : "auto" }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {confirming?.confirm ? (
        <div className="r2-menu-confirm">
          <p id={confirmId}>{confirming.confirm.message}</p>
          <div className="r2-menu-confirm-actions">
            <button type="button" data-menu-item className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button
              type="button"
              data-menu-item
              className="r2-button r2-button--danger r2-button--sm"
              onClick={() => choose(confirming)}
            >
              {confirming.confirm.action}
            </button>
          </div>
        </div>
      ) : (
        items.map((item, i) => {
          const Icon = item.icon;
          const choice = item.checked !== undefined;
          return (
            <Fragment key={item.key ?? item.label}>
              {(item.separator || item.section) && i > 0 && <div className="r2-menu-separator" aria-hidden />}
              {item.section && (
                <p className="r2-menu-section" aria-hidden>
                  {item.section}
                </p>
              )}
              <button
                type="button"
                role={choice ? "menuitemradio" : "menuitem"}
                aria-checked={choice ? item.checked : undefined}
                data-menu-item
                tabIndex={-1}
                className="r2-menu-item"
                data-tone={item.tone}
                style={item.inset ? { paddingLeft: 8 + item.inset * 12 } : undefined}
                onClick={() => choose(item)}
              >
                <span className="r2-menu-icon" aria-hidden>
                  {Icon && <Icon {...ICON} />}
                </span>
                <span className="r2-menu-label">
                  {item.label}
                  {item.confirm && <span aria-hidden>…</span>}
                </span>
                {item.hint && (
                  <kbd className="r2-menu-hint" aria-hidden>
                    {item.hint}
                  </kbd>
                )}
                {choice && (
                  <span className="r2-menu-check" aria-hidden>
                    {item.checked && <Check {...ICON_SM_BOLD} />}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })
      )}
    </div>
  );
}
