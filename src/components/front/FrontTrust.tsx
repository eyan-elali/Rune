import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ICON_SM_BOLD } from "@/components/rune2/icons";
import { Reveal } from "./Reveal";

// Section 5 of the landing page (front.css: "Trust and authorship"): the
// promises underneath the product. After four sections that show what
// Sutura does, this one says what it will not do, and what stays the
// writer's. A split, the other way round from the Inspector section's: at
// the left, four long surfaces in a stack, one promise each — a label, a
// short statement, one supporting line; at the right, the editorial
// statement, set against the upper part of the stack, with nothing else
// beside it.
//
// It is not a feature grid and not a policy page: four promises, said
// once, in plain words. The copy makes no claim the product does not
// keep today (CLAUDE.md §2, §11, §18): no AI in the writing, the
// manuscript is the writer's, the editor saves and keeps working offline
// (IndexedDB and background sync), and the manuscript exports. Nothing
// here is added to that — no encryption, no privacy or security language.
//
// The first promise is the one that most sets Sutura apart, and the only
// one that leads deeper today: the whole card is the link to the
// editorial page (NO_AI_PATH), a placeholder until the article is
// written. The other three are statements, not controls.

export const NO_AI_PATH = "/principles/no-ai";

export type TrustPromise = {
  id: "no-ai" | "your-work" | "offline" | "no-lock-in";
  label: string;
  title: string;
  line: string;
  /* The smallest mark of a tone before the label (Section 3's dots). */
  tone: "blue" | "sage" | "sand" | "terracotta";
};

export const TRUST_PROMISES: ReadonlyArray<TrustPromise> = [
  {
    id: "no-ai",
    label: "No AI writing",
    title: "The writing stays human.",
    line: "Sutura will never use AI to write, rewrite, or complete your story.",
    tone: "blue",
  },
  {
    id: "your-work",
    label: "Your work",
    title: "What you write stays yours.",
    line: "Your manuscript is your work, not ours.",
    tone: "sage",
  },
  {
    id: "offline",
    label: "Offline first",
    title: "Write even when the internet disappears.",
    line: "Your writing remains available when you need it.",
    tone: "sand",
  },
  {
    id: "no-lock-in",
    label: "No lock-in",
    title: "Take your work with you.",
    line: "Your manuscript should never be trapped in Sutura.",
    tone: "terracotta",
  },
];

// One promise's text: the label with its mark, the serif statement, the
// line. The same three parts on every card, so the stack reads as one.
function PromiseText({ p }: { p: TrustPromise }) {
  return (
    <>
      <p id={`lp-tr-${p.id}-label`} className="r2-lp-tr-label">
        <span className="r2-lp-ws-dot" data-tone={p.tone} aria-hidden />
        {p.label}
      </p>
      <h3 id={`lp-tr-${p.id}-title`} className="r2-lp-tr-title">
        {p.title}
      </h3>
      <p id={`lp-tr-${p.id}-line`} className="r2-lp-tr-line">
        {p.line}
      </p>
    </>
  );
}

export function FrontTrust() {
  return (
    <section id="trust" className="r2-lp-tr" aria-labelledby="lp-tr-title">
      <div className="r2-lp-tr-in">
        <Reveal className="r2-lp-tr-copy">
          <p className="r2-lp-eyebrow">Trust &amp; authorship</p>
          <h2 id="lp-tr-title" className="r2-lp-h2">
            A writing space
            <br />
            you can trust.
          </h2>
          <p className="r2-lp-lede">Built around your authorship, your control, and the simple idea that the book is yours.</p>
        </Reveal>
        <Reveal className="r2-lp-tr-stack-wrap" delay>
          <ul className="r2-lp-tr-stack">
            {TRUST_PROMISES.map((p) =>
              p.id === "no-ai" ? (
                <li key={p.id} className="r2-lp-tr-item" data-promise={p.id}>
                  {/* The one card that opens: named by its label and statement,
                      described by its line, so the whole surface reads as one link. */}
                  <Link
                    href={NO_AI_PATH}
                    className="r2-lp-tr-card r2-lp-tr-card--link r2-material"
                    aria-labelledby={`lp-tr-${p.id}-label lp-tr-${p.id}-title`}
                    aria-describedby={`lp-tr-${p.id}-line`}
                  >
                    <div className="r2-lp-tr-text">
                      <PromiseText p={p} />
                    </div>
                    <span className="r2-lp-tr-cue" aria-hidden>
                      Read our approach
                      <ArrowRight {...ICON_SM_BOLD} />
                    </span>
                  </Link>
                </li>
              ) : (
                <li key={p.id} className="r2-lp-tr-item" data-promise={p.id}>
                  <div className="r2-lp-tr-card r2-material">
                    <div className="r2-lp-tr-text">
                      <PromiseText p={p} />
                    </div>
                  </div>
                </li>
              )
            )}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
