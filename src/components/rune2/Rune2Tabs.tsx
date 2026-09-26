"use client";

import { useEffect, useRef } from "react";
import { PanelLeft, X } from "lucide-react";
import { MANUSCRIPT_TAB, useRune2Selection, type WorkingTab } from "./Rune2Selection";

// The working set: a quiet row of the objects the writer has open in tabs of
// their own (⌘/Ctrl-click or "Open in new tab" in the navigator). The row is
// part of the application frame and is always there, one tab or many; while
// the writer types it fades with the rest of the top chrome rather than
// disappearing. Tabs name canonical objects by id (see Rune2Selection); a
// label is always the object's current title. Overflow scrolls sideways —
// never a second row. When the navigator is retracted, the control that
// brings it back sits at the row's start.

function tabLabel(tab: WorkingTab): string {
  return tab.entry?.title ?? "Manuscript";
}

/** Where the tab's object sits, for its tooltip ("Book One / Chapter 3 / Scene 2"). */
function tabPath(tab: WorkingTab): string {
  if (!tab.entry) return "Manuscript";
  const trail =
    tab.entry.kind === "unplacedScene"
      ? ["Unplaced Scenes"]
      : tab.entry.kind === "workspacePage"
        ? ["Workspace", ...tab.entry.path.map((p) => p.title)]
        : tab.entry.path.map((p) => p.title);
  return [...trail, tab.entry.title].join(" / ");
}

export function Rune2Tabs() {
  const { tabs, activeTab, activateTab, closeTab, navCollapsed, toggleNav } = useRune2Selection();
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
      {navCollapsed && (
        <button
          type="button"
          className="r2-icon-button r2-tabs-nav-toggle"
          aria-label="Show navigator"
          title="Show navigator"
          onClick={toggleNav}
        >
          <PanelLeft size={14} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <ul ref={listRef} role="list">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          const label = tabLabel(tab);
          // An unnamed placed Scene is "Scene 2" of *some* Chapter: say which.
          const context =
            tab.entry?.kind === "scene" && !tab.entry.named ? tab.entry.path[tab.entry.path.length - 1]?.title : null;
          return (
            <li key={tab.key} className="r2-tab" data-tab={tab.key} data-active={active || undefined}>
              <button
                type="button"
                className="r2-tab-main"
                aria-current={active ? "page" : undefined}
                title={tabPath(tab)}
                onClick={() => activateTab(tab.key)}
                // Middle-click closes, as in any tabbed application.
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.key);
                  }
                }}
              >
                {context && <span className="r2-tab-context">{context} ·</span>}
                <span className="r2-tab-label">{label}</span>
              </button>
              <button
                type="button"
                className="r2-tab-close"
                aria-label={`Close ${tab.key === MANUSCRIPT_TAB ? "Manuscript" : label}`}
                title="Close tab"
                onClick={(e) => {
                  // detail 0: a keyboard press, not a pointer click.
                  refocus.current = e.detail === 0;
                  closeTab(tab.key);
                }}
              >
                <X size={13} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
