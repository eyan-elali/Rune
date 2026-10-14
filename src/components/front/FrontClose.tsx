import Link from "next/link";
import { Reveal } from "./Reveal";
import { startPath } from "./publicRoutes";

// The close of the landing page (front.css: "The close"): where the page
// resolves. Five sections have said what Sutura is, what it does and what
// stays the writer's; this one says where it stands — open to anyone, free
// during Early Access, still being improved — and offers the one action
// again. It is one centred composition, and nothing more:
//
//            EARLY ACCESS
//         Ready when you are.
//   Sutura is open to anyone and free to use
//  during Early Access while we keep improving it.
//         [ Start writing free ]
//          Early Access · Free
//
// Then the frame's footer. No features, no pictures, no cards, no prices:
// Early Access is said plainly and once, and the action is the hero's and the
// header's — the same wording, the same button, the same destination
// (Create account for a visitor, Projects for a signed-in writer).

export function FrontClose({ member }: { member: boolean }) {
  return (
    <section id="start" className="r2-lp-cl" aria-labelledby="lp-cl-title">
      <Reveal className="r2-lp-cl-in">
        <p className="r2-lp-eyebrow">Early Access</p>
        <h2 id="lp-cl-title" className="r2-lp-h2">
          Ready when you are.
        </h2>
        <p className="r2-lp-lede">Sutura is open to anyone and free to use during Early Access while we keep improving it.</p>
        <div className="r2-lp-cl-actions">
          <Link href={startPath(member)} className="r2-button r2-button--primary r2-button--lg" data-cta="final">
            Start writing free
          </Link>
          <p className="r2-lp-note">
            Early Access <span aria-hidden="true">·</span> Free
          </p>
        </div>
      </Reveal>
    </section>
  );
}
