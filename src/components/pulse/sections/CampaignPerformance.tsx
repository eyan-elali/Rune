"use client";

import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { CampaignRow } from "@/lib/actions/pulse";

const COLUMNS: { key: keyof Omit<CampaignRow, "campaign">; label: string }[] = [
  { key: "signups", label: "Signups" },
  { key: "firstSaves", label: "First Saves" },
  { key: "secondWritingDays", label: "2nd Day" },
  { key: "subscribers", label: "Subscribers" },
];

export function CampaignPerformance({ data }: { data: CampaignRow[] }) {
  const { openCampaignDrilldown } = usePulseDrawer();

  return (
    <PulseCard className="p-6">
      <PulseCardLabel>Campaign Performance</PulseCardLabel>
      <p className="mb-4 -mt-1 text-xs leading-relaxed" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
        Signups are counted in the selected range. First saves, 2nd-day return, and subscribers
        are counted whenever they happen, even after the range ends.
      </p>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No attributed campaign signups in this range yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                  Campaign
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="pb-2 pl-4 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.campaign} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className="max-w-[180px] truncate py-2.5 pr-4" style={{ color: "var(--text-primary)" }} title={row.campaign}>
                    {row.campaign}
                  </td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="py-2.5 pl-4 text-right">
                      <button
                        onClick={() => openCampaignDrilldown(row.campaign, col.key, `${row.campaign} — ${col.label}`)}
                        className="tabular-nums transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {row[col.key].toLocaleString()}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PulseCard>
  );
}
