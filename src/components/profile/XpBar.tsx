"use client";

import { useEffect, useState } from "react";
import { xpProgressInCurrentLevel } from "@/lib/xp";

interface XpBarProps {
  xp: number;
  level: number;
  hero?: boolean;
}

export function XpBar({ xp, level, hero = false }: XpBarProps) {
  const { current, required, percent } = xpProgressInCurrentLevel(xp);
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDisplayPercent(percent), 60);
    return () => clearTimeout(t);
  }, [percent]);

  const xpToNext = required - current;

  if (hero) {
    return (
      <div className="flex flex-col">
        <p
          className="font-rune-serif leading-none"
          style={{ fontSize: "6rem", color: "var(--color-gold)" }}
        >
          {level}
        </p>
        <p
          className="mt-1 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Level
        </p>
        <p className="mt-4 text-sm" style={{ color: "var(--color-mist)" }}>
          {current.toLocaleString()} XP
        </p>
        <div className="mt-3 w-full">
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={0}
            aria-valuemax={required}
            aria-label={`Level ${level} XP progress`}
            style={{
              background: "color-mix(in srgb, var(--color-gold) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-gold) 20%, transparent)",
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${displayPercent}%`,
                background:
                  "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
                transition: "width 0.8s ease-out",
                boxShadow: "0 0 6px color-mix(in srgb, var(--color-gold) 35%, transparent)",
              }}
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--color-mist)" }}>
            {xpToNext.toLocaleString()} XP until Level {level + 1}
          </p>
        </div>
      </div>
    );
  }

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
          <span
            className="font-rune-sans text-sm"
            style={{ color: "var(--color-mist)" }}
          >
            Level
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--color-mist)" }}>
          {xpToNext.toLocaleString()} XP to level {level + 1}
        </span>
      </div>

      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-label={`Level ${level} XP progress`}
        style={{
          background: "color-mix(in srgb, var(--color-gold) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-gold) 20%, transparent)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${displayPercent}%`,
            background:
              "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
            transition: "width 0.8s ease-out",
            boxShadow: "0 0 8px color-mix(in srgb, var(--color-gold) 40%, transparent)",
          }}
        />
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--color-mist)" }}>
        {current.toLocaleString()} / {required.toLocaleString()} XP
      </p>
    </div>
  );
}
