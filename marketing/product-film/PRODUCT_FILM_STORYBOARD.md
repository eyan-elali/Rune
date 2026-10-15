# Sutura — Product Film Storyboard

**Status:** storyboard only, revision 2. These are 14 static 1920 × 1080 keyframes for review. The film has not been animated or scored, no MP4 exists, and it isn't approved for release.

**Working title:** *The Salt House*
**Master format:** 1920 × 1080, 16:9
**Sound:** no music and no voiceover. Restrained effects and silence (cues below are annotations only).
**Intended length:** about 32–36 seconds. The film breathes at the pause, Revision Notes, the Inspector, the reveal and the return, with no long holds elsewhere.
**Stills:** `marketing/product-film/frames/01-writing.png` to `14-brand.png` (`npm run film:storyboard` re-renders them)
**Contact sheet:** `marketing/product-film/contact-sheet.png`
**Source:** `marketing/src/creatives/product-film/` (compositions `ProductFilm-Storyboard` and `ProductFilm-ContactSheet`) and `marketing/src/data/salt-house.ts`

---

## What the film says

> A special manuscript surrounded by a workspace the writer can shape however they think.

There is one thought, followed outward and back. A writer is drafting a Scene. The book grows to a finished first draft. The writer goes back to that early Scene to revise it, and stops at one line. A note they left themselves says it doesn't work yet. The Scene's own properties point to the research behind it. They follow that thread through a Page, a Collection, an Entry and a Canvas until the answer is clear. Then they go straight back to the same Scene and write the sentence it needed.

The emotional hinge:

1. *"I need something."* (frame 05)
2. *"Sutura has somewhere for that."* (frames 06–08)
3. *"Now I can go back to the book."* (frame 13)

The visual arc is **intimate, then expanding, then exploratory, then intimate again**. The only full-window shot is frame 08. Every other frame is inside the product, and the window's edges are usually out of frame.

## The demo novel

*The Salt House* is a grounded coastal mystery. It was invented for this film and lives only in `marketing/src/data/salt-house.ts`. It is never written to a database.

Mara Vale goes back to the Salt House Hotel in Greyhaven, which has been shut since a fire on 14–15 November 1998. An anonymous letter has reached her: *"He went back to seventeen."* Her brother Elias is missing. At the reception desk, the hook for Room 17 is empty.

The thread the film follows:

- **Revision Note** (on the Scene, anchored to *"Seventeen was empty."*): *"Seed why Mara recognizes the room number."*
- **Scene → Research → 1998 Guest Ledger** (a Relationship property): the ledger shows key 17 signed out at **23:40, initials T.V.**, while the fire brigade listed Room 17 as *"vacant, no occupant."*
- **Characters → Elias Vale**: he was nine, was found on the cliff path at 02:30, and said *"Dad gave me the key."*
- **Canvas, The Night of the Fire**: Thomas Vale → *signed for* → the 23:40 note → *recorded in* → the ledger → *plant it* → a note, "pencil under hook 17", → the Scene card.
- **Canvas → the Scene card**: the camera's path through the Canvas ends on *The Key Cabinet*, and a click returns to it.
- **Back in the Scene**, the writer adds: *"Beneath it, in pencil gone soft with years, someone had written a time and two initials: 23:40, T.V. Her father had signed for the key himself."*

The Workspace served the writing. The new sentence exists because of the Workspace.

