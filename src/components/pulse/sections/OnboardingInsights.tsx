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
    <PulseCard className="p-6">
      <PulseCardLabel>Onboarding Insights</PulseCardLabel>

      {data.onboardedCount === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No onboarding behavior data in this range yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => openOnboardingDrilldown(item.kind, item.label)}
              className="-mx-2 -my-1.5 flex flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-rune-gold/5"
            >
              <p className="font-rune-serif text-3xl leading-tight" style={{ color: "var(--text-primary)" }}>
                {item.percent}%
              </p>
              <p className="mt-1.5 text-xs uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                {item.label}
              </p>
            </button>
          ))}
        </div>
      )}

      {(data.hasIncompleteFirstSentenceCoverage || data.hasIneligibleLetterCohort) && (
        <p className="mt-5 text-[11px]" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
          {data.hasIncompleteFirstSentenceCoverage &&
            "First-sentence figures apply only to writers whose onboarding was tracked by analytics. "}
          {data.hasIneligibleLetterCohort &&
            "Future-letter figures apply only to writers who onboarded on or after July 13, 2026, when the feature launched."}
        </p>
      )}
    </PulseCard>
  );
}
