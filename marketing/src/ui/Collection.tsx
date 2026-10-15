import type { ReactNode } from "react";
import { ArrowUpDown, Columns3, Ellipsis, Layers2, ListFilter, Plus, Rows3, Search, Table2, type LucideIcon } from "lucide-react";
import { ICON, ICON_SM } from "@/components/rune2/icons";

// A Collection's page (components/rune2/CollectionView.tsx), drawn: the title
// with its "Collection" eyebrow and context line, the View tabs and the
// View's toolbar (ViewControls), then the View — a Table (CollectionViewBodies:
// TableView: a Name column, one column per property, the "+" for another, and
// "New entry") or a Board (BoardView: a lane per option, cards with their
// other values on one line, "New" in each lane, "Add a column"). The broad
// geometry (.r2-broad) and every class are the app's.

export type CollectionColumn = { id: string; name: string; type: "text" | "select" | "status" };
export type CollectionRow = { id: string; name: string; values: Record<string, string> };

export function CollectionPage({
  title,
  columns,
  rows,
  widths,
}: {
  title: string;
  columns: CollectionColumn[];
  rows: CollectionRow[];
  /** Column widths, px: the Name column first (the app keeps a View's widths). */
  widths: number[];
}) {
  return (
    <CollectionFrame
      title={title}
      entries={rows.length}
      properties={columns.length}
      view="table"
      views={[{ name: "Table", icon: Table2 }]}
      tools={[
        { icon: ListFilter, label: "Filter" },
        { icon: ArrowUpDown, label: "Sort" },
        { icon: Search },
        { icon: Rows3, label: "Columns" },
        { icon: Ellipsis },
      ]}
    >
      <div className="r2-collection-body">
        <div className="r2-table-wrap">
          <table className="r2-table" style={{ width: widths.reduce((a, b) => a + b, 0) + 40 }}>
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="r2-table-title-col">
                  <span className="r2-table-head">Name</span>
                </th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" data-type={c.type}>
                    <button type="button" tabIndex={-1} className="r2-table-head r2-table-head--button">
                      {c.name}
                    </button>
                  </th>
                ))}
                <th scope="col" className="r2-table-add">
                  <button type="button" tabIndex={-1} className="r2-table-add-prop">
                    <Plus {...ICON} aria-hidden />
                    <span>Add property</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="r2-table-row">
                  <th scope="row" className="r2-table-title">
                    <button type="button" tabIndex={-1} data-entry-open="">
                      {r.name}
                    </button>
                  </th>
                  {columns.map((c) => (
                    <td key={c.id} data-type={c.type} className="r2-prop-value">
                      {c.type === "text" ? (
                        <textarea className="r2-prop-input" rows={1} readOnly value={r.values[c.id]} />
                      ) : (
                        <div className="r2-prop-choice">
                          <button type="button" tabIndex={-1} className="r2-prop-button">
                            <span className="r2-prop-options" data-type={c.type}>
                              <span className="r2-prop-option">{r.values[c.id]}</span>
                            </span>
                          </button>
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="r2-table-filler" aria-hidden />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" tabIndex={-1} className="r2-entry-add">
          <Plus {...ICON} aria-hidden />
          New entry
        </button>
      </div>
    </CollectionFrame>
  );
}

type ViewTabSpec = { name: string; icon: LucideIcon };
type ToolSpec = { icon: LucideIcon; label?: string; active?: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The page around a View: the title, its context line, the View tabs and the toolbar. */
function CollectionFrame({
  title,
  entries,
  properties,
  view,
  views,
  active = 0,
  tools,
  children,
}: {
  title: string;
  entries: number;
  properties: number;
  /** The shown View's type (data-view). */
  view: "table" | "board";
  views: ViewTabSpec[];
  /** Which of `views` is shown. */
  active?: number;
  tools: ToolSpec[];
  children: ReactNode;
}) {
  return (
    <div className="r2-writing">
      <div className="r2-doc r2-page r2-collection r2-broad" data-view={view}>
        <header className="r2-doc-head r2-page-head">
          <p className="r2-doc-eyebrow">Collection</p>
          <textarea className="r2-page-title" rows={1} readOnly value={title} />
          <p className="r2-collection-context">
            <span>{plural(entries, "entry", "entries")}</span>
            <span>{plural(properties, "property", "properties")}</span>
          </p>
        </header>

        <div className="r2-collection-bar" data-tabs>
          <div className="r2-view-tabs">
            <div className="r2-view-strip">
              <div className="r2-view-switcher" role="tablist">
                {views.map(({ name, icon: Icon }, i) => (
                  <button key={name} type="button" tabIndex={-1} className="r2-view-tab" role="tab" aria-selected={i === active}>
                    <Icon {...ICON_SM} aria-hidden className="r2-view-tab-icon" />
                    <span className="r2-view-tab-name">{name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="r2-view-add">
              <button type="button" tabIndex={-1} className="r2-view-tab r2-view-tab--add">
                <Plus {...ICON} aria-hidden />
              </button>
            </div>
          </div>
          <div className="r2-toolbar" role="group">
            {tools.map(({ icon: Icon, label, active: on }, i) => (
              <div key={label ?? i} className="r2-tool-wrap">
                <button type="button" tabIndex={-1} className="r2-tool" data-active={on || undefined}>
                  <Icon {...ICON} aria-hidden />
                  {label && <span className="r2-tool-label">{label}</span>}
                </button>
              </div>
            ))}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export type BoardCard = { name: string; meta: string[] };
export type BoardLaneSpec = { name: string; cards: BoardCard[] };

/**
 * A Collection on its Board View, grouped by a Select: the Table and Board
 * tabs (Board shown), the Board's toolbar (Columns · <property> active), and
 * the lanes. `scroll` is the board's own horizontal scroll, in px — the
 * writer moving across lanes that run past the window.
 */
export function CollectionBoardPage({
  title,
  groupBy,
  properties,
  lanes,
  scroll = 0,
  hover,
}: {
  title: string;
  groupBy: string;
  properties: number;
  lanes: BoardLaneSpec[];
  scroll?: number;
  /** The card the pointer is over (drawn with the app's :hover ring). */
  hover?: string;
}) {
  // The board is the app's overflow-x scroller. Its scroll is drawn, not set
  // (a frame must not depend on the element's scroll state): the lanes shift
  // inside the board's clip exactly as scrolling would move them.
  const scrolled = scroll ? { transform: `translateX(${-scroll}px)` } : undefined;
  const entries = lanes.reduce((n, l) => n + l.cards.length, 0);
  return (
    <CollectionFrame
      title={title}
      entries={entries}
      properties={properties}
      view="board"
      views={[
        { name: "Table", icon: Table2 },
        { name: "Board", icon: Columns3 },
      ]}
      active={1}
      tools={[
        { icon: ListFilter, label: "Filter" },
        { icon: ArrowUpDown, label: "Sort" },
        { icon: Layers2, label: `Columns · ${groupBy}`, active: true },
        { icon: Search },
        { icon: Rows3, label: "On cards" },
        { icon: Ellipsis },
      ]}
    >
      <div className="r2-collection-body">
        <div className="r2-board" role="group" aria-label={`Board, by ${groupBy}`}>
          {lanes.map((lane) => (
            <section key={lane.name} className="r2-lane" aria-label={lane.name} style={scrolled}>
              <header className="r2-lane-head">
                <span className="r2-lane-name">
                  <span className="r2-prop-options" data-type="select">
                    <span className="r2-prop-option">{lane.name}</span>
                  </span>
                </span>
                <span className="r2-lane-count">{lane.cards.length}</span>
              </header>
              <ul className="r2-lane-cards">
                {lane.cards.map((card) => (
                  <li key={card.name}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="r2-card"
                      data-entry-open=""
                      style={
                        hover === card.name
                          ? { boxShadow: "0 0 0 1px var(--r2-border-strong), 0 2px 6px -2px rgba(var(--r2-palette-shadow) / 0.14)" }
                          : undefined
                      }
                    >
                      <span className="r2-card-title">{card.name}</span>
                      {card.meta.length > 0 && <span className="r2-card-meta">{card.meta.join("  ·  ")}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" tabIndex={-1} className="r2-lane-add">
                <Plus {...ICON} aria-hidden />
                New
              </button>
            </section>
          ))}
          <div className="r2-lane r2-lane--new" style={scrolled}>
            <button type="button" tabIndex={-1} className="r2-lane-add">
              <Plus {...ICON} aria-hidden />
              Add a column
            </button>
          </div>
        </div>
      </div>
    </CollectionFrame>
  );
}