Cast: Mara Vale, Elias Vale, Thomas Vale (night manager in 1998, died 2016), Clara Mercer (housekeeper, died in the fire), June Mercer (Clara's daughter, keeps the ledger), Ned Ashby (night porter in 1998), Constance Ware (owner in 1998), and "The guest in 17" (unconfirmed). Pen name on the account: *Isobel Wren*.

## Visual system

- **Stage:** Sutura's Dark theme page (`--r2-page-bg`), taken a step deeper and given a breath of the theme's own ink blue (`--r2-palette-blue`, 6%). It still reads as near-black. It is flat: no gradient, no glow.
- **Window:** the real Light Sutura shell at a laptop browser's logical size (1520 × 780). It has a 12px radius, a hairline ring and one soft shadow. There is no fake browser chrome.
- **Wide shot (frame 08 only):** the window fills about 90% of the frame's width and about 82% of its height.
- **Time-lapse (frames 03–04):** drawn with the navigator dragged to its widest (400px, the app's `NAV_MAX`) in a narrower window (1260 logical), so structure and prose sit side by side. Both are real layout states. The window's edges are never in frame. See *Approximations*.
- **Everywhere else:** the camera is inside the window, at 1.65–2.7× its logical size. The window's edges are out of frame.
- **Cursor:** the system arrow, about 30px on screen, shown only where a choice is being made.
- **No copy** appears during the journey, including frame 08. The only copy is the end card.

## Camera language

Slow push-ins and pull-backs, gentle pans, and cursor-led reframing. There are no 3D moves, bounce, punch zooms or flash transitions. There are two cuts on action: into the lapse (02 → 03) and out of it on the click (04 → 05). Between frames 07 and 08 is the one large pull-back. Between 12 and 13 is the one large push-in.

---

## Frames

### 01 · Writing *(unchanged; the stage tone is new)*
- **Purpose:** open inside the book, before any idea of "software".
- **The viewer understands:** someone is writing a novel, on a page worth writing on.
- **Camera / crop:** close, 2.2×. The eyebrow (*The East Stair*), the title and five paragraphs of EB Garamond. No navigator, tabs or chrome.
- **Product state:** Scene *The Key Cabinet* (Chapter 3 · Part I), first draft.
- **Cursor:** none. The text caret is mid-sentence: "…as if someone had gone on taking that key down long after there was|".
- **Sound (later):** soft, natural typing.
- **Into the next:** the sentence finishes ("…any reason to."). A slow drift left and out.

### 02 · Toward the navigator *(unchanged)*
- **Purpose:** the bridge from prose to structure. We are still inside the writing.
- **The viewer understands:** this page belongs to a manuscript.
- **Camera / crop:** 1.9×, panning left. The navigator enters from the left (Part I → The Ferry, Greyhaven, The East Stair → The Lobby, **The Key Cabinet**; Workspace → Characters, Research). The prose stays alive on the right.
- **Sound:** typing ends on the period. A beat.
- **Into the next:** the typing picks back up and accelerates. Cut on that action into the lapse.

### 03 · The novel grows *(re-composed)*
- **Purpose:** weeks or months of writing compressed into seconds.
- **The viewer understands at a glance:** **structure growing** on the left, **writing happening fast** on the right.
- **Camera / crop:** 2.6×. The navigator takes a little over half the frame, crisp and stable. The editor takes the right third or so, immediately beside it, with no dead middle band. The breadcrumb runs across the top of the editor.
- **Product state:** the navigator mid-growth. Part I is complete, with *Room 17* under The East Stair. Part II has The Inquest and **What the Ledger Kept** (selected, being written), and *The Cliff Path* is arriving at part ink. The Manuscript count reads 44,680. The editor shows several Chapters' prose at once, displaced along the scroll and blurred along it only. It reads as rushing text, not broken text.
- **Motion intent:** rows arrive one at a time with the navigator's own reveal. The count ticks up and the selection steps down the book. The prose streams. The camera drifts down with the newest row, then eases back up for frame 04.
- **Sound:** typing accelerated into a soft texture. Faint, sparse ticks of structure as rows land (not the thinking motif).
- **Into the next:** the lapse slows. The draft completes (*Seventeen* and the Unplaced Scenes land, and the count settles at 51,996). The pointer appears and climbs back up through Part II and Part I.

### 04 · Back to The Key Cabinet *(new)*
- **Purpose:** the visible return to revision, which earns everything that follows: *Revising*, History, the First Draft milestone, the Revision Notes.
- **The viewer understands:** the first draft is done, and the writer has gone back to an early Scene.
- **Camera / crop:** the same framing as frame 03. Only the state has changed, so the viewer reads the return directly.
- **Product state:** the finished draft (51,996 words; Part II through *Seventeen*). The selection is on **The Key Cabinet**, under Part I / The East Stair. The editor is sharp and still: *The East Stair / The Key Cabinet* with its opening lines. The breadcrumb reads *Manuscript / Part I / The East Stair / The Key Cabinet*.
- **Cursor:** on the row, just clicked.
- **Sound:** one quiet click. All the lapse texture stops. Silence.
- **Into the next:** cut on the settle to the writer's view of the Scene.

### 05 · The pause *(re-framed for continuity)*
- **Purpose:** the turn. The writer needs something.
- **The viewer understands:** the writer is rereading their own Scene, thinking. Nothing is broken.
- **Camera / crop:** 1.75×, mid-close. The prose on the left two-thirds, the context bar's actions across the top (*+ Scene · Read · ⋯ · Revision Notes · Inspector*), and calm space on the right where the panel will open.
- **Product state:** the caret rests after *"Seventeen was empty."* The status reads *1,846 words · Saved*.
- **Cursor:** still, in the right margin.
- **Sound:** silence, then the thinking motif: *tick… tick…*, a small tactile pulse rather than a wall clock. About 1.5 seconds.
- **Into the next:** the pointer travels to *Revision Notes*.

### 06 · Revision Notes *(preserved)*
- **Purpose:** the writer's own earlier thought about this exact passage.
- **The viewer understands:** Sutura keeps notes on the manuscript, at the place they belong.
- **Camera / crop:** 1.65×. The whole Scene on the left, so the notes read as being *about* it, and the Revision Notes sheet on the right. The pressed action and the pointer are at the top.
- **Product state:** notes for the Scene (trail *Manuscript / Part I / The East Stair / The Key Cabinet*). The first, *"Seed why Mara recognizes the room number."*, has its details open and is anchored to *"Seventeen was empty."* The second is *"Is the silent bell too neat?…"* Below them, *Show 1 resolved note*.
- **Sound:** a small click. The motif pauses for a brief silence while the note is read, then *tick… tick…* again.
- **Into the next:** one action right. The Inspector takes the same sheet.

### 07 · Inspector *(re-composed: approach B)*
- **Purpose:** this Scene sits inside a real manuscript system, and it points outward.
- **The viewer understands:** POV, location, status, cast and research, with history and milestones kept.
- **Camera / crop:** 1.75×. The **whole Scene** on the left, with its left margin in frame and no clipped words or title fragments. The Inspector is on the right. The context is intentional, not accidental.
- **Product state:** Inspector for *The Key Cabinet*, settled where the motion ends. **Scene properties**: POV **Mara Vale**, Location Salt House Hotel, Status Revising, Cast **Mara Vale** and **Elias Vale**, Research **1998 Guest Ledger** (pressed). **History**: Today, 9:42 AM · Yesterday, 6:15 PM · Mon, 12 Oct. **Milestones**: ⚑ **First Draft** (Sun, 4 Oct · 1,790 words). Shown, never clicked.
- **Motion intent:** the Inspector opens at its head (*Scene · The Key Cabinet · Scene 2 of 3 · 1,846 words*). The properties are read. A subtle downward drift reveals History and First Draft. The view settles back on Research → *1998 Guest Ledger*. The pointer ⌘-clicks it, which opens the Page in its own tab.
- **Sound:** a small click as the Inspector opens. The motif continues under the hover.
- **Into the next:** the click, then the film's one big pull-back.

### 08 · The connection: full window *(wordless)*
- **Purpose:** the reveal, the film's *aha*. The image carries the idea; there is no copy.
- **The viewer understands:** Manuscript + Workspace + active content + a contextual panel. The manuscript is the centre and everything else lives around it, connected both ways.
- **Camera / crop:** the only wide shot. The whole window on the ink stage, about 90% of the frame wide and 82% tall. Hold here.
- **Product state:**
  - **Navigator:** the finished draft (Manuscript 51,996, Part I and Part II, Unplaced folded at 2,276) and the Workspace (Characters, Research → *1998 Guest Ledger* selected, Greyhaven Harbour, *The Night of the Fire*).
  - **Tabs:** *The Key Cabinet* | ***1998 Guest Ledger***.
  - **Page and Inspector:** the ledger Page beside its Inspector. *Related*: Thomas Vale, Greyhaven Harbour. *Referenced by*: *The East Stair · The Key Cabinet*, *What the Ledger Kept*, *Elias Vale*.
- **Cursor:** resting beside the backlink to the Scene, the way home.
- **Sound:** the thinking motif **resolves**, one restrained tonal step.
- **Into the next:** hold. The Inspector closes and the camera pushes into the Page.

### 09 · Research Page *(preserved)*
- **Purpose:** the clue exists in the Workspace.
- **Camera / crop:** 1.95×, the Page from its eyebrow to its checklist. Readable, not zoomed out.
- **Product state:** *1998 Guest Ledger*: *Room 17: no entry*; *14 Nov, 23:40 — Key 17 signed out. Initials: T.V.*; the 02:10 fire; the brigade's *"vacant, no occupant"*; the aside *"The contradiction… Who was in seventeen?"*; **Who saw what**, with Clara Mercer and Elias Vale (*"in seventeen"*); a checklist.
- **Sound:** near silence. Perhaps one soft scroll.
- **Into the next:** the pointer finds *Characters* in the navigator.

### 10 · Characters Collection *(pushed in)*
- **Purpose:** structure that feels inhabited, never a screenshot of a board.
- **Camera / crop:** 2.7×. The cards are large. *Greyhaven* and *Missing* are whole, *Deceased* runs off the right edge, and the first lane runs off the bottom.
- **Product state:** Board View by Whereabouts. **Greyhaven:** Mara Vale, June Mercer, Ned Ashby, Constance Ware. **Missing:** **Elias Vale** (hovered), The guest in 17. **Deceased:** Thomas Vale, Clara Mercer.
- **Motion intent:** a slow, restrained pan right, Greyhaven → Missing → Deceased, then back to settle on Elias. The pointer then clicks.
- **Sound:** one quiet click on the card.
- **Into the next:** the Entry opens in place.

### 11 · Collection Entry *(preserved)*
- **Purpose:** an Entry is structured metadata plus freeform creative thinking.
- **Camera / crop:** 1.85×, from the Collection eyebrow to the end of the notes.
- **Product state:** *Characters / Elias Vale*. **Properties · 5**: Role Brother · Whereabouts Missing · Age in 1998 9 · Last seen Greyhaven ferry, 3 March · Connected to **Mara Vale**, **Thomas Vale**, **1998 Guest Ledger**. Then the notes: **Now**; **The night of the fire** (*"…Dad gave him the key…"*); the quoted line; the checklist.
- **Sound:** silence.
- **Into the next:** the writer opens *The Night of the Fire*.

### 12 · Canvas *(much closer; ends on the Scene card)*
- **Purpose:** the writer traces the problem through the story, and the trace ends at the Scene.
- **Camera / crop:** 2.5× on a Canvas at 100%. About a quarter to a third of the relevant Canvas is in view at any moment. The still is the **destination**: June Mercer, the *plant it* thread arriving from the ledger, the "Plant it: pencil under hook 17. Her father's initials." note, and the **Scene card, *The Key Cabinet*** (*Scene · The East Stair*, 1,846 words, *"Seventeen was empty."*) under the pointer. The letter and Mara sit just above the frame, and the 1998 section's edge is at the left.
- **Motion intent (camera only; nothing is dragged):**
  1. **1998, top row:** Thomas Vale → *signed for* → "23:40 — key 17 signed out. Initials: T.V." → *recorded in* → 1998 Guest Ledger → *contradicts* → "Room 17 'vacant, no occupant.'"
  2. **1998, below:** Elias Vale → *was it him?* → "Who was in seventeen?" ← *saw?* ← Clara Mercer.
  3. **Now:** June Mercer → *wrote it?* → "The letter: 'He went back to seventeen.'" → *sent to* → Mara Vale.
  4. **Down the *plant it* line** to the note, then across to **The Key Cabinet** card. The pointer arrives and the card shows its hover.
  5. **Click.** The Scene opens (a Canvas Scene card opens its Scene), and the camera begins the push-in.
- **Sound:** almost quiet: air, one or two soft movement sounds, then the click.
- **Into the next:** the push-in toward the prose. The UI recedes.

### 13 · Back to the manuscript *(tighter than frame 01)*
- **Purpose:** resolution. *I found what I needed, and now I can keep writing.*
- **The viewer understands:** the Workspace journey changed the manuscript.
- **Camera / crop:** 2.55×, closer than frame 01 and lower. It rhymes with the opening without repeating it. No title, no chrome: the last lines of the Scene, with the new paragraph arriving in the lower third and room below for it to finish.
- **Product state:** *The Key Cabinet*, with the navigator retracted and the panel closed. The new paragraph: *"Beneath it, in pencil gone soft with years, someone had written a time and two initials: 23:40, T.V. Her father had signed for the key him|"*.
- **Cursor:** none. The text caret is typing.
- **Sound:** everything strips away. Natural, unhurried typing resumes, the same as frame 01.
- **Into the next:** "…himself." A held beat. The window fades and the stage remains.

### 14 · Sutura *(bottom lines strengthened)*
- **Content:** the approved wordmark (light ink), **Write the book.**, *Build only what it asks for.* (italic, accent ink), **Early Access · Free** and **writesutura.com**. The bottom two lines are a touch larger and one step brighter, still well below the headline.
- **Sound:** silence, or one restrained final tonal mark.

---

## Sound summary (annotation only)

| Moment | Sound |
|---|---|
| 01–02 | natural, soft typing |
| 03 | typing accelerates into a soft texture; sparse, subtle structure sounds as rows land |
| 04 | one click on the row; typing stops |
| 05 | silence → *tick… tick…* |
| 06 | small click; brief silence while the note is read; *tick… tick…* |
| 07 | small click; the motif continues under the hover |
| 07 → 08 | the click on Research; the motif **resolves**; one restrained transition |
| 09–11 | minimal cursor and UI sounds only |
| 12 | almost quiet; occasional subtle movement; the click on the Scene card |
| 13 | sound strips away; typing resumes |
| 14 | silence, or one final tonal mark |

No music, no voiceover, no keyboard ASMR, no whooshes, booms, risers or UI pops.

## Authenticity notes

Every surface is drawn with the app's own markup classes and `rune2.css`, and only the data is invented.

- **Status "Draft" → "Revising".** A new Status starts with *Planned / Drafting / Done*, and writers name their own options. Frame 04 now shows *why* it reads *Revising*.
- **"Characters" → "Cast".** At the Inspector's default 320px width, a label as long as "Characters" truncates to "Charact…". This is a real product finding.
- **Inspector depth.** Properties, History and Milestones don't all fit at laptop height. The panel scrolls, so frame 07 is the settled, scrolled state.
- **Research link.** A Relationship value opens its object. ⌘-click opens it in a new tab, which is what frame 08 shows.
- **Canvas Scene card.** Clicking a Scene card on a Canvas opens that Scene. That is the frame 12 → 13 return. (In frame 13 the earlier second tab still holds the Canvas.)
- **Canvas connections are not backlinks.** The ledger's *Referenced by* list shows only real sources.

## Approximations still in the storyboard

1. **The lapse's window (frames 03–04).** It is drawn 1260 logical wide with the navigator dragged to 400px. Both are real, writer-reachable layouts, but the rest of the film uses 1520 with a 252px navigator. The change is hidden by the two cuts on action and the lapse itself. The window's edges are never visible in 03–04. The navigator's width isn't visible again until the wide shot (08), where it is the default 252.
2. **The time-lapse editor** is a cinematic device: several Chapters' prose layered and blurred along the scroll. It shows the real editor's content, not a real UI state.
3. **Pressed and hover states** (Revision Notes action, Research link, Board card, Canvas card) are drawn with the app's own hover styling for a still frame.
4. **The new tab and Canvas click.** Frame 13 assumes the Canvas card opens the Scene in the second tab. The first tab already holds the Scene, so the real app would switch to that tab. Either way, the result on screen is the same Scene.

## Open decisions

1. **The lapse's last beat.** Whether the pointer's climb back to Part I reads in about 1 second, or needs the camera to lead it.
2. **Frame 10's pan.** Whether it should end on Elias (as storyboarded) or start there.
3. **The end card's timing.** Animation will decide whether the wordmark arrives before the line.
