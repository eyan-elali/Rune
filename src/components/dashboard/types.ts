import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";
import type { CombatRecord } from "@/lib/actions/games";

export type { CombatRecord };
import type { SubscriptionTier } from "@/lib/subscription";

export type RecentPageCard = {
  pageId: string;
  pageTitle: string;
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  wordCount: number;
};

export type RecentWork = {
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  coverColor: string | null;
};

export interface DashboardContentProps {
  displayName: string;
  projects: Project[];
  totalWords: number;
  recentWork: RecentWork | null;
  recentPageCards: RecentPageCard[];
  profile: { display_name: string | null; xp: number; level: number } | null;
  personalBests: Record<string, number>;
  combatRecords?: Record<string, CombatRecord>;
  goals?: WritingGoal[];
  writingStreak?: { currentStreak: number; maxStreak: number };
  subscriptionTier?: SubscriptionTier;
  todayWords?: number;
}
