import { File as PageIcon, Folder, FolderOpen, Frame, Library } from "lucide-react";
import { NavHeader, NavRow, RootRow, Tabs, ContextBar } from "./shell";

// The Pages page's drawings. A Workspace Page as the writer sees it
// (WorkspacePageEditor, WorkspaceTitle; rune2.css: "Workspace Page"): the
// writing column, the eyebrow "Page", the title in the interface sans,
// semibold, and a body set in the same sans — a little smaller and denser
// than the manuscript, with paragraph spacing, headings and lists — because
// a Page is supporting material, not prose. Then the navigator with the
// Workspace open (ProjectNavigator): the Manuscript and Unplaced Scenes
// above, and under Workspace the Folders, Pages, a Collection and a Canvas
// the writer made, in the tree they arranged.

/** The open Page, as one document: the head and a body of rich text. */
export function PageDocument() {
  return (
    <div className="r2-fp-shell r2-fp-shell--column">
      <Tabs context="Characters" label="Ada Marsh" />
      <ContextBar crumbs={["Workspace", "Characters", "Ada Marsh"]} actions="workspace" />
      <div className="r2-fp-page">
        <div className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">Page</p>
          <p className="r2-page-title r2-fp-page-title">Ada Marsh</p>
        </div>
        <div className="r2-fp-page-body">
          <p>
            Born on the island, the youngest of three. Left at nineteen without telling anyone, and came back twenty-two years
            later for the house, which she had not expected to want.
          </p>
          <p>
            She reads letters twice. The first time to know what they say; the second to know what they mean. She would call this
            caution. Tomas calls it waiting.
          </p>
          <h2>What she knows, and when</h2>
          <ul>
            <li>That her mother kept the grey string — before the ferry scene.</li>
            <li>That the second letter was not written to her — not until High Water.</li>
            <li>Who sent the third — never said outright; the reader works it out first.</li>
          </ul>
          <h2>Voice</h2>
          <p>
            Short declaratives when she is frightened. Longer, more qualified sentences when she is at ease, which is rarely. She
            does not say what she wants; she arranges things so that it happens.
          </p>
          <blockquote>Keep the house physical. Her feelings about it arrive through its weather, its damp, the noise it makes at night.</blockquote>
        </div>
      </div>
    </div>
  );
}

/** The shell with the navigator open: the Workspace beneath the manuscript, and the chosen Page's head beside it. */
export function WorkspaceNavigator() {
  return (
    <div className="r2-fp-shell r2-fp-shell--nav">
      <div className="r2-lp-shot-nav r2-fp-nav">
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
                <NavRow depth={1} title="Characters" icon={FolderOpen} open />
                <ul>
                  <li>
                    <NavRow depth={2} title="Ada Marsh" icon={PageIcon} selected />
                  </li>
                  <li>
                    <NavRow depth={2} title="Tomas Reyes" icon={PageIcon} />
                  </li>
                  <li>
                    <NavRow depth={2} title="Mrs. Hale" icon={PageIcon} />
                  </li>
                </ul>
              </li>
              <li>
                <NavRow depth={1} title="Places" icon={Folder} open={false} />
              </li>
              <li>
                <NavRow depth={1} title="Why the letters wait" icon={PageIcon} />
              </li>
              <li>
                <NavRow depth={1} title="Ending ideas" icon={PageIcon} />
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
        <Tabs context="Characters" label="Ada Marsh" />
        <ContextBar crumbs={["Workspace", "Characters", "Ada Marsh"]} actions="workspace" />
        <div className="r2-fp-page r2-fp-page--peek">
          <div className="r2-doc-head r2-page-head">
            <p className="r2-doc-eyebrow">Page</p>
            <p className="r2-page-title r2-fp-page-title">Ada Marsh</p>
          </div>
          <div className="r2-fp-page-body">
            <p>Born on the island, the youngest of three. Left at nineteen without telling anyone, and came back twenty-two years later for the house.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
