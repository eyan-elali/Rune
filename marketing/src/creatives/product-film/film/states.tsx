import type { CSSProperties } from "react";
import { ELIAS, ELIAS_BODY, NIGHT_CARDS, NIGHT_LINES, NIGHT_SECTIONS, SCENE, SCENE_OPEN_LINE, SCENE_OPEN_TYPED, SCENE_PROSE, WORKSPACE } from "../../../data/salt-house";
import type { CanvasViewport } from "../../../ui/Canvas";
import { DocStatus } from "../../../ui/Shell";
import { PLANS, ShellFor, Window, type Plan } from "../Keyframes";
import type { Anchor, ProbeSpec } from "../studies/probe";
import { scoped } from "../studies/layers";
import { STREAM_PROBE } from "./growth";

// The film's authentic product states — the states it passes through and the
// ones it measures (probes: studies/probe.tsx) so every carried object begins
// and ends on the real element. Everything here is the product's own markup
// with the film's data; the choreography between them lives in sequences.tsx.

export const LINE = "Seventeen was empty.";
export const PROSE = [...SCENE_PROSE.slice(0, 3), LINE, SCENE_OPEN_LINE + SCENE_OPEN_TYPED];

const caretStyle = (on: number): CSSProperties => ({
  display: "inline-block",
  width: 2,
  height: "1.08em",
  marginLeft: 1,
  marginRight: -3,
  verticalAlign: "-0.18em",
  background: "var(--r2-ms-caret)",
  opacity: on,
});

/**
 * The Key Cabinet's writing surface (the settled Scene, Keyframes' markup):
 * the caret after "Seventeen was empty." — where the writer stops, and where
 * they come back to — with anything they type there, and the film's ink steps.
 */
