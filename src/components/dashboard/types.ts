import type { Project, ProjectNote } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";
import type { SubscriptionTier } from "@/lib/subscription";

export type RecentSceneCard = {
  sceneId: string;
  sceneTitle: string;
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
  chapterWordCount: number;
};

export type DrawerChapter = {
  id: string;
  title: string;
  wordCount: number;
};

export interface DashboardContentProps {
  displayName: string;
  projects: Project[];
  totalWords: number;
  recentWork: RecentWork | null;
  recentSceneCards: RecentSceneCard[];
  profile: { display_name: string | null; xp: number; level: number } | null;
  goals?: WritingGoal[];
  writingStreak?: { currentStreak: number; maxStreak: number };
  subscriptionTier?: SubscriptionTier;
  todayWords?: number;
  progressChapters?: DrawerChapter[];
  avgWordsPerDay?: number;
  pinnedNote?: ProjectNote | null;
  hideArena?: boolean;
}
