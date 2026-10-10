import Link from "next/link";
import { ArrowRight, Link2, X } from "lucide-react";
import { ICON, ICON_SM, ICON_SM_BOLD } from "@/components/rune2/icons";
import { Reveal } from "./Reveal";

// Section 4 of the landing page (front.css: "The Inspector"): one idea —
// the supporting details of a scene stay close to the writing. A split: the
// statement at the left, with one quiet link to the closer look; at the
// right, one focused product visual — the Inspector, large, on a trace of
// the shell, on a flat plane of Sutura blue.
//
// The visual is the product's own: the Inspector is the real panel
// (rune2.css: .r2-panel, .r2-inspector, Rune2Panel.tsx), open as the
// inset side sheet beside the writing, with the real classes — the Scene's
// kind, title, place and facts; its Properties (two Relationships, a
// Select, a Status: PropertyFields.tsx); its Connections (ObjectLinks.tsx).
// The writing is only implied: the tab band and the context bar name the
// open scene, and the column beside the sheet is left quiet. Nothing is
// explained; the
// linked values (a Relationship's ink-blue underline, a Connection's row)
// are the product's own way of saying a value leads somewhere.
//
// Nothing here is a control, and nothing moves: the composition is one
// image. The one link is the section's, beneath the copy.

export const INSPECTOR_PATH = "/features/inspector";

const PROJECT = "The Lantern Road";
const CHAPTER = "The Letters";
const SCENE = "The Thursday Boat";

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="r2-prop">
      <dt className="r2-prop-label">
        <span className="r2-prop-label-text">{label}</span>
      </dt>
      <dd className="r2-prop-value">{children}</dd>
    </div>
  );
}

// A Relationship's value: the linked object's name, in the product's own
// link voice (rune2.css: .r2-prop-link).
function Relation({ name }: { name: string }) {
  return (
    <div className="r2-prop-choice r2-prop-relation">
      <span className="r2-prop-links">
        <span className="r2-prop-link">{name}</span>
      </span>
    </div>
  );
}

function Inspector() {
  return (
    <aside className="r2-panel" data-open="">
      <div className="r2-panel-inner">
        <div className="r2-panel-head">
          <h2>Inspector</h2>
          <span className="r2-icon-button">
            <X {...ICON} />
          </span>
        </div>
        <div className="r2-panel-body">
          <div className="r2-inspector">
            <header className="r2-insp-head">
              <p className="r2-insp-kind">Scene</p>
              <p className="r2-insp-title">{SCENE}</p>
              <p className="r2-insp-place">
                <span className="r2-insp-place-step">
                  <span className="r2-insp-place-link">Part One</span>
                </span>
                <span className="r2-insp-place-step">
                  <span className="r2-insp-place-sep">/</span>
                  <span className="r2-insp-place-link">{CHAPTER}</span>
                </span>
              </p>
              <p className="r2-insp-facts">
                <span>Scene 2 of 3</span>
                <span>1,412 words</span>
              </p>
            </header>

            <section className="r2-insp-section">
              <header className="r2-insp-section-head">
                <h3 className="r2-insp-label">Properties</h3>
                <span className="r2-insp-aside">
                  <span className="r2-insp-aside-link">Edit</span>
                </span>
              </header>
              <div className="r2-scene-props">
                <section className="r2-props">
                  <dl className="r2-props-list">
                    <PropRow label="Point of view">
                      <Relation name="Ada Marsh" />
                    </PropRow>
                    <PropRow label="Location">
                      <Relation name="The house" />
                    </PropRow>
                    <PropRow label="Timeline">
                      <div className="r2-prop-choice">
                        <span className="r2-prop-button">
                          <span className="r2-prop-options" data-type="select">
                            <span className="r2-prop-option">March, year two</span>
                          </span>
                        </span>
                      </div>
                    </PropRow>
                    <PropRow label="Status">
                      <div className="r2-prop-choice">
                        <span className="r2-prop-button">
                          <span className="r2-prop-options" data-type="status">
                            <span className="r2-prop-option">Draft</span>
                          </span>
                        </span>
                      </div>
                    </PropRow>
                  </dl>
                </section>
              </div>
            </section>

            <section className="r2-insp-section">
              <header className="r2-insp-section-head">
                <h3 className="r2-insp-label">Connections</h3>
                <span className="r2-insp-aside">
                  <span className="r2-insp-aside-link">
                    <Link2 {...ICON_SM} />
                    Link to…
                  </span>
                </span>
              </header>
              <div className="r2-links">
                <h4 className="r2-links-sub">Related</h4>
                <ul className="r2-links-list">
                  <li>
                    <span className="r2-link">
                      <span className="r2-link-title">Why the letters wait</span>
                      <span className="r2-link-hint">Research</span>
                    </span>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
}

// The shell, cropped to a trace: the content column's tab band and context
// bar across the top (the same classes as the manuscript section's shell),
// then the body zone — quiet at the left, where the writing would be, and
// the sheet inset beside it, as the product lays them out (rune2.css:
// .r2-body). No prose: the manuscript section has shown the writing, and
// here the sheet is the subject.
function Shell() {
  return (
    <div className="r2-lp-shot-in">
      <div className="r2-tabs">
        <ul>
          <li className="r2-tab" data-active>
            <span className="r2-tab-main">
              <span className="r2-tab-context">{CHAPTER} ·</span>
              <span className="r2-tab-label">{SCENE}</span>
            </span>
          </li>
        </ul>
      </div>
      <div className="r2-lp-shot-crumbs">
        <span className="r2-crumb-project">{PROJECT}</span>
        <span>Part One</span>
        <span className="r2-crumb-sep">/</span>
        <span>{CHAPTER}</span>
        <span className="r2-crumb-sep">/</span>
        <span className="r2-crumb-current">{SCENE}</span>
      </div>
      <div className="r2-lp-dt-body">
        <div className="r2-lp-shot-content" />
        <Inspector />
      </div>
      <div className="r2-lp-shot-status">
        1,412 words <span>·</span> Saved
      </div>
    </div>
  );
}

const SHOT_LABEL =
  "The Inspector, open beside the scene The Thursday Boat in Sutura. It shows the scene's place in the manuscript — Part One, The Letters, scene 2 of 3, 1,412 words — then its properties: Point of view, Ada Marsh, a linked character; Location, The house, a linked place; Timeline, March, year two; Status, Draft. Under Connections, the research page Why the letters wait.";

export function FrontDetails() {
  return (
    <section id="inspector" className="r2-lp-dt" aria-labelledby="lp-dt-title">
      <div className="r2-lp-dt-in">
        <Reveal className="r2-lp-dt-copy">
          <p className="r2-lp-eyebrow">The Inspector</p>
          <h2 id="lp-dt-title" className="r2-lp-h2">
            The book stays open.
            <br />
            The details stay close.
          </h2>
          <p className="r2-lp-lede">See what a scene needs without leaving the writing.</p>
          <Link href={INSPECTOR_PATH} className="r2-lp-dt-more">
            Learn about the Inspector
            <ArrowRight {...ICON_SM_BOLD} aria-hidden />
          </Link>
        </Reveal>
        <Reveal className="r2-lp-dt-visual" delay>
          <div className="r2-lp-dt-plane" role="img" aria-label={SHOT_LABEL}>
            <div className="r2-lp-dt-shot r2-lp-shot" aria-hidden>
              <Shell />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
