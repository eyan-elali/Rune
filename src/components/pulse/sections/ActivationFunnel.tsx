"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { AnalyticsEventName } from "@/lib/analyticsEvents";
import type { FunnelResult } from "@/lib/actions/pulse";

const STEP_EVENT_NAMES: Record<string, "signups" | AnalyticsEventName> = {
  signup: "signups",
  email_verified: "email_verified",
  onboarding_started: "onboarding_started",
  project_created: "project_created",
  first_sentence_written: "first_sentence_written",
  onboarding_completed: "onboarding_completed",
  first_save: "first_save",
};

export function ActivationFunnel({ data }: { data: FunnelResult }) {
  const { openDrilldown } = usePulseDrawer();
  const maxCount = Math.max(1, ...data.steps.map((s) => s.count));

  return (
    <PulseCard className="p-6">
      <PulseCardLabel>Activation Funnel</PulseCardLabel>

      <div className="space-y-2.5">
        {data.steps.map((step) => {
          const isBottleneck = data.bottleneck?.toLabel === step.label;
          const widthPercent = Math.max(2, Math.round((step.count / maxCount) * 100));

          return (
            <button
              key={step.key}
              onClick={() => openDrilldown(STEP_EVENT_NAMES[step.key], step.label)}
              className="group flex w-full items-center gap-4 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-rune-gold/5"
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
              <span className="w-14 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-mist)" }}>
                {step.percentOfFirst}%
              </span>
              {step.dropFromPrevious !== null && (
                <span
                  className="w-20 shrink-0 text-right text-xs tabular-nums"
                  style={{ color: isBottleneck ? "var(--color-crimson)" : "var(--color-mist)", opacity: isBottleneck ? 1 : 0.7 }}
                >
                  −{step.dropFromPrevious}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {data.bottleneck && (
        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Bottleneck: <span style={{ color: "var(--color-crimson)" }}>{data.bottleneck.fromLabel} → {data.bottleneck.toLabel}</span> loses {data.bottleneck.dropPercent}% of writers.
        </p>
      )}
    </PulseCard>
  );
}
