import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE } from "../../../foundation/time";
import { ELIAS, ELIAS_BODY, WORKSPACE } from "../../../data/salt-house";
import { PLANS, SHELL, ShellFor, Window, on, type Plan } from "../Keyframes";
import { FILM } from "../frames";
import { Surrogate, TextCarrier, type Path } from "./Carrier";
import { CAMERA, CARRY, SETTLE, cameraAbout, center, clamp01, lerp, span, type Rect } from "./motion";
import type { Measured, Probes } from "./probe";
import { Document, Environment, Whole, resolveAt, scoped } from "./layers";
import { Field, LightRoot, frameScope, type Cue, type Phase, type StudyDef } from "./Study";
import clickSound from "../../../audio/click.wav";
import settleSound from "../../../audio/settle.wav";

// STUDY D — the Characters Board → Elias Vale's Entry. OBJECT EXPANSION.
//
// Authentic source: the Characters Collection on its Board View (by
// Whereabouts), wide — the whole window, three lanes, eight characters.
// Authentic destination: frame 11 (Elias Vale's Entry), at a medium framing.
// The semantic object is Elias Vale: a Board card is a representation of the
// Entry (architecture §21) — its second line is the Entry's own property
// values (Role · Last seen), and its lane is the Entry's Whereabouts.
//
// The idea: the card does not open onto the Entry; the card becomes it.
// Scale runs WIDE (the Board in its workspace) → MEDIUM (the Missing lane) →
// CLOSE (the card, at the click) → MEDIUM (the Entry). On the click the rest
// of the Board steps back in place, and only what the card carries travels:
// its name into the title, "Brother" into Role, "Greyhaven ferry, 3 March"
// into Last seen. (Its lane, "Missing", is his Whereabouts — carried in a
// first cut, but its path must cross Role's, so it resolves in place.) The
// card's surface grows into the region those now occupy — the Entry's head
// and properties — and settles into the page (its edge and lift dissolve).
// The Collection's title steps up into the Entry's eyebrow. Only then does
// the rest of the Entry resolve around him: labels, the other values, notes.

const CURSOR = 30 / 20;
const WIDE_S = 1736 / SHELL.width;

// ── The event grid (seconds) ───────────────────────────────────────────────
const T = {
  toMissing: 0.5, // the camera moves toward the Missing lane: gentle, horizontal, unhurried
  toMissingDur: 1.4,
  reach: 1.2, // the pointer goes to Elias
  hover: 1.86,
  close: 1.7, // the last approach, onto the card
  click: 2.16,
  recede: 2.16, // the Board steps back in place
  recedeDur: 0.3,
  carry: 2.24, // the card's name leaves first…
  carryDur: 1.05,
  values: 0.06, // …its values a beat behind
  pull: 2.28, // the camera opens to the Entry, pivoting on the card
  pullDur: 1.55,
  chrome: 2.5, // tab, trail, selection: the Entry's, in place
  labels: 2.9, // the Entry's labels and other values resolve around him
  body: 3.14,
  pointer: 3.05, // the pointer leaves for rest before the Entry's links resolve under it
  end: 5.0,
};

// ── Authentic states ───────────────────────────────────────────────────────

const BOARD: Plan = { ...PLANS.collection, cursor: undefined, hoverCard: undefined };
const ENTRY: Plan = { ...PLANS.entry, cursor: undefined };

const probes = [
  {
    id: "board",
    node: (
      <Window>
        <ShellFor plan={BOARD} />
      </Window>
    ),
    anchors: [
      { key: "card", selector: ".r2-card", mode: "box" as const, text: ELIAS.title },
      { key: "name", selector: ".r2-card-title", text: ELIAS.title },
      { key: "role", selector: ".r2-card-meta", text: "Brother" },
      { key: "seen", selector: ".r2-card-meta", text: "Greyhaven ferry, 3 March" },
      { key: "lane", selector: ".r2-lane", mode: "box" as const, text: "Missing" },
      { key: "collection", selector: ".r2-page-title", mode: "field" as const, text: WORKSPACE.characters.title },
    ],
  },
  {
    id: "entry",
    node: (
      <Window>
        <ShellFor plan={ENTRY} />
      </Window>
    ),
    anchors: [
      { key: "name", selector: ".r2-page-title", mode: "field" as const, text: ELIAS.title },
      { key: "role", selector: ".r2-prop-option", text: "Brother" },
      { key: "seen", selector: ".r2-prop-input", mode: "field" as const, text: "Greyhaven ferry" },
      { key: "collection", selector: ".r2-entry-collection", text: WORKSPACE.characters.title },
      { key: "props", selector: ".r2-props--entry", mode: "box" as const },
    ],
  },
];

/** What the card carries: [board anchor, entry anchor, text, delay]. */
const CARRIED = [
  { key: "name", text: ELIAS.title, delay: 0 },
  { key: "role", text: "Brother", delay: T.values },
  { key: "seen", text: "Greyhaven ferry, 3 March", delay: T.values + 0.05 },
] as const;
const PATH: Path = { kind: "arc", lift: 0.06 };

