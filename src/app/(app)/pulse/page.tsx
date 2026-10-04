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
import { ClosedBeta } from "@/components/pulse/sections/ClosedBeta";
import { getBetaOverview } from "@/lib/actions/beta";

// Pulse: the founder's private operational room (admin-only, see the (app)
// layout). The closed beta — who is waiting, who is in, what they say — is
// the work of the moment and leads the page; the acquisition, activation and
// retention analytics follow as one quieter chapter, every figure still here.

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
    beta,
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
    getBetaOverview(),
  ]);

  return (
    <PulseDrawerProvider range={range} includeInternal={includeInternal}>
      <div className="r2-pulse-page">
        <header className="r2-pulse-head">
          <div>
            <h1>Pulse</h1>
            <p className="r2-pulse-sub">What happened, where writers are leaving, and what to work on next.</p>
          </div>
        </header>

        {/* Closed beta: who is waiting, approved and in; what they tell us. */}
        <ClosedBeta initial={beta.data} loadError={beta.error} />

        {/* The analytics: one quieter chapter, with its own controls. */}
        <div className="r2-pulse-chapter">
          <div className="r2-pulse-chapter-head">
            <h2>Acquisition, activation and retention</h2>
            <div className="r2-pulse-controls">
              <IncludeInternalToggle includeInternal={includeInternal} />
              <TimeRangeSelector range={range} />
            </div>
          </div>

          <DailyBrief data={dailyBrief} />

          <div className="r2-pulse-section">
            <Heartbeat data={heartbeat} />
          </div>

          <div className="r2-pulse-section">
            <ActivationFunnel data={funnel} trackingStartDate={trackingStartDate} />
          </div>

          <div className="r2-pulse-section">
            <OnboardingInsights data={onboardingInsights} />
          </div>

          <div className="r2-pulse-section r2-pulse-pair">
            <WriterProgress data={writerProgress} />
            <CampaignPerformance data={campaigns} />
          </div>

          <div className="r2-pulse-section r2-pulse-pair r2-pulse-pair--wide">
            <RecentWriters initialWriters={recentWriters} />
            <OpenQuestions initialNotes={notes} />
          </div>

          <div className="r2-pulse-section">
            <InternalAccounts initialUsers={excludedUsers} />
          </div>
        </div>
      </div>
    </PulseDrawerProvider>
  );
}
