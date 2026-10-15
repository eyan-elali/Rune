import type { ReactNode } from "react";
import { Easing, Img, staticFile } from "remotion";
import { WORDMARK } from "@/lib/brand";
import { Camera, type CameraState } from "../../../foundation/Camera";
import { Cursor } from "../../../foundation/Cursor";
import { EASE, EASE_FRAME, typedCount, typingSchedule } from "../../../foundation/time";
import { FILM_RETURN_TYPED } from "../../../data/salt-house";
import { PLANS, SHELL, ShellFor, Window } from "../Keyframes";
import { TextCarrier, carrierAt } from "../studies/Carrier";
import { CAMERA, CARRY, SETTLE, clamp01, lerp, lerpRect, logLerp, repin, span, toScreen, type Rect } from "../studies/motion";
import type { Probes } from "../studies/probe";
import { scoped } from "../studies/layers";
import { Field, LightRoot, frameScope } from "../studies/Study";
import { CURSOR, FADE_OUT, WRITING_SETTLE, blendCam, writingCss } from "./common";
import { CARD_OF, CARD_RADIUS, LINE, canvasPlan, returnPlan, trailCss } from "./states";
import { cam4, trailAt } from "./seq4";
import { T } from "./timeline";

// 5 · BACK TO THE BOOK. RETURN TO MANUSCRIPT (Study C V2's second half): the
// Scene card opens into the Scene, its preview line — already the writer's
// prose — becoming the line in the manuscript. The caret holds still where
// the writer stopped. Then the writer types what the Workspace helped them
// find. Nothing is carried into the prose. The UI recedes; the window recedes
// into the ink stage it was revealed on; Sutura.

// ── The writer's words ─────────────────────────────────────────────────────
const [PART1, PART2] = FILM_RETURN_TYPED;
const TIMES1 = typingSchedule(PART1, T.typing, 17, 0.46);
/** A beat after "T.V." — the writer, sure now — then the sentence that matters. */
const TIMES2 = typingSchedule(PART2, TIMES1[TIMES1.length - 1] + 0.27, 23, 0.46);
export const TYPE_TIMES = [...TIMES1, ...TIMES2];
export const TYPED_TEXT = PART1 + PART2;
export const TYPING_END = TYPE_TIMES[TYPE_TIMES.length - 1];
export const AWAY = TYPING_END + T.away;
/**
 * The retreat — camera and scale first, fade very late. The camera leaves the
 * prose the way the opening entered it (close → the medium-wide the film began
 * in → the whole window) and keeps going: a luminous window receding into a
 * large, quiet stage, light, crisp and opaque the whole way. Only once it is
 * genuinely small (about a third of the frame's width) does it go, quickly.
 * Then the stage is empty for a breath. Then: Sutura.
 */
const RETREAT = { dur: 2.45, far: 0.33 };
/** The window's width on screen, as a fraction of the frame, at which it begins to go. */
const FADE_WIDTH = 0.305;
/**
 * How it goes: late and short (Absorb) — full light until the last moment, then
 * removed in ~0.1s while the camera keeps receding. Never a dimmed rectangle.
 */
const FADE_DUR = 0.3;
const RETREAT_CURVE = Easing.bezier(0.42, 0, 0.36, 1);
/** Seconds into the retreat at which the window has receded to FADE_WIDTH (solved once). */
const FADE_IN_RETREAT = (() => {
  // Scale at the retreat's start is the return framing (PLANS.return).
  const s0 = PLANS.return.camera.s;
  const target = (FADE_WIDTH * 1920) / SHELL.width;
  for (let x = 0; x <= RETREAT.dur; x += 1 / 240) if (logLerp(s0, RETREAT.far, RETREAT_CURVE(x / RETREAT.dur)) <= target) return x;
  return RETREAT.dur;
})();
export const FADE_AT = AWAY + FADE_IN_RETREAT;
/** The frame the window begins to go (frame-aligned, so the 30fps samples fall at ~94%, 75%, 44%, then nothing). */
export const FADE_GO = Math.ceil((FADE_AT + 0.09) * 30) / 30;
const GO_FRAMES = 4;
export const BRAND = FADE_AT + FADE_DUR + 0.38; // the empty stage: the same breath as pass 4 (~0.46s from the last visible frame)
export const END = BRAND + T.brandHold;

const typedAt = (t: number) => TYPED_TEXT.slice(0, typedCount(Math.round(t * 30), TYPE_TIMES));

// ── The return ─────────────────────────────────────────────────────────────

function sentence(t: number, m: Probes) {
  const p = span(t, T.morph, T.morphDur, CARRY);
  const c = carrierAt(m.canvas.scenePreview, m.scene.sentence, p, { kind: "arc", lift: 0.04 });
  const k = c.size / m.scene.sentence.style.fontSize;
  return { p, at: c.at, pin: { k, x: c.at.x - m.scene.sentence.text.x * k, y: c.at.y - m.scene.sentence.text.cy * k } };
}