export function SceneProse({ ink = 1, caret = 0, typed = "" }: { ink?: number; caret?: number; typed?: string }) {
  const dim: CSSProperties | undefined = ink < 1 ? { opacity: ink } : undefined;
  return (
    <div className="r2-writing">
      <article className="r2-doc r2-doc--manuscript">
        <header className="r2-doc-head" style={dim}>
          <p className="r2-doc-eyebrow">The East Stair</p>
          <h1 className="r2-doc-title">
            <span className="r2-doc-title-text">{SCENE.title}</span>
          </h1>
        </header>
        <div className="r2-scenes">
          <section className="r2-scene">
            <div className="r2-prose">
              <div className="ProseMirror tiptap">
                {PROSE.map((p, i) => (
                  <p key={i} style={i === 3 ? undefined : dim}>
                    {p}
                    {i === 3 && typed}
                    {i === 3 && <span style={caretStyle(caret)} />}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

/** The Scene being revised (frames 05–07): no panel, Revision Notes, or the Inspector (scrolled). */
export const scenePlan = (o: { panel?: Plan["panel"]; panelScroll?: number; ink?: number; caret?: number; hoverLink?: string } = {}): Plan => ({
  ...PLANS["the-pause"],
  cursor: undefined,
  panel: o.panel,
  panelScroll: o.panelScroll,
  hoverLink: o.hoverLink,
  mainNode: <SceneProse ink={o.ink} caret={o.caret} />,
});

/** The Scene, back (frame 13): navigator retracted, the writer typing after the line. */
export const returnPlan = (o: { caret?: number; typed?: string; saving?: boolean } = {}): Plan => ({
  ...PLANS.return,
  mainNode: <SceneProse caret={o.caret} typed={o.typed} />,
  status: <DocStatus words={SCENE.words + (o.typed ? o.typed.trim().split(/\s+/).length : 0)} state={o.saving ? "Saving…" : "Saved"} />,
});

export const LEDGER: Plan = { ...PLANS.reveal, cursor: undefined };
export const BOARD: Plan = { ...PLANS.collection, cursor: undefined, hoverCard: undefined };
export const ENTRY: Plan = { ...PLANS.entry, cursor: undefined };
/** The Canvas at 56%: the whole of the night in the window — all three Sections — so the wide is the whole thought-space. */
export const VP: CanvasViewport = { tx: 22, ty: 122, scale: 0.56 };
export const canvasPlan = (hover?: string): Plan => ({ ...PLANS.canvas, cursor: undefined, canvas: VP, hoverCard: hover });
export const CARD_RADIUS = 7 * VP.scale;

/** The Entry's relationships, in the order they leave for the Canvas: each away from those still waiting, so no path crosses. */
export const RELATED = [
  { key: "thomas", text: "Thomas Vale" },
  { key: "ledger", text: WORKSPACE.ledger.title },
  { key: "mara", text: "Mara Vale" },
] as const;
export const CARD_OF = (id: string) => NIGHT_CARDS.findIndex((c) => c.id === id);
/** A card's place among the Canvas world's children (after its Sections and the lines' SVG). */
export const cardChild = (i: number) => NIGHT_SECTIONS.length + 1 + i + 1;

/**
 * FILM-ONLY: the one paper trail the writer follows — Thomas → 23:40 / key 17
 * → the ledger and its contradiction → "Plant it" → the Scene — becomes
 * compositionally dominant: its lines take the app's own hover strength, and
 * everything else falls back. No glow, no tracer: attention, not the line.
 */
export const TRAIL_CARDS = ["thomas", "key", "ledger", "vacant", "plant", "scene"];
const TRAIL_LINES = new Set([0, 1, 2, 8, 9]);
export function trailCss(scope: string, amount: number): string {
  if (amount <= 0.001) return "";
  const rules: Record<string, string> = {};
  NIGHT_CARDS.forEach((c, i) => {
    if (!TRAIL_CARDS.includes(c.id)) rules[`.r2-canvas-world > .r2-canvas-card:nth-child(${cardChild(i)})`] = `opacity: ${(1 - 0.5 * amount).toFixed(3)} !important;`;
  });
  NIGHT_LINES.forEach((_, i) => {
    const sel = `.r2-canvas-line:nth-of-type(${i + 1})`;
    if (TRAIL_LINES.has(i)) rules[`${sel} .r2-canvas-line-stroke`] = `stroke: color-mix(in srgb, rgb(var(--r2-palette-ink)) ${(32 + 26 * amount).toFixed(1)}%, transparent) !important;`;
    else rules[sel] = `opacity: ${(1 - 0.6 * amount).toFixed(3)};`;
  });
  return scoped(scope, rules);
}

// ── Probes ─────────────────────────────────────────────────────────────────

const probe = (id: string, plan: Plan, anchors: Anchor[]): ProbeSpec => ({
  id,
  node: (
    <Window>
      <ShellFor plan={plan} />
    </Window>
  ),
  anchors,
});
const box = (key: string, selector: string, text?: string): Anchor => ({ key, selector, mode: "box", text });
const run = (key: string, selector: string, text: string): Anchor => ({ key, selector, text });
const field = (key: string, selector: string, text: string): Anchor => ({ key, selector, mode: "field", text });

export const PROBES: ProbeSpec[] = [
  STREAM_PROBE,
  probe("pause", scenePlan(), [
    box("kcRow", ".r2-nav .r2-row", SCENE.title),
    run("sentence", ".r2-prose p", LINE),
    box("notesAction", ".r2-contextbar-panel .r2-action"),
    box("inspAction", ".r2-contextbar-panel .r2-action--icon"),
  ]),
  probe("notes", scenePlan({ panel: "notes" }), [run("sentence", ".r2-prose p", LINE), run("excerpt", ".r2-rnote-excerpt", LINE), box("inspAction", ".r2-contextbar-panel .r2-action--icon")]),
  probe("insp", scenePlan({ panel: "inspector-scene", panelScroll: 160 }), [run("link", ".r2-prop-link", WORKSPACE.ledger.title), box("pill", ".r2-prop-link", WORKSPACE.ledger.title)]),
  probe("ledger", LEDGER, [
    field("title", ".r2-page-title", WORKSPACE.ledger.title),
    box("row", ".r2-nav .r2-row", SCENE.title),
    box("tab", ".r2-tab", SCENE.title),
    box("backlink", ".r2-link", "The East Stair · The Key Cabinet"),
    run("keyLine", ".r2-page-body li p", "Key 17 signed out. Initials: T.V."),
    run("seventeen", ".r2-page-body p", "in seventeen"),
    run("aside", ".r2-aside p", "Who was in seventeen?"),
    box("charactersRow", ".r2-nav .r2-row", WORKSPACE.characters.title),
  ]),
  probe("board", BOARD, [
    box("card", ".r2-card", ELIAS.title),
    run("name", ".r2-card-title", ELIAS.title),
    run("role", ".r2-card-meta", "Brother"),
    run("seen", ".r2-card-meta", "Greyhaven ferry, 3 March"),
    box("lane", ".r2-lane", "Missing"),
    field("collection", ".r2-page-title", WORKSPACE.characters.title),
  ]),
  probe("entry", ENTRY, [
    field("name", ".r2-page-title", ELIAS.title),
    run("role", ".r2-prop-option", "Brother"),
    field("seen", ".r2-prop-input", "Greyhaven ferry"),
    run("collection", ".r2-entry-collection", WORKSPACE.characters.title),
    box("props", ".r2-props--entry"),
    ...RELATED.map((r) => run(r.key, ".r2-prop-link", r.text)),
    ...RELATED.map((r) => box(`${r.key}Box`, ".r2-prop-link", r.text)),
    box("canvasRow", ".r2-nav .r2-row", WORKSPACE.canvas.title),
    box("main", ".r2-main"),
    run("dad", ".r2-page-body p", "Dad gave him the key"),
    // The Entry's blocks, each absorbed as the Canvas reaches it (seq4: Entry → Canvas).
    box("blkCollection", ".r2-entry-collection"),
    box("blkPropsHead", ".r2-props-head"),
    ...ELIAS.properties.map((_, i) => box(`blkProp${i}`, `.r2-props-list > .r2-prop:nth-child(${i + 1})`)),
    ...ELIAS_BODY.map((_, i) => box(`blkBody${i}`, `.r2-page-body .ProseMirror > *:nth-child(${i + 1})`)),
  ]),
  probe("canvas", canvasPlan(), [
    run("elias", ".r2-canvas-card-title", ELIAS.title),
    ...RELATED.map((r) => run(r.key, ".r2-canvas-card-title", r.text)),
    box("eliasCard", ".r2-canvas-card", ELIAS.title),
    ...RELATED.map((r) => box(`${r.key}Card`, ".r2-canvas-card", r.text)),
    box("keyCard", ".r2-canvas-card", "23:40"),
    box("vacantCard", ".r2-canvas-card", "Fire brigade"),
    box("guestCard", ".r2-canvas-card", "Who was in seventeen?"),
    box("juneCard", ".r2-canvas-card", "June Mercer"),
    box("plantCard", ".r2-canvas-card", "Plant it"),
    box("claraCard", ".r2-canvas-card", "Clara Mercer"),
    box("sec1998", ".r2-canvas-section", "14 November 1998"),
    box("sceneCard", ".r2-canvas-card--scene"),
    run("scenePreview", ".r2-canvas-card--scene .r2-canvas-card-preview", LINE),
  ]),
  probe("scene", returnPlan(), [run("sentence", ".r2-prose p", LINE), box("main", ".r2-main")]),
];
