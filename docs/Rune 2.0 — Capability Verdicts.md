# Rune 2.0 Capability Verdicts

2026-09-28 · Eyan El Ali

This report gives a product verdict on each proposed capability so the product owner can review the reasoning before any of it becomes authoritative. Nothing in the repository, the architecture document or the product decisions was changed to produce it. Evidence is the repository audit already delivered (branch rune-2 at 418004e plus uncommitted Trash work, live ledger at 031), CLAUDE.md and the architecture document. Claims about other products are from general knowledge, not fresh research.

## How to read the verdicts

Each capability gets a strategic category first, because that is the decision that matters, and then the six ratings the brief asks for. Where a capability splits into parts with different fates, the parts are categorised separately.

| Category | Meaning |
| --- | --- |
| A. Later, strategic | Not for the closed beta, but valuable enough that it should be planned, not merely allowed. |
| B. Evidence-gated | Plausibly valuable; build only if beta writers show the need. |
| C. Already covered | The existing primitives, or ones already recommended, express it. Building it separately would duplicate. |
| D. Harmful | Bloats Rune, prescribes a way to write, or pulls it toward generic software. Probably never. |
| E. Path now | Important enough that the current architecture must deliberately leave room for it, even though it is not built. |

Ratings: Product value (Low / Medium / High / Exceptional), Breadth (Niche / Some writers / Many writers / Nearly universal), Rune fit (Weak / Moderate / Strong / Core), Bloat risk (Low / Medium / High), Recommended status (Beta / Early post-beta / Later / Build only after user evidence / Do not build), Conceptual form. No combined score is computed; a High value with High bloat is a judgment call and is argued as one.

## 1. Workspace Page block system

| | Verdict |
| --- | --- |
| Category | A for text blocks and object references; A for View embeds; E for the content model; D for the rest of Notion's block catalogue |
| Product value | High |
| Breadth | Many writers |
| Rune fit | Strong (Workspace only) |
| Bloat risk | High |
| Recommended status | Early post-beta (references, text blocks); Later (View embeds, images) |
| Conceptual form | Page block |

**Should Rune have this?** Yes, but as a menu over a small block set, not as a block platform. The Workspace editor today is bare StarterKit with autolink (`src/components/rune2/WorkspacePageEditor.tsx:65-75`). A writer cannot point at a Character, Scene or Chapter from inside a sentence, and the only way to discover headings or checklists is knowing Markdown shortcuts. The `/` menu solves discovery; the reference block solves pointing.

**How far.** Three groups and roughly fifteen items, with a hard ceiling stated as a product rule: a block enters only if it is text, media, or a pointer at the story.

| Group | Blocks | Category |
| --- | --- | --- |
| Text | headings, bullet, numbered, checklist, quote, divider, one aside style | C, already in StarterKit; the menu only exposes them |
| Story | reference to Entry, Page, Scene, Chapter; embedded Collection View; embedded Scene View | A; the differentiating group |
| Media | image, attachment | A, after an Attachments table exists (architecture §25; nothing built) |
| Omitted | Canvas embed, table of contents | D |

**What to omit compared with Notion.** Columns and layouts, toggles, synced blocks, inline and linked databases, generic tables, external web embeds, buttons, page templates, equations, code with language pickers, colours and highlights, page icons and covers, comments, table of contents. A Page that needs a table should become a Collection; a Page that needs a table of contents should become several Pages in a Folder.

**Should Pages and Entries share the editor?** Yes, and they already do: an Entry body is the same component and the same saver (`WorkspacePageEditor.tsx:43-46`, `workspacePageSaver.ts`). Every block above applies to both. An Entry is a Page with a schema on top.

**Which blocks differentiate.** Only the Story group. A Scene reference that shows "Chapter 8 · Scene 2 · 1,240 words" and opens the prose; a Chapter reference; an embedded Scene View inside a Character Entry showing the Scenes she appears in. Headings and callouts are commodity and should be treated as such: shipped quietly, never marketed.

**Path now (E).** Two things the current code should not foreclose. First, mention chips must feed `object_references` so backlinks work; the Page save path (`saveVersionedContent`, a single conditional update) needs a reconciliation step on content save, which is easy to add now and awkward later if saves move client-side. Second, adding node types means older clients will meet unknown nodes; the renderer should already be tolerant of unknown node types rather than failing the document, and `rich_text_plain` should ignore non-text nodes it does not know (it already only reads `type:"text"`, which is the right shape).

## 2. Canvas

| | Verdict |
| --- | --- |
| Category | B, with one small E |
| Product value | Medium overall; High for a niche |
| Breadth | Some writers |
| Rune fit | Moderate |
| Bloat risk | High |
| Recommended status | Build only after user evidence |
| Conceptual form | First-class object with a dedicated surface |

