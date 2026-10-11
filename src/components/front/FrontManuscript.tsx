import { Reveal } from "./Reveal";
import { ManuscriptDemo } from "./ManuscriptDemo";

// Section 2 of the landing page (front.css: "The manuscript"): the hero's
// promise made concrete. One statement, then the product as proof — the
// Project shell with a manuscript open, demonstrating itself in a short,
// muted loop (ManuscriptDemo): a line is written, a Scene is set aside, a
// Chapter is made and the Scene placed in it, and the writing goes on.
// Write → structure when needed → return to writing.
//
// The shell is a faithful drawing of the real one (components/rune2:
// ProjectNavigator, Rune2Tabs, Rune2Content, Rune2Writing, Rune2Editor), not
// the live components: those need a Project, a session and the selection
// context, none of which belong on a public page. It borrows the shell's
// own row, tab and title classes from rune2.css — the very same metrics and
// tokens the writer sees — and its drag, drop, rename and selection states
// are the product's own, so it cannot drift from the product in a way the
// product itself has not. It is inert: nothing here is a control, and
// nothing in it moves with the scroll.

const SHOT_LABEL =
  "Sutura with a manuscript open. The navigator lists the manuscript in reading order: Part One holds the chapters The Harbour, The Letters and A Quiet House; The Letters is open to its scenes, with The Thursday Boat selected; Part Two follows. Beneath the manuscript, Unplaced Scenes keeps two scenes aside. The editor shows The Thursday Boat, a scene of The Letters, with its prose. In a short loop, a line is written, The Thursday Boat is moved to Unplaced Scenes, a new chapter, The Crossing, is created and named, the scene is placed in it, and the writing continues.";

export function FrontManuscript() {
  return (
    <section id="features" className="r2-lp-ms" aria-labelledby="lp-ms-title">
      <div className="r2-lp-ms-in">
        <Reveal className="r2-lp-ms-head">
          <p className="r2-lp-eyebrow">The manuscript</p>
          <h2 id="lp-ms-title" className="r2-lp-h2">
            One manuscript. In order.
          </h2>
          <p className="r2-lp-lede">
            Chapters, scenes and prose stay in one ordered manuscript, so you always know where the book is.
          </p>
        </Reveal>
        <Reveal className="r2-lp-ms-proof" delay>
          <div className="r2-lp-shot" role="img" aria-label={SHOT_LABEL}>
            <div className="r2-lp-shot-body" aria-hidden>
              <ManuscriptDemo />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
