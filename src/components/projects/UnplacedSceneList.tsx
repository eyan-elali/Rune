"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveSceneToChapter } from "@/lib/actions/scenes";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";
import type { UnplacedSceneSummary } from "@/lib/manuscriptQueries";

interface UnplacedSceneListProps {
  scenes: UnplacedSceneSummary[];
  chapters: { id: string; title: string }[];
  projectId: string;
}

/**
 * The Project's Unplaced Scenes: prose kept out of narrative order. Opening
 * one edits it in the manuscript editor; placing one appends it to a Chapter.
 */
export function UnplacedSceneList({ scenes, chapters, projectId }: UnplacedSceneListProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [movingId, setMovingId] = useState<string | null>(null);

  async function handlePlace(sceneId: string, chapterId: string) {
    if (!chapterId) return;
    setMovingId(sceneId);
    const { data, error } = await moveSceneToChapter(sceneId, chapterId);
    setMovingId(null);
    if (error || !data) {
      showToast("Couldn't move this scene — please try again.", "error");
      return;
    }
    const target = chapters.find((c) => c.id === chapterId);
    showToast(`“${data.title}” moved to ${target?.title ?? "its chapter"}`, "success");
    router.refresh();
  }

  return (
    <ul className="flex flex-col" role="list">
      {scenes.map((scene) => (
        <li
          key={scene.id}
          className={cn(
            "flex items-center gap-4 border-b px-4 py-3 last:border-b-0",
            movingId === scene.id && "opacity-60"
          )}
          style={{ borderColor: "var(--color-border)" }}
        >
          <Link
            href={`/projects/${projectId}/unplaced?scene=${scene.id}`}
            className="min-w-0 flex-1 truncate text-sm transition-colors hover:text-rune-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rune-gold"
            style={{ color: "var(--text-primary)", opacity: 0.8 }}
            title={scene.title}
          >
            {scene.title}
          </Link>
          <span className="shrink-0 text-xs tabular-nums text-rune-mist/40">
            {scene.word_count.toLocaleString()} words
          </span>
          {chapters.length > 0 && (
            <select
              aria-label={`Move “${scene.title}” to a chapter`}
              value=""
              disabled={movingId !== null}
              onChange={(e) => void handlePlace(scene.id, e.target.value)}
              className="shrink-0 cursor-pointer rounded border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-rune-gold disabled:opacity-40"
              style={{ borderColor: "var(--color-border)", color: "var(--color-mist)" }}
            >
              <option value="" disabled>
                Move to chapter…
              </option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
        </li>
      ))}
    </ul>
  );
}
