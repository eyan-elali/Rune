import type { CSSProperties } from "react";
import { Html5Audio, staticFile, useCurrentFrame } from "remotion";
import { FileText, File as PageIcon, Folder, Layers, Library } from "lucide-react";
import { navigateTab, openTab, type TabState } from "@/lib/rune2/workingSet";
import { Caption } from "../../foundation/Caption";
import { Cursor, cursorAt } from "../../foundation/Cursor";
import { EndFrame } from "../../foundation/EndFrame";
import { FPS, FORMATS, type FormatId } from "../../foundation/formats";
import { Shot } from "../../foundation/Shot";
import { Stage } from "../../foundation/Stage";
import { EASE, EASE_FRAME, mix, presence, progress, typedCount, typingSchedule } from "../../foundation/time";
import {
  CHAPTER_1,
  CHAPTER_1_OPEN_LINE,
  CHAPTER_1_PROSE,
  CHAPTER_1_TYPED,
  CHAPTER_2,
  CHARACTER_PROPERTIES,
  CHARACTERS,
  PART_I,
  PEN_NAME,
  PROJECT,
  UNPLACED_SCENE,
  WORKSPACE,
} from "../../data/hollow";
import { CollectionPage } from "../../ui/Collection";
import { ManuscriptDoc } from "../../ui/Manuscript";
import { Navigator, type NavRowSpec, type NavSectionSpec } from "../../ui/Navigator";
import { ContextBar, DocStatus, Shell, TabBand } from "../../ui/Shell";
import { CAPTIONS, CLOSE, EMPHASIS, GROWTH, VISIT, WRITING } from "./script";
import { LAYOUTS } from "./layout";

// Creative A — "Writing a book starts simple."
//
// A new book in Sutura is a Manuscript and Chapter 1, and the writer writing
// in it. Then the book grows the way books do — another Chapter, a Part to
// hold them, a Scene that has no place yet, and around the manuscript the
// Workspace: Characters, World, Research, Ending Ideas — each arriving where
// the navigator puts it. The Workspace steps back to show what stays at the
// centre; Characters opens beside the Chapter, deep enough to see; and the
// writer returns to the Chapter. The close is the landing page's hero.
//
// Every value is a function of the frame (foundation/time.ts). The shell is
// the app's markup and stylesheet (ui/*); only what is on it is staged.

export type CreativeAProps = {
  format: FormatId;
  /** A file in public/ to lay under the picture. None by default: the creative is made to work silent. */
  soundtrack?: string;
};

const TYPE_TIMES = typingSchedule(CHAPTER_1_TYPED, WRITING.typeAt, WRITING.seed);
const TYPE_END = TYPE_TIMES[TYPE_TIMES.length - 1];

// The working set (lib/rune2/workingSet.ts, the app's own rules): Chapter 1
// open; Characters opened in a new tab beside it; then Chapter 1's tab again.
const TABS_START: TabState = { tabs: [CHAPTER_1.id], active: CHAPTER_1.id };
const TABS_VISIT = openTab(TABS_START, WORKSPACE.characters.id);
const TABS_BACK = navigateTab(TABS_VISIT, CHAPTER_1.id);
const TAB_LABEL: Record<string, string> = { [CHAPTER_1.id]: CHAPTER_1.title, [WORKSPACE.characters.id]: WORKSPACE.characters.title };

// Where the pointer goes, in the shell's logical pixels (the navigator's
// 44px header, 29px rows, 16px between sections; the tab band's toggle and
// 164px tabs).
const ROW = 29;
const CHARACTERS_ROW_Y = 44 + 2 + 7 * ROW + 2 * 16 + 6;

