"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Per-request debug override, off by default — never persisted anywhere.
// Mirrors TimeRangeSelector's URL-param pattern so the whole page (server
// sections + client search/drilldown/drawer calls, via PulseDrawerProvider)
// stays in sync from one source of truth.
export function IncludeInternalToggle({ includeInternal }: { includeInternal: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (includeInternal) params.delete("internal");
    else params.set("internal", "1");
    router.push(`/pulse?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={includeInternal}
      title="When on, founder and test accounts are counted in every metric below."
      className="r2-button r2-button--quiet r2-button--sm r2-pulse-internal"
      data-on={includeInternal || undefined}
    >
      <span className="r2-pulse-internal-dot" aria-hidden />
      {includeInternal ? "Including internal accounts" : "Internal accounts excluded"}
    </button>
  );
}
