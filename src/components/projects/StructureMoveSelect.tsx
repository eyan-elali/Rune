"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moveChapter, moveGroup } from "@/lib/actions/structure";
import { groupAndDescendantIds } from "@/lib/manuscriptStructure";
import { useToastStore } from "@/store/toastStore";
import type { ManuscriptGroup } from "@/lib/types";

export const UNTITLED_GROUP = "Untitled group";

interface StructureMoveSelectProps {
  kind: "group" | "chapter";
  id: string;
  label: string;
  /** The item's parent Group; null = top level. */
  parentId: string | null;
  /** The item's index among its parent's children, and how many there are. */
  index: number;
  siblingCount: number;
  groups: ManuscriptGroup[];
  projectId: string;
}

/**
 * Minimal structure controls for a Group or Chapter: up, down, to the top
 * level, or into a Group. Each choice is one atomic database move. (A native
 * select: keyboard- and touch-accessible, no hover required.)
 */
export function StructureMoveSelect({
  kind,
  id,
  label,
  parentId,
  index,
  siblingCount,
  groups,
  projectId,
}: StructureMoveSelectProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  // A Group cannot go inside itself or one of its own Groups.
  const excluded = kind === "group" ? groupAndDescendantIds(id, groups) : new Set<string>();
  const targets = groups.filter((g) => g.id !== parentId && !excluded.has(g.id));

  const options: { value: string; label: string; parent: string | null; index: number | null }[] = [];
  if (index > 0) options.push({ value: "up", label: "Move up", parent: parentId, index: index - 1 });
  if (index < siblingCount - 1) options.push({ value: "down", label: "Move down", parent: parentId, index: index + 1 });
  if (parentId !== null) options.push({ value: "top", label: "Move to top level", parent: null, index: null });
  for (const g of targets) {
    options.push({ value: `into:${g.id}`, label: `Move into ${g.title ?? UNTITLED_GROUP}`, parent: g.id, index: null });
  }
  if (options.length === 0) return null;

  async function handleChange(value: string) {
    const option = options.find((o) => o.value === value);
    if (!option) return;
    setBusy(true);
    const { error } =
      kind === "group"
        ? await moveGroup(id, option.parent, option.index, projectId)
        : await moveChapter(id, option.parent, option.index, projectId);
    setBusy(false);
    if (error) {
      showToast("Couldn't move this — nothing was changed.", "error");
      return;
    }
    router.refresh();
  }

  return (
    <select
      aria-label={`Move “${label}”`}
      value=""
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void handleChange(e.target.value)}
      className="shrink-0 cursor-pointer rounded border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-rune-gold disabled:opacity-40"
      style={{ borderColor: "var(--color-border)", color: "var(--color-mist)" }}
    >
      <option value="" disabled>
        Move…
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
