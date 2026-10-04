import type { ReactNode } from "react";
import type { ReadingPlan } from "@/lib/rune2/reading";
import { ProseSnapshot } from "./ProseSnapshot";

// Reading Mode's text: a ReadingPlan's headings and Scenes, one after another,
// rendered straight from each Scene's TipTap JSON (ProseSnapshot) — no editor
// instance, nothing editable, nothing that can save. Each block carries an
// anchor, so the contents rail can go to any Group, Chapter or Scene, and
// its index, so the surface can tell which block is being read. Scene breaks
// are the manuscript's own quiet ornament between a run's Scenes.
//
// `texts`: a Scene's content (null: an empty Scene), or absent while it is
// being read. `failed`: Scenes that couldn't be read. `sceneAside` adds a
// Scene's quiet margin actions (revision note, edit); the text never does.

export function readingAnchor(id: string): string {
  return `r2-read-${id}`;
}

export function ReadingDocument({
  plan,
  texts,
  failed,
  sceneAside,
  labelOf,
}: {
  plan: ReadingPlan;
  texts: ReadonlyMap<string, Record<string, unknown> | null>;
  failed?: ReadonlySet<string>;
  sceneAside?: (sceneId: string) => ReactNode;
  /** How a Scene is named for assistive technology ("Chapter 3 · Scene 2"). */
  labelOf?: (sceneId: string) => string | null;
}) {
  return (
    <article className="r2-reading-doc">
      {plan.blocks.map((block, i) => {
        switch (block.kind) {
          case "group":
            return (
              <div
                key={`g-${block.id}`}
                id={readingAnchor(block.id)}
                data-reading-block={i}
                tabIndex={-1}
                className="r2-reading-group"
                data-depth={Math.min(block.depth, 2)}
              >
                {block.title && <h2>{block.title}</h2>}
              </div>
            );
          case "chapter":
            return (
              <div
                key={`c-${block.id}`}
                id={readingAnchor(block.id)}
                data-reading-block={i}
                tabIndex={-1}
                className="r2-reading-chapter"
              >
                <h3>{block.title}</h3>
                {block.sceneCount === 0 && <p className="r2-reading-empty">No scenes yet.</p>}
              </div>
            );
          case "unplacedHeading":
            return (
              <div
                key="unplaced"
                id={readingAnchor(block.id)}
                data-reading-block={i}
                tabIndex={-1}
                className="r2-reading-group r2-reading-unplaced"
              >
                <h2>Unplaced Scenes</h2>
                <p className="r2-reading-caption">Not part of the manuscript’s order.</p>
              </div>
            );
          case "scene": {
            const text = texts.get(block.id);
            return (
              <section
                key={`s-${block.id}`}
                id={readingAnchor(block.id)}
                data-reading-block={i}
                data-scene={block.id}
                tabIndex={-1}
                className="r2-reading-scene"
                data-break={block.breakBefore || undefined}
                aria-label={labelOf?.(block.id) ?? undefined}
              >
                {sceneAside && <div className="r2-reading-aside">{sceneAside(block.id)}</div>}
                {block.context && <p className="r2-reading-context">{block.context}</p>}
                {texts.has(block.id) ? (
                  <ProseSnapshot content={text} empty="Empty scene." />
                ) : failed?.has(block.id) ? (
                  <p className="r2-reading-empty">This scene couldn’t be loaded.</p>
                ) : (
                  <p className="r2-reading-empty">Loading…</p>
                )}
              </section>
            );
          }
        }
      })}
    </article>
  );
}
