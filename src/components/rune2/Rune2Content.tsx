"use client";

import type { ReactNode } from "react";
import type { NavEntry, NavKind } from "@/lib/rune2/navigatorModel";
import { chapterShowsScenes } from "@/lib/rune2/navigatorModel";
import { useRune2Selection } from "./Rune2Selection";

// The context bar (a quiet breadcrumb to the selection) and the content area's
// selection view. The view is temporary scaffolding until the editor arrives:
// it only proves the navigator's selection is wired to real objects. With
// nothing selected, the content area shows its route (the Manuscript overview).

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
  const { selected, index } = useRune2Selection();
  if (!selected) return <>{children}</>;
  return <SelectionPreview entry={selected} index={index} />;
}

function SelectionPreview({ entry, index }: { entry: NavEntry; index: Map<string, NavEntry> }) {
  const facts: [string, string][] = [];
  if (entry.kind === "group") {
    facts.push(["Contains", plural(entry.childCount, "item")]);
    facts.push(["Words", plural(entry.words, "word")]);
  } else if (entry.kind === "chapter") {
    const scenes = (entry.sceneIds ?? []).map((id) => index.get(id)).filter(Boolean) as NavEntry[];
    facts.push(["Words", plural(entry.words, "word")]);
    facts.push([
      "Scenes",
      scenes.length === 1 && !chapterShowsScenes({ scenes })
        ? `1 scene, not shown in the navigator (${scenes[0].title})`
        : plural(scenes.length, "scene"),
    ]);
  } else {
    facts.push(["Words", plural(entry.words, "word")]);
    if (entry.kind === "unplacedScene") facts.push(["Placement", "Not in the manuscript’s order"]);
  }

  return (
    <div className="mx-auto max-w-2xl px-8 pb-16 pt-14">
      <p className="text-xs font-medium" style={{ color: "var(--r2-faint)" }}>
        {KIND_LABEL[entry.kind]}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{entry.title}</h1>
      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt style={{ color: "var(--r2-muted)" }}>{term}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-10 text-xs" style={{ color: "var(--r2-faint)" }}>
        Temporary view — the editor arrives in a later milestone.
      </p>
    </div>
  );
}