// ── The camera: wide → medium → close → medium ─────────────────────────────

function cameraAt(t: number, m: Probes): CameraState {
  const card = m.board.card.box;
  const lane = m.board.lane.box;
  const C = center(card);
  const WIDE = on(SHELL.width / 2, SHELL.height / 2, WIDE_S, FILM.width / 2, FILM.height / 2 + 6);
  const MEDIUM = on(center(lane).x, card.y + 150, 1.72);
  const CLOSE = on(C.x, C.y + 24, 2.15);
  const ENTRY_CAM = on(870, 404, 1.72);
  const a = cameraAbout(WIDE, MEDIUM, center(lane), span(t, T.toMissing, T.toMissingDur, CAMERA));
  const b = cameraAbout(a, CLOSE, C, span(t, T.close, T.click - T.close + 0.04, CAMERA));
  return cameraAbout(b, ENTRY_CAM, C, span(t, T.pull, T.pullDur, CAMERA));
}

// ── The frame ──────────────────────────────────────────────────────────────

/** The Entry's head and properties: the region the card's own contents land in. */
const regionOf = (m: Probes): Rect => {
  const name = m.entry.name;
  const props = m.entry.props.box;
  const top = name.text.cy - name.style.lineHeight / 2 - 14;
  return { x: props.x - 16, y: top, w: props.w + 32, h: props.y + props.h + 8 - top };
};

/** A carried run, as it travels: the board's representation → the Entry's. */
function carried(m: Probes, key: (typeof CARRIED)[number]["key"]): { from: Measured; to: Measured } {
  return { from: m.board[key], to: m.entry[key] };
}

