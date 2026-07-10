import { PulseCard } from "@/components/pulse/PulseCard";
import type { DailyBrief as DailyBriefData } from "@/lib/actions/pulse";

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

// Deterministic, template-based summary — no AI, no external calls. Every
// number here comes straight from analytics_events / profiles for
// yesterday's UTC calendar day.
function briefSentence(data: DailyBriefData): string {
  const parts = [
    `${plural(data.signups, "writer")} signed up`,
    `${plural(data.onboardingCompletions, "person")} completed onboarding`,
    `${plural(data.firstSaves, "writer")} saved for the first time`,
    `${plural(data.secondWritingDays, "writer")} returned for a second writing day`,
    `${plural(data.subscriptions, "person")} subscribed`,
  ];
  return `Yesterday, ${parts.join(", ")}.`;
}

export function DailyBrief({ data }: { data: DailyBriefData }) {
  return (
    <PulseCard className="p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
          Daily Brief
        </p>
        <p className="text-xs" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
          {data.label}
        </p>
      </div>

      <p className="font-rune-serif text-lg leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {briefSentence(data)}
      </p>

      {data.activationCohortSize === 0 ? (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Not enough tracked activation data yet.
        </p>
      ) : (
        data.bottleneck && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
            Biggest activation drop-off (last 30 days):{" "}
            <span style={{ color: "var(--color-gold)" }}>
              {data.bottleneck.fromLabel} → {data.bottleneck.toLabel}
            </span>{" "}
            — {data.bottleneck.dropPercent}% of writers fall off here.
          </p>
        )
      )}
    </PulseCard>
  );
}
