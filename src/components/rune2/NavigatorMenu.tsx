"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

// A small contextual menu for the navigator (row "+" and "⋯" buttons, right
// click). Fixed-positioned at a point so the navigator's scroll container
// never clips it. Keyboard: arrows move, Enter/Space choose, Escape or Tab
// closes. An item may ask for confirmation, shown in place of the list.

export type NavigatorMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "danger";
  /** Shown in place of the menu before onSelect runs. */
  confirm?: { message: string; action: string };
};

export function NavigatorMenu({
  label,
  at,
  items,
  onClose,
}: {
  /** Accessible name, e.g. "Chapter 3 actions". */
  label: string;
  /** Viewport point to open at (the menu's top-left, clamped on screen). */
  at: { x: number; y: number };
  items: NavigatorMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [confirming, setConfirming] = useState<NavigatorMenuItem | null>(null);

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - height - 8)),
    });
  }, [at, confirming]);

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
      className="r2-menu"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {confirming?.confirm ? (
        <div className="r2-menu-confirm">
          <p>{confirming.confirm.message}</p>
          <div className="r2-menu-confirm-actions">
            <button type="button" data-menu-item className="r2-menu-button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button
              type="button"
              data-menu-item
              className="r2-menu-button r2-menu-button--danger"
              onClick={() => choose(confirming)}
            >
              {confirming.confirm.action}
            </button>
          </div>
        </div>
      ) : (
        items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              data-menu-item
              tabIndex={-1}
              className="r2-menu-item"
              data-tone={item.tone}
              onClick={() => choose(item)}
            >
              <span className="r2-menu-icon" aria-hidden>
                {Icon && <Icon size={14} strokeWidth={1.75} />}
              </span>
              <span>
                {item.label}
                {item.confirm && <span aria-hidden>…</span>}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
