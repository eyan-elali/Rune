import { Composition } from "remotion";
import { FPS } from "../../foundation/formats";
import { Stage } from "../../foundation/Stage";
import { WithProbes, type Probes } from "../product-film/studies/probe";
import { Ad01StartSimple, DURATION_FRAMES, END, FRAME, PHASES, PROBES, frameAt } from "./Ad01";
import { REST } from "./stream";
import { T } from "./timeline";

// Review surfaces for Performance Ad #1: a contact sheet dense enough to
// judge the whole cut, the first two seconds frame by frame-ish, the growth
// transition, and the key compositions at the width a phone shows them.

const DARK = { theme: "dark", surface: "theme", accent: "blue" } as const;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-6; t += step) out.push(+Math.min(t, END - 1 / FPS).toFixed(3));
  return out;
};
const phaseOf = (t: number) => PHASES.find((p) => t >= p.from && t < p.to) ?? PHASES[PHASES.length - 1];

export const SHEETS = {
  contact: { times: range(0, END - 1 / FPS, 0.25), cols: 9, scale: 0.19, title: "Ad 01 · Start simple · the whole cut, every 0.25 s" },
  first2s: { times: range(0, 2.0, 0.1), cols: 7, scale: 0.25, title: "Ad 01 · the first two seconds, every 0.1 s" },
  growth: { times: range(T.grow - 0.2, REST + 0.45, 0.15), cols: 8, scale: 0.22, title: "Ad 01 · the growth transition, every 0.15 s" },
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

function Thumb({ t, m, scale }: { t: number; m: Probes; scale: number }) {
  return (
    <div style={{ position: "relative", width: FRAME.width * scale, height: FRAME.height * scale, overflow: "hidden", borderRadius: 4, boxShadow: "0 0 0 1px rgba(255 255 255 / 0.12)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: FRAME.width, height: FRAME.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>{frameAt(t, m)}</div>
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
              {s.title} <span style={{ fontFamily: "Inter", fontSize: 18, opacity: 0.6, marginLeft: 16 }}>{END.toFixed(2)} s · 1080 × 1920 · first cut, for review</span>
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

/** The key compositions at 390 px wide — the ad's width on a 390-pt phone — with nothing around them but the feed's black. */
export const PHONE_TIMES: readonly [string, number][] = [
  ["A · hook + Chapter 1", 0.6],
  ["B · writing, close", 2.25],
  ["C · the book grows", 3.9],
  ["D · substantial + Workspace", 6.3],
  ["E · back to the writing", 8.7],
  ["F · CTA", END - 0.05],
];
const PHONE_SCALE = 390 / FRAME.width;
export const PHONE_SIZE = { width: Math.round(48 * 2 + 6 * 390 + 5 * 24), height: Math.round(48 * 2 + 40 + FRAME.height * PHONE_SCALE + 30) };
function PhoneSheet() {
  return (
    <Stage appearance={DARK} background="#000">
      <WithProbes probes={PROBES}>
        {(m) => (
          <div style={{ position: "absolute", inset: 0, padding: 48, fontFamily: "Inter", color: "#9aa0a8" }}>
            <p style={{ height: 40, fontSize: 14 }}>Phone size · each frame 390 px wide, as on a 390-pt phone · judge legibility here</p>
            <div style={{ display: "flex", gap: 24 }}>
              {PHONE_TIMES.map(([label, t]) => (
                <figure key={label}>
                  <Thumb t={t} m={m} scale={PHONE_SCALE} />
                  <figcaption style={{ marginTop: 8, fontSize: 13 }}>
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

export function Ad01Compositions() {
  return (
    <>
      <Composition id="Ad01StartSimple" component={Ad01StartSimple} width={FRAME.width} height={FRAME.height} fps={FPS} durationInFrames={DURATION_FRAMES} defaultProps={{ sound: true }} />
      {(Object.keys(SHEETS) as SheetId[]).map((id) => (
        <Composition key={id} id={`Ad01-Sheet-${id}`} component={Sheet} {...sheetSize(id)} fps={FPS} durationInFrames={1} defaultProps={{ id }} />
      ))}
      <Composition id="Ad01-Phone" component={PhoneSheet} width={PHONE_SIZE.width} height={PHONE_SIZE.height} fps={FPS} durationInFrames={1} />
    </>
  );
}
