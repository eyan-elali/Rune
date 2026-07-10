type PulseCardTier = "default" | "elevated" | "primary";

// Rune has only one raw card surface (--color-sepia / --color-border) — no
// elevated theme token exists across the 12 theme blocks in globals.css.
// Hierarchy for "elevated" and "primary" tiers is built from what's already
// theme-aware (border strength, a var(--color-gold) accent stripe) instead
// of introducing a new surface variable.
export function PulseCard({
  children,
  className = "",
  style,
  tier = "default",
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  tier?: PulseCardTier;
}) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: "var(--color-sepia)",
        border: `1px solid ${tier === "default" ? "var(--color-border)" : "var(--color-border-strong)"}`,
        ...(tier === "primary" ? { borderTop: "2px solid var(--color-gold)" } : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PulseCardLabel({
  children,
  action,
  emphasis = false,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <p
        className={
          emphasis
            ? "text-sm font-semibold uppercase tracking-widest"
            : "text-xs font-semibold uppercase tracking-widest"
        }
        style={{ color: emphasis ? "var(--color-gold-dim)" : "var(--color-mist)" }}
      >
        {children}
      </p>
      {action}
    </div>
  );
}
