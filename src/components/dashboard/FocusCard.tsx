import Link from "next/link";

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
} as const;

interface FocusCardProps {
  href: string;
  label: string;
  title: string;
  subtitle?: string;
  meta: string;
  className?: string;
}

export function FocusCard({
  href,
  label,
  title,
  subtitle,
  meta,
  className,
}: FocusCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className ?? ""}`}
      style={cardStyle}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <h3
        className="font-rune-serif text-lg leading-snug transition-colors duration-150 group-hover:text-rune-gold line-clamp-2"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1 text-xs line-clamp-1" style={{ color: "var(--color-mist)" }}>
          {subtitle}
        </p>
      )}
      <p className="mt-auto pt-3 text-xs" style={{ color: "var(--color-mist)" }}>
        {meta}
      </p>
    </Link>
  );
}

export function EmptyFocusCard({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col rounded-lg p-5"
      style={{ ...cardStyle, borderStyle: "dashed" }}
    >
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        {label}
      </p>
      <p
        className="font-rune-serif text-sm"
        style={{ color: "var(--text-primary)", opacity: 0.4 }}
      >
        Nothing here yet
      </p>
    </div>
  );
}
