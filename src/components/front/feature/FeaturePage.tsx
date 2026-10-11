import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { FeatureLink } from "./FeatureLink";
import { FeatureShell } from "./FeatureShell";
import type { FeatureSlug } from "./featureNav";

// The feature pages' one system (feature.css): the closer looks the landing
// page leads to — Pages, Collections, Scene properties, Canvas, the
// Inspector — and the authorship principle. The landing sells Sutura from
// the outside; these pages are read from inside it: a simplified Sutura
// workspace — the navigator at the left (FeatureNavigator; where it does
// not fit, the switcher at the top, FeatureSwitcher) and, where the writing
// would be, a Page. No marketing header, no tab band, no context bar, no
// Inspector, no status. The Page is set as a Workspace Page is (rune2.css:
// "Workspace Page"): the title, then the body in the interface sans with a
// Page's paragraph spacing, headings, lists and rules — and, set into the
// writing, the product's own surfaces as figures: one frame, one width,
// the Page's own, so the text, the rules and the pictures stand on one
// axis. Each article (articles/) is read two ways: on its own route, in
// this frame; and from the landing page, inside the Center Peek
// (FeaturePeek), where the same shell fills a dialog over the landing.
//
//   FeaturePage     the standalone frame: the public frame's tone and
//                   themes and the shell in page mode. Reads whether a
//                   writer is signed in, so the one action leads to
//                   Projects for them and to Create account for a visitor.
//   FeatureHead     the Page's head: the eyebrow, the title in the serif
//                   (what names the page, and the peek), one line of support.
//   FeatureSection  a passage of the Page. Alone, its prose takes the full
//                   measure; with `layout`, its prose and a narrow figure
//                   share the width (feature.css: "Beside").
//   Prose           the writing: headings, paragraphs, lists, in order.
//   Visual          the product's surface as one figure in the Page, at the
//                   Page's width, named for assistive technology by
//                   `label`; what is inside is a drawing, never a control,
//                   and nothing it is there to show is cut off.
//   Principle       the pull quote: one line in the serif, italic.
//   Aside           one cross-link to another page, in a sentence.
//
// Nothing here moves with the scroll.

export async function FeaturePage({ children, current }: { children: ReactNode; current: FeatureSlug }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <PublicFrame variant="feature">
      <FeatureShell mode="page" current={current} member={user !== null}>
        {children}
      </FeatureShell>
    </PublicFrame>
  );
}

export function FeatureHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="r2-doc-head r2-fp-head">
      <p className="r2-doc-eyebrow">{eyebrow}</p>
      <h1 id="fp-title" className="r2-fp-title">
        {title}
      </h1>
      {lede && <p className="r2-fp-lede">{lede}</p>}
    </header>
  );
}

export type SectionLayout =
  /** Prose at the left, the figure at the right, from the top. */
  | "visual-right"
  /** The figure at the left, prose at the right. */
  | "visual-left";

/**
 * A passage of the Page. Children are given in reading order; without a
 * layout they follow one another at the Page's width. A layout is for a
 * figure narrow enough to stand beside its prose (a property sheet, a
 * panel), never for a surface that wants the width.
 */
export function FeatureSection({
  id,
  layout,
  children,
  labelledBy,
}: {
  id?: string;
  layout?: SectionLayout;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section id={id} className="r2-fp-section" data-layout={layout} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function Prose({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="r2-fp-prose" id={id}>
      {children}
    </div>
  );
}

export function Visual({
  label,
  frame = "material",
  size,
  children,
}: {
  /** What the picture shows, for someone who cannot see it. */
  label: string;
  /** The object's frame: the shell's material, or none (the drawing stands on the page). */
  frame?: "material" | "none";
  /** A hint for the stylesheet: which drawing this is. */
  size?: string;
  children: ReactNode;
}) {
  return (
    <figure className="r2-fp-visual" data-frame={frame} data-size={size} role="img" aria-label={label}>
      <div className="r2-fp-visual-in" aria-hidden>
        {children}
      </div>
    </figure>
  );
}

export function Principle({ children }: { children: ReactNode }) {
  return (
    <blockquote className="r2-fp-principle">
      <p>{children}</p>
    </blockquote>
  );
}

export function Aside({ children, href, cue }: { children: ReactNode; href: string; cue: string }) {
  return (
    <p className="r2-fp-aside">
      <span>{children}</span>{" "}
      <FeatureLink href={href} className="r2-fp-aside-link">
        {cue}
        <ArrowRight {...ICON_SM_BOLD} aria-hidden />
      </FeatureLink>
    </p>
  );
}
