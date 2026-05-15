"use client";

export interface BattleLogEntry {
  id: number;
  message: string;
}

interface BattleLogProps {
  entries: BattleLogEntry[];
}

export function BattleLog({ entries }: BattleLogProps) {
  const visible = entries.slice(-5).reverse();

  return (
    <>
      <style>{`
        @keyframes battle-entry-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .battle-entry { animation: battle-entry-in 0.3s ease forwards; }
      `}</style>
      <div
        className="flex min-h-[6rem] flex-col gap-1.5"
        aria-live="polite"
        aria-label="Battle log"
      >
        {visible.map((entry, idx) => (
          <p
            key={entry.id}
            className="battle-entry text-xs leading-relaxed"
            style={{
              color:
                idx === 0 ? "var(--color-parchment)" : "var(--color-mist)",
              opacity: Math.max(0.3, 1 - idx * 0.18),
            }}
          >
            {entry.message}
          </p>
        ))}
      </div>
    </>
  );
}
