"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
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
      <h2 className="r2-pulse-label">Heartbeat</h2>
      <p className="r2-pulse-help r2-pulse-help--lead">
        Events that happened in the selected range — not funnel conversion or current totals.
      </p>
      <div className="r2-pulse-figures r2-pulse-figures--buttons">
        {items.map((item, i) => {
          const isPrimary = i < 2;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => openDrilldown(item.kind, item.label)}
              className="r2-pulse-figure"
              data-primary={isPrimary || undefined}
            >
              <span className="r2-pulse-figure-value">{item.value.toLocaleString()}</span>
              <span className="r2-pulse-figure-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
