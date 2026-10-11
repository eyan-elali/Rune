import type { CSSProperties } from "react";
import { ChevronDown, Columns3, Plus, Table2 } from "lucide-react";
import { ICON_SM } from "@/components/rune2/icons";
import { Choice, Options, PropRow, Relation, Tabs, ContextBar } from "./shell";

// The Collections page's drawings, by the product's own classes. A
// Collection is read through a View (CollectionView, ViewControls,
// CollectionViewBodies; rune2.css: "Collection head", "The bar", "Table",
// "Board"): the title in the sans, one quiet line of what it holds, the
// Views' tabs on a hairline, then the active View flat on the page — a
// Table that is structured, not a spreadsheet; a Board of lanes. An Entry
// (WorkspacePageEditor with ItemProperties) is a Page with a compact
// region of facts under its title, parted from the body by one hairline:
// a document with structured metadata attached, not a database row.

/** A column's width, as the View saves it (CollectionViewBodies: columnWidth); the stylesheet reads it. */
export function col(width: number): CSSProperties {
  return { "--fp-col": `${width}px` } as CSSProperties;
}

type Row = { name: string; role: string; affiliation: string; status: string };
const CHARACTERS: Row[] = [
  { name: "Ada Marsh", role: "Protagonist", affiliation: "The house", status: "Drafted" },
  { name: "Tomas Reyes", role: "Ferryman", affiliation: "The harbour", status: "Drafted" },
  { name: "Mrs. Hale", role: "Neighbour", affiliation: "The village", status: "Sketched" },
  { name: "Ines Marsh", role: "The mother", affiliation: "The house", status: "Revised" },
  { name: "Daniel Croft", role: "Solicitor", affiliation: "The mainland", status: "Sketched" },
];

function ViewBar({ active }: { active: "table" | "board" }) {
  return (
    <div className="r2-collection-bar" data-tabs="">
      <div className="r2-view-tabs">
        <div className="r2-view-strip">
          <div className="r2-view-switcher">
            <span className="r2-view-tab" aria-selected={active === "table"}>
              <Table2 {...ICON_SM} className="r2-view-tab-icon" />
              <span className="r2-view-tab-name">All characters</span>
            </span>
            <span className="r2-view-tab" aria-selected={active === "board"}>
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
  );
}

function CollectionHead({ active }: { active: "table" | "board" }) {
  return (
    <>
      <div className="r2-doc-head r2-page-head">
        <p className="r2-doc-eyebrow">Collection</p>
        <p className="r2-page-title r2-fp-page-title">Characters</p>
        <p className="r2-collection-context">
          <span>5 entries</span>
          <span>3 properties</span>
          <span>2 views</span>
        </p>
      </div>
      <ViewBar active={active} />
    </>
  );
}

/** The Collection read as a Table. */
export function CollectionTable() {
  return (
    <div className="r2-fp-shell r2-fp-shell--broad">
      <Tabs label="Characters" />
      <ContextBar crumbs={["Workspace", "Characters"]} actions="workspace" />
      <div className="r2-fp-broad r2-collection">
        <CollectionHead active="table" />
        <div className="r2-table-wrap">
          <table className="r2-table r2-fp-table">
            <thead>
              <tr>
                <th scope="col" className="r2-table-title-col" style={col(160)}>
                  <span className="r2-table-head">Name</span>
                </th>
                <th scope="col" data-type="text" style={col(112)}>
                  <span className="r2-table-head">Role</span>
                </th>
                <th scope="col" data-type="relationship" style={col(128)}>
                  <span className="r2-table-head">Affiliation</span>
                </th>
                <th scope="col" data-type="status" style={col(112)}>
                  <span className="r2-table-head">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {CHARACTERS.map((r) => (
                <tr key={r.name} className="r2-table-row">
                  <th scope="row" className="r2-table-title">
                    <span className="r2-fp-table-name">{r.name}</span>
                  </th>
                  <td data-type="text" className="r2-prop-value">
                    <span className="r2-prop-input r2-fp-prop-plain">{r.role}</span>
                  </td>
                  <td data-type="relationship" className="r2-prop-value">
                    <Relation names={[r.affiliation]} />
                  </td>
                  <td data-type="status" className="r2-prop-value">
                    <span className="r2-prop-button">
                      <Options type="status" options={[r.status]} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** The same Entries, read as a Board by their Status. */
export function CollectionBoard() {
  const lanes = ["Sketched", "Drafted", "Revised"].map((status) => ({
    status,
    rows: CHARACTERS.filter((r) => r.status === status),
  }));
  return (
    <div className="r2-fp-broad r2-collection r2-fp-board-crop">
      <CollectionHead active="board" />
      <div className="r2-board">
        {lanes.map((lane) => (
          <div key={lane.status} className="r2-lane">
            <header className="r2-lane-head">
              <span className="r2-lane-name">{lane.status}</span>
              <span className="r2-lane-count">{lane.rows.length}</span>
            </header>
            <ul className="r2-lane-cards">
              {lane.rows.map((r) => (
                <li key={r.name}>
                  <span className="r2-card">
                    <span className="r2-card-title">{r.name}</span>
                    <span className="r2-card-meta">
                      {r.role}  ·  {r.affiliation}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One Entry: its properties under the title, then its notes. */
export function EntryDocument() {
  return (
    <div className="r2-fp-page r2-page r2-fp-entry">
      <div className="r2-doc-head r2-page-head">
        <p className="r2-doc-eyebrow">
          <span className="r2-entry-collection">Characters</span>
        </p>
        <p className="r2-page-title r2-fp-page-title">Ada Marsh</p>
      </div>
      <section className="r2-props r2-props--entry">
        <div className="r2-props-head">
          <span className="r2-props-toggle">
            <ChevronDown {...ICON_SM} />
            <span>Properties</span>
            <span className="r2-props-count">· 3</span>
          </span>
          <span className="r2-props-edit">Edit</span>
        </div>
        <dl className="r2-props-list">
          <PropRow label="Role">
            <span className="r2-prop-input r2-fp-prop-plain">Protagonist</span>
          </PropRow>
          <PropRow label="Affiliation">
            <Relation names={["The house"]} />
          </PropRow>
          <PropRow label="Status">
            <Choice type="status" options={["Drafted"]} />
          </PropRow>
        </dl>
      </section>
      <div className="r2-fp-page-body">
        <p>
          Born on the island, the youngest of three. Left at nineteen without telling anyone, and came back twenty-two years later
          for the house, which she had not expected to want.
        </p>
        <p>
          She reads letters twice. The first time to know what they say; the second to know what they mean. She would call this
          caution. Tomas calls it waiting.
        </p>
      </div>
    </div>
  );
}