**Would it materially improve Rune?** For mystery writers, heavy plotters and worldbuilders, yes: a clue web, a faction map, an act structure laid out spatially. For everyone else, no. Most spatial planning writers actually do is cards in lanes, which a Board View already gives, and a Card presentation of Scenes (section 4) gives the corkboard.

**Who benefits.** Mystery and thriller writers (who knows what, when), fantasy worldbuilders (factions, geography), heavy plotters (act structures). Discovery writers and first-timers never open it. Revision-heavy writers occasionally, for restructuring.

**First-class object?** If built, yes. Positions, edges and viewport are authored information that belongs to the Canvas, not to the objects on it. It gets a tree node, Trash, and a full-page surface; it is never embedded in a Page.

**What is placeable.** Free text cards, images (needs Attachments), and live cards for Entry, Page, Scene and Chapter. A Scene card shows its live title, position and words. That liveness is the only thing that would make Rune's Canvas different from Obsidian Canvas or Milanote, and it depends entirely on the reference model.

**Visual versus semantic.** Keep them separate. An edge on a Canvas is drawing; it never creates a Relationship. Placing an object on a Canvas creates one generic reference (source canvas, target object) so the object's Inspector can say "On canvas: Clue board". A writer who wants a semantic link uses a Relationship property.

**Differentiator?** Not on its own. Canvas products exist; Rune's would be judged against them and lose on drawing features. It becomes distinctive only as a spatial view of live manuscript objects, which means it must come after Scene metadata, references and Attachments.

**Cost.** The largest single Workspace feature: a new client library (none in `package.json`), a new persistence model, viewport and hit-testing, and the reference plumbing above. It should not be built on the strength of a hypothesis.

**Path now (E).** Only one thing: `object_references.source_type` is a CHECK constraint enumerating types (028:162-165). Adding `canvas` later is a migration, not a redesign. Nothing else needs to change now.

## 3. Timeline

| | Verdict |
| --- | --- |
| Category | A, with E for the View config |
| Product value | High for those who use it |
| Breadth | Some writers |
| Rune fit | Strong, because of the manuscript-order axis |
| Bloat risk | Medium |
| Recommended status | Later, after Scene properties |
| Conceptual form | View |

**Should it exist?** Yes, as a View type, and only because Rune can offer an axis nobody else has. A Timeline that orders by a Date property is Notion's timeline and Plottr's; on its own it is not a reason to choose Rune.

**Is it generic enough?** Yes, if it is defined strictly as "lay these objects along an ordered property" and never as "chronology". A Threads Collection along manuscript order, a History Collection along a Number property, a Relationships Collection along a Date property, and Scenes along a story-date property are all the same View with a different anchor.

**How Collections become compatible.** By having one of: a Date property; a Number property (fictional calendars do not fit ISO dates; "Year 412" and "Day 3" are numbers); a Relationship to Scenes, which positions the Entry at the manuscript position of its related Scenes. A Relationship to Chapters would work the same way once Chapters are reference targets. Realistically, most writers will use a Number or a Scene Relationship, not a Date.

**No usable property.** The Timeline type does not appear in the Add View menu; choosing it elsewhere shows one line, "Timeline needs a Date, Number or Scene property", with the option to add one. Entries with no value sit in an unplaced gutter, visible, not hidden.

**Manuscript position as the axis.** This is the author-native part and the reason to build the View at all. Three uses: a Thread drawn as a lane across the book, showing where it goes quiet; Scenes by story date beside Scenes by manuscript order, which exposes flashbacks and out-of-order telling; a Character's appearances as points along the manuscript. None of these is possible in Notion or Obsidian without hand-maintained ordinals.

**Differentiation.** Medium as a feature, High as a consequence of Scene metadata. It should be built after Scene properties and Scene-targeted Relationships, never before.

**Path now (E).** The View config validator (`workspace_view_config_shape_valid`, 027:112-146) and the `type` CHECK should be designed so a new type and an `anchor` key are additive. They are today; the only thing to avoid is any client code that assumes the three-type enum is closed.

## 4. View model

**Minimum long-term set: List, Table, Board, Timeline.** Four types, each over Collections and over Scenes. Everything else in the candidate list is either a presentation option on one of these or does not belong.

| Candidate | Verdict | Category | Reasoning |
| --- | --- | --- | --- |
| List | Keep | C | Exists (027). |
| Table | Keep | C | Exists. Inline cell editing already works. |
| Board | Keep | C | Exists. Needs group-by Relationship to reach its value (028:47-49 refuses it today). |
| Timeline | Add later | A | Section 3. The one new type worth its own renderer. |
| Cards | Presentation option on List | C | Density and tile size plus body excerpt. This is the corkboard when applied to Scenes. Not a system. |
| Gallery | Presentation option on Cards | C | Cards with a cover image once Attachments exist. Not a system. |
| Calendar | Do not build | D | Real dates are project management; story dates are a Timeline. |
| Outline | Do not build as a type | C | The manuscript hierarchy is the outline. A grouped List over a Collection covers the rest. |
| Graph | Do not build | D | Section 14. |

