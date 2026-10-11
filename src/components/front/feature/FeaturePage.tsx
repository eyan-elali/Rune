import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { createClient } from "@/lib/supabase/server";
import { PublicFootLinks, PublicFrame } from "@/components/front/PublicFrame";
import { FeatureNavigator } from "./FeatureNavigator";
import { FeatureSwitcher } from "./FeatureSwitcher";
import type { FeatureSlug } from "./featureNav";

// The feature pages' one system (feature.css): the closer looks the landing
// page leads to — Pages, Collections, Scene properties, Canvas, the
// Inspector — and the authorship principle. The landing sells Sutura from
// the outside; these pages are read from inside it: a simplified Sutura
// workspace — the navigator at the left (FeatureNavigator; on a phone, the
// switcher at the top, FeatureSwitcher) and, where the writing would be, a
// Page. No marketing header, no tab band, no context bar, no Inspector, no
// status. The Page is set as a Workspace Page is (rune2.css: "Workspace
// Page"): the title, then the body in the interface sans with a Page's
// paragraph spacing, headings, lists and rules — and, set into the writing,
// the product's own surfaces as art-directed figures: framed, shadowed,
// cropped, as wide as the idea wants, breaking the column where width
// helps. The pieces here keep six pages one place; each page composes them
// in its own order.
//
//   FeaturePage     the frame: the public frame's tone and themes, the
//                   navigator, the Page column, the close and the trust
//                   links. Reads whether a writer is signed in, so the one
//                   action leads to Projects for them and to Create
//                   account for a visitor.
//   FeatureHead     the Page's head: the eyebrow, the title in the serif,
//                   one line of support.
//   FeatureSection  a passage of the Page. Alone, its prose takes the full
//                   reading measure; with `layout`, its prose and its
//                   figure share the width (feature.css: "Beside").
//   Prose           the writing: headings, paragraphs, lists, in order.
//   Visual          the product's surface as one figure in the Page — a
//                   material frame, or the plane of Sutura blue — at the
//                   Page's measure, or wider (`width`); named for
//                   assistive technology by `label`; what is inside is a
//                   drawing, never a control.
//   Principle       the pull quote: one line in the serif, italic.
//   Aside           one cross-link to another page, in a sentence.
//
// Nothing here moves with the scroll.

export async function FeaturePage({ children, current }: { children: ReactNode; current: FeatureSlug }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = user !== null;
  return (
    <PublicFrame variant="feature">
      <div className="r2-fp">
        <FeatureNavigator current={current} />
        <div className="r2-fp-content">
          <FeatureSwitcher current={current} />
          <main className="r2-fp-main">
            <article className="r2-fp-doc r2-page">
              {children}
              <FeatureClose member={member} />
            </article>
            <footer className="r2-fp-foot">
              <PublicFootLinks />
            </footer>
          </main>
        </div>
      </div>
    </PublicFrame>
  );
}

export function FeatureHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="r2-doc-head r2-fp-head">
      <p className="r2-doc-eyebrow">{eyebrow}</p>
      <h1 className="r2-fp-title">{title}</h1>
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
 * layout they simply follow one another at the Page's measure, a figure
 * taking the width it asks for (Visual: `width`).
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
  width,
  children,
}: {
  /** What the picture shows, for someone who cannot see it. */
  label: string;
  /** The object's frame: the shell's material, the plane of Sutura blue, or none (the drawing stands on the page). */
  frame?: "material" | "plane" | "none";
  /** A hint for the stylesheet: which drawing this is. */
  size?: string;
  /** How far past the Page's measure the figure may run: a little, or as far as the content column allows. */
  width?: "wide" | "bleed";
  children: ReactNode;
}) {
  return (
    <figure className="r2-fp-visual" data-frame={frame} data-size={size} data-width={width} role="img" aria-label={label}>
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
      <Link href={href} className="r2-fp-aside-link">
        {cue}
        <ArrowRight {...ICON_SM_BOLD} aria-hidden />
      </Link>
    </p>
  );
}

/**
 * The end of the Page: the landing's one action, said once more, as plainly
 * as a Page ends — a rule, a line in the serif, the button, the note. The
 * same wording and destination as the front door (Projects for a signed-in
 * writer, Create account for a visitor).
 */
function FeatureClose({ member }: { member: boolean }) {
  return (
    <section className="r2-fp-close" aria-labelledby="fp-close-title">
      <h2 id="fp-close-title" className="r2-fp-close-title">
        Ready when you are.
      </h2>
      <div className="r2-fp-close-actions">
        <Link href={member ? "/projects" : "/signup"} className="r2-button r2-button--primary r2-button--lg">
          Start writing free
        </Link>
        <p className="r2-fp-note">
          Public beta <span aria-hidden="true">·</span> Free during beta
        </p>
      </div>
    </section>
  );
}
