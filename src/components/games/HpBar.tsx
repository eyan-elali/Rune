"use client";

import { cn } from "@/lib/utils";

interface HpBarProps {
  current: number;
  max: number;
  variant: "enemy" | "player";
  label?: string;
}

export function HpBar({ current, max, variant, label }: HpBarProps) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const isLow = pct < 25;
  const isEnemy = variant === "enemy";

  return (
    <div>
      {label && (
        <p
          className="mb-2 text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-mist)", opacity: 0.7 }}
        >
          {label}
        </p>
      )}
      <div
        className="battle-hp-bar__track relative h-3 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(current)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            "battle-hp-bar__fill h-full rounded-full",
            isEnemy
              ? cn(
                  "battle-hp-bar__fill--enemy",
                  isLow && "battle-hp-bar__fill--low"
                )
              : cn(
                  "battle-hp-bar__fill--player",
                  isLow && "battle-hp-bar__fill--low"
                )
          )}
          style={{
            width: `${pct}%`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <p
        className="mt-1 text-right font-rune-sans text-[10px] tabular-nums"
        style={{ color: "var(--color-mist)", opacity: 0.6 }}
      >
        {Math.round(current)} / {max}
      </p>
    </div>
  );
}