**What matters more than new types.** The audit found the existing Views shallow in ways that block real workflows: filters exist only for choice properties (027:201-207), one sort, no group or sort by Relationship, Entries in creation order with no manual reorder (025:34-35). Fixing those unlocks "Scenes by POV", "Characters in cast order" and "Threads with no Scenes yet". That is beta work and worth more than any new View type.

**Path now (E).** The View tables and validators are owned by `collection_id`. Scene Views need the same config over a Manuscript-owned definition. The cleanest route is an owner column or a parallel table sharing the validator functions; either way, the pure helpers in `collectionViews.ts` should stay owner-agnostic, which they are.

## 5. Manuscript-aware Workspace

| | Verdict |
| --- | --- |
| Category | E for Scene properties and Scene Views; A for the rest; one D |
| Product value | Exceptional |
| Breadth | Many writers directly; nearly universal indirectly |
| Rune fit | Core |
| Bloat risk | Low |
| Recommended status | Beta for Scene properties and Scene Views (already §35 surface); Early post-beta for the rest |
| Conceptual form | Combination: first-class metadata, View, Page block, system capability |

This is where Rune's advantage lives and where the code is thinnest. A Scene today has title, prose, words, position and version (`src/lib/types.ts:362-373`). Relationships and generic links can target Scenes (028), backlinks show in the Inspector, and the Inspector itself states that Scene properties are not built (`Rune2Panel.tsx:317-323`).

| Interaction | Today | Verdict | Advantage over Notion or Obsidian |
| --- | --- | --- | --- |
| Relationship from Entry to Scenes | Built | C | Real: the target is a live manuscript unit, not a page. |
| Relationship from Scene to Entries (POV, Characters, Location) | Not built; only Entries carry values (028:181-182) | E, Beta | Genuine: authored from the Scene where the writer is. |
| Relationship to Chapters | Not built (028:17-18 anticipates it) | A, Early post-beta, as a reference target only | Moderate: "see Chapter 12" from notes. |
| Relationship to Manuscript Groups | Not built | D | None. A Group is structure; a Page named "Part II" covers any notes about it. |
| Scene metadata connected to Collections | Not built | E, Beta | Genuine: the property's target is a Collection the writer defined. |
| Manuscript-order sorting | Navigator only | E, Beta: the default sort of every Scene View and of backlinks from Scenes | Genuine: no other tool has a reading order to sort by. |
| Manuscript-order Timeline positioning | Not built | A, Later | Genuine (section 3). |
| Scene references inside Pages | Not built | A, Early post-beta, as a chip that opens the Scene | Moderate alone; strong combined with the above. |
| Embedding Scene prose in a Page | Not built | D | A second rendering of manuscript prose outside the editor invites drift and violates the spirit of §7. Show metadata, never prose. |
| Chapter references | Not built | A, Early post-beta | As above. |
| Backlinks | Built, derived (`references.ts:97-111`) | C | Real, and already in the right place (Inspector, not the page foot). |
| Filtered Scene Views | Not built | E, Beta | Genuine: "Scenes with Status = Draft", "Scenes where Characters contains Nerai". |
| "Appears in" on an Entry | Backlinks exist unordered | A, Early post-beta: render as an implicit Scene View filtered by relationship to this Entry, in reading order, with summed words | Genuine and cheap: everything needed is derivable now. |
| Jump from Workspace object into prose | Built for Inspector links (`useOpenObject`, `openableId`) | C; extend to chips | Real. |
| Manuscript information without polluting prose | Inspector exists | C; grow it with properties, history, Scene-anchored notes | Real: this is the design rule that keeps Rune a writing app. |

**Which create genuine advantage.** Scene-sourced Relationships, manuscript-order sorting, filtered Scene Views, "Appears in" with words, and manuscript-order Timeline. Together they mean the Workspace knows where in the book something is. Mentions, Chapter references and backlinks are necessary connective tissue but not advantages on their own; Notion has mentions and Obsidian has backlinks.

**Other manuscript-aware primitives Rune needs.**

