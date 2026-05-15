"use client";

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
        className="relative h-3 w-full overflow-hidden rounded-full"
        style={{
          background: "rgba(26, 22, 20, 0.7)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
        role="progressbar"
        aria-valuenow={Math.round(current)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            transition: "width 0.3s ease",
            background: isEnemy
              ? isLow
                ? "#6b1a1a"
                : "linear-gradient(90deg, #6b1a1a, var(--color-crimson))"
              : isLow
              ? "var(--color-crimson)"
              : "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
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
