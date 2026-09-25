"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ChapterRow } from "./ChapterRow";
import { StructureMoveSelect, UNTITLED_GROUP } from "./StructureMoveSelect";
import { createChapter } from "@/lib/actions/chapters";
import { createGroup, deleteGroup, renameGroup } from "@/lib/actions/structure";
import { buildManuscriptOutline, type OutlineNode } from "@/lib/manuscriptStructure";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ChapterWithScenes } from "@/lib/manuscriptQueries";
import type { ManuscriptGroup } from "@/lib/types";

interface ChapterListProps {
  /** In manuscript reading order. */
  chapters: ChapterWithScenes[];
  groups: ManuscriptGroup[];
  projectId: string;
}

type Node = OutlineNode<ManuscriptGroup, ChapterWithScenes>;

export function ChapterList({ chapters, groups, projectId }: ChapterListProps) {
  const router = useRouter();
  const [adding, setAdding] = useState<"chapter" | "group" | null>(null);
  const outline = buildManuscriptOutline(groups, chapters);

  async function handleAddChapter() {
    setAdding("chapter");
    const nextTitleNum = chapters.length + 1;

    // The database places the new Chapter at the end of the Manuscript.
    await createChapter(projectId, `Chapter ${nextTitleNum}`);
    router.refresh();
    setAdding(null);
  }

  async function handleAddGroup() {
    setAdding("group");
    // Added at the end of the Manuscript; the writer names it (Part, Book, Act…).
    await createGroup(projectId, null);
    router.refresh();
    setAdding(null);
  }

  function renderNodes(nodes: Node[], parentId: string | null) {
    return nodes.map((node, index) => {
      const move = (kind: "group" | "chapter", id: string, label: string) => (
        <StructureMoveSelect
          kind={kind}
          id={id}
          label={label}
          parentId={parentId}
          index={index}
          siblingCount={nodes.length}
          groups={groups}
          projectId={projectId}
        />
      );
      if (node.kind === "chapter") {
        return (
          <ChapterRow
            key={node.chapter.id}
            chapter={node.chapter}
            projectId={projectId}
            moveControl={move("chapter", node.chapter.id, node.chapter.title)}
          />
        );
      }
      return (
        <GroupSection
          key={node.group.id}
          group={node.group}
          isEmpty={node.children.length === 0}
          projectId={projectId}
          moveControl={move("group", node.group.id, node.group.title ?? UNTITLED_GROUP)}
        >
          {renderNodes(node.children, node.group.id)}
        </GroupSection>
      );
    });
  }

  return (
    <div className="flex flex-col gap-4" data-guide="project-chapters">
      {outline.length === 0 ? (
        <p className="py-6 text-center text-sm text-rune-mist/50">
          No chapters yet. Add one to start writing.
        </p>
      ) : (
        renderNodes(outline, null)
      )}

      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="primary"
          onClick={handleAddChapter}
          loading={adding === "chapter"}
          disabled={adding !== null}
          className="gap-1.5"
        >
          <Plus size={14} aria-hidden="true" />
          Add Chapter
        </Button>
        <Button
          variant="ghost"
          onClick={handleAddGroup}
          loading={adding === "group"}
          disabled={adding !== null}
          className="gap-1.5"
          title="A Part, Book, Act or any section that holds chapters"
        >
          <Plus size={14} aria-hidden="true" />
          Add Group
        </Button>
      </div>
    </div>
  );
}

interface GroupSectionProps {
  group: ManuscriptGroup;
  isEmpty: boolean;
  projectId: string;
  moveControl: React.ReactNode;
  children: React.ReactNode;
}

/** A Manuscript Group: a heading over its Chapters and Groups. It holds no prose. */
function GroupSection({ group, isEmpty, projectId, moveControl, children }: GroupSectionProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = group.title ?? UNTITLED_GROUP;
  const headingId = `group-${group.id}`;

  function startEditing() {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit() {
    setIsEditing(false);
    const next = titleValue.trim();
    if (next === (group.title ?? "")) return;
    setSaving(true);
    const { error } = await renameGroup(group.id, next, projectId);
    setSaving(false);
    if (error) {
      setTitleValue(group.title ?? "");
      showToast("Couldn't rename this group.", "error");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete the empty group "${label}"?`)) return;
    const { error } = await deleteGroup(group.id, projectId);
    if (error) {
      showToast("Couldn't delete this group — nothing was changed.", "error");
      return;
    }
    router.refresh();
  }

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", saving && "opacity-60")}>
      <div className="flex items-center gap-3 border-b pb-2" style={{ borderColor: "var(--color-border)" }}>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              ref={inputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") {
                  setTitleValue(group.title ?? "");
                  setIsEditing(false);
                }
              }}
              placeholder="Part I, Book Two, Act I…"
              className="w-full rounded border border-rune-gold px-2 py-0.5 font-serif text-base outline-none focus:ring-1 focus:ring-rune-gold/30"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
              aria-label="Group title"
            />
          ) : (
            <h3
              id={headingId}
              className="truncate font-serif text-base"
              style={{ color: "var(--text-primary)", opacity: group.title ? 0.9 : 0.5 }}
            >
              <button
                type="button"
                onClick={startEditing}
                title="Rename"
                className="max-w-full truncate text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rune-gold"
              >
                {label}
              </button>
            </h3>
          )}
        </div>
        {moveControl}
        <button
          type="button"
          aria-label={`Delete group “${label}”`}
          title={isEmpty ? "Delete group" : "Move its chapters and groups out first"}
          onClick={handleDelete}
          disabled={!isEmpty}
          className="shrink-0 rounded p-1 text-rune-mist/40 transition-colors hover:text-rune-crimson disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-4 border-l pl-4" style={{ borderColor: "var(--color-border)" }}>
        {isEmpty ? (
          <p className="py-2 text-xs text-rune-mist/50">Empty. Move chapters into it with “Move…”.</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
