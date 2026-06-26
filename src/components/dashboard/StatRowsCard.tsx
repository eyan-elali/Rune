const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

interface StatRowsCardProps {
  rows: { label: string; value: string }[];
}

export function StatRowsCard({ rows }: StatRowsCardProps) {
  return (
    <div className="flex-1 rounded-lg p-5" style={cardStyle}>
      <ul className="flex flex-col gap-3">
        {rows.map(({ label, value }) => (
          <li key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm" style={{ color: "var(--color-mist)" }}>
              {label}
            </span>
            <span
              className="shrink-0 font-rune-serif text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
