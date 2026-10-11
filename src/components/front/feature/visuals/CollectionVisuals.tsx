import type { CSSProperties } from "react";
import { ChevronDown, Columns3, GitCommitHorizontal, Plus, Table2 } from "lucide-react";
import { ICON_SM } from "@/components/rune2/icons";
import { Choice, ContextBar, Options, PropRow, Relation, Tabs } from "./shell";

// The Collections page's drawings, by the product's own classes. A
// Collection is read through a View (CollectionView, ViewControls,
// CollectionViewBodies, TimelineView; rune2.css: "Collection head", "The
// bar", "Table", "Board", "Timeline"): the title in the sans, one quiet line
// of what it holds, the Views' tabs on a hairline, then the active View flat
// on the page — a Table that is structured, not a spreadsheet; a Board of
// lanes; a Timeline of points along a date. An Entry (WorkspacePageEditor
// with ItemProperties) is a Page with a compact region of facts under its
// title, parted from the body by one hairline: a document with structured
// metadata attached, not a database row. One cast, read four ways.

/** A column's width, as the View saves it (CollectionViewBodies: columnWidth); the stylesheet reads it. */
export function col(width: number): CSSProperties {
  return { "--fp-col": `${width}px` } as CSSProperties;
}

type Row = { name: string; role: string; affiliation: string; status: string; first: string; year: number };
const CHARACTERS: Row[] = [
  { name: "Ada Marsh", role: "Protagonist", affiliation: "The house", status: "Drafted", first: "1.1 Arrival", year: 1983 },
  { name: "Tomas Reyes", role: "Ferryman", affiliation: "The harbour", status: "Drafted", first: "1.2 The ferryman", year: 1989 },
  { name: "Mrs. Hale", role: "Neighbour", affiliation: "The village", status: "Sketched", first: "2.3 High Water", year: 1968 },
  { name: "Ines Marsh", role: "The mother", affiliation: "The house", status: "Revised", first: "2.2 The Thursday Boat", year: 1961 },
  { name: "Daniel Croft", role: "Solicitor", affiliation: "The mainland", status: "Sketched", first: "3.1 The reading", year: 2004 },
  { name: "Agnes Doyle", role: "Postmistress", affiliation: "The village", status: "Drafted", first: "1.2 The ferryman", year: 1972 },
  { name: "Peter Marsh", role: "The brother", affiliation: "The mainland", status: "Sketched", first: "3.2 The call", year: 1985 },
  { name: "Father Lyle", role: "Priest", affiliation: "The village", status: "Revised", first: "2.3 High Water", year: 1979 },
];

type ViewKind = "table" | "board" | "timeline";

