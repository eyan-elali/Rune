"use client";

import { useState } from "react";
import { ChapterGoalControl } from "./ChapterGoalControl";
import { RevisionNotesButton } from "./RevisionNotesButton";
import { NewDraftButton } from "./NewDraftButton";
import { ManuscriptExportButton } from "./ManuscriptExportButton";
import { PageGuide, type GuideStep } from "@/components/ui/PageGuide";
import { GuideButton } from "@/components/ui/GuideButton";
import type { Project } from "@/lib/types";

interface ProjectHeaderProps {
  project: Project;
  subscriptionTier?: string;
  canSeeChapterGoals?: boolean;
  completedCount: number;
  wordCount: number;
  totalChapters: number;
}

const STEPS: GuideStep[] = [
  {
    target: "project-chapters",
    heading: "Chapters",
    copy: "Chapters organize your manuscript. Add, rename, and reorder them from this page.",
    side: "bottom",
  },
  {
    target: "project-completed",
    heading: "Completed Chapters",
    copy: "Mark chapters complete when they are finished.",
    side: "bottom",
  },
  {
    target: "project-chapter-goal",
    heading: "Chapter Goal",
    copy: "Set a chapter goal to track how many chapters you plan to finish.",
    side: "bottom",
  },
  {
    target: "project-notes",
    heading: "Notes",
    copy: "Revision Notes track fixes, ideas, and changes for this manuscript.",
    side: "bottom",
  },
  {
    target: "project-new-draft",
    heading: "New Draft",
    copy: "New Draft duplicates this project so you can revise separately without changing the original.",
    side: "bottom",
  },
  {
    target: "project-export",
    heading: "Export Manuscript",
    copy: "Export Manuscript exports the canonical pages from this project.",
    side: "bottom",
  },
];

export function ProjectHeader({
  project,
  completedCount,
  wordCount,
  totalChapters,
}: ProjectHeaderProps) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="mb-8">
      {project.cover_color && (
        <div
          className="mb-5 h-1 w-12 rounded-full"
          style={{ background: project.cover_color }}
        />
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1
              className="font-rune-serif text-3xl"
              style={{ color: "var(--text-primary)" }}
            >
              {project.title}
            </h1>
            <GuideButton onClick={() => setGuideOpen(true)} />
          </div>
          {project.description && (
            <p className="mt-2 max-w-prose text-sm text-rune-mist">
              {project.description}
            </p>
          )}
          <p className="mt-4 text-xs text-rune-mist/40">
            {wordCount.toLocaleString()} words total ·{" "}
            {totalChapters}{" "}
            {totalChapters === 1 ? "chapter" : "chapters"}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div data-guide="project-chapter-goal">
            <ChapterGoalControl
              project={project}
              completedCount={completedCount}
            />
          </div>
          <div className="flex items-center gap-2">
            <div data-guide="project-notes">
              <RevisionNotesButton
                projectId={project.id}
              />
            </div>
            <div data-guide="project-new-draft">
              <NewDraftButton
                projectId={project.id}
                projectTitle={project.title}
              />
            </div>
            <div data-guide="project-export">
              <ManuscriptExportButton project={project} />
            </div>
          </div>
        </div>
      </div>

      <PageGuide
        steps={STEPS}
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}
