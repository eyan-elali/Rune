"use client";

import { useEffect, useState } from "react";
import { xpProgressInCurrentLevel } from "@/lib/xp";

interface XpBarProps {
  xp: number;
  level: number;
}

export function XpBar({ xp, level }: XpBarProps) {
  const { current, required, percent } = xpProgressInCurrentLevel(xp);
  const [displayPercent, setDisplayPercent] = useState(0);

  // Animate fill on mount
  useEffect(() => {
    const t = setTimeout(() => setDisplayPercent(percent), 60);
    return () => clearTimeout(t);
  }, [percent]);

  const xpToNext = required - current;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className="font-rune-serif leading-none"
            style={{ fontSize: "3.5rem", color: "var(--color-gold)" }}
          >
            {level}
          </span>
          <span className="font-rune-sans text-sm" style={{ color: "var(--color-mist)" }}>
            Level
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--color-mist)" }}>
          {xpToNext.toLocaleString()} XP to level {level + 1}
        </span>
      </div>

      {/* Track */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-label={`Level ${level} XP progress`}
        style={{ background: "rgba(201, 168, 76, 0.12)", border: "1px solid rgba(201, 168, 76, 0.2)" }}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${displayPercent}%`,
            background: "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
            transition: "width 0.8s ease-out",
            boxShadow: "0 0 8px rgba(201, 168, 76, 0.4)",
          }}
        />
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--color-mist)" }}>
        {current.toLocaleString()} / {required.toLocaleString()} XP
      </p>
    </div>
  );
}
