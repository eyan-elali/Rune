import { Composition } from "remotion";
import { FPS } from "../../foundation/formats";
import { Stage } from "../../foundation/Stage";
import { WithProbes, type Probes } from "../product-film/studies/probe";
import { PROBES as CONTROL_PROBES, frameAt as controlFrame, END as CONTROL_END } from "../ad-01-start-simple/Ad01";
import { Ad01StartSimpleVariantB, DURATION_FRAMES, END, FRAME, ORG_END, ORG_START, PHASES, PROBES, frameAt } from "./Ad01B";
import { REST } from "./stream";
import { T } from "./timeline";

// Review surfaces for Variant B: the whole cut, the new middle alone (every
// 0.1 s), the key compositions at phone width, and Control beside Variant B
// at matching times.

const DARK = { theme: "dark", surface: "theme", accent: "blue" } as const;
const range = (from: number, to: number, step: number, end = END) => {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-6; t += step) out.push(+Math.min(t, end - 1 / FPS).toFixed(3));
  return out;
};
const phaseOf = (t: number) => PHASES.find((p) => t >= p.from && t < p.to) ?? PHASES[PHASES.length - 1];

export const SHEETS = {
  contact: { times: range(0, END - 1 / FPS, 0.25), cols: 9, scale: 0.19, title: "Ad 01 · Variant B · the whole cut, every 0.25 s" },
  middle: { times: range(T.grow + 0.4, ORG_END + 0.3, 0.1), cols: 9, scale: 0.19, title: "Ad 01 · Variant B · the middle: thoughts loosen, the book grows, the thoughts are put away — every 0.1 s" },
} as const;
type SheetId = keyof typeof SHEETS;

const GAP = 20;
const PAD = 60;
const HEAD = 80;
const CAP = 34;
export const sheetSize = (id: SheetId) => {
  const s = SHEETS[id];
  const rows = Math.ceil(s.times.length / s.cols);
  const w = FRAME.width * s.scale;
  const h = FRAME.height * s.scale;
  return { width: Math.round(PAD * 2 + s.cols * w + (s.cols - 1) * GAP), height: Math.round(PAD * 2 + HEAD + rows * (h + CAP) + (rows - 1) * GAP) };
};

