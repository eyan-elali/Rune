"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PulseTimeRange } from "@/lib/actions/pulse";

const OPTIONS: { value: PulseTimeRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

/** The analytics' time range: Rune 2's segmented choice, one pressed. */
export function TimeRangeSelector({ range }: { range: PulseTimeRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: PulseTimeRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`/pulse?${params.toString()}`);
  }

  return (
    <div className="r2-segmented" role="group" aria-label="Time range">
      {OPTIONS.map((opt) => (
        <button key={opt.value} type="button" aria-pressed={range === opt.value} onClick={() => setRange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
