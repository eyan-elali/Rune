"use client";

import { useEffect, useState } from "react";
import { useModeStore } from "@/store/modeStore";

export function ModeToggle() {
  const { mode, setMode } = useModeStore();
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-20" aria-hidden />;
  }

  const isFocus = mode === "focus";

  function handleClick() {
    setMode(isFocus ? "normal" : "focus");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-pressed={isFocus}
      data-tutorial-id="focus-mode-btn"
      className="rounded-full px-3.5 py-1 text-xs font-rune-sans transition-colors duration-150"
      style={{
        border: "1px solid var(--color-border-strong)",
        background: isFocus
          ? "var(--color-gold)"
          : isHovered
            ? "rgba(201,168,76,0.1)"
            : "transparent",
        color: isFocus
          ? "var(--color-ink)"
          : isHovered
            ? "var(--color-gold)"
            : "var(--color-mist)",
      }}
    >
      Focus
    </button>
  );
}