1. **A suggested Synopsis Scene property.** Every outliner from Scrivener onward has one, and Cards over Scenes are empty without it. Do not hardcode a column; when a writer first opens Scene properties, offer Synopsis (Text) and Status (Status) as one-click suggestions. Category A.
2. **One derived rollup: words per related object.** "Nerai: 14 Scenes, 31,200 words" is the single aggregate writers want, and it is computable from `backlinksOf` and the navigator index without a formula system. Category A. This is the only rollup Rune should ever have.
3. **Reading position as a stable derived value** exposed to Views and Timeline (chapter ordinal, scene ordinal), never stored. The navigator already computes it (`navigatorModel.ts`); it needs to be reachable from View code. Category E.
4. **Scene-anchored Revision Notes** (section 7). Category A.

**Path now (E).** Decide the owner model for Scene property definitions before Scene Views are designed: a parallel `scene_properties` and `scene_values` pair is recommended so the Workspace RLS and the Scene save path (`save_scene_checked`) are untouched, and property writes never bump `scenes.version`. Keep `ReferenceObjectType` open to `chapter`. Keep Relationship value storage in `object_references` so a Scene-sourced Relationship is the same row shape with `source_type = 'scene'`; the schema already allows a Scene source, only the property-value rule (`property_id is null or source_type = 'entry'`, 028:181-182) needs to widen.

## 6. Templates

| | Verdict |
| --- | --- |
| Category | A; user-authored templates B; a template gallery D |
| Product value | Medium |
| Breadth | Many writers, especially first-timers and moderate planners |
| Rune fit | Strong |
| Bloat risk | Low if capped; High if it becomes a library |
| Recommended status | Early post-beta |
| Conceptual form | Template (a recipe over existing RPCs; no schema) |

**The principle is right.** "Rune provides primitives; templates demonstrate configurations and introduce no modules" is the correct rule and the code already respects it: there is no template code and no template table, so a template can only ever be a sequence of the existing create-Collection, create-property and create-View calls.

**Role.** Discovery, not prescription. A writer creating a Collection sees "Start from: Blank, Characters, Locations, Threads, Research". A writer opening Scene properties for the first time sees two suggestions, Synopsis and Status. That is the whole template system. It teaches what a Relationship to Scenes is by showing one.

| Template | Creates | Why it earns its place |
| --- | --- | --- |
| Characters | Role (select), Status (status), Appears in (Relationship to Scenes, many); Table and Board by role | The most common Collection; shows Scene Relationships. |
| Locations | Type (select), Appears in (Relationship to Scenes, many); Table | Second most common; same lesson. |
| Threads | Status (status), Scenes (Relationship to Scenes, many); Table and Board by status | Teaches the manuscript-order idea; becomes the Timeline's best lane once that exists. |
| Research | Source (text), Used in (Relationship to Scenes, many); List | Shows that notes can point at the book. |
| Scene properties starter | Synopsis (text), Status (status) on Scenes | Makes Cards and revision Boards useful on day one. |

**Not recommended.** Clues (a Thread), Factions (a Character-shaped Collection any writer makes in a minute), Character Arcs (a Thread with a Character Relationship), Revision Tracker (a Scene Status property), World Timeline (a Number property plus the Timeline View), Submissions (business tracking), Beat Sheets (prescriptive structure), whole-Project templates (a new Project is Manuscript plus Chapter 1, §37). No sample Entries, no Pages, no more than three properties and two Views per template.

**User-authored templates ("save this Collection as a template")** are category B: plausible for series writers, unproven, and they need a definition format. Wait for evidence.

## 7. Revision

| | Verdict |
| --- | --- |
| Category | Mostly C once Scene properties exist; two native pieces A; a passes engine D |
| Product value | High |
| Breadth | Nearly universal: every finished novel is revised |
| Rune fit | Core |
| Bloat risk | Low as primitives; High as a module |
| Recommended status | Early post-beta for the native pieces |
| Conceptual form | Combination: Scene properties, Scene Views, Scene-anchored notes, milestones, a template |

**Would Rune benefit from a first-class Revision system?** Rune benefits enormously from being good at revision, and revision is where "help writers finish" is won or lost. But revision is not one workflow. Some writers do one structural pass then one line pass; some do a pass per POV; some do a continuity sweep; some just reread and fix. A native system with pass types would prescribe one of these. The right answer is that revision is what Scene metadata, Scene Views, history and notes are for, plus one template that shows how they fit.

| Piece | Verdict | Form |
| --- | --- | --- |
| Per-Scene revision state | C | A Status property on Scenes. |
| Custom passes | C | A second Status or Select property per pass ("Structural pass", "Line pass"). Multiple Status properties must be allowed; they are. |
| Revision notes | C exists; A extension | Keep `project_notes`; add optional `scene_id` so a note attaches to the Scene it was written in and shows in that Scene's Inspector. The panel already names this gap (`Rune2Panel.tsx:92-96`). |
| Issues | C | A Collection (or Threads) related to Scenes. |
| Structural review | C plus section 12 | A Scene Table with Synopsis, POV, Status and words in reading order, and a whole-manuscript reading mode. |
| Manuscript milestones | A, native | Section 8. "First draft complete" is a snapshot, not a property value. |
| Progress through a pass | C, with one presentation detail | A Board of Scenes by the pass's Status property; each lane shows Scene count and words. "18 of 42 Scenes revised, 61,000 of 90,000 words" is a Board header, not a system. |
| Views of Scenes during revision | E, Beta | Scene Views. |
| Revision template | A | Creates a Status property named for the pass and a Board over it, and offers to create a milestone first. |

