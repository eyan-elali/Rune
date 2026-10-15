import type { CSSProperties } from "react";

// The manuscript writing surface (Rune2Writing → Rune2Editor): the Chapter's
// title, then its Scene's prose in the editor's own element (.r2-prose
// .ProseMirror), so the manuscript type, measure, indents and ink are the
// application's. The prose is static text; the paragraph being written
// takes the typed characters and a caret in the writing surface's caret
// colour (--r2-ms-caret).

export function ManuscriptDoc({
  eyebrow,
  title,
  paragraphs,
  openLine,
  typed,
  caret,
}: {
  eyebrow?: string;
  title: string;
  paragraphs: readonly string[];
  /** The paragraph the writer is in. */
  openLine?: string;
  /** What has been typed onto it so far. */
  typed?: string;
  /** 0–1: the caret's ink (it blinks at rest, holds while typing). */
  caret?: number;
}) {
  const caretStyle: CSSProperties = {
    display: "inline-block",
    width: 2,
    height: "1.08em",
    marginLeft: 1,
    marginRight: -3,
    verticalAlign: "-0.18em",
    background: "var(--r2-ms-caret)",
    opacity: caret ?? 0,
  };
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-doc--manuscript">
        <header className="r2-doc-head">
          {eyebrow && <p className="r2-doc-eyebrow">{eyebrow}</p>}
          <h1 className="r2-doc-title">
            <span className="r2-doc-title-text">{title}</span>
          </h1>
        </header>
        <div className="r2-scenes">
          <section className="r2-scene">
            <div className="r2-prose">
              <div className="ProseMirror tiptap">
                {paragraphs.map((p) => (
                  <p key={p.slice(0, 32)}>{p}</p>
                ))}
                {openLine !== undefined && (
                  <p>
                    {openLine}
                    {typed}
                    <span style={caretStyle} />
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