function ViewBar({ active }: { active: ViewKind }) {
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
            <span className="r2-view-tab" aria-selected={active === "timeline"}>
              <GitCommitHorizontal {...ICON_SM} className="r2-view-tab-icon" />
              <span className="r2-view-tab-name">Arrivals</span>
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

function CollectionHead({ active }: { active: ViewKind }) {
  return (
    <>
      <div className="r2-doc-head r2-page-head">
        <p className="r2-doc-eyebrow">Collection</p>
        <p className="r2-page-title r2-fp-page-title">Characters</p>
        <p className="r2-collection-context">
          <span>8 entries</span>
          <span>5 properties</span>
          <span>3 views</span>
        </p>
      </div>
      <ViewBar active={active} />
    </>
  );
}

/** The Collection read as a Table. */
export function CollectionTable() {
  return (
    <div className="r2-fp-shell r2-fp-shell--broad r2-fp-shell--table">
      <Tabs label="Characters" />
      <ContextBar crumbs={["Workspace", "Characters"]} actions="workspace" />
      <div className="r2-fp-broad r2-collection">
        <CollectionHead active="table" />
        <div className="r2-table-wrap">
          <table className="r2-table r2-fp-table">
            <thead>
              <tr>
                <th scope="col" className="r2-table-title-col" style={col(168)}>
                  <span className="r2-table-head">Name</span>
                </th>
                <th scope="col" data-type="text" style={col(124)}>
                  <span className="r2-table-head">Role</span>
                </th>
                <th scope="col" data-type="relationship" style={col(136)}>
                  <span className="r2-table-head">Affiliation</span>
                </th>
                <th scope="col" data-type="relationship" data-wide="" style={col(196)}>
                  <span className="r2-table-head">First appears</span>
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
                  <td data-type="relationship" data-wide="" className="r2-prop-value">
                    <Relation names={[r.first]} />
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

// ── The Timeline ────────────────────────────────────────────────────────
// The same Entries along a date property, "Came to the island", in lanes by
// Affiliation (TimelineView: a property axis with group_by). The product
// works these measures out from the values; here they are the drawing's:
// a rail for the lane names, a year's width along the axis, a tick each
// five years and a major one each decade, each Entry a mark at its year
// with its name and its role beneath, stacking into a second row where two
// would overlap, as the product packs them.

const RAIL = 168;
const AXIS_PAD = 20;
const YEAR = 17;
const FIRST_YEAR = 1958;
const LAST_YEAR = 2008;
const ITEM_WIDTH = 176;
const MARK = 9;
const ROW = 42;
const LANE_PAD = 8;
const HEADER = 34;
const LANES = ["The house", "The village", "The harbour", "The mainland"];

function yearX(year: number) {
  return RAIL + AXIS_PAD + (year - FIRST_YEAR) * YEAR;
}

/** The same Entries, read as a Timeline by the year each came to the island, in lanes by Affiliation. */
export function CollectionTimeline() {
  const ticks: number[] = [];
  for (let y = 1960; y <= LAST_YEAR; y += 5) ticks.push(y);
  const width = yearX(LAST_YEAR) + AXIS_PAD + 120;
  const lanes = LANES.map((name) => {
    const rows = CHARACTERS.filter((r) => r.affiliation === name).sort((a, b) => a.year - b.year);
    // Pack into rows: a marker goes on the first row whose last marker ends before it starts.
    const ends: number[] = [];
    const placed = rows.map((r) => {
      const x = yearX(r.year) - MARK;
      let row = ends.findIndex((end) => end <= x);
      if (row === -1) row = ends.length;
      ends[row] = x + ITEM_WIDTH;
      return { ...r, x, row };
    });
    return { name, placed, rows: Math.max(1, ends.length) };
  });
  return (
    <div className="r2-fp-shell r2-fp-shell--broad r2-fp-shell--timeline">
      <Tabs label="Characters" />
      <ContextBar crumbs={["Workspace", "Characters"]} actions="workspace" />
      <div className="r2-fp-broad r2-collection">
        <CollectionHead active="timeline" />
        <div className="r2-timeline r2-fp-timeline" data-rail="" style={{ "--r2-timeline-rail": `${RAIL}px` } as CSSProperties}>
          <div className="r2-timeline-scroll">
            <div className="r2-timeline-track" style={{ width }}>
              <div className="r2-timeline-rules" style={{ top: HEADER }}>
                {ticks.map((y) => (
                  <span key={y} className="r2-timeline-rule" data-major={y % 10 === 0 || undefined} style={{ left: yearX(y) }} />
                ))}
              </div>
              <div className="r2-timeline-axis" style={{ height: HEADER }}>
                <div className="r2-timeline-corner" style={{ width: RAIL, height: HEADER }}>
                  <span className="r2-timeline-axis-name">
                    Came to the island <span className="r2-timeline-axis-kind">date</span>
                  </span>
                </div>
                {ticks.map((y) => (
                  <span key={y} className="r2-timeline-tick" data-major={y % 10 === 0 || undefined} style={{ left: yearX(y) }}>
                    {y}
                  </span>
                ))}
              </div>
              {lanes.map((lane) => (
                <section key={lane.name} className="r2-timeline-lane" style={{ height: lane.rows * ROW + LANE_PAD * 2 }}>
                  <header className="r2-timeline-rail" style={{ width: RAIL }}>
                    <span className="r2-timeline-lane-name">{lane.name}</span>
                    <span className="r2-timeline-lane-count">{lane.placed.length}</span>
                  </header>
                  <div className="r2-timeline-rows" style={{ top: LANE_PAD }}>
                    {lane.placed.map((r) => (
                      <span key={r.name} className="r2-timeline-item" data-meta="" style={{ left: r.x, top: r.row * ROW, width: ITEM_WIDTH }}>
                        <span className="r2-timeline-mark" />
                        <span className="r2-timeline-item-title">{r.name}</span>
                        <span className="r2-timeline-item-meta">
                          {r.year}  ·  {r.role}
                        </span>
                      </span>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
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
            <span className="r2-props-count">· 5</span>
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
          <PropRow label="First appears">
            <Relation names={["1.1 Arrival"]} />
          </PropRow>
          <PropRow label="Came to the island">
            <span className="r2-prop-input r2-fp-prop-plain">1983</span>
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
