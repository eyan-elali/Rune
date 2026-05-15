"use client";

import { useEffect, useState } from "react";
import { useModeStore, type Mode } from "@/store/modeStore";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";

const MODE_TOAST: Record<Mode, string> = {
  focus: "Focus Mode",
  game: "Game Mode",
  normal: "Normal Mode",
};

export function ModeToggle() {
  const { mode, setMode } = useModeStore();
  const showToast = useToastStore((s) => s.showToast);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-32" aria-hidden />;
  }

  const isFocus = mode === "focus";
  const isGame = mode === "game";

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    showToast(MODE_TOAST[next], "info");
  }

  function handleFocusClick() {
    switchMode(mode === "focus" ? "normal" : "focus");
  }

  function handleGameClick() {
    switchMode(mode === "game" ? "normal" : "game");
  }

  return (
    <div
      className="relative flex items-center rounded-full p-[3px] text-xs"
      style={{ border: "1px solid var(--color-border-strong)" }}
      role="group"
      aria-label="Writing mode"
    >
      {/* Sliding indicator */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-[3px] rounded-full bg-rune-gold transition-all duration-200",
          mode === "normal" && "opacity-0"
        )}
        style={{
          left: isFocus ? "3px" : "50%",
          right: isFocus ? "50%" : "3px",
        }}
      />

      <button
        type="button"
        onClick={handleFocusClick}
        aria-pressed={isFocus}
        className={cn(
          "relative z-10 rounded-full px-3.5 py-1 font-rune-sans transition-colors duration-150",
          isFocus ? "text-rune-ink" : "text-rune-mist hover:text-rune-gold"
        )}
      >
        Focus
      </button>
      <button
        type="button"
        onClick={handleGameClick}
        aria-pressed={isGame}
        className={cn(
          "relative z-10 rounded-full px-3.5 py-1 font-rune-sans transition-colors duration-150",
          isGame ? "text-rune-ink" : "text-rune-mist hover:text-rune-gold"
        )}
      >
        Game
      </button>
    </div>
  );
}
