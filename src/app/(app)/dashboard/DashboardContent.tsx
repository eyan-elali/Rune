"use client";

import { useState, useEffect } from "react";
import { BetaFeedbackBanner } from "@/components/dashboard/BetaFeedbackBanner";
import { YourStoryHero } from "@/components/dashboard/YourStoryHero";
import { MomentumStrip } from "@/components/dashboard/MomentumStrip";
import { ExploreRuneSection } from "@/components/dashboard/ExploreRuneSection";
import { ProgressDrawer } from "@/components/dashboard/ProgressDrawer";
import type { DashboardContentProps } from "@/components/dashboard/types";
import type { WritingGoal } from "@/lib/actions/writingStats";


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

  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

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
        <h1
          className="font-rune-serif text-4xl"
          style={{ color: "var(--text-primary)" }}
        >
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 font-rune-serif text-lg text-rune-mist">
          The page is waiting.
        </p>
      </div>

      {/* Your Story hero */}
      <div className="mb-6">
        <YourStoryHero
          recentWork={recentWork}
          recentPageCard={recentPageCards[0]}
          todayWords={todayWords}
          writingStreak={writingStreak}
          goals={goals}
          pinnedNote={pinnedNote}
        />
      </div>

      {/* Momentum strip */}
      <div className="mb-8">
        <MomentumStrip
          totalWords={totalWords}
          writingStreak={writingStreak ?? { currentStreak: 0, maxStreak: 0 }}
          goals={localGoals}
          tier={subscriptionTier ?? "free"}
          todayWords={todayWords}
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
      />
    </div>
  );
}
