import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronRight, FileText, Layers, PanelLeft, Plus, Search } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";
import { Reveal } from "./Reveal";

// Section 2 of the landing page (front.css: "The manuscript"): the hero's
// promise made concrete. One statement, then the product as proof — the
// Project shell with a manuscript open: the navigator's Groups, Chapters and
// Scenes in reading order, Unplaced Scenes beneath them, and the Scene editor
// at the centre.
//
// The shell here is a static, faithful representation of the real one
// (components/rune2: ProjectNavigator, Rune2Tabs, Rune2Content, Rune2Writing,
// Rune2Editor), not the live components: those need a Project, a session and
// the selection context, none of which belong on a public page. It borrows the
// shell's own row, tab and title classes from rune2.css — the very same metrics
// and tokens the writer sees — so it cannot drift from the product in a way the
// product itself has not. It is inert: nothing here is a control.
//
// Only the manuscript is shown. The Workspace row that follows Unplaced Scenes
// in the real navigator is cropped away: this section is about the book.

const BASE_PAD = 6;
const INDENT = 16;
const ICONLESS_INSET = 19;

const PROJECT = "The Lantern Road";
const CHAPTER = "The Letters";
const SCENE = "Scene 2";

const PROSE = [
  "The letters came on the Thursday boat, three of them, tied with the grey string her mother had always used. Ada did not open them at the harbour. She carried them up the hill the way one carries something that might still be warm.",
  "By the time she reached the house the wind had turned. She set the letters on the table beside the lamp and left them there while she made tea, as if the ordinary tasks could be made to go first.",
  "The first was dated in March, which meant it had waited somewhere for the better part of a season. She read it standing, and then again sitting down, and the second reading was the one that counted.",
  "Outside, the ferry gave its long note and turned for the mainland, and the house was quiet in the particular way of a house that has just learned something.",
];

function pad(depth: number, iconless = false): CSSProperties {
  return { paddingLeft: BASE_PAD + depth * INDENT + (iconless ? ICONLESS_INSET : 0) };
}

function Disclosure({ open }: { open?: boolean }) {
  if (open === undefined) return <span className="r2-disclosure" />;
  return (
    <span className="r2-disclosure" data-open={open || undefined}>
      <ChevronRight {...ICON_SM_BOLD} />
    </span>
  );
}

function Row({
  depth,
  title,
  icon: Icon,
  open,
  selected,
  emphasis,
  muted,
}: {
  depth: number;
  title: string;
  icon?: typeof Layers;
  open?: boolean;
  selected?: boolean;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <li>
      <div
        className="r2-row"
        data-selected={selected || undefined}
        data-emphasis={emphasis || undefined}
        data-muted={muted || undefined}
        style={pad(depth, !Icon)}
      >
        <Disclosure open={open} />
        {Icon && <Icon className="r2-row-icon" {...ICON} />}
        <span className="r2-row-main">
          <span className="r2-row-label">{title}</span>
        </span>
      </div>
    </li>
  );
}

function RootRow({ label, count, children }: { label: string; count: string; children?: ReactNode }) {
  return (
    <li className="r2-lp-shot-section">
      <div className="r2-row r2-row--root" style={{ paddingLeft: BASE_PAD }}>
        <Disclosure open />
        <span className="r2-row-main">
          <span className="r2-row-label">{label}</span>
        </span>
        <span className="r2-row-count">{count}</span>
      </div>
      {children}
    </li>
  );
}

function Navigator() {
  return (
    <div className="r2-lp-shot-nav">
      <div className="r2-nav-header">
        <span className="r2-nav-project">
          <span className="r2-nav-project-title">{PROJECT}</span>
          <ChevronDown {...ICON_SM_BOLD} />
        </span>
        <span className="r2-icon-button">
          <Search {...ICON} />
        </span>
      </div>
      <div className="r2-lp-shot-tree">
        <ul>
          <RootRow label="Manuscript" count="41,208">
            <ul>
              <Row depth={1} title="Part One" icon={Layers} open emphasis />
              <ul>
                <Row depth={2} title="The Harbour" icon={FileText} open={false} />
                <Row depth={2} title={CHAPTER} icon={FileText} open />
                <ul>
                  <Row depth={3} title="The Ferry" />
                  <Row depth={3} title={SCENE} selected />
                  <Row depth={3} title="High Water" />
                </ul>
                <Row depth={2} title="A Quiet House" icon={FileText} open={false} />
              </ul>
              <Row depth={1} title="Part Two" icon={Layers} open={false} emphasis />
            </ul>
          </RootRow>
          <RootRow label="Unplaced Scenes" count="2,340">
            <ul>
              <Row depth={1} title="The old argument" />
              <Row depth={1} title="Untitled scene" muted />
            </ul>
          </RootRow>
        </ul>
      </div>
    </div>
  );
}

function Editor() {
  return (
    <div className="r2-lp-shot-content">
      <div className="r2-tabs">
        <span className="r2-icon-button r2-tabs-nav-toggle">
          <PanelLeft {...ICON} />
        </span>
        <ul>
          <li className="r2-tab" data-active>
            <span className="r2-tab-main">
              <span className="r2-tab-context">{CHAPTER} ·</span>
              <span className="r2-tab-label">{SCENE}</span>
            </span>
          </li>
        </ul>
        <span className="r2-icon-button r2-icon-button--xs r2-tabs-add">
          <Plus {...ICON} />
        </span>
      </div>
      <div className="r2-lp-shot-crumbs">
        <span className="r2-crumb-project">{PROJECT}</span>
        <span>Part One</span>
        <span className="r2-crumb-sep">/</span>
        <span>{CHAPTER}</span>
        <span className="r2-crumb-sep">/</span>
        <span className="r2-crumb-current">{SCENE}</span>
      </div>
      <div className="r2-lp-shot-doc">
        <div className="r2-doc-head">
          <p className="r2-doc-eyebrow">{CHAPTER}</p>
          <p className="r2-doc-title">{SCENE}</p>
        </div>
        <div className="r2-lp-shot-prose">
          {PROSE.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHOT_LABEL =
  "Sutura with a manuscript open. The navigator lists the manuscript in reading order: Part One holds the chapters The Harbour, The Letters and A Quiet House; The Letters is open to its scenes, with Scene 2 selected; Part Two follows. Beneath the manuscript, Unplaced Scenes keeps two scenes aside. The editor shows Scene 2 of The Letters, with its prose.";

export function FrontManuscript() {
  return (
    <section id="features" className="r2-lp-ms" aria-labelledby="lp-ms-title">
      <div className="r2-lp-ms-in">
        <Reveal className="r2-lp-ms-head">
          <p className="r2-lp-eyebrow">The manuscript</p>
          <h2 id="lp-ms-title" className="r2-lp-h2">
            One manuscript. In order.
          </h2>
          <p className="r2-lp-lede">
            Chapters, scenes and prose stay in one ordered manuscript, so you always know where the book is.
          </p>
        </Reveal>
        <Reveal className="r2-lp-ms-proof" delay>
          <div className="r2-lp-shot" role="img" aria-label={SHOT_LABEL}>
            <div className="r2-lp-shot-in" aria-hidden>
              <Navigator />
              <Editor />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
