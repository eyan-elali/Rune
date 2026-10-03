"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PanelLeft, Plus, X } from "lucide-react";
import { ICON } from "./icons";
import { Tooltip } from "./Tooltip";
import { isWorkspaceKind } from "@/lib/rune2/navigatorModel";
import { MANUSCRIPT_TAB, useRune2Selection, type WorkingTab } from "./Rune2Selection";

// The working set: a quiet row of the objects the writer has open in tabs of
// their own (⌘/Ctrl-click or "Open in new tab" in the navigator). The row is
// part of the application frame and is always there, one tab or many; while
// the writer types it fades with the rest of the top chrome rather than
// disappearing. Tabs name canonical objects by id (see Rune2Selection); a
// label is always the object's current title. Every tab is one width
// (rune2.css, --r2-tab-width): a title that does not fit is cut with an
// ellipsis and given in full by the tooltip. Overflow scrolls sideways —
// never a second row.
//
// The row's two controls (BC-C closeout): at its start, the one control that
// hides and shows the navigator — always there, in the same place whether the
// navigator is open or not; after the last tab, "+" (Open another), which
// opens Project Search to add an object to the working set in a tab of its
// own. Both fade with the rest of the chrome while the writer types.

function tabLabel(tab: WorkingTab): string {
  return tab.entry?.title ?? "Manuscript";
}

/**
 * Where the tab's object sits, for its tooltip ("Book One / Chapter 3 /
 * Scene 2"). Null when the label already says it all.
 */
function tabPath(tab: WorkingTab): string | null {
  if (!tab.entry) return null;
  const trail =
    tab.entry.kind === "unplacedScene"
      ? ["Unplaced Scenes"]
      : isWorkspaceKind(tab.entry.kind)
        ? ["Workspace", ...tab.entry.path.map((p) => p.title)]
        : tab.entry.path.map((p) => p.title);
  return trail.length > 0 ? [...trail, tab.entry.title].join(" / ") : null;
}

export function Rune2Tabs() {
  const { tabs, activeTab, activateTab, closeTab, navCollapsed, toggleNav, openSearchToAdd } = useRune2Selection();
  const listRef = useRef<HTMLUListElement>(null);
  // A tab closed from the keyboard hands focus to the tab that takes its place.
  const refocus = useRef(false);

  // Keep the active tab in view when it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(activeTab)}"] .r2-tab-main`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (refocus.current) {
      refocus.current = false;
      el?.focus();
    }
  }, [activeTab, tabs.length]);

  return (
    <nav className="r2-tabs" aria-label="Open tabs">
      <Tooltip label={navCollapsed ? "Show navigator" : "Hide navigator"}>
        <button
          type="button"
          className="r2-icon-button r2-tabs-nav-toggle"
          aria-label={navCollapsed ? "Show navigator" : "Hide navigator"}
          aria-expanded={!navCollapsed}
          onClick={toggleNav}
        >
          <PanelLeft {...ICON} aria-hidden />
        </button>
      </Tooltip>
      <ul ref={listRef} role="list">
        {tabs.map((tab) => (
          <Tab
            key={tab.key}
            tab={tab}
            active={tab.key === activeTab}
            onActivate={() => activateTab(tab.key)}
            onClose={(fromKeyboard) => {
              refocus.current = fromKeyboard;
              closeTab(tab.key);
            }}
          />
        ))}
      </ul>
      <Tooltip label="Open another">
        <button
          type="button"
          className="r2-icon-button r2-icon-button--xs r2-tabs-add"
          aria-label="Open another in a new tab"
          aria-haspopup="dialog"
          onClick={openSearchToAdd}
        >
          <Plus {...ICON} aria-hidden />
        </button>
      </Tooltip>
    </nav>
  );
}

function Tab({
  tab,
  active,
  onActivate,
  onClose,
}: {
  tab: WorkingTab;
  active: boolean;
  onActivate: () => void;
  onClose: (fromKeyboard: boolean) => void;
}) {
  const label = tabLabel(tab);
  // An unnamed placed Scene is "Scene 2" of *some* Chapter: say which.
  const context = tab.entry?.kind === "scene" && !tab.entry.named ? tab.entry.path[tab.entry.path.length - 1]?.title : null;
  const path = tabPath(tab);
  // The tab is a fixed width, so a long title is cut: the tooltip then gives
  // the whole of it. Measured after each change of title (the width itself
  // never changes), so a tab that fits shows no tooltip for its own text.
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth + 1);
    // (The active tab's label is a little heavier, so it is measured again.)
  }, [label, context, active]);
  const tip = path ?? (truncated ? (context ? `${context} · ${label}` : label) : null);

  return (
    <li className="r2-tab" data-tab={tab.key} data-active={active || undefined}>
      <Tooltip label={tip} describes={path !== null}>
        <button
          type="button"
          className="r2-tab-main"
          aria-current={active ? "page" : undefined}
          onClick={onActivate}
          // Middle-click closes, as in any tabbed application.
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onClose(false);
            }
          }}
        >
          {context && <span className="r2-tab-context">{context} ·</span>}
          <span ref={labelRef} className="r2-tab-label">
            {label}
          </span>
        </button>
      </Tooltip>
      <Tooltip label="Close tab">
        <button
          type="button"
          className="r2-tab-close"
          aria-label={`Close ${tab.key === MANUSCRIPT_TAB ? "Manuscript" : label}`}
          // detail 0: a keyboard press, not a pointer click.
          onClick={(e) => onClose(e.detail === 0)}
        >
          <X {...ICON} aria-hidden />
        </button>
      </Tooltip>
    </li>
  );
}
