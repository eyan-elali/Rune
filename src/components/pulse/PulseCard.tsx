type PulseCardTier = "default" | "elevated" | "primary";

// A Pulse section's surface: Rune 2's quiet grouped surface (the one Settings
// and Projects sit on), a shade off the page — hierarchy from tone and space,
// not from rules. The tiers are kept for the sections that pass them; they
// read the same, since what matters most now leads the page instead of
// being outlined.
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
    <section className={`r2-pulse-group ${className}`} data-tier={tier} style={style}>
      {children}
    </section>
  );
}

/** A section's heading, in the eyebrow voice, with room for one action beside it. */
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
    <div className="r2-pulse-label-row">
      <h2 className={emphasis ? "r2-pulse-label r2-pulse-label--emphasis" : "r2-pulse-label"}>{children}</h2>
      {action}
    </div>
  );
}
