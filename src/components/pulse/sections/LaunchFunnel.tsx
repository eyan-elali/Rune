"use client";

import { useMemo, useState } from "react";
import { PulseCard, PulseCardLabel } from "@/components/pulse/PulseCard";
import type { LaunchReport } from "@/lib/launchReport";

// The launch funnel (lib/launchReport.ts, lib/launchMetrics.ts): where writers
// came from, whether they actually wrote, and whether they came back to write.
// Counts only — no names, no writing. Definitions are said under each block.

const fmtPct = (v: number | null) => (v === null ? "—" : `${v}%`);
const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

function Figures({ items, label }: { items: { value: string | number; label: string }[]; label: string }) {
  return (
    <dl className="r2-pulse-figures" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dd>{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function hoursLabel(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} days`;
}

export function LaunchFunnel({ data }: { data: LaunchReport }) {
  const { acquisition: acq, activation, retention, device } = data;
  const [channel, setChannel] = useState<string>("all");
  const channels = useMemo(() => Array.from(new Set(data.campaigns.map((c) => c.channel))).sort(), [data.campaigns]);
  const rows = channel === "all" ? data.campaigns : data.campaigns.filter((c) => c.channel === channel);

  return (
    <PulseCard tier="primary">
      <PulseCardLabel emphasis>Launch funnel</PulseCardLabel>
      <div className="r2-pulse-help r2-pulse-help--lead">
        <p>
          Cohort: accounts that signed up in the selected range (production only). Later stages count whenever they
          happened. Landing views and clicks are anonymous events in the same range, so view → signup compares two
          counts, not the same people.
        </p>
      </div>

      <h3 className="r2-pulse-label">Acquisition</h3>
      <Figures
        label="Acquisition"
        items={[
          { value: acq.landingViews, label: "landing views" },
          { value: acq.ctaClicks, label: `“Start writing free” clicks (${fmtPct(acq.ctaRate)})` },
          { value: acq.signups, label: "signups" },
          { value: fmtPct(acq.viewToSignup), label: "signups per landing view" },
        ]}
      />
      <p className="r2-pulse-help r2-pulse-faint">
        Clicks by placement — header {acq.ctaByPlacement.header} · hero {acq.ctaByPlacement.hero} · final{" "}
        {acq.ctaByPlacement.final} · feature pages {acq.ctaByPlacement.feature}
      </p>

      <h3 className="r2-pulse-label">Signup → writing</h3>
      <div className="overflow-x-auto">
        <table className="r2-pulse-table">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" className="text-right">Writers</th>
              <th scope="col" className="text-right">Of signups</th>
            </tr>
          </thead>
          <tbody>
            {data.funnel.map((s) => (
              <tr key={s.key}>
                <td className="r2-pulse-primary">{s.label}</td>
                <td className="text-right tabular-nums">{s.count.toLocaleString()}</td>
                <td className="text-right tabular-nums">{s.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="r2-pulse-help r2-pulse-faint">
        Activated: typed manuscript words credited in the writer’s own Project (never paste, import or restore) —
        first_words_written, or writing history for earlier writers. Median time from signup to activation:{" "}
        {hoursLabel(activation.medianHoursToActivation)}. By starting path —{" "}
        {activation.byPath
          .map((p) => `${p.path === "none" ? "no path" : p.path}: ${p.onboarded} onboarded, ${p.activated} activated`)
          .join(" · ")}
        .
      </p>

      <h3 className="r2-pulse-label">Returned to write</h3>
      <Figures
        label="Retention"
        items={[
          { value: retention.returned, label: `returned (${rate(retention.returned, retention.activated)} of activated)` },
          { value: rate(retention.d1.returned, retention.d1.eligible), label: `D1 (${retention.d1.returned} of ${retention.d1.eligible})` },
          { value: rate(retention.d7.returned, retention.d7.eligible), label: `D7 (${retention.d7.returned} of ${retention.d7.eligible})` },
        ]}
      />
      <p className="r2-pulse-help r2-pulse-faint">
        Returned: credited writing on a later local day than activation. D1: wrote on the next local day. D7: wrote on
        any later day within 7 days. A writer enters D1/D7 only once that window has passed. Visits never count.
      </p>

      <h3 className="r2-pulse-label">Device</h3>
      <Figures
        label="Device"
        items={[
          { value: device.onboarded.phone, label: "onboarded on a phone" },
          { value: device.onboarded.desktop + device.onboarded.tablet, label: `on desktop / tablet (${device.onboarded.tablet} tablet)` },
          { value: device.handoffShown, label: "saw the desktop handoff" },
          { value: device.desktopLinkEmailed, label: "emailed a desktop link" },
          { value: device.desktopLinkCopied, label: "copied the link" },
          { value: device.phoneOnboardedActivated, label: "phone-onboarded, then wrote" },
        ]}
      />
      {device.onboarded.unknown > 0 && (
        <p className="r2-pulse-help r2-pulse-faint">{device.onboarded.unknown} onboarded before device was recorded.</p>
      )}

      <PulseCardLabel
        action={
          channels.length > 1 ? (
            <select className="r2-field r2-field--sm w-44" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
              <option value="all">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        Campaigns
      </PulseCardLabel>
      <p className="r2-pulse-help">
        First touch per writer: campaign parameters, else a Meta click id, else the referring site; nothing at all is
        Direct / Unknown — never guessed. Landing views are this range’s views carrying the same fields.
      </p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--r2-ink-3)" }}>
          Nothing in this range yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="r2-pulse-table">
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Source / medium</th>
                <th scope="col">Campaign / content</th>
                <th scope="col" className="text-right">Views</th>
                <th scope="col" className="text-right">Signups</th>
                <th scope="col" className="text-right">Onboarded</th>
                <th scope="col" className="text-right">Activated</th>
                <th scope="col" className="text-right">Returned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = [r.channel, r.source, r.medium, r.campaign, r.content].join("|");
                const sm = [r.source, r.medium].filter(Boolean).join(" / ") || "—";
                const cc = [r.campaign, r.content].filter(Boolean).join(" / ") || "—";
                return (
                  <tr key={key}>
                    <td className="r2-pulse-primary">{r.channel}</td>
                    <td className="max-w-[180px] truncate" title={sm}>{sm}</td>
                    <td className="max-w-[220px] truncate" title={cc}>{cc}</td>
                    <td className="text-right tabular-nums">{r.landingViews.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.signups.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.onboarded.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.activated.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.returned.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PulseCard>
  );
}