function Thumb({ t, m, scale, draw = frameAt }: { t: number; m: Probes; scale: number; draw?: typeof frameAt }) {
  return (
    <div style={{ position: "relative", width: FRAME.width * scale, height: FRAME.height * scale, overflow: "hidden", borderRadius: 4, boxShadow: "0 0 0 1px rgba(255 255 255 / 0.12)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: FRAME.width, height: FRAME.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>{draw(t, m)}</div>
    </div>
  );
}

function Sheet({ id }: { id: SheetId }) {
  const s = SHEETS[id];
  const w = FRAME.width * s.scale;
  return (
    <Stage appearance={DARK} background="#0b0c0f">
      <WithProbes probes={PROBES}>
        {(m) => (
          <div style={{ position: "absolute", inset: 0, padding: PAD, fontFamily: "Inter", color: "#cfd3da" }}>
            <h1 style={{ height: HEAD, fontFamily: "var(--r2-prose-font)", fontSize: 34, fontWeight: 400, color: "#fff" }}>
              {s.title} <span style={{ fontFamily: "Inter", fontSize: 18, opacity: 0.6, marginLeft: 16 }}>{END.toFixed(2)} s · 1080 × 1920 · experiment, for review</span>
            </h1>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${s.cols}, ${w}px)`, gap: GAP }}>
              {s.times.map((t) => {
                const p = phaseOf(t);
                return (
                  <figure key={t}>
                    <Thumb t={t} m={m} scale={s.scale} />
                    <figcaption style={{ height: CAP, marginTop: 6, fontSize: 13, display: "flex", gap: 8, alignItems: "baseline", overflow: "hidden" }}>
                      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.toFixed(2)}s</span>
                      <span style={{ color: p.kind === "film-only" ? "#f4c56a" : "#8fd3a6" }}>{p.kind}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        )}
      </WithProbes>
    </Stage>
  );
}

export const PHONE_TIMES: readonly [string, number][] = [
  ["A · hook + Chapter 1", 0.6],
  ["B · writing, close", 2.25],
  ["C · the book grows; a thought loosens", 3.5],
  ["C · three thoughts beside the book", REST - 0.05],
  ["D · put away", ORG_START + 0.9],
  ["D · the Workspace the writer made", ORG_END + 0.6],
  ["E · back to the writing", T.type2 + 0.9],
  ["F · CTA", END - 0.05],
];
const PHONE_SCALE = 390 / FRAME.width;
export const PHONE_SIZE = { width: Math.round(48 * 2 + 8 * 390 + 7 * 24), height: Math.round(48 * 2 + 40 + FRAME.height * PHONE_SCALE + 30) };
function PhoneSheet() {
  return (
    <Stage appearance={DARK} background="#000">
      <WithProbes probes={PROBES}>
        {(m) => (
          <div style={{ position: "absolute", inset: 0, padding: 48, fontFamily: "Inter", color: "#9aa0a8" }}>
            <p style={{ height: 40, fontSize: 14 }}>Variant B · phone size · each frame 390 px wide, as on a 390-pt phone · judge legibility here</p>
            <div style={{ display: "flex", gap: 24 }}>
              {PHONE_TIMES.map(([label, t]) => (
                <figure key={label}>
                  <Thumb t={t} m={m} scale={PHONE_SCALE} />
                  <figcaption style={{ marginTop: 8, fontSize: 13, width: 390 }}>
                    {label} · {t.toFixed(2)}s
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </WithProbes>
    </Stage>
  );
}

/** Control over Variant B at matching times (the same clock until the middle; the ends are aligned to each cut's own events). */
export const AB_TIMES: readonly [string, number, number][] = [
  ["first frame", 0, 0],
  ["typing", 1.0, 1.0],
  ["close", 2.25, 2.25],
  ["growth begins", 2.9, 2.9],
  ["growth", 3.5, 3.5],
  ["growth", 4.1, 4.1],
  ["rest", 5.05, REST + 0.07],
  ["organised / noticed", 5.6, ORG_START + 0.6],
  ["middle line", 6.3, T.line2 + 0.6],
  ["return", 8.7, T.type2 + 0.9],
  ["retreat", 9.7, T.back + 2.6],
  ["CTA", CONTROL_END - 0.05, END - 0.05],
];
const AB_SCALE = 0.2;
export const AB_SIZE = { width: Math.round(PAD * 2 + 160 + AB_TIMES.length * (FRAME.width * AB_SCALE) + (AB_TIMES.length - 1) * GAP), height: Math.round(PAD * 2 + HEAD + 2 * (FRAME.height * AB_SCALE + CAP) + GAP) };
function ABSheet() {
  const w = FRAME.width * AB_SCALE;
  const row = (label: string, draw: typeof frameAt, col: 1 | 2, m: Probes) => (
    <>
      <p style={{ width: 160, fontFamily: "var(--r2-prose-font)", fontSize: 28, color: "#fff", alignSelf: "center" }}>{label}</p>
      {AB_TIMES.map(([name, tc, tb]) => {
        const t = col === 1 ? tc : tb;
        return (
          <figure key={name + t}>
            <Thumb t={t} m={m} scale={AB_SCALE} draw={draw} />
            <figcaption style={{ height: CAP, marginTop: 6, fontSize: 13, color: "#cfd3da", display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.toFixed(2)}s</span>
              <span style={{ opacity: 0.7 }}>{name}</span>
            </figcaption>
          </figure>
        );
      })}
    </>
  );
  return (
    <Stage appearance={DARK} background="#0b0c0f">
      <WithProbes probes={[...CONTROL_PROBES, ...PROBES]}>
        {(m) => (
          <div style={{ position: "absolute", inset: 0, padding: PAD, fontFamily: "Inter" }}>
            <h1 style={{ height: HEAD, fontFamily: "var(--r2-prose-font)", fontSize: 34, fontWeight: 400, color: "#fff" }}>
              Ad 01 · Control vs Variant B <span style={{ fontFamily: "Inter", fontSize: 18, opacity: 0.6, marginLeft: 16 }}>Control {CONTROL_END.toFixed(2)} s · Variant B {END.toFixed(2)} s · matching moments</span>
            </h1>
            <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${AB_TIMES.length}, ${w}px)`, gap: GAP }}>
              {row("Control", controlFrame, 1, m)}
              {row("Variant B", frameAt, 2, m)}
            </div>
          </div>
        )}
      </WithProbes>
    </Stage>
  );
}

export function Ad01VariantBCompositions() {
  return (
    <>
      <Composition id="Ad01StartSimpleVariantB" component={Ad01StartSimpleVariantB} width={FRAME.width} height={FRAME.height} fps={FPS} durationInFrames={DURATION_FRAMES} defaultProps={{ sound: true }} />
      {(Object.keys(SHEETS) as SheetId[]).map((id) => (
        <Composition key={id} id={`Ad01B-Sheet-${id}`} component={Sheet} {...sheetSize(id)} fps={FPS} durationInFrames={1} defaultProps={{ id }} />
      ))}
      <Composition id="Ad01B-Phone" component={PhoneSheet} width={PHONE_SIZE.width} height={PHONE_SIZE.height} fps={FPS} durationInFrames={1} />
      <Composition id="Ad01B-ProbeDump" component={Ad01BProbeDump} width={1080} height={1920} fps={FPS} durationInFrames={1} />
      <Composition id="Ad01B-ControlVsB" component={ABSheet} width={AB_SIZE.width} height={AB_SIZE.height} fps={FPS} durationInFrames={1} />
    </>
  );
}

/** Development: what the probes measured, as text. */
export function Ad01BProbeDump() {
  return (
    <Stage appearance={DARK} background="#000">
      <WithProbes probes={PROBES}>
        {(m) => (
          <pre style={{ color: "#fff", fontSize: 14, padding: 20, whiteSpace: "pre-wrap" }}>
            {JSON.stringify({ finalB: Object.fromEntries(Object.entries(m.finalB).map(([k, v]) => [k, { box: v.box, text: v.text, fs: v.style.fontSize }])), main: m.streamB.main.box }, null, 1)}
          </pre>
        )}
      </WithProbes>
    </Stage>
  );
}
