"use client";

import dynamic from "next/dynamic";

const WritingActivityChart = dynamic(
  () => import("./WritingActivityChart").then((m) => m.WritingActivityChart),
  { ssr: false, loading: () => <div className="h-48 w-full" /> }
);

interface DayData {
  date: string;
  words: number;
}

interface WritingActivitySectionProps {
  data: DayData[];
}

export function WritingActivitySection({ data }: WritingActivitySectionProps) {
  const activeDays = data.filter((d) => d.words > 0);
  const totalWords = data.reduce((s, d) => s + d.words, 0);
  const avgPerActive = activeDays.length > 0 ? Math.round(totalWords / activeDays.length) : 0;
  const bestDay = data.reduce((best, d) => (d.words > best ? d.words : best), 0);

  return (
    <section
      className="mb-8 rounded-lg p-6"
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border)",
      }}
      aria-label="Writing activity"
    >
      <h2
        className="mb-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Writing Activity — Last 30 Days
      </h2>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { label: "Avg per active day", value: `${avgPerActive.toLocaleString()} words` },
          { label: "Best day", value: `${bestDay.toLocaleString()} words` },
          { label: "Active days", value: `${activeDays.length} / 30` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{
              background: "rgba(201,168,76,0.08)",
              border: "1px solid var(--color-border)",
              color: "var(--color-mist)",
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{value}</span>
            {" "}
            {label}
          </div>
        ))}
      </div>

      <WritingActivityChart data={data} />
    </section>
  );
}
