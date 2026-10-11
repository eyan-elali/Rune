import { Columns3, Plus, Table2, X } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";
import { col } from "./CollectionVisuals";
import { CHAPTER, Choice, ContextBar, DocStatus, GROUP, Options, PropRow, Relation, SCENE, SceneProse, Tabs } from "./shell";

// The Scene properties page's drawings. First, where the properties live:
// beside the writing, in the Inspector (Rune2Panel: SceneInspectorProperties;
// rune2.css: ".r2-scene-props") — the prose column clean, the sheet inset
// beside it with the scene's few facts. Then the same facts seen another
// way: the Manuscript's Scenes as a Table (ManuscriptScenes; rune2.css:
// "Scene properties and Scene Views") — the scene's derived number quiet
// before its name, the writer's properties as columns, and the native
// word count in the second ink. The prose editor never shows any of this.

/** The scene open, with the Inspector's Properties beside it. */
export function SceneWithProperties() {
  return (
    <div className="r2-fp-shell r2-fp-shell--split">
      <Tabs context={CHAPTER} label={SCENE} />
      <ContextBar crumbs={["Manuscript", GROUP, CHAPTER, SCENE]} />
      <div className="r2-fp-body">
        <div className="r2-lp-shot-content">
          <SceneProse />
          <DocStatus />
        </div>
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
                          <Relation names={["Ada Marsh"]} />
                        </PropRow>
                        <PropRow label="Location">
                          <Relation names={["The house"]} />
                        </PropRow>
                        <PropRow label="Timeline">
                          <Choice type="select" options={["March, year two"]} />
                        </PropRow>
                        <PropRow label="Threads">
                          <Choice type="multi_select" options={["The letters", "The house"]} />
                        </PropRow>
                        <PropRow label="Status">
                          <Choice type="status" options={["Draft"]} />
                        </PropRow>
                      </dl>
                    </section>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

type SceneRow = { number: string; title: string; pov: string; location: string; status: string; words: string };
const SCENES: Array<{ chapter: string; scenes: SceneRow[] }> = [
  {
    chapter: "The Harbour",
    scenes: [
      { number: "1.1", title: "Arrival", pov: "Ada Marsh", location: "The harbour", status: "Revised", words: "2,106" },
      { number: "1.2", title: "The ferryman", pov: "Tomas Reyes", location: "The harbour", status: "Revised", words: "1,780" },
    ],
  },
  {
    chapter: CHAPTER,
    scenes: [
      { number: "2.1", title: "The Ferry", pov: "Ada Marsh", location: "The crossing", status: "Draft", words: "1,934" },
      { number: "2.2", title: SCENE, pov: "Ada Marsh", location: "The house", status: "Draft", words: "1,412" },
      { number: "2.3", title: "High Water", pov: "Mrs. Hale", location: "The village", status: "Planned", words: "318" },
    ],
  },
];

/** The Manuscript's Scenes, as a Table grouped by Chapter. */
export function SceneTable() {
  return (
    <div className="r2-fp-broad r2-scenes r2-fp-scenes">
      <div className="r2-scenes-head">
        <span className="r2-scenes-title">Scenes</span>
      </div>
      <div className="r2-collection-bar" data-tabs="">
        <div className="r2-view-tabs">
          <div className="r2-view-strip">
            <div className="r2-view-switcher">
              <span className="r2-view-tab" aria-selected="true">
                <Table2 {...ICON_SM} className="r2-view-tab-icon" />
                <span className="r2-view-tab-name">By chapter</span>
              </span>
              <span className="r2-view-tab" aria-selected="false">
                <Columns3 {...ICON_SM} className="r2-view-tab-icon" />
                <span className="r2-view-tab-name">By status</span>
              </span>
            </div>
          </div>
          <span className="r2-view-tab r2-view-tab--add">
            <Plus {...ICON_SM} />
          </span>
        </div>
      </div>
      <div className="r2-table-wrap">
        <table className="r2-table r2-fp-table">
          <thead>
            <tr>
              <th scope="col" className="r2-table-title-col" style={col(196)}>
                <span className="r2-table-head">Scene</span>
              </th>
              <th scope="col" data-type="relationship" style={col(124)}>
                <span className="r2-table-head">Point of view</span>
              </th>
              <th scope="col" data-type="relationship" style={col(124)}>
                <span className="r2-table-head">Location</span>
              </th>
              <th scope="col" data-type="status" style={col(100)}>
                <span className="r2-table-head">Status</span>
              </th>
              <th scope="col" data-type="number" data-native="" style={col(72)}>
                <span className="r2-table-head">Words</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {SCENES.map((group) => (
              <GroupRows key={group.chapter} chapter={group.chapter} scenes={group.scenes} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ chapter, scenes }: { chapter: string; scenes: SceneRow[] }) {
  return (
    <>
      <tr className="r2-table-section">
        <td colSpan={5}>{chapter}</td>
      </tr>
      {scenes.map((s) => (
        <tr key={s.number} className="r2-table-row" data-scene={s.title === SCENE ? "open" : undefined}>
          <th scope="row" className="r2-table-title">
            <span className="r2-fp-table-name">
              <span className="r2-item-number">{s.number}</span>
              {s.title}
            </span>
          </th>
          <td data-type="relationship" className="r2-prop-value">
            <Relation names={[s.pov]} />
          </td>
          <td data-type="relationship" className="r2-prop-value">
            <Relation names={[s.location]} />
          </td>
          <td data-type="status" className="r2-prop-value">
            <span className="r2-prop-button">
              <Options type="status" options={[s.status]} />
            </span>
          </td>
          <td data-type="number" data-native="" className="r2-prop-value">
            <span className="r2-prop-static r2-fp-num">{s.words}</span>
          </td>
        </tr>
      ))}
    </>
  );
}
