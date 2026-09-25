"use client";

import type { ReactNode } from "react";
import type { NavEntry, NavKind } from "@/lib/rune2/navigatorModel";
import { writingTargetFor } from "@/lib/rune2/writingTarget";
import { useRune2Selection } from "./Rune2Selection";
import { Rune2Writing } from "./Rune2Writing";

// The context bar (a quiet breadcrumb to the selection) and the content area.
// Chapters and Scenes open in the writing surface (see writingTarget.ts);
// a Group shows a structural summary; with nothing selected, the content area
// shows its route (the Manuscript overview).

const KIND_LABEL: Record<NavKind, string> = {
  group: "Group",
  chapter: "Chapter",
  scene: "Scene",
  unplacedScene: "Unplaced Scene",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function Rune2ContextBar() {
  const { manuscript, selected, select } = useRune2Selection();
  // id undefined = a label only (Unplaced Scenes is a section, not an object).
  const trail: { id?: string | null; title: string }[] = [{ id: null, title: "Manuscript" }];
  if (selected) {
    if (selected.kind === "unplacedScene") trail.push({ title: "Unplaced Scenes" });
    trail.push(...selected.path.map((p) => ({ id: p.id, title: p.title })));
    trail.push({ id: selected.id, title: selected.title });
  }

  return (
    <header className="r2-contextbar">
      <nav aria-label="Breadcrumb">
        <ol>
          <li className="r2-crumb-project">{manuscript.project.title}</li>
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={`${crumb.id}-${i}`}>
                <span aria-hidden className="r2-crumb-sep">/</span>
                {last ? (
                  <span aria-current="page" className="r2-crumb-current">{crumb.title}</span>
                ) : crumb.id === undefined ? (
                  <span>{crumb.title}</span>
                ) : (
                  <button type="button" onClick={() => select(crumb.id ?? null)}>{crumb.title}</button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

export function Rune2SelectionView({ children }: { children: ReactNode }) {
  const { manuscript, selected, index } = useRune2Selection();
  const target = writingTargetFor(selected, index);
  return (
    <>
      {!target && (selected ? <StructurePreview entry={selected} /> : children)}
      {/* Always mounted, in the same place: one editor instance for the shell. */}
      <Rune2Writing projectId={manuscript.project.id} target={target} />
    </>
  );
}

/** A Group: structure, not prose. A restrained summary until Groups get their own view. */
function StructurePreview({ entry }: { entry: NavEntry }) {
  return (
    <div className="mx-auto max-w-2xl px-8 pb-16 pt-14">
      <p className="text-xs font-medium" style={{ color: "var(--r2-faint)" }}>
        {KIND_LABEL[entry.kind]}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{entry.title}</h1>
      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
        <dt style={{ color: "var(--r2-muted)" }}>Contains</dt>
        <dd className="tabular-nums">{plural(entry.childCount, "item")}</dd>
        <dt style={{ color: "var(--r2-muted)" }}>Words</dt>
        <dd className="tabular-nums">{plural(entry.words, "word")}</dd>
      </dl>
    </div>
  );
}