**What deserves native behaviour.** Exactly two things: notes that can attach to a Scene, and milestones that snapshot the manuscript. Both are small and both are about the manuscript, not about a methodology.

**What should never be native (D).** Pass types, pass templates with fixed stages, completion percentages as a first-class number, a separate Revision page, automatic flagging of "issues" in prose.

## 8. Version history and manuscript snapshots

| | Verdict |
| --- | --- |
| Category | E and A for Scene history and milestones; B for whole-manuscript restore and diff; D for whole-manuscript diff |
| Product value | Exceptional (safety); Medium (convenience) |
| Breadth | Nearly universal as trust; Some writers as a used feature |
| Rune fit | Core |
| Bloat risk | Low |
| Recommended status | Early post-beta, first in line |
| Conceptual form | System capability |

**Safety versus convenience.** These must be separated because they justify different investments.

| Requirement | Kind | Verdict | Reasoning |
| --- | --- | --- | --- |
| Automatic Scene history with restore | Safety | E, Early post-beta | Today a bad rewrite has no way back; `version` is only optimistic concurrency (015:228-238). A paid manuscript product without this asks for trust it cannot back. Trigger on content change, coalesced to one row per Scene per interval, retention by count and age. Restore is an ordinary save through `save_scene_checked`, so it is never destructive. |
| Trash with restore | Safety | C | Built (030, 031, uncommitted). |
| Export as a backup | Safety | C, but missing from the Rune 2.0 shell | Legacy only today. |
| Named milestones (First Draft, Beta Reader Draft, Submission Draft) | Convenience with a safety edge | A, Early post-beta | A row that pins every active Scene's history entry and the structure at that moment. Writers create them; Rune may suggest one when a goal completes but never creates one silently. |
| Restore a single Scene from a milestone | Convenience | A | Same as Scene restore. |
| Restore the whole manuscript from a milestone | Convenience | B | Rare, dangerous, and expressible as "open the milestone read-only and restore the Scenes you want". Build only if asked. |
| Compare two versions of one Scene | Convenience | B | A per-Scene text diff is cheap and useful for line edits; wait for evidence that writers use history first. |
| Compare two milestones of the whole manuscript | Convenience | D | Heavy, rarely useful for fiction, and pulls Rune toward version-control software. |
| Workspace Page and Entry history | Convenience | D for now | Trash and conditional saves are enough for notes; history is a manuscript concern. |
| Branching drafts | Convenience | D | Unplaced Scenes already hold alternate drafts with identity. |

**Path now (E).** Three things the current code should preserve. Scene content stays a separately addressable unit (it is). `save_scene_checked` stays the single write path, including the "Keep Local" conflict path, so one trigger sees every content change (it does: `syncEngine.ts:597,621`). `renameScene` bumps `version` without a content change (`scenes.ts:294-313`), so the history trigger must compare `content`, never `version`.

## 9. Search and command palette

| | Verdict |
| --- | --- |
| Category | C for search; A for go-to, recent and create; D for a command registry |
| Product value | High |
| Breadth | Many writers; nearly universal on long manuscripts |
| Rune fit | Strong |
| Bloat risk | Medium |
| Recommended status | Early post-beta for the additions |
| Conceptual form | System capability |

**Already there.** ⌘K opens Project Search (`ProjectSearch.tsx:44-50`): titles matched on the client across Groups, Chapters, Scenes, Pages, Folders, Collections and Entries; body text matched on the server by substring (029). That is the universal search the brief describes. It is not a command palette and should not become one.

| Candidate | Verdict | Reasoning |
| --- | --- | --- |
| Search manuscript prose, Pages, Entries | C | Built. |
| Jump to Scene or Chapter | C | Built; Enter opens. Add ⌘Enter for a new tab. |
| Recent objects when the query is empty | A | The most-used affordance in every palette; trivial with the working set. |
| Open Canvases | B | Only if Canvas exists; it would simply be one more searchable kind. |
| Limited object creation ("New Page", "New Entry in Characters", "New Scene") | A | Three verbs, typed, no menu tree. |
| Navigation commands (toggle navigator, open Inspector) | D | The shell has a context bar and shortcuts; a command list here is generic productivity. |
| Settings, formatting, export commands | D | Same. |
| Search operators, fuzzy matching, regular expressions | B | Wait for evidence; substring plus tiered ranking is enough for one novel. |
| Search index (stored text or trigram) | A, Later | Needed when Projects grow; the migration comment already plans it (029:31-34). |

