import { File as PageIcon, Folder, FolderOpen, Frame, Library } from "lucide-react";
import { ContextBar, NavHeader, NavRow, RootRow, Tabs } from "./shell";

// The Pages page's drawings. A Workspace Page as the writer sees it
// (WorkspacePageEditor, WorkspaceTitle; rune2.css: "Workspace Page"): the
// writing column, the eyebrow "Page", the title in the interface sans,
// semibold, and a body set in the same sans — a little smaller and denser
// than the manuscript, with paragraph spacing, headings and lists — because
// a Page is supporting material, not prose. The Page shown is a piece of
// thinking about the book, "Why the letters wait": the kind of writing that
// has no shape but the one the writer gives it. (A character is the
// Collections page's example; the two kinds of object stay distinct.) Then
// the navigator with the Workspace open (ProjectNavigator): the Manuscript
// and Unplaced Scenes above, and under Workspace the Folders, Pages,
// Collections and a Canvas the writer made, in the tree they arranged, with
// the same Page open beside it and nothing written under its title — the
// picture is of where Pages stand, not of another note.

const PAGE = "Why the letters wait";

/** The open Page, as one document: the head and a body of rich text. */
export function PageDocument() {
  return (
    <div className="r2-fp-shell r2-fp-shell--column">
      <Tabs label={PAGE} />
      <ContextBar crumbs={["Workspace", PAGE]} actions="workspace" />
      <div className="r2-fp-page">
        <div className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">Page</p>
          <p className="r2-page-title r2-fp-page-title">{PAGE}</p>
        </div>
        <div className="r2-fp-page-body">
          <p>
            She has the letters by noon and does not open them until the next morning. Every reader will ask why. I need to know
            the answer before she does, even if she never says it.
          </p>
          <h2>Possible reasons</h2>
          <ul>
            <li>She knows her mother&rsquo;s hand, and does not want that voice back in the house yet.</li>
            <li>Three letters at once means someone kept them. She wants to know who, first.</li>
            <li>Island habit: nothing is opened until the tide has turned. (Too neat. Cut unless Mrs. Hale can say it.)</li>
          </ul>
          <h2>What the delay buys the book</h2>
          <p>
            A night with the letters unopened on the table. The house gets a scene to itself. And Tomas arrives before the
            contents do, so the reader meets him not knowing what she knows.
          </p>
          <blockquote>
            Rule for the chapter: the letters are weather, not a plot device. Let them change the pressure in every scene before
            anyone reads a word.
          </blockquote>
        </div>
      </div>
    </div>
  );
}

/** The shell with the navigator open: the Workspace beneath the manuscript, and the chosen Page's head beside it. */
export function WorkspaceNavigator() {
  return (
    <div className="r2-fp-shell r2-fp-shell--nav">
      <div className="r2-lp-shot-nav r2-fp-nav-shot">
        <NavHeader />
        <div className="r2-lp-shot-tree">
          <ul>
            <li className="r2-lp-shot-section">
              <RootRow title="Manuscript" count="41,208" open={false} />
            </li>
            <li className="r2-lp-shot-section">
              <RootRow title="Unplaced Scenes" count="2,340" open={false} />
            </li>
            <li className="r2-lp-shot-section">
              <RootRow title="Workspace" />
              <ul>
                <li>
                  <NavRow depth={1} title="Research" icon={FolderOpen} open />
                  <ul>
                    <li>
                      <NavRow depth={2} title="The island ferries" icon={PageIcon} />
                    </li>
                    <li>
                      <NavRow depth={2} title="Letters, 1950s" icon={PageIcon} />
                    </li>
                    <li>
                      <NavRow depth={2} title="Tide tables" icon={PageIcon} />
                    </li>
                  </ul>
                </li>
                <li>
                  <NavRow depth={1} title="Places" icon={Folder} open={false} />
                </li>
                <li>
                  <NavRow depth={1} title={PAGE} icon={PageIcon} selected />
                </li>
                <li>
                  <NavRow depth={1} title="Ending ideas" icon={PageIcon} />
                </li>
                <li>
                  <NavRow depth={1} title="Characters" icon={Library} />
                </li>
                <li>
                  <NavRow depth={1} title="Threads" icon={Library} />
                </li>
                <li>
                  <NavRow depth={1} title="The crossing" icon={Frame} />
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
      <div className="r2-lp-shot-content">
        <Tabs label={PAGE} />
        <ContextBar crumbs={["Workspace", PAGE]} actions="workspace" />
        <div className="r2-fp-page r2-fp-page--peek r2-fp-page--blank">
          <div className="r2-doc-head r2-page-head">
            <p className="r2-doc-eyebrow">Page</p>
            <p className="r2-page-title r2-fp-page-title">{PAGE}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
