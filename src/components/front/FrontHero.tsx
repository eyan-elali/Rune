import Link from "next/link";

// The hero (front.css: "Hero"): one statement, one action, nothing else.
//
//   Write the book.                 — the statement, Sutura's serif, large
//   Build only what it asks for.    — the second line, italic, quieter
//   [ Start writing free ]          — the one action
//   Public beta · Free during beta  — a small note
//
// It is a static composition: no stage, no scroll, no objects. The only
// motion is one short settle on first paint (the stylesheet; none under
// reduced motion). What Sutura is — the manuscript at the core, structure
// only when the book asks for it — is said by the line, and shown by the
// rest of the page below.
//
// One action, one wording — "Start writing free" — on the public page. A
// signed-in writer is sent to their Projects by the same action.

export function FrontHero({ member }: { member: boolean }) {
  return (
    <section className="r2-lp-hero" aria-labelledby="lp-title">
      <div className="r2-lp-hero-in">
        <h1 id="lp-title" className="r2-lp-title">
          <span className="r2-lp-title-1">Write the book.</span>
          <span className="r2-lp-title-2">Build only what it asks for.</span>
        </h1>
        <div className="r2-lp-actions">
          <Link href={member ? "/projects" : "/signup"} className="r2-button r2-button--primary r2-button--lg">
            Start writing free
          </Link>
          <p className="r2-lp-note">
            Public beta <span aria-hidden="true">·</span> Free during beta
          </p>
        </div>
      </div>
    </section>
  );
}
