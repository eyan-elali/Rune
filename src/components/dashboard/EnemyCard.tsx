import Link from "next/link";

export const ENEMIES = [
  {
    id: "blank-page",
    name: "The Blank Page",
    hp: 500,
    description: "An endless white void — silent, patient, and utterly merciless.",
    gimmick: null,
  },
  {
    id: "writers-block",
    name: "Writer's Block",
    hp: 800,
    description: "A stubborn phantom that feeds on hesitation. Stop moving and it heals.",
    gimmick: "Heals 50 HP every 60s",
  },
  {
    id: "deadline",
    name: "The Deadline",
    hp: 1200,
    description: "Time itself, weaponised. Every idle moment costs double.",
    gimmick: "2× idle damage",
  },
] as const;

export function EnemyCard({
  name,
  hp,
  description,
  gimmick,
}: (typeof ENEMIES)[number]) {
  return (
    <div
      className="flex h-full flex-col rounded-lg p-5"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--color-border)",
        borderTopColor: "var(--color-crimson)",
        borderTopWidth: "2px",
      }}
    >
      <p
        className="mb-0.5 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-crimson)" }}
      >
        {hp} HP
        {gimmick && (
          <span style={{ color: "var(--color-mist)" }}> · {gimmick}</span>
        )}
      </p>
      <h3
        className="!mb-2 font-rune-serif text-lg"
        style={{ color: "var(--text-primary)" }}
      >
        {name}
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--color-mist)" }}>
        {description}
      </p>
      <Link
        href="/games/battle"
        className="mt-auto inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
        style={{ background: "var(--color-crimson)", color: "var(--color-parchment)" }}
      >
        Enter Battle
      </Link>
    </div>
  );
}
