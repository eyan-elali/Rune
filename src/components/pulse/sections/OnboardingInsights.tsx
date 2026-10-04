"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { OnboardingDrilldownKind, OnboardingInsights as OnboardingInsightsData } from "@/lib/actions/pulse";

export function OnboardingInsights({ data }: { data: OnboardingInsightsData }) {
  const { openOnboardingDrilldown } = usePulseDrawer();

  const items: { label: string; percent: number; kind: OnboardingDrilldownKind }[] = [
    { label: "First sentence written", percent: data.firstSentenceWrittenPercent, kind: "first_sentence_written" },
    { label: "Skipped first sentence", percent: data.firstSentenceSkippedPercent, kind: "first_sentence_skipped" },
    { label: "Future letter written", percent: data.letterWrittenPercent, kind: "future_letter_written" },
    { label: "Future letter skipped", percent: data.letterSkippedPercent, kind: "future_letter_skipped" },
  ];

  return (
    <PulseCard>
      <PulseCardLabel>Onboarding Insights</PulseCardLabel>

      {data.onboardedCount === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No onboarding behavior data in this range yet.
        </p>
      ) : (
        <div className="r2-pulse-figures r2-pulse-figures--buttons">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => openOnboardingDrilldown(item.kind, item.label)}
              className="r2-pulse-figure"
            >
              <span className="r2-pulse-figure-value">{item.percent}%</span>
              <span className="r2-pulse-figure-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {(data.hasIncompleteFirstSentenceCoverage || data.hasIneligibleLetterCohort) && (
        <p className="r2-pulse-faint mt-5">
          {data.hasIncompleteFirstSentenceCoverage &&
            "First-sentence figures apply only to writers whose onboarding was tracked by analytics. "}
          {data.hasIneligibleLetterCohort &&
            "Future-letter figures apply only to writers who onboarded on or after July 13, 2026, when the feature launched."}
        </p>
      )}
    </PulseCard>
  );
}