**Rule.** ⌘K is for going somewhere and starting something. Anything that is a setting or a verb on the current object belongs on the object.

## 10. References and backlinks

| | Verdict |
| --- | --- |
| Category | A for @-references and hover cards; C for backlinks; E for reconciliation; D for wiki links and object embeds |
| Product value | High |
| Breadth | Many writers |
| Rune fit | Strong |
| Bloat risk | Medium |
| Recommended status | Early post-beta |
| Conceptual form | Page block plus system capability |

**Concrete interaction direction.**

| Element | Direction | Category |
| --- | --- | --- |
| `@` reference | Typing `@` in a Page or Entry body opens the same picker the Inspector uses (`ObjectPicker`), scoped to Entry, Page, Scene and, once supported, Chapter. Inserts a chip carrying only the target id. | A |
| Wiki-style `[[ ]]` | Do not add. It encourages linking every noun, needs title-based resolution that breaks on rename, and is the identity of a note-graph tool. Rune's references are by id and by deliberate choice. | D |
| Rich object cards | A small hover card: kind, place ("Characters" or "Chapter 8"), and for a Scene its words and position. No body excerpt, no property list. Clicking opens the object. | A, Later |
| Embedded objects | An embedded saved View is the one embed worth having. Embedding an Entry or Page body is not: mention it and open it. Embedding Scene prose is refused (section 5). | View embed A; others D |
| Backlinks | Already derived from `object_references` and shown in the Inspector as "Referenced by". Keep them there; never render a backlinks footer on every Page. Mentions must feed the same table so they appear. | C, with E |
| References to manuscript objects | Scene and Chapter chips read as the navigator names them ("Chapter 8 · Scene 2", a sole-Scene Chapter as the Chapter) and open the prose in the writing surface. | A |
| Trashed and deleted targets | A trashed target renders muted and opens Trash; a permanently deleted target renders as plain text (§28), rewritten in the stored JSON only on the next save. | A |
| Manuscript prose | Excluded entirely. No `@`, no autolink. The one leak found by the audit is that StarterKit v3 enables Link in `useSceneEditor` (356-369); it should be disabled. | Rule |

**Path now (E).** Mentions are only worth building if they become references. The reconciliation (walk the saved JSON for mention nodes, diff against generic references from that source, add and remove through the existing RPCs) belongs in the server save action. Keep Page and Entry saves server-side so that hook has one home.

## 11. Series and universe support

| | Verdict |
| --- | --- |
| Category | B for building; E for three constraints |
| Product value | High for series writers |
| Breadth | Some writers overall; many in genre fiction, where series are the norm |
| Rune fit | Strong |
| Bloat risk | Medium |
| Recommended status | Build only after user evidence |
| Conceptual form | A future container above Project owning shared Collections |

**Does Rune become meaningfully better with it?** For a fantasy, romance or mystery series writer, yes: the cast, the world and the timeline persist across books, and "Appears in" across a series is a question nobody else can answer. For a standalone novelist, nothing changes. It is the most credible long-term expansion of the Workspace, and it should be decided by beta writers' actual projects, not assumed.

**What the current architecture must avoid preventing.**

1. Identity must not depend on the Project. It does not: every object is a UUID, and references carry ids, never positions or titles. Keep it that way; in particular, never let a future Workspace content format store `project_id` inside JSON.
2. The same-Project rule on references is a trigger check (`check_object_reference`, 028:237-290), not a composite key. Relaxing it to same-Universe later is a function change. Keep it a function.
3. Collections are owned by a non-null `project_id`. A shared Collection needs an alternative owner. Do not add constraints or RLS that assume a Collection's Project is the only possible owner in places where a later `universe_id` could not be added beside it. Search (`search_project_content`) is per Project and can be wrapped later.

**What should not be built yet.** A Universe container, shared Collections, cross-project mentions, series dashboards, series-level search, series export. None of it is needed to prove the product, and building it early would force the Workspace ownership model before the single-Project model is settled with real writers.

## 12. Things we missed

Working through the nine writer profiles against the primitives and the capabilities above, three recurring problems are not addressed, and one is worth watching.

### 12.1 Manuscript import

| | Verdict |
| --- | --- |
| Category | A, bordering on Beta |
| Product value | Exceptional for anyone with an existing draft |
| Breadth | Nearly universal among revision-heavy writers and 100k-word authors; irrelevant to first-timers |
| Rune fit | Core |
| Bloat risk | Low |
| Recommended status | Early post-beta at the latest |
| Conceptual form | System capability |

