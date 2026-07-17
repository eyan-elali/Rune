"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BetaFeedbackBanner } from "@/components/dashboard/BetaFeedbackBanner";
import { YourStoryHero } from "@/components/dashboard/YourStoryHero";
import { MomentumStrip } from "@/components/dashboard/MomentumStrip";
import { ExploreRuneSection } from "@/components/dashboard/ExploreRuneSection";
import { ProgressDrawer } from "@/components/dashboard/ProgressDrawer";
import { PageGuide, type GuideStep } from "@/components/ui/PageGuide";
import { GuideButton } from "@/components/ui/GuideButton";
import type { DashboardContentProps } from "@/components/dashboard/types";
import type { WritingGoal } from "@/lib/actions/writingStats";
import { getTodayWords, getWritingStreak } from "@/lib/actions/writingStats";
import { getLocalDateString } from "@/lib/utils";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";

const DASHBOARD_GUIDE_STEPS: GuideStep[] = [
  {
    target: "dashboard-your-story",
    heading: "Your Story",
    copy: "This shows the manuscript you were last working on. Click Write to return to it.",
    side: "bottom",
  },
  {
    target: "dashboard-momentum",
    heading: "Momentum Strip",
    copy: "These numbers show today's writing, total words, streak, and your manuscript goal.",
    side: "bottom",
  },
  {
    target: "dashboard-explore",
    heading: "Explore Rune",
    copy: "Use these cards to open Arena, Progress, or Insights.",
    side: "bottom",
  },
  {
    target: "dashboard-progress",
    heading: "Progress",
    copy: "Progress shows how your current manuscript is coming together.",
    side: "bottom",
  },
];


export function DashboardContent({
  displayName,
  projects,
  totalWords,
  recentWork,
  recentPageCards,
  profile,
  goals = [],
  writingStreak = { currentStreak: 0, maxStreak: 0 },
  subscriptionTier = "free",
  todayWords = 0,
  progressChapters = [],
  avgWordsPerDay = 0,
  pinnedNote = null,
  hideArena = false,
}: DashboardContentProps) {
  const primaryProjectId = recentWork?.projectId ?? projects[0]?.id;
  const primaryProject = projects.find((p) => p.id === primaryProjectId) ?? null;
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressEditGoal, setProgressEditGoal] = useState(false);
  const [localGoals, setLocalGoals] = useState<WritingGoal[]>(goals);
  const [guideOpen, setGuideOpen] = useState(false);
  const [localTodayWords, setLocalTodayWords] = useState(todayWords);
  const [localStreak, setLocalStreak] = useState(writingStreak);
  const userId = useProfileStore((s) => s.profile?.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

  // Restrained, one-time acknowledgement after returning from a cancelled or
  // failed Scribe Checkout via the landing-page purchase-intent flow
  // (src/app/auth/continue/route.ts) — the account itself is untouched
  // either way, so this never blocks anything, just reassures.
  useEffect(() => {
    if (searchParams.get("checkoutCancelled") === "1") {
      showToast(
        "Your account is ready. You can start writing free and upgrade whenever you're ready.",
        "info"
      );
    } else if (searchParams.get("checkoutError") === "1") {
      showToast(
        "We couldn't open checkout. Your account is ready, and you can try again from Billing.",
        "error"
      );
    } else {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("checkoutCancelled");
    params.delete("checkoutError");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch today's words and streak using the browser's local date.
  // The server-rendered initial values use UTC, which can be a different
  // calendar day for users writing in the evening in UTC-offset timezones.
  useEffect(() => {
    if (!userId) return;
    const localDate = getLocalDateString();
    const utcDate = new Date().toISOString().slice(0, 10);
    if (localDate === utcDate) return; // same calendar day, no correction needed
    void Promise.all([
      getTodayWords(userId, localDate),
      getWritingStreak(userId, localDate),
    ]).then(([words, streak]) => {
      setLocalTodayWords(words);
      setLocalStreak(streak);
    });
  }, [userId]);

  function openProgressDrawer(opts?: { editGoal?: boolean }) {
    setProgressEditGoal(opts?.editGoal ?? false);
    setIsProgressOpen(true);
  }

  function handleGoalsChange(newGoals: WritingGoal[]) {
    setLocalGoals(newGoals);
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      {/* Welcome */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-3">
          <h1
            className="font-rune-serif text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Welcome back, {displayName}.
          </h1>
          <div className="mt-2 shrink-0">
            <GuideButton onClick={() => setGuideOpen(true)} />
          </div>
        </div>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          The page is waiting.
        </p>
      </div>

      {/* Your Story hero */}
      <div className="mb-6">
        <YourStoryHero
          recentWork={recentWork}
          recentPageCard={recentPageCards[0]}
          todayWords={localTodayWords}
          writingStreak={localStreak}
          goals={goals}
          pinnedNote={pinnedNote}
        />
      </div>

      {/* Momentum strip */}
      <div className="mb-8">
        <MomentumStrip
          totalWords={totalWords}
          writingStreak={localStreak ?? { currentStreak: 0, maxStreak: 0 }}
          goals={localGoals}
          tier={subscriptionTier ?? "free"}
          todayWords={localTodayWords}
          primaryProjectId={primaryProject?.id}
          primaryProjectTitle={primaryProject?.title}
          onOpenProgress={() => openProgressDrawer({ editGoal: true })}
        />
      </div>

      {/* Explore Rune */}
      <div className="mb-10">
        <ExploreRuneSection
          hideArena={hideArena}
          onProgressClick={() => openProgressDrawer()}
        />
      </div>

      <BetaFeedbackBanner />

      <PageGuide
        steps={DASHBOARD_GUIDE_STEPS}
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      {/* Progress drawer */}
      <ProgressDrawer
        isOpen={isProgressOpen}
        onClose={() => {
          setIsProgressOpen(false);
          setProgressEditGoal(false);
        }}
        projects={projects}
        initialProject={primaryProject}
        goals={localGoals}
        initialChapters={progressChapters}
        avgWordsPerDay={avgWordsPerDay}
        onGoalsChange={handleGoalsChange}
        openInEditGoalMode={progressEditGoal}
        guideActive={guideOpen}
      />
    </div>
  );
}
