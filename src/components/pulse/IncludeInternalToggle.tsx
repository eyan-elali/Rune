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
      onClick={toggle}
      role="switch"
      aria-checked={includeInternal}
      title="When on, founder and test accounts are counted in every metric below."
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors duration-150"
      style={{
        background: includeInternal
          ? "color-mix(in srgb, var(--color-crimson) 10%, transparent)"
          : "color-mix(in srgb, var(--color-gold) 6%, transparent)",
        border: "1px solid var(--color-border)",
        color: includeInternal ? "var(--color-crimson)" : "var(--color-mist)",
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: includeInternal ? "var(--color-crimson)" : "var(--color-mist)" }}
      />
      {includeInternal ? "Including internal accounts" : "Internal accounts excluded"}
    </button>
  );
}
