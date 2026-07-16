interface CircularRingProps {
  current: number;
  target: number;
  size?: number;
}

export function CircularRing({ current, target, size = 128 }: CircularRingProps) {
  const strokeWidth = 9;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, target > 0 ? current / target : 0);
  const reached = current >= target && target > 0;
  const strokeColor = reached ? "var(--color-sage)" : "var(--color-gold)";
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="color-mix(in srgb, var(--color-gold) 10%, transparent)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
      />
    </svg>
  );
}
