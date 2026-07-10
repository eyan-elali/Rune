"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { FunnelResult } from "@/lib/actions/pulse";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ActivationFunnel({
  data,
  trackingStartDate,
}: {
  data: FunnelResult;
  trackingStartDate: string | null;
}) {
  const { openFunnelDrilldown } = usePulseDrawer();
  const maxCount = Math.max(1, ...data.steps.map((s) => s.count));

  return (
    <PulseCard tier="primary" className="p-7">
      <PulseCardLabel emphasis>Activation Funnel</PulseCardLabel>
      <div className="mb-5 -mt-1 space-y-0.5">
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-mist)", opacity: 0.7 }}>
          Tracked signup cohort. Historical users may not have complete activation data.
        </p>
        {trackingStartDate && (
          <p className="text-[11px]" style={{ color: "var(--color-mist)", opacity: 0.45 }}>
            Tracking began {fmtDate(trackingStartDate)}.
          </p>
        )}
      </div>

      {data.cohortSize === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No tracked signups in this range yet.
        </p>
      ) : (
        <div className="space-y-3">
          {data.steps.map((step) => {
            const isBottleneck = data.bottleneck?.toLabel === step.label;
            const widthPercent = Math.max(2, Math.round((step.count / maxCount) * 100));

            return (
              <button
                key={step.key}
                onClick={() => openFunnelDrilldown(step.key, step.label)}
                className="group flex w-full items-center gap-4 rounded-md px-2 py-2 text-left transition-colors hover:bg-rune-gold/5"
              >
                <span
                  className="w-40 shrink-0 truncate text-sm"
                  style={{ color: isBottleneck ? "var(--color-gold)" : "var(--text-primary)" }}
                >
                  {step.label}
                </span>

                <span
                  className="relative h-6 flex-1 overflow-hidden rounded-sm"
                  style={{ background: "rgba(201, 168, 76, 0.08)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm transition-all"
                    style={{
                      width: `${widthPercent}%`,
                      background: isBottleneck ? "var(--color-crimson)" : "var(--color-gold)",
                      opacity: isBottleneck ? 0.55 : 0.75,
                    }}
                  />
                </span>

                <span className="w-16 shrink-0 text-right font-rune-serif text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {step.count.toLocaleString()}
                </span>
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--color-mist)", opacity: 0.55 }}>
                  {step.percentOfFirst}%
                </span>
                {step.exceedsPrevious ? (
                  <span
                    className="w-20 shrink-0 text-right text-[10px] leading-tight"
                    style={{ color: "var(--color-mist)", opacity: 0.6 }}
                    title="Some users have this event without the preceding tracked event — a tracking gap, not a funnel gain."
                  >
                    tracking gap
                  </span>
                ) : (
                  step.dropFromPrevious !== null && (
                    <span
                      className="w-20 shrink-0 text-right text-[11px] tabular-nums"
                      style={{ color: isBottleneck ? "var(--color-crimson)" : "var(--color-mist)", opacity: isBottleneck ? 1 : 0.55 }}
                    >
                      −{step.dropFromPrevious}%
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      )}

      {data.bottleneck && (
        <div className="mt-5 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-mist)" }}>
            Bottleneck: <span style={{ color: "var(--color-crimson)" }}>{data.bottleneck.fromLabel} → {data.bottleneck.toLabel}</span> loses {data.bottleneck.dropPercent}% of writers.
          </p>
        </div>
      )}
    </PulseCard>
  );
}
