import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { OnboardingInsights as OnboardingInsightsData } from "@/lib/actions/pulse";

export function OnboardingInsights({ data }: { data: OnboardingInsightsData }) {
  const items: { label: string; percent: number }[] = [
    { label: "First sentence written", percent: data.firstSentenceWrittenPercent },
    { label: "Skipped first sentence", percent: data.firstSentenceSkippedPercent },
    { label: "Future letter written", percent: data.letterWrittenPercent },
    { label: "Future letter skipped", percent: data.letterSkippedPercent },
  ];

  return (
    <PulseCard className="p-6">
      <PulseCardLabel>Onboarding Insights</PulseCardLabel>

      {data.coveredCount === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No onboarding behavior data in this range yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-start">
              <p className="font-rune-serif text-3xl leading-tight" style={{ color: "var(--text-primary)" }}>
                {item.percent}%
              </p>
              <p className="mt-1.5 text-xs uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {data.hasIncompleteCoverage && (
        <p className="mt-5 text-[11px]" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
          Applies to writers who completed the redesigned onboarding.
        </p>
      )}
    </PulseCard>
  );
}
