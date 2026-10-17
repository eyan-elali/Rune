"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { ICON_SM_BOLD } from "./icons";
import { CANVAS_TONES, NEUTRAL_TONE_LABEL } from "@/lib/rune2/canvas";
import { placeFloating, pointRect } from "@/lib/rune2/floating";
import type { CanvasTone } from "@/lib/types";

// The tone picker (migration 059): a compact popover of curated swatches —
// Neutral and the seven tones — for the selected notes and Sections. A
// swatch applies at once (direct manipulation; no form, no dialog). The
// chosen one carries a check; a mixed selection carries none. Arrow keys
// move between swatches, Enter or Space applies, Escape closes; focus comes
// in on the chosen swatch and goes back to whatever opened it.

export function CanvasTonePicker({
  at,
  value,
  onChoose,
  onClose,
}: {
  /** Viewport point to open at (the popover's top-left, kept on screen). */
  at: { x: number; y: number };
  /** The selection's tone: null for neutral, "mixed" when they differ. */
  value: CanvasTone | null | "mixed";
  onChoose: (tone: CanvasTone | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: "top" | "bottom" }>({ ...at, side: "bottom" });
  const options: { id: CanvasTone | null; label: string }[] = [{ id: null, label: NEUTRAL_TONE_LABEL }, ...CANVAS_TONES.map((t) => ({ id: t.id, label: t.label }))];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const p = placeFloating({
      anchor: pointRect(at.x, at.y),
      size: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      side: "bottom",
      gap: 0,
    });
    setPos({ x: p.x, y: p.y, side: p.side });
  }, [at]);

  // Focus the chosen swatch (or Neutral) on opening; hand focus back on closing.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const chosen = el?.querySelector<HTMLElement>('[data-swatch][aria-checked="true"]') ?? el?.querySelector<HTMLElement>("[data-swatch]");
    chosen?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || el?.contains(now)) opener?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // The control that opened it toggles it itself (its click follows this press).
      if (target?.closest(".r2-canvas-tone-control")) return;
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const away = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
    };
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const swatches = [...(ref.current?.querySelectorAll<HTMLElement>("[data-swatch]") ?? [])];
    const index = swatches.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      onClose();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (swatches.length === 0) return;
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const next = index === -1 ? 0 : (index + step + swatches.length) % swatches.length;
      swatches[next].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      swatches[e.key === "Home" ? 0 : swatches.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={ref}
      className="r2-popover r2-canvas-tones"
      role="radiogroup"
      aria-label="Colour"
      data-side={pos.side}
      style={{ position: "fixed", left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const checked = value !== "mixed" && value === o.id;
        return (
          <button
            key={o.id ?? "neutral"}
            type="button"
            role="radio"
            className="r2-canvas-tone"
            data-swatch
            data-tone={o.id ?? undefined}
            aria-checked={checked}
            aria-label={o.label}
            title={o.label}
            tabIndex={checked || (value === "mixed" && o.id === null) ? 0 : -1}
            onClick={() => {
              onChoose(o.id);
              onClose();
            }}
          >
            <span className="r2-canvas-tone-dot" aria-hidden />
            {checked && <Check className="r2-canvas-tone-check" {...ICON_SM_BOLD} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
