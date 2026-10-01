"use client";

import type { ReactNode } from "react";

/**
 * One section of the Inspector (Rune2Panel): a small label, an optional word
 * at the right (a count, a quiet action, a note on what the section is), and
 * its content. Sections are parted from one another by a hairline and space —
 * never boxed (rune2.css, .r2-insp-section).
 */
export function InspectorSection({
  title,
  aside,
  caption,
  children,
}: {
  title: string;
  aside?: ReactNode;
  /** One quiet line under the label saying what the section is for. */
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="r2-insp-section" aria-label={title}>
      <header className="r2-insp-section-head">
        <h3 className="r2-insp-label">{title}</h3>
        {aside && <span className="r2-insp-aside">{aside}</span>}
      </header>
      {caption && <p className="r2-insp-caption">{caption}</p>}
      {children}
    </section>
  );
}