export function cam5(t: number, m: Probes): CameraState {
  if (t < T.morph) return cam4(t, m);
  const close = cam4(T.morph - 1e-6, m);
  const p = span(t, T.morph + 0.05, T.morphDur + 0.1, CARRY);
  const from = toScreen(close, { x: m.canvas.scenePreview.text.x, y: m.canvas.scenePreview.text.cy });
  const end = repin(PLANS.return.camera, { x: m.scene.sentence.text.x, y: m.scene.sentence.text.cy });
  const at = sentence(t, m).at;
  const back: CameraState = { x: at.x, y: at.y, s: logLerp(close.s, end.s, p), ax: lerp(from.x, end.ax, p), ay: lerp(from.y, end.ay, p) };
  // Leaving: the same world the opening entered, in reverse — out of the prose, through the medium-wide, past the whole window, into the stage.
  const r = span(t, AWAY, RETREAT.dur, RETREAT_CURVE);
  if (r <= 0) return back;
  const far: CameraState = { x: SHELL.width / 2, y: SHELL.height / 2, s: RETREAT.far, ax: 960, ay: 540 };
  return blendCam(back, far, r);
}

export function frame5(t: number, m: Probes) {
  const scope = frameScope(t);
  const cam = cam5(t, m);
  const s = sentence(t, m);
  const opened = s.p >= 1;

  // The Scene card opening (Study C V2): its surface grows; the Scene, pinned to the carried line, resolves in it.
  const card = m.canvas.sceneCard.box;
  const pin0 = sentence(T.morph, m).pin;
  const cardLocal: Rect = { x: (card.x - pin0.x) / pin0.k, y: (card.y - pin0.y) / pin0.k, w: card.w / pin0.k, h: card.h / pin0.k };
  const main = m.scene.main.box;
  const column: Rect = { x: main.x, y: main.y, w: SHELL.width - main.x, h: SHELL.height - main.y };
  const mask = { rect: lerpRect(cardLocal, column, s.p), radius: lerp(CARD_RADIUS / pin0.k, 0, s.p) };
  const prose = span(s.p, 0.12, 0.42, SETTLE);
  const surface = 1 - span(s.p, 0.55, 0.45, SETTLE);
  const sceneChild = CARD_OF("scene") + 3 + 1 + 1;
  const canvasCss = trailCss(`${scope}-c5`, trailAt(t)) + scoped(`${scope}-c5`, {
    [`.r2-canvas-world > .r2-canvas-card:nth-child(${sceneChild})`]: `opacity: ${1 - span(s.p, 0, 0.22, SETTLE)};`,
    [`.r2-canvas-world > .r2-canvas-card:nth-child(${sceneChild}) .r2-canvas-card-preview`]: t >= T.morph ? "visibility: hidden;" : "",
  });

  // Back: the caret still; then the writer's words.
  const typed = t >= T.typing ? typedAt(t) : "";
  const typing = t >= T.typing && t < TYPING_END + 0.6;
  const caret = t < T.still ? 0 : t < TYPING_END + 0.4 ? 1 : Math.floor((t - TYPING_END - 0.4) / 0.53) % 2 === 0 ? 1 : 0;
  const scene = returnPlan({ caret, typed, saving: typing });
  // Writing: the app's own data-writing — 700ms of sustained typing, then the chrome leaves (460ms). Nothing reaches
  // for the interface again, so it stays away through the retreat: the manuscript is what remains.
  const writing = span(t, T.typing + WRITING_SETTLE, FADE_OUT, EASE_FRAME);
  const sceneCss = scoped(`${scope}-s5`, { ".r2-prose p:nth-child(4)": `visibility: ${opened ? "visible" : "hidden"};` }) + writingCss(`${scope}-s5`, writing);

  // The window recedes into the stage; Sutura.
  // Light and whole while it recedes; it goes only at the end, small and far (a symmetric curve: never a cut).
  const windowO = t < FADE_GO + GO_FRAMES / 30 ? 1 : 0;
  const hover = t >= T.open - 0.24 && t < T.morph ? "scene" : undefined;

  // The pointer: it finds "Plant it" — the writer's conclusion — rests, then follows its arrow to the Scene card. Click.
  const plant = m.canvas.plantCard.box;
  const cardAt = { x: card.x + card.w * 0.58, y: card.y + card.h * 0.6 };
  const atPlant = { x: plant.x + plant.w * 0.82, y: plant.y + plant.h * 0.7 };
  // It arrives on the conclusion and rests there while it registers; then it goes to the card beside it.
  const arrive = span(t, T.pointer, 0.42, EASE);
  const go = span(t, T.toScene, T.open - T.toScene - 0.04, EASE);
  const ptr = { x: lerp(lerp(atPlant.x + 46, atPlant.x, arrive), cardAt.x, go), y: lerp(lerp(atPlant.y + 58, atPlant.y, arrive), cardAt.y, go) };
  const ptrO = span(t, T.pointer, 0.2, EASE) * (1 - span(t, T.morph + 0.1, 0.25, EASE));

  return (
    <Field>
      {windowO > 0.001 && (
        <div style={{ position: "absolute", inset: 0 }}>
          <Camera state={cam}>
           <Absorb t={t}>
            {!opened && (
              <Window>
                <div data-pf={`${scope}-c5`}>
                  <style>{canvasCss}</style>
                  <ShellFor plan={canvasPlan(hover)} />
                </div>
              </Window>
            )}
            {t >= T.morph && (
              <LightRoot>
                <div style={{ position: "absolute", left: 0, top: 0, transform: opened ? undefined : `translate(${s.pin.x}px, ${s.pin.y}px) scale(${s.pin.k})`, transformOrigin: "0 0" }}>
                  {!opened && (
                    <div style={{ position: "absolute", left: mask.rect.x, top: mask.rect.y, width: mask.rect.w, height: mask.rect.h, borderRadius: mask.radius, background: "var(--r2-surface-raised)", boxShadow: "0 0 0 1px rgba(20 22 28 / 0.07), 0 18px 48px -12px rgba(20 22 28 / 0.22)", opacity: surface }} />
                  )}
                  <div style={{ position: "absolute", left: 0, top: 0, width: SHELL.width, height: SHELL.height, opacity: opened ? 1 : prose, clipPath: opened ? undefined : `inset(${mask.rect.y}px ${SHELL.width - mask.rect.x - mask.rect.w}px ${SHELL.height - mask.rect.y - mask.rect.h}px ${mask.rect.x}px round ${mask.radius}px)` }}>
                    <Window>
                      <div data-pf={`${scope}-s5`}>
                        <style>{sceneCss}</style>
                        <ShellFor plan={scene} />
                      </div>
                    </Window>
                  </div>
                </div>
              </LightRoot>
            )}
            {/* FILM-ONLY: the Scene card's preview — the writer's own line — carried into its place in the prose. */}
            {t >= T.morph && !opened && <TextCarrier text={LINE} from={m.canvas.scenePreview} to={m.scene.sentence} p={s.p} swap={clamp01((s.p - 0.2) / 0.5)} path={{ kind: "arc", lift: 0.04 }} />}
            {ptrO > 0.001 && <Cursor x={ptr.x} y={ptr.y} opacity={ptrO} pressed={t >= T.open && t < T.open + 0.1} size={CURSOR / cam.s} />}
           </Absorb>
          </Camera>
        </div>
      )}
      <Brand t={t} />
    </Field>
  );
}

