import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ICON_SM } from "@/components/rune2/icons";
import { PropertyList, type PropertySpec } from "./Panel";

// A Workspace Page or a Collection Entry (components/rune2/WorkspacePageEditor.tsx),
// drawn: the eyebrow ("Page", or the Entry's Collection as a way back), the
// title (WorkspaceTitle), an Entry's foldable properties (EntryProperties),
// then the body in the Workspace editor's own element (.r2-page-body
// .ProseMirror) with the node shapes its schema allows — headings, lists,
// checklists, quotes, asides (.r2-aside) and inline references (.r2-ref →
// .r2-ref-link). Nothing here is a node the real schema lacks.

export type Inline = string | { ref: string };
export type Block =
  | { h: 2 | 3; text: string }
  | { p: Inline[] }
  | { quote: Inline[] }
  | { aside: Inline[] }
  | { bullets: Inline[][] }
  | { tasks: { done: boolean; text: Inline[] }[] };

function inline(parts: Inline[]): ReactNode {
  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} className="r2-ref" data-reference="">
        <button type="button" tabIndex={-1} className="r2-ref-link">
          {part.ref}
        </button>
      </span>
    )
  );
}

function Body({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="r2-page-body">
      <div className="ProseMirror tiptap">
        {blocks.map((b, i) => {
          if ("h" in b) return b.h === 2 ? <h2 key={i}>{b.text}</h2> : <h3 key={i}>{b.text}</h3>;
          if ("p" in b) return <p key={i}>{inline(b.p)}</p>;
          if ("quote" in b)
            return (
              <blockquote key={i}>
                <p>{inline(b.quote)}</p>
              </blockquote>
            );
          if ("aside" in b)
            return (
              <aside key={i} className="r2-aside">
                <p>{inline(b.aside)}</p>
              </aside>
            );
          if ("bullets" in b)
            return (
              <ul key={i}>
                {b.bullets.map((item, j) => (
                  <li key={j}>
                    <p>{inline(item)}</p>
                  </li>
                ))}
              </ul>
            );
          return (
            <ul key={i} data-type="taskList">
              {b.tasks.map((t, j) => (
                <li key={j} data-checked={t.done ? "true" : "false"}>
                  <label>
                    <input type="checkbox" readOnly checked={t.done} tabIndex={-1} />
                  </label>
                  <div>
                    <p>{inline(t.text)}</p>
                  </div>
                </li>
              ))}
            </ul>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspacePageDoc({ title, blocks }: { title: string; blocks: readonly Block[] }) {
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-page">
        <header className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">Page</p>
          <textarea className="r2-page-title" rows={1} readOnly tabIndex={-1} value={title} />
        </header>
        <Body blocks={blocks} />
      </article>
    </div>
  );
}

export function EntryDoc({
  collection,
  title,
  properties,
  blocks,
}: {
  collection: string;
  title: string;
  properties: readonly PropertySpec[];
  blocks: readonly Block[];
}) {
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-page">
        <header className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">
            <button type="button" tabIndex={-1} className="r2-entry-collection">{collection}</button>
          </p>
          <textarea className="r2-page-title" rows={1} readOnly tabIndex={-1} value={title} />
        </header>
        <section className="r2-props r2-props--entry" aria-label="Properties">
          <div className="r2-props-head">
            <span className="r2-props-toggle">
              <ChevronDown {...ICON_SM} aria-hidden />
              <span>Properties</span>
              <span className="r2-props-count">· {properties.length}</span>
            </span>
          </div>
          <PropertyList properties={properties} />
        </section>
        <Body blocks={blocks} />
      </article>
    </div>
  );
}
