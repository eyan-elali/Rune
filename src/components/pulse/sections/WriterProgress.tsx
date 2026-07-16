"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { WriterProgressItem } from "@/lib/actions/pulse";

function formatThreshold(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString()}k` : String(n);
}

export function WriterProgress({ data }: { data: WriterProgressItem[] }) {
  const { openDrilldown } = usePulseDrawer();
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <PulseCard className="p-6">
      <PulseCardLabel>Writer Progress</PulseCardLabel>
      <p className="mb-4 -mt-1 text-xs leading-relaxed" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
        Writers who reached each word milestone in the selected range.
      </p>
      <div className="space-y-3">
        {data.map((item) => {
          const widthPercent = Math.max(2, Math.round((item.count / maxCount) * 100));
          return (
            <button
              key={item.threshold}
              onClick={() => openDrilldown(item.eventName, `${formatThreshold(item.threshold)} words`)}
              className="flex w-full items-center gap-4 rounded-md px-2 py-2 text-left transition-colors hover:bg-rune-gold/5"
            >
              <span className="w-12 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                {formatThreshold(item.threshold)}
              </span>
              <span className="relative h-4 flex-1 overflow-hidden rounded-sm" style={{ background: "color-mix(in srgb, var(--color-gold) 8%, transparent)" }}>
                <span
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: `${widthPercent}%`, background: "var(--color-gold)", opacity: 0.7 }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-rune-serif text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                {item.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </PulseCard>
  );
}
