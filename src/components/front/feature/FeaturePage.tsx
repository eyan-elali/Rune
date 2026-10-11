import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { FrontHeader } from "@/components/front/FrontHeader";
import { FrontClose } from "@/components/front/FrontClose";
import { Reveal } from "@/components/front/Reveal";

// The feature pages' one system (feature.css): the closer looks the landing
// page leads to — Pages, Collections, Scene properties, Canvas, the
// Inspector — and the authorship principle. Editorial pages, not
// documentation: a hero that says the one idea, a few sections of prose
// with the product's own surfaces set into the writing, a principle that
// breaks the rhythm, and the landing's close. The pieces here are the few
// that keep six pages one site; each page composes them in its own rhythm.
//
//   FeaturePage     the frame: the landing's header (the same sticky row,
//                   pill and hide-on-scroll), the page's tone, the close
//                   and the frame's footer. Reads whether a writer is
//                   signed in, so the one action leads to Projects for
//                   them and to Create account for a visitor.
//   FeatureHero     the eyebrow, the statement, one line of support.
//   FeatureSection  a band of the page; `layout` says how its prose and
//                   visual share the width (feature.css: "Compositions").
//   Prose           a measured column of editorial text: a heading, then
//                   paragraphs, in reading order.
//   Visual          the product's surface as one object on the page —
//                   a material frame, or the plane of Sutura blue — named
//                   for assistive technology by `label`; what is inside
//                   is a drawing, never a control.
//   Principle       the pull quote: one line in the serif, on its own.
//   Aside           one editorial cross-link to another page, in a
//                   sentence, never a related-features grid.
//
// Nothing here moves with the scroll but the landing's own reveal.

export async function FeaturePage({ children, kind }: { children: ReactNode; kind: "feature" | "principle" }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = user !== null;
  return (
    <PublicFrame variant="landing">
      <div className="r2-lp r2-fp" data-kind={kind}>
        <FrontHeader member={member} />
        <main>
          {children}
          <FrontClose member={member} />
        </main>
      </div>
    </PublicFrame>
  );
}

export function FeatureHero({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="r2-fp-hero">
      <div className="r2-fp-in r2-fp-hero-in">
        <p className="r2-fp-eyebrow">{eyebrow}</p>
        <h1 className="r2-fp-title">{title}</h1>
        {lede && <p className="r2-fp-lede">{lede}</p>}
      </div>
    </header>
  );
}

export type SectionLayout =
  /** A measured column of prose, nothing beside it. */
  | "column"
  /** Prose at the left, the visual at the right; both from the top. */
  | "visual-right"
  /** The visual at the left, prose at the right. */
  | "visual-left"
  /** The visual across the container, the prose beneath it. */
  | "wide"
  /** The visual across the container, the prose beside it in a narrow column. */
  | "wide-aside";

/**
 * One band of the page. The children are given in reading order — the
 * order a phone shows them in — and the layout places them on a desktop.
 */
export function FeatureSection({
  id,
  layout = "column",
  tone,
  children,
  labelledBy,
}: {
  id?: string;
  layout?: SectionLayout;
  /** The deeper tone the landing's sections rest on, for a band that should stand apart. */
  tone?: "deep";
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section id={id} className="r2-fp-section" data-layout={layout} data-tone={tone} aria-labelledby={labelledBy}>
      <Reveal className="r2-fp-in r2-fp-grid">{children}</Reveal>
    </section>
  );
}

export function Prose({ children, id, lead }: { children: ReactNode; id?: string; lead?: boolean }) {
  return (
    <div className="r2-fp-prose" id={id} data-lead={lead || undefined}>
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
  /** The object's frame: the shell's material, the plane of Sutura blue, or none (the drawing stands on the page). */
  frame?: "material" | "plane" | "none";
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

export function Principle({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <section className="r2-fp-principle" aria-label="A principle">
      <Reveal className="r2-fp-in">
        <blockquote className="r2-fp-quote">
          <p>{children}</p>
          {cite && <footer>{cite}</footer>}
        </blockquote>
      </Reveal>
    </section>
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
