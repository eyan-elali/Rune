"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard } from "@/components/pulse/PulseCard";
import type { HeartbeatMetrics } from "@/lib/actions/pulse";

export function Heartbeat({ data }: { data: HeartbeatMetrics }) {
  const { openDrilldown } = usePulseDrawer();

  const items: { label: string; value: number; kind: Parameters<typeof openDrilldown>[0] }[] = [
    { label: "New Signups", value: data.signups, kind: "signups" },
    { label: "New First Saves", value: data.firstSaves, kind: "first_save" },
    { label: "New 2nd Writing Days", value: data.secondWritingDays, kind: "second_writing_day" },
    { label: "New Subscribers", value: data.subscribers, kind: "subscription_started" },
  ];

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
        Heartbeat
      </p>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
        Events that happened in the selected range — not funnel conversion or current totals.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <PulseCard key={item.label} className="overflow-hidden">
            <button
              onClick={() => openDrilldown(item.kind, item.label)}
              className="flex w-full flex-col items-start px-6 py-5 text-left transition-colors hover:bg-rune-gold/5"
            >
              <p className="font-rune-serif text-3xl leading-tight" style={{ color: "var(--text-primary)" }}>
                {item.value.toLocaleString()}
              </p>
              <p className="mt-1.5 text-xs uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                {item.label}
              </p>
            </button>
          </PulseCard>
        ))}
      </div>
    </div>
  );
}