export function CreativeA({ format, soundtrack }: CreativeAProps) {
  const frame = useCurrentFrame();
  const now = frame / FPS;
  const L = LAYOUTS[format];
  const F = FORMATS[format];

  // ── The writing ──────────────────────────────────────────────────────
  const typed = typedCount(frame, TYPE_TIMES);
  const typing = now >= WRITING.typeAt && now <= TYPE_END + 0.05;
  const blink = Math.floor((now * 1000) / 530) % 2 === 0 ? 1 : 0;
  const typedText = CHAPTER_1_TYPED.slice(0, typed);
  // A word counts once the space after it lands, as the editor counts.
  const typedWords = (typedText.match(/ \S+(?= )/g) ?? []).length + (typed === CHAPTER_1_TYPED.length ? 1 : 0);
  const chapter1Words = CHAPTER_1.words + typedWords;
  const saveState = now >= WRITING.savingAt && now < WRITING.savedAt ? "Saving…" : "Saved";

  // ── The growth ───────────────────────────────────────────────────────
  const arrive = (at: number) => progress(frame, at, GROWTH.arrive, EASE_FRAME);
  const ch2 = arrive(GROWTH.chapter2);
  const part = arrive(GROWTH.part);
  const unplaced = arrive(GROWTH.unplaced);
  const ws = arrive(GROWTH.workspace);
  const world = arrive(GROWTH.world);
  const research = arrive(GROWTH.research);
  const ending = arrive(GROWTH.ending);
  const manuscriptWords = chapter1Words + (ch2 > 0.5 ? CHAPTER_2.words : 0);

  // ── Characters, and back ─────────────────────────────────────────────
  const visiting = now >= VISIT.openCharacters && now < VISIT.backToChapter;
  const tabs = now < VISIT.openCharacters ? TABS_START : now < VISIT.backToChapter ? TABS_VISIT : TABS_BACK;
  const newTab = progress(frame, VISIT.openCharacters, 0.22);
  // The content changes surface with a short dip, as a View arrives (r2-view-enter).
  const dip = (at: number) => {
    const t = now - at;
    if (t < -VISIT.swap / 2 || t > VISIT.swap) return 1;
    return t < 0 ? mix(1, 0.15, EASE((t + VISIT.swap / 2) / (VISIT.swap / 2))) : mix(0.15, 1, EASE(t / VISIT.swap));
  };
  const contentInk = Math.min(dip(VISIT.openCharacters), dip(VISIT.backToChapter));

  const cursorKeys = [
    { t: VISIT.cursorIn, x: L.shell.navWidth + 210, y: CHARACTERS_ROW_Y + 70 },
    { t: VISIT.atCharacters, x: 96, y: CHARACTERS_ROW_Y - 2 },
    { t: VISIT.leave, x: 96, y: CHARACTERS_ROW_Y - 2 },
    { t: VISIT.atChapterTab, x: L.shell.navWidth + 36 + 70, y: 24 },
    { t: VISIT.cursorOut + 1, x: L.shell.navWidth + 36 + 70, y: 24 },
  ];
  const cursor = cursorAt(cursorKeys, now, EASE_FRAME);
  const cursorInk = presence(frame, VISIT.cursorIn, VISIT.cursorOut + 0.25, 0.25, 0.25);
  const pressed =
    (now >= VISIT.openCharacters - 0.06 && now < VISIT.openCharacters + 0.08) ||
    (now >= VISIT.backToChapter - 0.06 && now < VISIT.backToChapter + 0.08);
  const hoverCharacters = now >= VISIT.atCharacters - 0.08 && now < VISIT.openCharacters;

  // ── The navigator ────────────────────────────────────────────────────
  const workspaceInk = mix(1, EMPHASIS.ink, progress(frame, EMPHASIS.in, EMPHASIS.dur) * (1 - progress(frame, EMPHASIS.out, EMPHASIS.dur)));
  const chapterDepth = mix(1, 2, part);
  const manuscriptRows: NavRowSpec[] = [
    ...(part > 0 ? [{ id: PART_I.id, title: PART_I.title, icon: Layers, depth: 1, open: true, emphasis: true, reveal: part }] : []),
    { id: CHAPTER_1.id, title: CHAPTER_1.title, icon: FileText, depth: chapterDepth, selected: !visiting },
    ...(ch2 > 0 ? [{ id: CHAPTER_2.id, title: CHAPTER_2.title, icon: FileText, depth: chapterDepth, reveal: ch2 }] : []),
  ];
  const workspaceRows: NavRowSpec[] = [
    { id: WORKSPACE.characters.id, title: WORKSPACE.characters.title, icon: Library, depth: 1, reveal: ws, selected: visiting, hover: hoverCharacters },
    ...(world > 0 ? [{ id: WORKSPACE.world.id, title: WORKSPACE.world.title, icon: Folder, depth: 1, open: false, reveal: world }] : []),
    ...(research > 0 ? [{ id: WORKSPACE.research.id, title: WORKSPACE.research.title, icon: PageIcon, depth: 1, reveal: research }] : []),
    ...(ending > 0 ? [{ id: WORKSPACE.ending.id, title: WORKSPACE.ending.title, icon: PageIcon, depth: 1, reveal: ending }] : []),
  ];
  const sections: NavSectionSpec[] = [
    { id: "manuscript", label: "Manuscript", count: manuscriptWords, open: true, rows: manuscriptRows },
    {
      id: "unplaced",
      label: "Unplaced Scenes",
      count: UNPLACED_SCENE.words,
      open: true,
      reveal: unplaced,
      rows: [{ id: UNPLACED_SCENE.id, title: UNPLACED_SCENE.title, depth: 1, muted: true }],
    },
    // A new Project's Workspace is closed while it is empty (ProjectNavigator:
    // open by default only once it has something in it).
    { id: "workspace", label: "Workspace", open: ws > 0, rows: ws > 0 ? workspaceRows : [], ink: workspaceInk },
  ];

  // ── The shot and the close ───────────────────────────────────────────
  const shotInk = 1 - progress(frame, CLOSE.shotOut, CLOSE.shotDur);
  const shotDrift = progress(frame, CLOSE.shotOut, CLOSE.shotDur + 0.2);

  const caption = (c: { text: string; in: number; out: number }) => (
    <Caption inAt={c.in} outAt={c.out} style={{ size: L.caption.size, width: L.caption.width }}>
      {c.text}
    </Caption>
  );

  return (
    <Stage>
      {soundtrack && <Html5Audio src={staticFile(soundtrack)} />}

      {/* The captions share one place: above the shot, settled on its left edge. */}
      <div
        style={{
          position: "absolute",
          left: L.caption.left,
          top: L.caption.top,
          height: L.caption.bottom - L.caption.top,
          width: L.caption.width,
          display: "grid",
          alignItems: "end",
        }}
      >
        {Object.values(CAPTIONS).map((c) => (
          <div key={c.text} style={{ gridArea: "1 / 1" }}>
            {caption(c)}
          </div>
        ))}
      </div>

      {shotInk > 0 && (
        <Shot
          window={{ x: L.shot.x, y: L.shot.y + mix(0, 18, shotDrift), width: F.width - L.shot.x, height: F.height - L.shot.y }}
          logical={L.shell}
          scale={L.shot.scale}
          opacity={shotInk}
        >
          <Shell
            width={L.shell.width}
            height={L.shell.height}
            navWidth={L.shell.navWidth}
            manuscript={!visiting}
            nav={<Navigator project={PROJECT} sections={sections} penName={PEN_NAME} />}
            tabs={
              <TabBand
                tabs={tabs.tabs.map((key) => ({
                  key,
                  label: TAB_LABEL[key],
                  active: key === tabs.active,
                  reveal: key === WORKSPACE.characters.id ? newTab : undefined,
                }))}
              />
            }
            contextBar={
              visiting ? (
                <ContextBar project={PROJECT} trail={["Workspace", WORKSPACE.characters.title]} read={false} />
              ) : (
                <ContextBar
                  project={PROJECT}
                  trail={part > 0.5 ? ["Manuscript", PART_I.title, CHAPTER_1.title] : ["Manuscript", CHAPTER_1.title]}
                  read
                />
              )
            }
            main={
              <div style={{ opacity: contentInk, minHeight: "100%", display: "flex", flexDirection: "column" } as CSSProperties}>
                {visiting ? (
                  <CollectionPage
                    title={WORKSPACE.characters.title}
                    columns={CHARACTER_PROPERTIES}
                    rows={CHARACTERS.map((c) => ({ id: c.id, name: c.name, values: { role: c.role, status: c.status, home: c.home } }))}
                    widths={[104, 112, 100, 120]}
                  />
                ) : (
                  <ManuscriptDoc
                    title={CHAPTER_1.title}
                    paragraphs={CHAPTER_1_PROSE}
                    openLine={CHAPTER_1_OPEN_LINE}
                    typed={typedText}
                    caret={typing ? 1 : now < VISIT.cursorIn ? blink : 0}
                  />
                )}
              </div>
            }
            status={!visiting ? <DocStatus words={chapter1Words} state={saveState} /> : null}
          />
          {cursorInk > 0 && <Cursor x={cursor.x} y={cursor.y} opacity={cursorInk} pressed={pressed} />}
        </Shot>
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: L.end.centreY,
          transform: "translateY(-50%)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {now >= CLOSE.endIn - 0.05 && (
          <EndFrame
            inAt={CLOSE.endIn}
            titleSize={L.end.titleSize}
            wordmarkWidth={L.end.wordmarkWidth}
            noteSize={L.end.noteSize}
            gap={L.end.gap}
          />
        )}
      </div>
    </Stage>
  );
}
