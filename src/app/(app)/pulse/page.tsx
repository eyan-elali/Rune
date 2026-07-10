import { requireAdmin } from "@/lib/actions/admin";
import {
  getActivationFunnel,
  getActivationTrackingStartDate,
  getCampaignPerformance,
  getDailyBrief,
  getHeartbeat,
  getWriterProgress,
  listFounderNotes,
  searchRecentWriters,
} from "@/lib/actions/pulse";
import type { PulseTimeRange } from "@/lib/actions/pulse";
import { PulseDrawerProvider } from "@/components/pulse/PulseDrawer";
import { TimeRangeSelector } from "@/components/pulse/TimeRangeSelector";
import { DailyBrief } from "@/components/pulse/sections/DailyBrief";
import { Heartbeat } from "@/components/pulse/sections/Heartbeat";
import { ActivationFunnel } from "@/components/pulse/sections/ActivationFunnel";
import { WriterProgress } from "@/components/pulse/sections/WriterProgress";
import { CampaignPerformance } from "@/components/pulse/sections/CampaignPerformance";
import { RecentWriters } from "@/components/pulse/sections/RecentWriters";
import { OpenQuestions } from "@/components/pulse/sections/OpenQuestions";

function normalizeRange(value: string | undefined): PulseTimeRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

interface PulsePageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function PulsePage({ searchParams }: PulsePageProps) {
  await requireAdmin();

  const { range: rawRange } = await searchParams;
  const range = normalizeRange(rawRange);

  const [
    dailyBrief,
    heartbeat,
    funnel,
    trackingStartDate,
    writerProgress,
    campaigns,
    recentWriters,
    notes,
  ] = await Promise.all([
    getDailyBrief(),
    getHeartbeat(range),
    getActivationFunnel(range),
    getActivationTrackingStartDate(),
    getWriterProgress(range),
    getCampaignPerformance(range),
    searchRecentWriters("", range),
    listFounderNotes(),
  ]);

  return (
    <PulseDrawerProvider range={range}>
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-rune-serif text-2xl leading-tight" style={{ color: "var(--text-primary)" }}>
              Pulse
            </h1>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
              What happened, where writers are leaving, and what to work on next.
            </p>
          </div>
          <TimeRangeSelector range={range} />
        </div>

        {/* Daily Brief */}
        <DailyBrief data={dailyBrief} />

        {/* Heartbeat */}
        <div className="mt-4">
          <Heartbeat data={heartbeat} />
        </div>

        {/* Activation Funnel — hero */}
        <div className="mt-4">
          <ActivationFunnel data={funnel} trackingStartDate={trackingStartDate} />
        </div>

        {/* Writer Progress + Campaign Performance */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WriterProgress data={writerProgress} />
          <CampaignPerformance data={campaigns} />
        </div>

        {/* Recent Writers + Open Questions */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <RecentWriters initialWriters={recentWriters} />
          <OpenQuestions initialNotes={notes} />
        </div>
      </div>
    </PulseDrawerProvider>
  );
}
