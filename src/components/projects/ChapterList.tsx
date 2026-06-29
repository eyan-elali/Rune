"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ChapterRow } from "./ChapterRow";
import { createChapter } from "@/lib/actions/chapters";
import { Button } from "@/components/ui/Button";
import type { Chapter } from "@/lib/types";

type ChapterWithStats = Chapter & {
  pages: { id: string; word_count: number; is_canonical: boolean }[];
};

interface ChapterListProps {
  chapters: ChapterWithStats[];
  projectId: string;
}

export function ChapterList({ chapters, projectId }: ChapterListProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  async function handleAddChapter() {
    setAdding(true);
    const nextPosition =
      chapters.length > 0
        ? Math.max(...chapters.map((c) => c.position)) + 1
        : 1;
    const nextTitleNum = chapters.length + 1;

    await createChapter(
      projectId,
      `Chapter ${nextTitleNum}`,
      nextPosition
    );
    router.refresh();
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-4" data-guide="project-chapters">
      {chapters.length === 0 ? (
        <p className="py-6 text-center text-sm text-rune-mist/50">
          No chapters yet. Add one to start writing.
        </p>
      ) : (
        chapters.map((chapter) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            projectId={projectId}
          />
        ))
      )}

      <div className="mt-2">
        <Button
          variant="ghost"
          onClick={handleAddChapter}
          loading={adding}
          className="gap-1.5 text-sm"
        >
          <Plus size={14} aria-hidden="true" />
          Add Chapter
        </Button>
      </div>
    </div>
  );
}
