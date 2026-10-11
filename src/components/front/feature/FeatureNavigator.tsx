"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";
import { FeatureLink } from "./FeatureLink";
import { useFeatureShell } from "./FeatureShell";
import { FEATURE_NAV } from "./featureNav";

// The feature shell's navigator: the Project navigator's own classes
// (ProjectNavigator; rune2.css: "Navigator", "Rows") — the header's
// project-style title, the section roots with their open disclosure, the
// rows with an icon and the selected one's wash — holding, instead of a
// book, the places a visitor can read: Explore Sutura; Features; Principles;
// and at the foot, the way back to the front door. Every row is a link
// (FeatureLink: soft inside the peek, full on a page of its own); the
// current page's row carries aria-current. It stands at the left on a wide
// screen; a narrower one gets the switcher (FeatureSwitcher) instead.

const BASE_PAD = 6;
const INDENT = 16;

export function FeatureNavigator() {
  const { current, mode } = useFeatureShell();
  return (
    <nav className="r2-nav r2-fp-nav" aria-label="Explore Sutura">
      <div className="r2-nav-header">
        <span className="r2-nav-project r2-fp-nav-title">
          <span className="r2-nav-project-title">Explore Sutura</span>
        </span>
      </div>
      <div className="r2-nav-scroll">
        <ul className="r2-fp-nav-tree">
          {FEATURE_NAV.map((group, g) => (
            <li key={group.label} className={g > 0 ? "r2-nav-section" : undefined}>
              <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
                <span className="r2-disclosure" data-open aria-hidden>
                  <ChevronRight {...ICON_SM_BOLD} />
                </span>
                <span className="r2-row-main" id={`fp-nav-${g}`}>
                  <span className="r2-row-label">{group.label}</span>
                </span>
              </div>
              <ul aria-labelledby={`fp-nav-${g}`}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = item.slug === current;
                  return (
                    <li key={item.slug}>
                      <div className="r2-row" data-selected={selected || undefined} style={{ paddingLeft: BASE_PAD + INDENT }}>
                        <span className="r2-disclosure" aria-hidden />
                        <Icon className="r2-row-icon" {...ICON} aria-hidden />
                        <FeatureLink href={item.href} className="r2-row-main" aria-current={selected ? "page" : undefined}>
                          <span className="r2-row-label">{item.title}</span>
                        </FeatureLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div className="r2-nav-footer">
        <FeatureLink href="/" className="r2-row r2-fp-nav-home">
          <ArrowLeft className="r2-row-icon" {...ICON} aria-hidden />
          <span className="r2-row-label">{mode === "peek" ? "Back to the front door" : "Back to home"}</span>
        </FeatureLink>
      </div>
    </nav>
  );
}
