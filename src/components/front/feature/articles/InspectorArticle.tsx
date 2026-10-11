import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { InspectorBesideWriting, InspectorConnections } from "../visuals/InspectorVisuals";

// The Inspector: the closer look the landing page's Section 4 leads to. The
// idea — a scene's context close to the writing, without taking the
// writing's room — in four passages: why the Inspector exists, the details
// it shows, the Connections that lead into the Workspace, and its quiet
// when not needed. Two figures, each one job: the shell with the scene open
// and the sheet beside it, the sheet running to the frame's foot and
// everything in it whole (context beside the manuscript) — the one picture
// of the writing and its side panel together, which this page owns — and
// the sheet alone, on its Connections, beside its passage (how the
// Inspector joins manuscript and workspace). The properties themselves are
// the Scene properties page's subject, and the revision thinking that shares
// the sheet's region is the Revision Notes page's.

export const INSPECTOR_LINE =
  "A scene's properties, its place in the manuscript, its earlier versions and its connections, in one sheet beside the writing.";

export function InspectorArticle() {
  return (
    <>
      <FeatureHead eyebrow="The Inspector" title="The details stay close." lede={`${INSPECTOR_LINE} There when you need context, gone when you do not.`} />

      <FeatureSection labelledBy="fp-in-why">
        <Visual
          size="inspector"
          label="Sutura with the scene The Thursday Boat open: the chapter's name, the scene's title and its prose in the writing column. Beside it, running to the foot of the window, the Inspector: Scene, The Thursday Boat, in Part One, The Letters, scene 2 of 3, 1,412 words. Its Properties: Point of view, Ada Marsh; Location, The house; Timeline, March, year two; Status, Draft. Its History: three versions, today at 09:41, the same as now; yesterday at 22:10, 1,388 words; Tuesday at 17:52, 1,102 words."
        >
          <InspectorBesideWriting />
        </Visual>
        <Prose>
          <h2 id="fp-in-why">Why the Inspector exists</h2>
          <p>
            A manuscript is full of things that are true about a scene but are not the scene. Whose point of view it is. Where in
            the book it falls. How many words it has grown to since Tuesday. Which page of notes it leans on. Sutura keeps all of
            that out of the writing surface, and the Inspector is where it goes instead.
          </p>
          <p>
            It opens beside the writing and closes when you are done. The writing column keeps its measure as long as there is
            room.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-in-details">
        <Prose>
          <h2 id="fp-in-details">Details without leaving the writing</h2>
          <p>
            Select a scene and the Inspector describes it: its kind and title, the Group and Chapter above it, its position among
            its siblings, its length. Below that, its properties, each edited in place; below that, its History: the versions
            Sutura keeps automatically as you write, each a time and a word count, any of which you can open and read.
          </p>
          <p>
            Nothing here has to be filled in. A scene with no properties shows a few plain suggestions and otherwise leaves the
            sheet quiet.
          </p>
          <Aside href="/features/scene-properties" cue="Scene properties">
            The properties themselves are the writer&rsquo;s to define.
          </Aside>
        </Prose>
      </FeatureSection>

      <Principle>Context should be available, not unavoidable.</Principle>

      <FeatureSection layout="visual-left" labelledBy="fp-in-links">
        <Visual
          size="connections"
          label="The Inspector's sheet alone, for the scene The Thursday Boat. Under Connections, with a Link to… action: Related lists the Page Why the letters wait and the Threads entry The grey string; Referenced by lists the Page Ending ideas."
        >
          <InspectorConnections />
        </Visual>
        <Prose>
          <h2 id="fp-in-links">Connections that lead into the workspace</h2>
          <p>
            The last section is where the manuscript meets the Workspace. Under Connections, the Inspector lists what a scene is
            linked to, a Page of research, an Entry in a Collection, and under Referenced by, everything that mentions the scene in
            turn. Each is one step away.
          </p>
          <p>
            The Inspector is not only for scenes. Select a Chapter and it lists the Chapter&rsquo;s scenes; a Page, an Entry or a
            Canvas, and it says where in the Workspace they stand and what they connect to.
          </p>
          <Aside href="/features/pages" cue="Pages">
            What the Inspector points to lives in Pages and Collections.
          </Aside>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-in-quiet">
        <Prose>
          <h2 id="fp-in-quiet">Quiet when not needed</h2>
          <p>
            The Inspector is a panel you open, not one that opens itself. It shares one region with Revision Notes, so there is
            never more than one sheet beside the writing, and while you are typing the shell&rsquo;s chrome recedes until you
            pause, so the page is the writing and little else.
          </p>
          <Aside href="/features/revision-notes" cue="Revision Notes">
            The other thing that sheet can hold is your revision thinking.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