Rune has no import; the only way in is pasting one Scene at a time. Every capability in sections 5, 7 and 8 is aimed at writers who have a manuscript, and none of them can reach Rune. Accept .docx, .md and .txt; split on chapter headings and scene-break markers into Chapters and Scenes; preview the tree before creating anything; create through `create_chapter_checked` and `insert_scene_checked`; treat imported words under the existing pasted-text rule (totals and export yes, Today's Words no). Scrivener project import is a separate, later task.

### 12.2 Whole-manuscript reading mode, including over a Scene View

| | Verdict |
| --- | --- |
| Category | A |
| Product value | High |
| Breadth | Many writers; nearly universal at revision time |
| Rune fit | Core |
| Bloat risk | Low |
| Recommended status | Beta if cheap, else Early post-beta |
| Conceptual form | Dedicated surface (read-only) |

Revising means reading the book whole, and today the largest continuous unit is one Chapter. A read-only rendering of every placed Scene in order with Group and Chapter headings, built from the export plan (`planManuscriptExport`), with headings that open the Chapter for editing, fixes that. The same surface over a filtered Scene View gives the multi-POV writer "read every Nerai Scene in order" and the revision writer "read every Scene still marked Draft". No editors mounted, no search-and-replace, no annotations.

### 12.3 Whole-Project backup export

| | Verdict |
| --- | --- |
| Category | A |
| Product value | High as trust; Low as daily use |
| Breadth | Nearly universal as reassurance |
| Rune fit | Core |
| Bloat risk | Low |
| Recommended status | Early post-beta |
| Conceptual form | System capability |

Manuscript export exists (legacy shell only). Nothing exports the Workspace. A writer who has built a cast, a world and a thread map has no way to take it with them, and the product promise that words remain the writer's own should cover the notes too. One action: a zip of the manuscript as .docx or Markdown plus every Page and Entry as Markdown with properties as front matter, plus a JSON of the structure. This is also the honest answer to "what if Rune goes away".

### 12.4 Watch, do not build: passage-anchored notes in prose

Category B. The most common revision act in Word and Scrivener is a note pinned to a passage. Scene-anchored Revision Notes (section 7) cover most of it. A passage-anchored note would be the first feature to write into manuscript JSON, must be stripped on export, must survive offline and conflict paths, and must be ignored by the word counter. Decide only after Scene-anchored notes ship and writers ask for finer anchoring.

**Considered and rejected as already covered or not justified:** session word goals and sprints (Arena and project goals), per-Chapter targets (a project goal suffices), character name search across the manuscript (search exists), a "where was I" landing (the working set and dashboard do this), dictation, distraction-free full-screen beyond Focus Mode, reading statistics such as time-to-read (an estimate on the manuscript page, not a capability), story-structure beat sheets (prescriptive), name generators and any AI assistance.

## 13. If Rune only adds three major power capabilities after the beta

One precondition first: **manuscript import** is not a power capability, it is the door. Without it, the three below only serve writers who started their novel in Rune. It should ship regardless of this list.

**1. Scene metadata and Scene Views.** Scene properties defined at Manuscript level, Scene-sourced Relationships to Collections, and List, Table, Board and Cards over Scenes with manuscript order as the default sort. This is the capability that makes every other Workspace feature manuscript-aware, and it is the one generic tools cannot copy. It turns "a Characters database" into "a cast that knows where it appears" and "a Board" into "a revision plan that never reorders the book". Without it, Rune's Workspace is a smaller Notion.

**2. Scene history and named milestones.** Automatic, coalesced per-Scene history with restore, and writer-named manuscript milestones. This is trust. A paid product that asks a writer to move a 90,000-word draft in must be able to give any Scene back. It also gives Revision its native piece without a revision module.

**3. `@`-references and a restrained slash menu in Workspace text, with Chapter as a reference target.** This is the connective tissue: a Page that can say "see Chapter 12" and open it, a Character Entry that lists where she appears, a research note that points at the Scene it was for. It is the smallest change that makes Pages feel part of the book instead of beside it, and it makes backlinks meaningful.

**Why not Canvas, Timeline or templates.** Canvas is a hypothesis about a minority; Timeline is a consequence of capability 1 and should follow it; templates are a discovery aid over capability 1 and are cheap enough to ride along with it rather than count as a major addition.

## 14. Capabilities Rune should probably never add

| Capability | Why never |
| --- | --- |
| Any AI that writes, rewrites, summarises, completes, suggests names or generates characters or plot | The authorship promise. Also excludes "AI synopsis" and "AI continuity check", which read the prose to write about it. |
| Automatic entity detection or linking in manuscript prose | Turns the manuscript into a database interface (§7). |
| `[[wiki links]]`, unlinked-mention panels, a graph view | The identity of a personal-knowledge tool; encourages linking nouns instead of writing. |
| Embedding Scene prose in Pages or Entries | A second rendering of the manuscript outside the editor; drift and confusion about where the book is. |
| Continuous multi-Scene editing across Scene boundaries | Rebuilds the hardened per-Scene save, conflict and offline model for a cosmetic gain. |
| Columns, toggles, synced blocks, inline databases, page icons and covers, colours, table of contents | Layout and decoration; Notion's identity. |
| Formulas, rollups (beyond words per related object), automations, reminders, recurring tasks | Spreadsheet and productivity semantics. Rune must not nag or compute. |
| Calendar View, Gantt charts, deadlines as a first-class concept | Project management. Story time is a Timeline; real time is the writer's own. |
| A native Character, Location, Plot, Clue, Faction or Magic System module | Prescribes one way to write; Collections express all of them. |
| A Revision Passes engine with pass types, stages and completion percentages | Prescribes a methodology; a Status property and a Board cover every method. |
| Beat-sheet and story-structure templates (Save the Cat, Hero's Journey) | Prescriptive structure inside a tool that promises not to prescribe. |
| Whole-manuscript diff, branching drafts, merge | Version-control software; Unplaced Scenes and Scene history cover alternate drafts. |
| Workspace Page version history | Trash and conditional saves suffice for notes. |
| A general command palette with settings and formatting commands | Generic productivity; ⌘K is for going and starting. |
| Collaboration, shared editing, reader comments, publishing, community | A different product with different trust and privacy rules. |
| Plugin marketplace, user scripting, formulas over Scenes | Every plugin is a way to make Rune generic. |
| Multiple manuscripts per Project, aliases in the tree, cross-project references (before a Universe model) | Deferred in §36; would force ownership decisions early. |
| Mobile editing of the manuscript | Explicitly out of scope; the phone waiting room is the product decision. |
| A replacement XP economy, badges, streak pressure, leaderboards | Retired direction (§44). |
| Canvas as freehand drawing, shapes, whiteboarding | If Canvas is ever built it is object cards and text on a plane, not a drawing tool. |
| Full mobile or web publishing of Pages, public wikis | Rune is private by design. |

## 15. Rune at full potential

**What a very advanced writer should eventually be able to construct.** A fantasy novelist writing book two of a trilogy has, in one Project: a Characters Collection with role, allegiance and status, a Locations Collection, a Factions Collection related to both, a Gods Collection, a History Collection ordered by a Number property and drawn as a Timeline of the world; Scene properties for POV (Relationship to Characters), Location, Story Day (Number), Status and Synopsis; a Scene Table in reading order with all of those columns; a Board of Scenes by Status with words per lane that she uses as her revision plan; Cards over Scenes as a corkboard; a Threads Collection related to Scenes, each Thread drawn as a lane along the manuscript so she can see the assassination plot go quiet for eleven chapters; Nerai's Entry showing she appears in 14 Scenes and 31,200 words, in order, and every Page that mentions her; Pages of lore and research that `@`-mention Entries, Scenes and Chapters and open them; revision notes attached to the Scenes they concern; a milestone named "Before structural rewrite" that she can open read-only and restore any Scene from; the previous draft imported from Word; the current draft exported with Part headings; and a backup of everything as Markdown. Every piece of that is a Page, a Collection, an Entry, a Property, a Reference or a View. None of it changed how the prose looks, and none of it required a module named Character, Plot or Revision.

**What keeps it from being bloated.** The navigator shows only what she made. The editor shows Chapter and prose. Properties live in the Inspector, which is closed until opened. Backlinks live there too. The `/` menu has fifteen items. There are four View types. There is one rollup. Nothing runs on its own, reminds her of anything, or scores her. The complexity is entirely hers, assembled from a small set of parts, and it could be deleted Collection by Collection without touching a word of the book.

**What the minimalist novelist sees.** A title, a navigator with Manuscript and Chapter 1, and a page of prose. The chrome fades when he types. Words today and total words are visible. A second Chapter is one click. Saves are silent and survive a lost connection. If he deletes a Scene it is in Trash; if he rewrites one badly it is in history. He can export the book. He never opens a Page, never sees a property, never meets a Collection, and never notices a `/` menu because he never types in a Workspace document. He finishes a novel and the only Rune he ever met was an editor with chapters.

**The test.** Both writers use the same Scene table, the same editor and the same save path. The advanced writer's system was assembled from tools the minimalist could have used and chose not to, not from features added for the advanced writer alone. If a future capability cannot pass that test, it is the wrong capability. Under that rule Rune can become very powerful and still be, first and last, a writing application.
