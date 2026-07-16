import { requireAdmin } from "@/lib/actions/admin";
import {
  getActivationFunnel,
  getActivationTrackingStartDate,
  getCampaignPerformance,
  getDailyBrief,
  getHeartbeat,
  getOnboardingInsights,
  getWriterProgress,
  listExcludedUsers,
  listFounderNotes,
  searchRecentWriters,
} from "@/lib/actions/pulse";
import type { PulseTimeRange } from "@/lib/actions/pulse";
import { PulseDrawerProvider } from "@/components/pulse/PulseDrawer";
import { TimeRangeSelector } from "@/components/pulse/TimeRangeSelector";
import { IncludeInternalToggle } from "@/components/pulse/IncludeInternalToggle";
import { DailyBrief } from "@/components/pulse/sections/DailyBrief";
import { Heartbeat } from "@/components/pulse/sections/Heartbeat";
import { ActivationFunnel } from "@/components/pulse/sections/ActivationFunnel";
import { OnboardingInsights } from "@/components/pulse/sections/OnboardingInsights";
import { WriterProgress } from "@/components/pulse/sections/WriterProgress";
import { CampaignPerformance } from "@/components/pulse/sections/CampaignPerformance";
import { RecentWriters } from "@/components/pulse/sections/RecentWriters";
import { OpenQuestions } from "@/components/pulse/sections/OpenQuestions";
import { InternalAccounts } from "@/components/pulse/sections/InternalAccounts";

function normalizeRange(value: string | undefined): PulseTimeRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

interface PulsePageProps {
  searchParams: Promise<{ range?: string; internal?: string }>;
}

export default async function PulsePage({ searchParams }: PulsePageProps) {
  await requireAdmin();

  const { range: rawRange, internal } = await searchParams;
  const range = normalizeRange(rawRange);
  const includeInternal = internal === "1";

  const [
    dailyBrief,
    heartbeat,
    funnel,
    trackingStartDate,
    onboardingInsights,
    writerProgress,
    campaigns,
    recentWriters,
    notes,
    excludedUsers,
  ] = await Promise.all([
    getDailyBrief(includeInternal),
    getHeartbeat(range, includeInternal),
    getActivationFunnel(range, includeInternal),
    getActivationTrackingStartDate(),
    getOnboardingInsights(range, includeInternal),
    getWriterProgress(range, includeInternal),
    getCampaignPerformance(range, includeInternal),
    searchRecentWriters("", range, includeInternal),
    listFounderNotes(),
    listExcludedUsers(),
  ]);

  return (
    <PulseDrawerProvider range={range} includeInternal={includeInternal}>
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1
              className="font-rune-serif text-[1.7rem] leading-tight tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Pulse
            </h1>
            <p className="mt-1 text-xs" style={{ color: "var(--color-mist)", opacity: 0.65 }}>
              What happened, where writers are leaving, and what to work on next.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <IncludeInternalToggle includeInternal={includeInternal} />
            <TimeRangeSelector range={range} />
          </div>
        </div>

        {/* Daily Brief */}
        <DailyBrief data={dailyBrief} />

        {/* Heartbeat */}
        <div className="mt-5">
          <Heartbeat data={heartbeat} />
        </div>

        {/* Activation Funnel — hero */}
        <div className="mt-5">
          <ActivationFunnel data={funnel} trackingStartDate={trackingStartDate} />
        </div>

        {/* Onboarding Insights */}
        <div className="mt-5">
          <OnboardingInsights data={onboardingInsights} />
        </div>

        {/* Writer Progress + Campaign Performance */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <WriterProgress data={writerProgress} />
          <CampaignPerformance data={campaigns} />
        </div>

        {/* Recent Writers + Open Questions */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
          <RecentWriters initialWriters={recentWriters} />
          <OpenQuestions initialNotes={notes} />
        </div>

        {/* Internal Accounts */}
        <div className="mt-5">
          <InternalAccounts initialUsers={excludedUsers} />
        </div>
      </div>
    </PulseDrawerProvider>
  );
}
