import type { Metadata } from "next";
import { Aside, FeatureHero, FeaturePage, FeatureSection, Principle, Prose, Visual } from "@/components/front/feature/FeaturePage";
import { SceneTable, SceneWithProperties } from "@/components/front/feature/visuals/ScenePropertyVisuals";
import "../../front.css";
import "../../feature.css";

// Scene properties: the closer look the landing page's third workspace card
// leads to, and the most philosophical of the feature pages. The idea —
// structure around the scene, never inside the prose — in four movements:
// the prose kept clean, properties the writer defines, the same facts read
// as Views, and complexity as a choice. Two drawings: the scene open with
// its properties in the Inspector beside it, and the Manuscript's Scenes
// as a Table.

export const metadata: Metadata = {
  title: "Scene properties",
  description:
    "Track point of view, place, time, status or anything else about a scene beside the writing, never in it. Writer-defined scene properties in Sutura keep the manuscript looking like a manuscript.",
  alternates: { canonical: "/features/scene-properties" },
};

export default function ScenePropertiesFeature() {
  return (
    <FeaturePage kind="feature">
      <FeatureHero
        eyebrow="Scene properties"
        title="Structure around the scene. Never inside the prose."
        lede="Point of view, place, time, status, the threads a scene carries. Track what matters to this book beside the writing, and keep the manuscript looking like a manuscript."
      />

      <FeatureSection layout="wide" labelledBy="fp-sp-clean">
        <Visual
          frame="plane"
          size="scene-inspector"
          label="Sutura with the scene The Thursday Boat open: the chapter's name, the scene's title and three paragraphs of prose in the writing column, with nothing else on it. Beside it, the Inspector shows the scene's properties: Point of view, Ada Marsh; Location, The house; Timeline, March, year two; Threads, The letters and The house; Status, Draft."
        >
          <SceneWithProperties />
        </Visual>
        <Prose lead>
          <h2 id="fp-sp-clean">Keep prose clean</h2>
          <p>
            Writers have always tracked things about scenes: whose eyes we see through, where we are, what day it is, whether
            the scene is finished. The usual places for those notes are the worst ones. A bracketed line at the top of the scene, a
            colour in the margin, a spreadsheet in another window.
          </p>
          <p>
            In Sutura the manuscript is protected territory. The editor shows the writing and nothing else. A scene&rsquo;s
            properties live outside the writing surface, in the Inspector beside it, where they are one glance away and never a
            word of the text.
          </p>
          <p>They are not part of the text. They do not export with it, and they are never counted as words.</p>
        </Prose>
      </FeatureSection>

      <FeatureSection layout="column" labelledBy="fp-sp-matters">
        <Prose>
          <h2 id="fp-sp-matters">Track what matters to this book</h2>
          <p>
            There are no built-in scene fields. Point of view, Location, Timeline and Status are examples of properties a writer
            might define, not a form Sutura hands you. A thriller may want a clock on every scene. A braided novel may want to know
            which strand each scene belongs to. A first draft may want nothing at all.
          </p>
          <p>
            Scene properties use the same types as a Collection&rsquo;s: text, numbers, choices, dates, checkboxes, and
            relationships to the project&rsquo;s own objects. Set a scene&rsquo;s point of view to the character&rsquo;s Entry and
            the link runs both ways.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection layout="visual-left" labelledBy="fp-sp-views">
        <Visual
          size="scene-table"
          label="The Manuscript's Scenes in Sutura as a Table, By chapter. Under The Harbour: 1.1 Arrival and 1.2 The ferryman. Under The Letters: 2.1 The Ferry, 2.2 The Thursday Boat and 2.3 High Water. Each row shows the scene's Point of view and Location as links, its Status, and its word count."
        >
          <SceneTable />
        </Visual>
        <Prose>
          <h2 id="fp-sp-views">Use the same scene information in useful views</h2>
          <p>
            Once scenes carry properties, the manuscript can be read another way. Under the Manuscript, and under any Group,
            Sutura shows its scenes as a List, a Table, a Board or a Timeline: every scene with its point of view and place, or the
            draft laid out by status in lanes. The manuscript&rsquo;s own order stays the order; a View only arranges what is
            already there.
          </p>
          <p>
            Moving a scene between the lanes of a status Board changes its status. It never changes where the scene sits in the
            book. Only the navigator does that.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection layout="column" labelledBy="fp-sp-optin">
        <Prose>
          <h2 id="fp-sp-optin">Complexity remains opt-in</h2>
          <p>
            A new project has no scene properties. The Inspector offers a few plain suggestions and otherwise stays quiet; nothing
            asks to be filled in before you write. Add one property when you find yourself wanting to see it across scenes, and
            stop there.
          </p>
          <Aside href="/features/inspector" cue="The Inspector">
            Those details can stay close through the Inspector.
          </Aside>
        </Prose>
      </FeatureSection>

      <Principle>The manuscript should still look like a manuscript.</Principle>
    </FeaturePage>
  );
}
