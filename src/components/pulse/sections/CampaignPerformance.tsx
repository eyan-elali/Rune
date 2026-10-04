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
    <PulseCard>
      <PulseCardLabel>Campaign Performance</PulseCardLabel>
      <p className="r2-pulse-help r2-pulse-help--lead">
        Signups are counted in the selected range. First saves, 2nd-day return, and subscribers
        are counted whenever they happen, even after the range ends.
      </p>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--color-mist)" }}>
          No attributed campaign signups in this range yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="r2-pulse-table">
            <thead>
              <tr>
                <th scope="col">
                  Campaign
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className="text-right">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.campaign}>
                  <td className="r2-pulse-primary max-w-[180px] truncate" title={row.campaign}>
                    {row.campaign}
                  </td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="text-right">
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