/**
 * FILM-ONLY: the workspace goes (q: 0 → 1). It holds its full light and
 * contrast — bright, crisp, recognisable — for most of q; then it is removed
 * decisively, in about three frames, so it never dwells as a dim rectangle.
 * No mask, no shape: only the window, then the dark.
 */
function Absorb({ t, children }: { t: number; children: ReactNode }) {
  const u = clamp01((t - FADE_GO) / (GO_FRAMES / 30));
  if (u <= 0) return <>{children}</>;
  const opacity = 1 - u * u;
  return <div style={{ position: "absolute", left: 0, top: 0, opacity }}>{children}</div>;
}

/** The close (frame 14): the approved wordmark, the line, the status, the address — arriving in reading order, then still. */
function Brand({ t }: { t: number }) {
  const a = (d: number) => span(t, BRAND + d, 0.5, SETTLE);
  if (a(0) <= 0.001) return null;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Img src={staticFile(WORDMARK.onDark.replace(/^\//, ""))} style={{ width: 300, height: "auto", opacity: a(0) }} alt="Sutura" />
      <h1 style={{ marginTop: 64, fontFamily: "var(--r2-prose-font)", fontWeight: 400, color: "var(--r2-ink-1)", lineHeight: 1 }}>
        <span style={{ display: "block", fontSize: 76, letterSpacing: "-0.025em", opacity: a(0.2) }}>Write the book.</span>
        <span style={{ display: "block", marginTop: 18, fontSize: 40, fontStyle: "italic", letterSpacing: "-0.01em", color: "var(--r2-accent-ink)", opacity: a(0.35) }}>
          Build only what it asks for.
        </span>
      </h1>
      <div style={{ opacity: a(0.5) }}>
        <p style={{ marginTop: 72, fontFamily: "var(--r2-font-ui)", fontSize: 22, fontWeight: 500, letterSpacing: "0.02em", color: "var(--r2-ink-2)" }}>
          Early Access<span style={{ margin: "0 0.4em" }}>·</span>Free
        </p>
        <p style={{ marginTop: 12, fontFamily: "var(--r2-font-ui)", fontSize: 21, letterSpacing: "0.02em", color: "var(--r2-ink-2)" }}>writesutura.com</p>
      </div>
    </div>
  );
}
