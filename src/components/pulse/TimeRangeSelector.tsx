"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PulseTimeRange } from "@/lib/actions/pulse";
import { cn } from "@/lib/utils";

const OPTIONS: { value: PulseTimeRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function TimeRangeSelector({ range }: { range: PulseTimeRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: PulseTimeRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`/pulse?${params.toString()}`);
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full p-1"
      style={{ background: "rgba(201, 168, 76, 0.06)", border: "1px solid var(--color-border)" }}
      role="tablist"
      aria-label="Time range"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={range === opt.value}
          onClick={() => setRange(opt.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs transition-colors duration-150",
            range === opt.value ? "bg-rune-gold/15 text-rune-gold" : "hover:bg-rune-gold/5"
          )}
          style={range === opt.value ? undefined : { color: "var(--color-mist)" }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
