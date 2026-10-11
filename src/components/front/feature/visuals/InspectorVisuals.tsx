import { Link2, X } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";
import { CHAPTER, Choice, ContextBar, GROUP, PROSE, PropRow, Relation, SCENE, SceneProse, Tabs } from "./shell";

// The Inspector page's drawings: the real panel (Rune2Panel.tsx; rune2.css:
// ".r2-panel", ".r2-inspector"), open as the inset side sheet beside the
// writing, with the sections it shows for a Scene — where it stands in the
// manuscript and its facts; its Properties (SceneInspectorProperties); its
// History, kept automatically as the writer writes (SceneHistory); its
// Connections (ObjectLinks): what it links to, and what refers to it. The
// landing's Section 4 shows the sheet beside a quiet column; here the
// writing is in it, since the page is about the two together: two
// paragraphs of the scene, the sheet whole beside them and running to the
// frame's foot, and no status line, so the picture is only the writing
// and what stands beside it. The sheet alone, on its Connections, is the
// figure itself: it fills its frame.

function Head() {
  return (
    <header className="r2-insp-head">
      <p className="r2-insp-kind">Scene</p>
      <p className="r2-insp-title">{SCENE}</p>
      <p className="r2-insp-place">
        <span className="r2-insp-place-step">
          <span className="r2-insp-place-link">{GROUP}</span>
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
  );
}

function Properties() {
  return (
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
              <Relation names={["Ada Marsh"]} />
            </PropRow>
            <PropRow label="Location">
              <Relation names={["The house"]} />
            </PropRow>
            <PropRow label="Timeline">
              <Choice type="select" options={["March, year two"]} />
            </PropRow>
            <PropRow label="Status">
              <Choice type="status" options={["Draft"]} />
            </PropRow>
          </dl>
        </section>
      </div>
    </section>
  );
}

function History() {
  return (
    <section className="r2-insp-section">
      <header className="r2-insp-section-head">
        <h3 className="r2-insp-label">History</h3>
        <span className="r2-insp-aside">
          <span className="r2-insp-aside-link">All versions</span>
        </span>
      </header>
      <ul className="r2-versions">
        <li>
          <span className="r2-version">
            <span className="r2-version-when">Today, 09:41</span>
            <span className="r2-version-words">same as now</span>
          </span>
        </li>
        <li>
          <span className="r2-version">
            <span className="r2-version-when">Yesterday, 22:10</span>
            <span className="r2-version-words">1,388 words</span>
          </span>
        </li>
        <li>
          <span className="r2-version">
            <span className="r2-version-when">Tuesday, 17:52</span>
            <span className="r2-version-words">1,102 words</span>
          </span>
        </li>
      </ul>
    </section>
  );
}

function Connections() {
  return (
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
              <span className="r2-link-hint">Page</span>
            </span>
          </li>
          <li>
            <span className="r2-link">
              <span className="r2-link-title">The grey string</span>
              <span className="r2-link-hint">Threads</span>
            </span>
          </li>
        </ul>
        <h4 className="r2-links-sub">Referenced by</h4>
        <ul className="r2-links-list">
          <li>
            <span className="r2-link">
              <span className="r2-link-title">Ending ideas</span>
              <span className="r2-link-hint">Page</span>
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Panel({ sections }: { sections: Array<"properties" | "history" | "connections"> }) {
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
            <Head />
            {sections.includes("properties") && <Properties />}
            {sections.includes("history") && <History />}
            {sections.includes("connections") && <Connections />}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The shell with the scene open and the Inspector beside it: the page's main picture. */
export function InspectorBesideWriting() {
  return (
    <div className="r2-fp-shell r2-fp-shell--split r2-fp-shell--inspector">
      <Tabs context={CHAPTER} label={SCENE} />
      <ContextBar crumbs={["Manuscript", GROUP, CHAPTER, SCENE]} />
      <div className="r2-fp-body">
        <div className="r2-lp-shot-content">
          <SceneProse paragraphs={PROSE.slice(0, 2)} />
        </div>
        <Panel sections={["properties", "history"]} />
      </div>
    </div>
  );
}

/** The sheet alone, closer in: its Connections. */
export function InspectorConnections() {
  return (
    <div className="r2-fp-sheet">
      <Panel sections={["connections"]} />
    </div>
  );
}