function frame(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cameraAt(t, m);
  const pCard = span(t, T.carry, T.carryDur, CARRY);
  const moving = t >= T.carry && pCard < 1;
  const landed = (delay: number) => span(t, T.carry + delay, T.carryDur, CARRY) >= 1;

  // The world responds: the Board steps back in place (nothing slides).
  const board = 1 - span(t, T.recede, T.recedeDur, EASE);
  const away = t >= T.click + 0.02;
  const srcCss = scoped(`${scope}-src`, {
    ".r2-board .r2-lane, .r2-collection-bar, .r2-collection-context, .r2-doc-eyebrow": `opacity: ${board};`,
    // The card and its lane's option leave the Board with the click: what they carry travels from here.
    ...(away
      ? {
          ".r2-lane:nth-child(2) .r2-lane-cards > li:first-child .r2-card": "visibility: hidden;",
          ".r2-page-title": "visibility: hidden;",
        }
      : {}),
  });

  // The environment settles: the Entry's tab, trail and selection, in place (text swaps in sequence, never overlapping).
  const chrome = span(t, T.chrome, 0.34, EASE);
  const oldText = 1 - span(t, T.chrome, 0.12, EASE);
  const newText = span(t, T.chrome + 0.14, 0.2, EASE);
  const SWAPPED = ".r2-contextbar nav, .r2-contextbar-actions > .r2-action:first-child";
  const envCss = scoped(`${scope}-env`, { [SWAPPED]: `opacity: ${chrome > 0 ? Math.min(1, newText / chrome) : 0};` });
  const srcText = scoped(`${scope}-src`, { [SWAPPED]: `opacity: ${oldText};` });

  // The Entry's document: what he carried, then what resolves around him.
  const rows = ELIAS.properties.map((p, i) => ({ name: p.name, n: i + 1 }));
  const carriedRow: Record<string, number> = { Role: T.values, "Last seen": T.values + 0.05 };
  let order = 0;
  const docRules: Record<string, string> = {
    ".r2-page-title": `visibility: ${landed(0) ? "visible" : "hidden"} !important;`,
    ".r2-entry-collection, .r2-entry-collection *": `visibility: ${span(t, T.carry, 0.8, CARRY) >= 1 ? "visible" : "hidden"} !important;`,
    ".r2-props-head": `opacity: ${resolveAt(t, T.labels, order++, 0.05, 0.3, SETTLE)};`,
  };
  for (const r of rows) {
    const label = resolveAt(t, T.labels, order++, 0.05, 0.3, SETTLE);
    docRules[`.r2-props-list > .r2-prop:nth-child(${r.n}) .r2-prop-label`] = `opacity: ${label};`;
    const delay = carriedRow[r.name];
    const value = `.r2-props-list > .r2-prop:nth-child(${r.n}) .r2-prop-value`;
    // Whereabouts was the card's lane, not its text: it resolves in place as the card settles — first of the rest.
    if (r.name === "Whereabouts") docRules[value] = `opacity: ${span(t, T.carry + T.carryDur - 0.2, 0.3, SETTLE)};`;
    else if (delay === undefined) docRules[value] = `opacity: ${label};`;
    // (The document layer sets every descendant visible: a carried value hides itself and all it holds.)
    else docRules[`${value}, ${value} *`] = `visibility: ${landed(delay) ? "visible" : "hidden"} !important;`;
  }
  ELIAS_BODY.forEach((_, i) => {
    docRules[`.r2-page-body .ProseMirror > *:nth-child(${i + 1})`] = `opacity: ${resolveAt(t, T.body, i, 0.06, 0.34, SETTLE)};`;
  });
  // The hairline parting facts from notes arrives with the labels.
  if (t < T.labels + 0.2) docRules[".r2-props--entry"] = "border-bottom-color: transparent;";
  const docCss = scoped(`${scope}-doc`, docRules);

  // The card's surface → the Entry's head and properties: it grows, then settles into the page.
  const card = m.board.card.box;
  const region = regionOf(m);
  // It holds what it carries until they are nearly home, then its edge and lift dissolve into the page.
  const settle = span(pCard, 0.6, 0.4, SETTLE);

  // The collection's title steps up into the Entry's eyebrow (secondary: shorter, a little later in reading).
  const pColl = span(t, T.carry, 0.8, CARRY);

  // The pointer: from rest onto Elias; it stays where it clicked, then comes to rest beside the Entry.
  const rest0 = { x: 1180, y: 600 };
  const onCard = { x: card.x + card.w * 0.72, y: card.y + card.h * 0.58 };
  const rest1 = { x: 1420, y: 560 };
  const p1 = span(t, T.reach, T.hover - T.reach, EASE);
  const p2 = span(t, T.pointer, 0.55, EASE);
  const ptr = { x: lerp(lerp(rest0.x, onCard.x, p1), rest1.x, p2), y: lerp(lerp(rest0.y, onCard.y, p1), rest1.y, p2) };
  const hoverOn = t >= T.hover && !away;
  const boardPlan: Plan = { ...BOARD, hoverCard: hoverOn ? ELIAS.title : undefined };

  return (
    <Field>
      <Camera state={cam}>
        {chrome < 1 && <Whole scope={`${scope}-src`} plan={boardPlan} css={srcCss + srcText} />}
        <Environment scope={`${scope}-env`} plan={ENTRY} css={envCss} opacity={chrome} />
        {/* FILM-ONLY: the card's surface becoming the Entry's head — growing with what it carries, then settling into the page. */}
        {moving && (
          <LightRoot>
            <Surrogate
              from={{ rect: card, radius: 6, background: "var(--r2-surface-raised)", shadow: "0 0 0 1px var(--r2-border-strong), 0 2px 6px -2px rgba(var(--r2-palette-shadow) / 0.14)" }}
              to={{ rect: region, radius: 10, background: "var(--r2-bg)" }}
              p={pCard}
              fill={settle}
            />
          </LightRoot>
        )}
        {t >= T.carry && <Document scope={`${scope}-doc`} plan={ENTRY} css={docCss} />}
        {/* FILM-ONLY: what the card carries — name, values, its lane's option — into their places in the Entry. */}
        {t >= T.carry &&
          CARRIED.map((c) => {
            const p = span(t, T.carry + c.delay, T.carryDur, CARRY);
            if (p >= 1) return null;
            const { from, to } = carried(m, c.key);
            return <TextCarrier key={c.key} text={c.text} from={from} to={to} p={p} swap={clamp01((p - 0.3) / 0.2)} path={PATH} />;
          })}
        {t >= T.carry && pColl < 1 && (
          <TextCarrier text={WORKSPACE.characters.title} from={m.board.collection} to={m.entry.collection} p={pColl} swap={clamp01((pColl - 0.4) / 0.08)} path={{ kind: "level", out: 0.3, into: 0.3 }} />
        )}
        <Cursor x={ptr.x} y={ptr.y} opacity={1} pressed={t >= T.click && t < T.click + 0.1} size={CURSOR / cam.s} />
      </Camera>
    </Field>
  );
}

// ── Sound and phases ───────────────────────────────────────────────────────

const cues: Cue[] = [
  { at: T.click - 0.03, src: clickSound, volume: 0.48, seconds: 0.15, note: "the click on Elias Vale's card" },
  { at: T.carry + T.carryDur - 0.06, src: settleSound, volume: 0.4, seconds: 0.5, note: "one tactile settle: the card has become the Entry" },
];

const phases: Phase[] = [
  { from: 0, to: T.click + 0.04, kind: "authentic", label: "the Characters Board · wide → Missing → Elias" },
  { from: T.click + 0.04, to: T.carry + T.carryDur + 0.1, kind: "film-only", label: "the card becomes the Entry" },
  { from: T.carry + T.carryDur + 0.1, to: T.body + 0.8, kind: "film-only", label: "the Entry resolves around him" },
  { from: T.body + 0.8, to: T.end + 1, kind: "authentic", label: "Frame 11 · Elias Vale's Entry" },
];

export const STUDY_D: StudyDef = { id: "D", duration: T.end, probes, phases, cues, frame };
export const STUDY_D_STRIP = [0.3, 1.1, 1.75, 2.16, 2.32, 2.45, 2.6, 2.75, 2.95, 3.2, 3.5, 4.9];
