# Rune 2.0 — Product & Domain Architecture

> **Status.** This document is the authoritative source for Rune 2.0 product and domain architecture. `CLAUDE.md` defers to it for Rune 2.0 decisions.
>
> It describes the **target** product. It does not describe what is currently deployed. Much of the current codebase still implements the pre-2.0 model: word-limit pricing, XP and Levels, Arena, and Pages as manuscript prose. Those systems are retired through staged, compatibility-safe migration (§45). They are never ripped out because this document deprecates them.
>
> This revision includes product decisions made after the Rune 2.0 repository audit. That audit is not stored in this repository. Where this document cites the audit's findings or recommendations, it does so as they were reported to the product owner.
>
> Deciding something here does **not** authorize implementing it. Each migration or retirement step needs an explicit implementation task.

---

## Product direction

Rune 2.0 is:

> **A special manuscript surrounded by a workspace the writer can shape however they think.**

Product priorities, in order:

1. **Manuscript integrity.**
2. **An excellent writing experience.**
3. **A flexible supporting Workspace.**
4. **Complexity only when requested.**
5. **Protect attention.**
6. **Help writers finish.**
7. **The writer creates. Rune organizes.**

Rune 2.0 is built around writing, organizing creative work, protecting attention, and helping writers finish.

It is not a progression RPG layered over writing software. XP, Levels, word-limit monetization, and progression-as-game do not define Rune 2.0 (§43, §44).

Rune still cares a great deal about progress. The distinction is:

> **Progress reflects the actual creative work.**
> **Gamification exists primarily to manufacture engagement.**

Rune 2.0 puts the first ahead of the second.

The authorship boundary does not change: Rune will never use AI to write, rewrite, or complete a writer's story.

---

## 1. Architectural thesis

Rune has one opinionated system for the manuscript and one composable system for everything surrounding it.

The manuscript is special.

The workspace is flexible.

They can connect, but they do not become the same thing.

The fundamental model is:

```text
PROJECT
│
├── MANUSCRIPT
│   └── structured creative writing
│
├── WORKSPACE
│   └── flexible supporting knowledge
│
└── WRITING INFRASTRUCTURE
    └── progress, sessions, history, search, export, sync, etc.
```

Rune's core architectural principle is:

> The manuscript participates in the workspace without becoming the workspace.

---

# 2. Project

A `Project` represents the complete creative work.

For Rune 2.0, one Project means one novel and everything associated with creating it.

```text
Project: Hollow
│
├── Manuscript
├── Pages
├── Folders
├── Collections
├── Attachments
├── Workspace structure
├── Writing history
├── Goals / progress
├── Search
├── Trash
└── Project settings
```

For Rune 2.0:

```text
1 Project
1 Manuscript
```

Multiple manuscripts inside one Project are explicitly deferred.

The Project is also the boundary for:

- ownership
- search
- relationships
- offline synchronization
- attachments
- archive/export
- trash
- deletion

Rune 2.0 does not support cross-project references.

---

# 3. Manuscript

The `Manuscript` is the ordered creative work intended to become the finished novel.

It is not a Page.

It is not a Collection.

It has special behavior for:

- prose
- narrative order
- word counts
- writing sessions
- progress
- export
- offline reliability
- history/versioning
- revision later

The manuscript hierarchy is:

```text
MANUSCRIPT
│
├── MANUSCRIPT GROUP
│   │
│   ├── MANUSCRIPT GROUP
│   │   └── CHAPTER
│   │       └── SCENE
│   │
│   └── CHAPTER
│       └── SCENE
│
├── CHAPTER
│   └── SCENE
│
└── UNPLACED SCENES
    ├── SCENE
    └── SCENE
```

---

# 4. Manuscript Group

A `ManuscriptGroup` is a structural grouping layer.

It contains no prose.

Examples of what writers may use one for:

```text
Part I
Book Two
Section Three
Act I
Interlude
```

Rune does not need separate object types for these.

Internally they are all simply manuscript groups.

Groups may recursively contain other Groups.

```text
Book I
└── Part I
    └── Chapter 1
```

A Group can contain:

```text
ManuscriptGroup
Chapter
```

A Group cannot directly contain Scenes.

Moving or renaming a Group does not change the identity of anything contained within it.

### Groups in export

A titled Group is meaningful manuscript structure. By default, standard manuscript export includes it as a structural heading before its Chapters.

```text
PART II
THE SHIMMERING VEIL

Chapter 7
…
```

Exact formatting is decided during export implementation. That includes how numbering labels and titles combine, how untitled Groups are handled, and how nested Groups are styled.

---

# 5. Chapter

A `Chapter` is an ordered manuscript structure containing Scenes.

A Chapter may exist:

```text
directly under Manuscript
```

or:

```text
inside any Manuscript Group
```

A Chapter contains no prose directly.

All prose belongs to Scenes.

A Chapter is simply an ordered collection of placed Scenes:

```text
CHAPTER
├── SCENE
├── SCENE
└── SCENE
```

> **Every placed Scene in a Chapter is part of that Chapter.**

No placed Scene is an alternate or a candidate kept beside the one that "really" counts. Rune 2.0 has no canonical Scene (§6).

Chapters may exist before meaningful prose has been written.

Creating a Chapter automatically creates an initial unnamed Scene, but Rune does not need to expose that Scene to a writer who does not care about scene structure.

---

# 6. Scene

A `Scene` is the smallest first-class unit of manuscript prose.

All manuscript prose belongs to Scenes.

A Scene may exist in exactly one of two states:

```text
PLACED
Scene → Chapter

UNPLACED
Scene → Manuscript's Unplaced Scenes pool
```

Scenes may move:

```text
Chapter → Chapter
Chapter → Unplaced
Unplaced → Chapter
```

without changing identity.

- Moving a Scene to Unplaced Scenes removes it from narrative order. It does not delete it.
- Moving an Unplaced Scene into a Chapter makes it part of the ordered manuscript.

Unplaced Scenes allow writers to draft or plan scenes before deciding exactly where they belong.

### No canonical Scene

Rune 2.0 has **no canonical Scene concept**. There is no:

- canonical Scene,
- primary Scene,
- active Scene that suppresses its siblings,
- special Scene that alone counts toward manuscript totals,
- special Scene that alone appears in export.

Every placed Scene is part of the manuscript. Therefore:

- every placed Scene counts toward the ordered manuscript word total,
- every placed Scene appears in manuscript export,
- Scene order defines prose order within its Chapter.

A writer who no longer wants some prose in narrative order moves that Scene to Unplaced Scenes. Keeping an alternate draft is not a Chapter state.

Canonical Pages are a legacy Rune 1.x concept only. §42 defines how existing canonical Pages are translated, and §45 how the legacy flag is retired.

Elsewhere in this document, "canonical" keeps its ordinary meaning, as in one canonical identity (§21) or one canonical sidebar location (§14). Those uses are unrelated to legacy canonical Pages.

### Unplaced Scene semantics

An Unplaced Scene:

- is genuine manuscript prose,
- belongs to the Manuscript,
- has no current Chapter placement.

It is not deleted material. It is manuscript material that currently has no position in the narrative. An Unplaced Scene:

- keeps its Scene identity,
- stays fully editable in the manuscript editor,
- keeps the same saving, offline, and sync protection as a placed Scene,
- will be searchable when search exists (§29),
- can be moved into a Chapter at any time.

An Unplaced Scene:

- does **not** count toward the ordered, official manuscript word total,
- does **not** appear in standard manuscript export by default.

Writing new prose in an Unplaced Scene is still real writing. It **does** count toward writing-activity metrics:

- Today's Words or its equivalent,
- writing-day history,
- streak and history calculations, if those remain,
- writing-session progress.

The existing rules for pasted and imported text still apply within these metrics.

Unplaced Scene words are never designed around a free-word allowance. That product model is retired (§43).

Unplaced words should be distinguishable from the ordered manuscript word count.

For example:

```text
Manuscript        72,430 words
Unplaced Scenes    2,140 words
```

Exact presentation is a later UX decision.

### Scene numbering

Scene numbers such as `31.2` are **derived presentation, not stored identity**.

`31.2` means "the second placed Scene currently appearing in Chapter 31."

When Scenes move, their displayed numbers may change. Their Scene IDs do not.

Unplaced Scenes have no Chapter position, so they have no derived Chapter-based number.

Nothing may persist a Scene number as a reference key. References, relationships, and backlinks always target the Scene ID.

### Scenes in export

> A Chapter's exported prose is the ordered concatenation of all its placed Scenes, with a manuscript-appropriate scene break between adjacent Scenes.

Conceptually:

```text
CHAPTER 12

[Scene 1 prose]

* * *

[Scene 2 prose]

* * *

[Scene 3 prose]
```

The exact visual separator is decided during export implementation. The semantic rule is fixed.

Scene titles are organizational metadata. Standard manuscript export does **not** print them. Printing Scene titles would need a separate, explicit product decision introducing titled-scene export.

Unplaced Scenes are not part of standard export (see above).

### Scene identity and storage

Rune 2.0 stores Scenes in a `scenes` table. A Scene belongs to its Manuscript (`manuscript_id`, which never changes) and is placed in a Chapter of that Manuscript or Unplaced (`chapter_id` null). Chapters belong to the Manuscript (`chapters.manuscript_id`), and the Manuscript to the Project, one to one. This schema was built on the new, empty Rune 2.0 database (migration 015).

Scene identity is stable. When Rune 1.x manuscripts move to Rune 2.0, **each Page ID becomes its Scene ID**. See §42.

---

# 7. The manuscript writing boundary

The manuscript editor is protected territory.

Rune must not turn prose into a database interface.

The writer should be able to see simply:

```text
CHAPTER 12

[prose]
```

and nothing more.

Rune should not automatically inject into manuscript prose:

- relationship chips
- backlinks
- entity tags
- `[[links]]`
- database fields
- character mentions
- graph behavior
- auto-detected story information

Rune does not infer that the word `Nerai` refers to the user's Nerai Character Entry.

The writer creates the prose.

Rune organizes outside it.

Scene metadata may connect manuscript structure to the Workspace, but that metadata exists outside the writing surface.

### Editor surface for the beta

For the Rune 2.0 beta:

> **One Scene per editor instance.**

The beta does **not** rebuild the editor into one continuous, multi-Scene Chapter document.

- If a Chapter has one Scene, the UI may hide that the Scene exists. The writer simply sees `Chapter 4` and the prose.
- If a Chapter has several Scenes, Rune may show Scene navigation and structure around the editor, not inside the prose.

This keeps the hardened per-Scene save model, conflict model, offline model, and Scene identity intact. The editor surface itself is redesigned only in a dedicated, explicit task.

---

# 8. Scene metadata

Scenes may optionally have custom properties.

Those properties are defined at the Manuscript level and are available to all Scenes.

Example:

```text
Scene Properties

POV
Location
Characters
Status
Threads
```

A Scene might then contain:

```text
Scene 31.2

POV          Nerai
Location     Cave
Characters   Nerai, Alaric
Status       Needs Revision
Thread       What Are Hollows?
```

This metadata may appear through:

- an optional inspector
- table views
- list views
- board views
- dedicated Scene details

It does not need to appear inside the prose editor.

Rune does not hardcode concepts like POV, Location, Characters, or Threads.

The author decides what metadata matters.

---

# 9. Workspace

The Workspace contains everything the writer creates around the manuscript.

Its core content primitives are intentionally small:

```text
Page
Folder
Collection
Collection Entry
```

Rune does not have dedicated underlying modules for:

```text
Characters
Locations
Magic Systems
Factions
Religions
Research
Plot Threads
Revision Issues
Clues
Themes
```

Those emerge from generic primitives.

This is fundamental to Rune 2.0.

---

# 10. Page

A `Page` is a freeform supporting document.

Examples:

```text
Magic System Notes
Ending Ideas
History of Drelareth
Theme Notes
Research
Revision Strategy
```

Pages support rich-text content and, eventually, natural references to other Rune objects.

Pages do not have custom properties in the Rune 2.0 beta.

If the writer needs structured repeated entities, that is generally a Collection.

### Naming: user-facing "Page" vs physical persistence

Writers see this object as a **Page**.

Workspace Pages must **not** be stored in the existing physical `pages` table. Do not reuse the name `pages` for them.

Manuscript **Scenes** are stored in `scenes`. On production, the Rune 1.x `pages` table stays compatibility-critical until the Rune 1.x data migration (§42).

Workspace Pages need a physical and internal name that cannot be confused with it, such as `workspace_documents`. The final schema name is chosen during schema design.

The rule:

> Manuscript Scenes and Workspace Pages must never share an ambiguous physical persistence name.

The same applies in code. Types, actions, and stores should keep "Scene" and "Workspace Page" clearly apart.

### Scenes and Workspace Pages are different objects

A **Scene** is manuscript prose. A **Workspace Page** is a freeform supporting document. They are not the same object type, and the terms are not interchangeable.

A writer who has prose they no longer want in narrative order may:

- move the Scene to Unplaced Scenes, or
- deliberately copy or move relevant material into a Workspace Page, once it has become notes or supporting information.

Rune does not convert between the two automatically.

---

# 11. Folder

A `Folder` is purely organizational.

It has no document body and no creative content.

Its purpose is to help writers shape their Workspace navigation.

Example:

```text
Worldbuilding
├── Characters
├── Locations
├── Religion
└── History
```

Deleting or moving a Folder does not redefine the semantic identity of its contents.

---

# 12. Collection

A `Collection` represents multiple entities of the same writer-defined conceptual type.

Examples:

```text
Characters
Locations
Factions
Gods
Research Sources
Threads
Revision Issues
Clues
Submissions
```

A Collection owns:

```text
Collection Entries
Property definitions
Saved Views
```

Rune does not understand a Collection named `Characters` differently from one named `Artifacts`.

Meaning belongs to the writer.

---

# 13. Collection Entry

A `CollectionEntry` is one entity inside a Collection.

Example:

```text
Collection: Characters

Nerai
Alaric
Djal
Maelros
```

A Collection Entry contains both:

```text
structured property values
+
freeform rich-text content
```

For example:

```text
NERAI

Role          Protagonist
Affiliation   Drelareth
Status        Alive

----------------------------

[freeform character notes]
```

An Entry is therefore not merely a database row.

It is a first-class creative object.

Entries do not contain child Entries.

Deeper semantics are expressed through relationships rather than nested entity ownership.

---

# 14. Workspace placement is separate from ownership

Pages, Folders, and Collections belong directly to the Project.

Their visual hierarchy is represented separately through the Workspace tree.

This means the following is valid:

```text
World                         [Page]
├── Lore                      [Folder]
│   ├── Religions             [Collection]
│   └── History               [Page]
└── Characters                [Collection]
```

The `World` Page does not semantically own the Lore Folder.

The Workspace tree simply says:

> Show Lore underneath World.

This distinction keeps the underlying content model flexible.

Conceptually:

```text
WorkspaceNode
├── target object
├── parent node
└── position
```

For the Rune 2.0 beta:

> One Page, Folder, or Collection has one canonical sidebar location.

Aliases and shortcuts are deferred.

---

# 15. Workspace hierarchy rules

The Workspace tree may visually nest:

```text
Folder → Folder
Folder → Page
Folder → Collection

Page → Folder
Page → Page
Page → Collection
```

Because this is navigation rather than semantic ownership, flexible combinations do not create complicated object-lifecycle rules.

The hierarchy answers:

> Where does the writer want to see this?

It does not answer:

> What fundamentally owns this object?

---

# 16. Properties

Custom properties exist on:

```text
Collection Entries
Scenes
```

For Rune 2.0 beta, supported property types are:

```text
Text
Number
Select
Multi-select
Status
Date
Checkbox
Relationship
```

Properties are always optional metadata.

Creating an Entry or Scene never requires the user to populate its properties.

Pages do not have custom properties in beta.

Chapters and Manuscript Groups only use native structural metadata in beta.

---

# 17. Relationship properties

A `Relationship` property connects an object to another Rune object.

Examples:

```text
Nerai
Affiliation → Drelareth
```

or:

```text
Scene 31.2
Characters → Nerai, Alaric
```

or:

```text
Scene 12.3
Payoff Scene → Scene 31.2
```

A Relationship definition specifies:

```text
target
cardinality
```

For example:

```text
Characters
Target: Characters Collection
Cardinality: Many
```

or:

```text
Location
Target: Locations Collection
Cardinality: One
```

Relationships are project-scoped.

---

# 18. Views

A `View` is an alternate representation of existing objects.

It never creates duplicate content.

Collections may have multiple saved Views from day one.

Beta Collection views:

```text
List
Table
Board
```

Example:

```text
Characters
├── All Characters       [Table]
├── Main Cast            [List]
└── By Affiliation       [Board]
```

All three operate on the same Entries.

A View may define:

```text
name
type
filters
sort
grouping
visible properties
```

---

# 19. Scene views

Scenes may also have alternate representations.

The primary representation remains:

```text
Manuscript hierarchy
```

Additional Scene Views may include:

```text
List
Table
Board
```

Example:

```text
Scene | POV    | Location | Status
31.1  | Nerai  | Cave     | Draft
31.2  | Alaric | Cave     | Revised
```

Or:

```text
PLANNED      DRAFTING      REVISION      DONE
Scene 19     Scene 22      Scene 12      Scene 8
```

Moving a Scene between Status columns changes its Status.

It does not change manuscript order.

Only movement inside the manuscript hierarchy changes narrative order.

---

# 20. References

A `Reference` represents a semantic connection between two creative objects.

References are separate from:

```text
structural containment
workspace placement
views
```

Meaning:

```text
STRUCTURE
Chapter → Scene

PLACEMENT
WorkspaceNode → Page

RELATIONSHIP
Scene → Nerai

VIEW
Board displays Scene
```

These are four different concepts.

They must remain separate throughout implementation.

---

# 21. Universal identity

Every meaningful content object has one canonical identity.

A Character Entry called Nerai exists once.

```text
Nerai
├── displayed in Table
├── displayed on Board
├── referenced from Scene
├── referenced from Page
└── eventually represented on Canvas
```

These are representations of one object, not copies.

Likewise:

```text
Scene 31.2
```

exists once regardless of how many views show it.

Moving an object never changes its identity.

Duplicating an object always creates a new identity.

---

# 22. Linkable creative objects

The architecture should support references among meaningful creative objects such as:

```text
Scene
Page
Collection Entry
Chapter
Manuscript Group
Collection
Manuscript
```

Not every object type needs dedicated relationship UI in beta.

Properties and Views themselves are configuration objects and do not need to participate in the creative reference graph.

---

# 23. Workspace references vs manuscript prose

Workspace content may support rich references.

For example, a Page may reference:

```text
Nerai
Vharos
Scene 31.2
Chapter 14
```

Collection Entry notes may do the same.

This may later be expressed through `@` mentions, wiki-style links, or another UI.

The exact interaction is not part of the domain architecture.

Manuscript prose remains excluded from automatic rich-reference behavior.

Scene-to-workspace connections happen through Scene metadata instead.

---

# 24. Backlinks

References automatically generate backlinks.

If:

```text
Magic System Page → Vharos
```

then Vharos may expose:

```text
Referenced by
Magic System
```

If:

```text
Scene 31.2 → Nerai
```

then Nerai may expose:

```text
Referenced in
Scene 31.2
```

Backlinks should remain unobtrusive.

They exist as useful depth when requested, not as constant visual clutter.

---

# 25. Attachments

An `Attachment` is a project-owned file asset.

Examples:

```text
image
PDF
reference document
map
other supported file
```

The Attachment belongs to the Project, not to the first Page or Entry that uses it.

Therefore one asset may be referenced in multiple places without duplication.

```text
Project
└── Attachment: drelareth-map.png
      ↑
      ├── World Page
      └── Drelareth Entry
```

Rune 2.0 does not require a complicated visible asset manager.

Uploads may remain contextual and simple.

---

# 26. Trash and deletion

Deletion is recoverable by default.

Deleting:

```text
Scene
Chapter
Page
Collection
Collection Entry
Folder
Manuscript Group
```

moves it to project-scoped Trash rather than immediately destroying it.

A trashed object keeps its identity: the same ID, content, version, property values and relationships. Restoring brings back the same object, not a copy.

Permanent deletion happens only from Trash, deliberately, after a confirmation that says what will be lost.

The beta supports Trash for:

```text
Scene (placed or Unplaced)
Chapter (with its Scenes)
Page
Folder
Collection
Collection Entry
```

Manuscript Group Trash is not built. Only an empty Group can be deleted; a Group whose Chapters are all in Trash counts as empty.

Trash is never Unplaced Scenes. Unplaced Scenes are active manuscript material with no narrative placement; moving a Scene there is a move, not a deletion, and "Move to Trash" never sends anything there.

### Ownership hierarchies go to Trash together

Deleting a parent that owns its children sends its subtree to Trash together.

Examples:

```text
Collection
└── Entries, properties, values, Views
```

or

```text
Chapter
└── its active Scenes
```

or, if ever built:

```text
Manuscript Group
└── Chapters
```

are restored together with their original hierarchy.

An Entry trashed on its own before its Collection stays in Trash when the Collection is restored. An Entry cannot be restored while its Collection is in Trash.

### Folders are navigation, not ownership

A Folder only arranges the Workspace (§11, §14). Trashing a Folder does **not** trash what is inside it.

```text
Research (Folder)          →  Research goes to Trash
├── Magic Notes                Magic Notes, Maps and Factions
├── Maps (Folder)              move up into Research's place,
└── Factions                   in their order, and stay active
```

A restored Folder comes back empty, in its old place. Its former items stay where they moved.

### Scenes

A trashed Scene leaves its Chapter (or Unplaced Scenes) and the ordered manuscript total. It keeps its ID, prose, word count and version.

Restoring a Scene returns it:

- to its Chapter, in its old place if that place is free, otherwise at the end of the Chapter;
- to the end of Unplaced Scenes, if its Chapter no longer exists;
- to Unplaced Scenes, if it was Unplaced.

Trash never changes a Scene's version, so writing saved on a device while the Scene was in Trash saves normally after a restore.

Permanently deleting a Scene removes its prose. Its writing history (sessions, writing days, Today's Words) is kept with the Project.

### Chapters

A Chapter goes to Trash with its active Scenes, as one piece of the manuscript: one Trash item, listed with its Scene count and words. The Chapter and each Scene keep their IDs, prose, words, version, Scene History, properties, references (dormant while in Trash) and writing history. Nothing is renumbered away.

Restoring the Chapter returns it:

- to its Group, at its old place among that Group's Groups and Chapters (or the nearest place that still exists), with its Scenes inside it in their order;
- to the end of the manuscript's top level, if its Group no longer exists.

A Scene that went to Trash with its Chapter is restored or permanently deleted only with it. A Scene trashed on its own before its Chapter stays its own Trash item; restoring it while its Chapter is in Trash puts it in Unplaced Scenes.

Permanently deleting a Chapter from Trash deletes it and the Scenes trashed with it; their writing history is kept.

"Remove chapter, keep its scenes" is a separate, explicit action, not deletion: the Chapter's Scenes move, in order, to Unplaced Scenes, and the empty Chapter is removed.

Writers cannot delete a Scene or Chapter directly. Permanent deletion happens only from Trash.

Trash never appears inside the manuscript prose or the editor.

### Where restored objects return

A Page, Folder or Collection returns to the Folder and position it left, if that Folder still exists. Otherwise it returns to the end of the Workspace's top level.

Restoring from Trash does not reopen the object's old tab. Moving an object to Trash removes its tab from the working set. An immediate Undo restores the object and opens it again.

---

# 27. Relationships and Trash

When an object enters Trash, its relationships remain dormant.

Example:

```text
Scene → Nerai
```

If Nerai is trashed:

```text
Scene → [Nerai — trashed]
```

Restoring Nerai restores the relationship automatically.

Only permanent deletion truly breaks the relationship.

Permanent deletion never deletes the referring object.

There are no cascading semantic deletions.

---

# 28. Rich reference deletion

If Workspace rich text contains a reference to an object that is permanently deleted, Rune should preserve the visible text rather than deleting the writer's sentence.

For example:

```text
[[Vharos]]
```

may ultimately become ordinary text:

```text
Vharos
```

The writer's authored notes remain intact.

---

# 29. Search

Search is a Project-level service rather than another content object.

Eventually, universal search should cover:

```text
Manuscript prose
Scenes
Chapters
Pages
Collection Entries
Collections
Properties
Tags/select values
References
```

Search does not alter object identity or hierarchy.

The eventual goal is that writers rely naturally on search rather than manually navigating every structure.

---

# 30. Writing infrastructure

The following systems sit around the creative-content model rather than inside it:

```text
Writing Sessions
Writing History
Project Goals
Progress
Focus Mode
Version History (Scene History and Manuscript Milestones — see below)
Search
Import
Export
Offline Sync
Backup
Trash
```

These support the act of creating and finishing the work.

They are not Workspace entities.

A user should not see things like Writing Sessions appearing as generic database objects beside Characters and Locations.

Focus Mode is core. Arena is not part of the core writing infrastructure (§46).

### Manuscript safety without full Version History

Full, user-facing Version History (browsing and restoring snapshots) does **not** block the Rune 2.0 closed beta.

Manuscript safety must still be very strong without it. The beta relies on:

- autosave,
- offline resilience,
- sync,
- Trash and soft deletion,
- export,
- regression tests,
- safe migration behavior.

Nothing in the architecture should make Version History hard to add later. In particular, Scene identity stays stable and Scene content remains a separately addressable unit.

### Scene History and Manuscript Milestones (Milestone 17)

Version History arrived as two small safety systems, not version control. There are no branches, merges or diffs to manage.

- **Scene History.** The database keeps earlier texts of each Scene on the save path itself. It keeps the text being replaced when the writer returns after a pause of 30 minutes or more, and about once an hour during long sittings. It never keeps a copy per save. The writer opens it from the Scene's Inspector, reads a version read-only, and restores it. A restore is a new save of that text through the normal Scene save path, and the replaced text is kept first. It uses the same Scene ID, creates no writing-session credit, and never rewinds history. Retention keeps every version from the last 30 days, then one per day, and at most 200 per Scene.
- **Manuscript Milestones.** The writer names the whole manuscript at a moment ("Draft 1"). A Milestone captures Groups, Chapters, placed and Unplaced Scenes, their order and prose, in one transaction, and changes nothing live. Chapters and Scenes in Trash are not captured. It is read-only and never a branch. Whole-manuscript restore is deferred. A single Scene's text from a Milestone is restored through that Scene's History. Workspace content is not captured.
- **Reading a Milestone.** A Milestone opens with its own read-only navigator: its Groups, Chapters, Scenes and Unplaced Scenes as they were, each a way straight to that part of the snapshot. A live Scene's or Chapter's Inspector lists the named Milestones that hold it, apart from the Scene's automatic History, and each opens the Milestone at that Scene or Chapter.
- History is not a live object. It is never searched, never linked, never counted and never exported. A trashed Scene keeps its history. Permanently deleting a Scene deletes its history, except the versions a Milestone uses.

### Revision Notes

**Revision Notes are writer-authored revision thoughts attached to the Manuscript, a Group, a Chapter or a Scene, surfaced contextually through the manuscript hierarchy.** There is one Revision Notes feature and one note model (`revision_notes`, migrations 039–040). It is not a Workspace Page, a Collection or a hidden Page, and it prescribes no revision workflow.

- **One note, one target.** A note belongs to exactly one of the Manuscript, a Group, a Chapter or a Scene, anchored by that target's stable ID. A target may carry any number of notes. Each note is created, edited and deleted on its own.
- **One home.** Revision Notes live in the Revision Notes panel. The Inspector shows no notes: it is about metadata, properties, history and references.
- **Hierarchical visibility.** The panel shows the level the writer is at: the selected Scene, Chapter or Group, the Scene being read, or the whole Manuscript when nothing is selected. A quiet trail moves between the levels above it. What each level shows is derived from the live manuscript structure, never copied, and each note appears exactly once:
  - a **Scene** shows only its own notes (the narrowest view: no Chapter, sibling, Group or Manuscript notes);
  - a **Chapter** shows its own notes, then those of each active Scene in it, in Scene order;
  - a **Group** shows its own notes, then everything inside it (nested Groups, Chapters and Scenes) in manuscript order;
  - the **Manuscript** shows its own notes, then every Group's, Chapter's and Scene's in manuscript order, then the Unplaced Scenes'. This is the bird's-eye revision view.
  - Every note is labelled with where it belongs ("This chapter", "Chapter 12", "The Bell Tower · Unplaced").
- **Adding.** A new note goes to the level being shown, so the writer never picks a scope. Return saves and clears the field for the next note; Shift+Return adds a new line. Unsent text in the field is kept on the device.
- **Reading Mode quick-add.** While reading, "Note" opens a small quick-add for the Scene being read. It creates ordinary Scene notes, several in a row, without opening any panel. They appear at once in that Scene's, its Chapter's, its Groups' and the Manuscript's Revision Notes. There is no separate reading note.
- **Movement.** Notes follow their targets. A Scene moved to another Chapter leaves the old Chapter's (and Groups') view and appears in the new one. An Unplaced Scene keeps its notes, which then appear only in its own view and the Manuscript's. A Chapter or Group moved between Groups brings everything inside it. No move rewrites a note.
- **Trash.** A Scene or Chapter in Trash has its notes hidden from every view (a Chapter takes its Scenes' with it). Restore brings back the same notes on the same IDs. Permanently deleting a Scene or Chapter deletes the notes on it. Groups have no Trash: only an empty Group can be deleted, and its own notes go with it after a confirmation that says so. Removing a Chapter while keeping its Scenes deletes the Chapter's own notes (said first); its Scenes keep theirs.
- **Outside the manuscript.** Notes are never part of a Scene's prose, version, word count, History or writing credit (sessions, Today). They are never counted in totals, captured by Milestones, searched as manuscript text, or exported.
- **Durable.** A note appears at once and is kept on the device until the server has it. A failed save, a lost connection, moving to another Scene or a reload never loses it. A retried save never duplicates it. An edit never silently overwrites a newer version made elsewhere: the writer chooses.
- **Not a task list.** There is no status, priority, due date, checkbox, assignee or resolved state.

**The Rune 1.x checklist.** Before Rune 2.0, the project had a checklist (`project_notes`) shown as "Revision Notes". In the Rune 2.0 shell it is folded into Revision Notes: migration 040 copied every open checklist item into a Manuscript-wide note (same ID, text and times), and the panel shows Revision Notes instead. Completed items were not copied. `project_notes` itself is left untouched, and only the remaining Rune 1.x pages (the legacy dashboard and project page) still read it. It retires with them. The single note per Scene of Milestone 18 (migration 038) likewise became Scene notes (039).

Folding Revision Notes into a Revision Issues Collection or a broader revision workflow is deferred.

---

# 31. Three architectural layers

Rune 2.0 can therefore be understood as three layers.

## Layer A — Creative content

The writer's actual material:

```text
Manuscript prose
Scenes
Pages
Collection Entries
Attachments
```

## Layer B — Structure and connection

How creative material is organized:

```text
Manuscript Groups
Chapters
Folders
Collections
Workspace Nodes
Properties
Relationships
References
Views
```

## Layer C — Writing experience

What Rune does to support completion:

```text
Focus
Writing Sessions
Progress
History
Search
Versioning
Offline resilience
Import/export
Backup
Revision later
```

Keeping these layers separate prevents Rune from turning every feature into another content primitive.

---

# 32. What Rune treats specially

Rune should deliberately special-case:

```text
Project
Manuscript
Manuscript Group
Chapter
Scene
Writing Session
Version / manuscript history
```

These represent concepts fundamental to creative writing and manuscript integrity.

Rune does not need to pretend everything is generic.

---

# 33. What remains generic

Rune should avoid special underlying modules for:

```text
Characters
Locations
Worldbuilding
Magic Systems
Religions
Factions
Themes
Threads
Clues
Research
Revision Issues
Submissions
Beat Sheets
```

These should generally be constructible from:

```text
Page
Collection
Collection Entry
Property
Relationship
View
```

Before adding a new first-class primitive, Rune should ask:

> Can this already be expressed naturally with the primitives we have?

Only behavior that genuinely cannot should justify a new domain type.

---

# 34. Templates

Templates configure generic primitives.

They do not introduce new object systems.

For example, a Character template might create:

```text
Collection: Characters

Properties:
Role
Status
Affiliation
```

A Thread template might create:

```text
Collection: Threads

Properties:
Type
Status
Related Scenes
```

The author may:

```text
rename
remove
add
ignore
replace
```

anything generated by the template.

Templates provide guidance without prescription.

---

# 35. Rune 2.0 beta architecture

The closed beta should prove one proposition:

> A writer can start with only a manuscript and gradually create whatever supporting structure their novel requires without leaving Rune.

The beta architectural surface should therefore include:

### Manuscript

```text
Manuscript
Manuscript Groups
Chapters
Scenes
Unplaced Scenes
reordering
word counts
clean editor
existing saving/offline reliability
```

### Workspace

```text
Pages
Folders
Collections
Collection Entries
Workspace hierarchy
```

### Structure

```text
Custom Collection properties
Custom Scene properties
Relationships
Backlinks
```

### Views

```text
List
Table
Board
Manuscript hierarchy
```

### Supporting systems

```text
Search
Writing progress (no XP or Levels)
Focus Mode
Import/export appropriate to beta (titled Groups exported as headings)
Manuscript safety infrastructure (autosave, sync, Trash, export)
Trash
Offline resilience
Revision Notes (Manuscript, Group, Chapter, Scene)
```

### Editor

```text
One Scene per editor instance
Scene navigation around the editor when a Chapter has several Scenes
```

---

# 36. Explicitly deferred

These should not block Rune 2.0 beta:

```text
Canvas
Graph view
Timeline view
Gallery view
Calendar view
Advanced formulas
Rollups
Automations
Plugin marketplace
Collaboration
Public publishing
Shared universes
Cross-project references
Multiple manuscripts per Project
Advanced revision passes
Screenplay spine
Poetry spine
Short-story spine
Stage-play spine
AI writing
AI rewriting
AI story generation
AI character generation
Whole-manuscript restore from a Milestone
Continuous multi-Scene Chapter editor
Migrating Revision Notes into Workspace Pages or Collections
Replacement unlock model for themes and fonts
Physical rename or replacement of the `pages` table
```

The last five are deferred, not rejected. The AI items are excluded permanently for manuscript prose (see the authorship boundary in Product direction).

Architecture may leave room for them.

Beta should not build them.

---

# 37. Progressive disclosure architecture

A new Project should initially be capable of appearing approximately as:

```text
HOLLOW

Manuscript
  Chapter 1
```

Nothing else is required.

The existence of:

```text
Pages
Collections
Properties
Views
Relationships
Backlinks
```

does not require those systems to be visible.

Power appears when the writer reaches for it.

A writer may finish a 100,000-word novel without creating one Collection.

Another may build hundreds of interconnected entities.

Both are valid Rune users.

---

# 38. Separation of product model and presentation

The domain model should not force the UI to expose its complexity.

Internally:

```text
Chapter
└── Scene
```

may always exist.

The writer may simply experience:

```text
Chapter

[prose]
```

Internally:

```text
Scene
├── properties
├── relationships
└── content
```

may exist.

The writer may see only:

```text
[content]
```

until they choose to inspect metadata.

The architecture should therefore support greater complexity than the default interface reveals.

---

# 39. Future creative formats

The Project architecture should permit other manuscript spines later without building them now.

Novel:

```text
Manuscript
→ Group
→ Chapter
→ Scene
```

Possible future screenplay:

```text
Script
→ Group / Act
→ Scene
→ Beat
```

Possible poetry:

```text
Collection
→ Section
→ Poem
```

Possible short stories:

```text
Story Collection
→ Story
→ Scene
```

Rune 2.0 only implements the novel spine.

The broader architecture should not make other creative spines impossible.

---

# 40. Complete conceptual map

```text
USER
│
└── PROJECT
    │
    ├── MANUSCRIPT
    │   │
    │   ├── MANUSCRIPT GROUP
    │   │   ├── MANUSCRIPT GROUP
    │   │   │   └── CHAPTER
    │   │   │       └── SCENE
    │   │   └── CHAPTER
    │   │       └── SCENE
    │   │
    │   ├── CHAPTER
    │   │   └── SCENE
    │   │
    │   ├── UNPLACED SCENES
    │   │   └── SCENE
    │   │
    │   ├── SCENE PROPERTY DEFINITIONS
    │   └── SCENE VIEWS
    │
    ├── WORKSPACE OBJECTS
    │   │
    │   ├── PAGE
    │   │
    │   ├── FOLDER
    │   │
    │   └── COLLECTION
    │       ├── PROPERTY DEFINITIONS
    │       ├── VIEWS
    │       └── COLLECTION ENTRY
    │           ├── PROPERTY VALUES
    │           └── RICH-TEXT CONTENT
    │
    ├── WORKSPACE TREE
    │   └── WORKSPACE NODE
    │       ├── target object
    │       ├── parent node
    │       └── position
    │
    ├── REFERENCES
    │   ├── RELATIONSHIPS
    │   └── BACKLINKS
    │
    ├── ATTACHMENTS
    │
    ├── TRASH
    │
    └── WRITING INFRASTRUCTURE
        ├── WRITING SESSIONS
        ├── WRITING HISTORY
        ├── GOALS / PROGRESS
        ├── FOCUS MODE
        ├── SEARCH
        ├── VERSION HISTORY
        ├── IMPORT / EXPORT
        ├── OFFLINE STORAGE
        ├── SYNC
        └── BACKUP
```

---

# 41. Architectural invariants

The following should be treated as Rune 2.0 invariants:

1. A Project contains exactly one Manuscript in Rune 2.0.

2. Manuscript prose exists in Scenes.

3. Scene structure may remain invisible when unnecessary.

4. Manuscript Groups contain structure, never prose.

5. Scenes may be placed in Chapters or remain Unplaced.

6. Workspace objects do not structurally become manuscript objects.

7. Manuscript prose remains clean and free from automatic relationship UI.

8. Scene metadata exists outside the writing surface.

9. Pages are freeform.

10. Collections are structured.

11. Collection Entries combine structured properties with freeform content.

12. Workspace nesting is navigation, not domain ownership.

13. Collections own their Entries, Properties, and Views.

14. Views never duplicate content.

15. Objects have one canonical identity.

16. Moving does not change identity.

17. Duplicating creates new identity.

18. References are project-scoped.

19. Backlinks derive automatically from references.

20. Trash preserves identity and dormant relationships.

21. Permanent deletion never cascade-deletes semantically related objects.

22. Attachments belong to the Project.

23. Complexity remains opt-in.

24. No new primitive should exist merely because a particular writer workflow can be imagined.

25. The manuscript remains more important than the organizational system surrounding it.

26. Unplaced Scenes are manuscript prose, but they are excluded from the ordered manuscript word total and from default export.

27. New writing in any Scene, placed or unplaced, counts as writing activity.

28. Scene numbers are derived presentation. Scene IDs are identity.

29. During the beta migration, a Scene's ID is its original Page ID.

30. Workspace Pages never share a physical persistence name with manuscript Scenes.

31. Titled Manuscript Groups appear as headings in standard export.

32. Access to reading and exporting one's own manuscript never depends on trial or subscription state.

33. Legacy systems are retired in stages, with compatibility protected. They are never removed only because this document deprecates them.

34. There is no canonical Scene. Every placed Scene in a Chapter is part of that Chapter: it counts toward the ordered manuscript total and appears in export.

35. A Chapter's exported prose is the ordered concatenation of all its placed Scenes, with a scene break between adjacent Scenes. Scene titles are not printed in standard export.

36. Manuscript Scenes and Workspace Pages are distinct object types. Rune never converts one into the other automatically.

37. Migrating existing manuscript prose never copies, merges, deletes, or re-identifies it. Every existing Page row survives in place as a Scene with the same ID, content, and word count.

---

# 42. Mapping the current manuscript into Rune 2.0

Currently, manuscript prose lives in **Pages** inside **Chapters**, and a Chapter may mark one Page as **canonical**. When it does, only that Page counts toward manuscript totals and appears in export.

The audit identified canonical Pages as the highest-risk semantic issue in the migration.

This section fixes the **approved semantic mapping**. It does not authorize running the migration.

### Existing Pages are Scenes

The audit established that existing `pages` rows are already the storage unit Rune 2.0 calls Scenes. Therefore:

> **Existing Page ID = Scene ID.**

- Every existing Page becomes a Scene, including empty ones.
- No existing prose gets a new Scene ID.
- No existing prose is re-created: every row keeps its id, content, word count, version and timestamps.
- No existing Page is deleted or merged.

The Rune 2.0 schema stores Scenes in `scenes` (§6). Whether production's `pages` rows become `scenes` rows in place (a rename) or are copied with all of the above unchanged is decided by the Rune 1.x data-migration task, within the constraints below.

### Case A: Chapter with a canonical Page

- The canonical Page stays placed, as the Chapter's **placed Scene**.
- Every non-canonical sibling becomes an **Unplaced Scene**.
- Nothing is deleted.

Before:

```text
Chapter
├── Page A [canonical]
├── Page B
└── Page C
```

After:

```text
Chapter
└── Scene A

Unplaced Scenes
├── Scene B
└── Scene C
```

This preserves the current manuscript totals, export selection, and writer intent, because only the canonical Page counted and exported for that Chapter. Every alternate draft stays real, recoverable, editable prose.

### Case B: Chapter without a canonical Page

Its Pages already behave like sequential Scenes. Every Page stays placed, in its existing order.

Before:

```text
Chapter
├── Page A
├── Page B
└── Page C
```

After:

```text
Chapter
├── Scene A
├── Scene B
└── Scene C
```

### Result of the mapping

For every Project, the ordered sequence of placed Scenes after the migration equals the ordered sequence of Pages the current canonical-aware rule includes in the manuscript and in export. The ordered manuscript word total therefore does not change.

### Canonical state after the migration

- Every `is_canonical` value is eventually cleared.
- After cutover, Rune 2.0 product and domain code must not depend on canonical semantics.
- The physical column may remain temporarily as a migration and compatibility artifact, until removing it is safe (§45).

### Implementation constraints (from the audit's recommendation, which stands)

- Production keeps the physical `pages` table, and its compatibility contracts, until the Rune 1.x data migration moves it to the Rune 2.0 schema (`scenes`).
- Keep each Page ID as its Scene ID.
- An Unplaced Scene has no Chapter (`chapter_id` is null) and belongs to the Manuscript. A Scene's ownership must stop depending on its Chapter **before** any Scene is unplaced. Otherwise access rules, queued offline saves, and account totals lose track of it.
- At first, keep the compatibility-sensitive RPCs and database contracts (§45).
- Offline saves queued against a Page ID must still land on the same Scene afterward, with no ID remapping.
- Writing history attached to a Page ID stays attached to the same ID. It is never rewritten or duplicated.

The migration itself follows the normal rules: committed migration, update `schema.sql`, RLS, staged rollout, and no manuscript loss.

### Verification

The migration safety harness in `tools/sync-harness` encodes these rules as executable invariants: prose survival, ordered-manuscript and export equivalence, account totals, writing history, and offline replay. No Phase 1 migration step is acceptable unless those invariants keep passing.

---

# 43. Pricing and access

### Direction

Rune 2.0 is a **subscription product with a time-based, full-product trial**.

- The trial length is likely about one month. **It is provisional, not final.** Do not hardcode "30 days" as a product requirement.
- The future price is **not final**.
- During the trial, the writer uses the real Rune, not a deliberately crippled version.

### What Rune 2.0 is no longer designed around

- a free manuscript word allowance,
- the 2,000-word starter limit,
- the legacy 15,000-word allowance as a long-term product model,
- blocking new manuscript words after a threshold,
- using manuscript word counts to separate free from paid access,
- free-project limits as the core product model.

Questions like these therefore **drop out of the Rune 2.0 architecture**:

- Do Unplaced Scene words count toward the free allowance?
- Do Workspace Page words count toward the free allowance?
- Can a writer get around a manuscript word cap by writing in Workspace content?

### What does not change

- The server is authoritative for subscription and access state.
- Client-supplied prices or Price IDs are never trusted.
- A manuscript is never deleted, truncated, hidden, corrupted, or trapped because a trial or subscription ends.
- Reading and export of one's own manuscript stay available.

### Not yet decided

These are business and migration decisions. They must be settled before billing changes ship, and are not decided here:

- exact trial length and price,
- what access a writer keeps after a trial ends without converting, beyond reading and export,
- how existing subscribers move to the new model, including the Stripe migration,
- what happens to legacy entitlements (the 15,000-word allowance and the `legacy_15k` / `starter_2k` cohorts),
- whether and how existing users are grandfathered, including the Founding Scribe offer,
- how trials convert,
- cancellation behavior under the new model.

### Current enforcement is retired in stages

Word-limit enforcement is deeply built into the current system (§45). Dropping the product requirement does **not** mean removing that enforcement immediately.

**Status on the Rune 2.0 database (migration 037):** the free-word limit no longer gates anything. Writing, Scene and Chapter creation, Project creation, import, duplication, Scene History restore and Trash restore are never blocked by a word count. The checked RPCs keep their names, signatures and result shapes for stale clients and queued offline saves; their one limit resolver answers "no limit". `account_word_total` remains as an account metric. The editor's input guards and the free-word notices are gone from the Rune 2.0 app. Billing surfaces (the pricing table, Settings, the returning-writer pricing notice) still describe the old model and are replaced with the trial and billing work in Beta Completion. Production (Rune 1.x) is unchanged.

---

# 44. Progress without XP or Levels

### Retired from the Rune 2.0 product

- XP accumulation,
- Level progression,
- XP bars,
- level-up framing,
- XP-based rewards,
- unlock conditions based on Level or XP.

Do not design a replacement XP economy.

### Kept, and central

Progress that reflects the actual creative work:

- manuscript word count,
- writing sessions,
- writing history,
- Today's Words or equivalent recent-writing information,
- project goals,
- completion progress,
- milestones,
- Focus Mode,
- meaningful writing-day history,
- realistic progress toward finishing the work.

### Streaks

Streaks may remain as underlying writing-history information.

They are not a central pressure mechanism or part of the product identity. Rune does not emphasize "don't break the streak."

### Themes and manuscript fonts

Themes and manuscript fonts **stay** in Rune. Their existing infrastructure stays too: the theme registry, font preferences, persistence, and the rule that unlocking does not switch the active selection.

What changes is that their future unlock model is **no longer tied to XP or Levels**.

The replacement is **undecided**. Options under consideration include:

- everything included with the subscription,
- unlocks for meaningful writing milestones,
- achievement-based unlocks tied directly to creative work,
- some other restrained system.

Until that is decided, the current grant logic stays in place and existing users keep every unlock they have earned.

---

# 45. Staged retirement of legacy systems

Several current systems are not part of Rune 2.0's product direction but are **load-bearing** in the current implementation.

> **Do not remove legacy systems solely because this architecture deprecates them.** Follow the staged migration plan and protect compatibility until an explicit implementation task removes them safely.

### Word-limit enforcement

According to the audit, current free-word enforcement is built into:

- SQL/RPCs such as `save_page_checked`, `insert_page_checked`, and `account_word_total`,
- editor input guards,
- IndexedDB and offline-queue compatibility,
- stale deployed clients that call those contracts.

Retirement is staged:

- The Rune 2.0 migration initially **keeps the load-bearing RPC signatures and database contracts**, so stale clients and queued offline manuscript saves keep working.
- Later stages are designed in their own explicit tasks, once the billing decisions in §43 are made. Changing enforcement behavior and removing contracts are separate steps.
- A contract can be removed only once no deployed client and no queued offline save can still depend on it.
- While enforcement remains, the manuscript migration must not change what it counts. The current account total counts every stored Page, whatever its canonical state. Moving prose to Unplaced Scenes must neither lower a writer's total nor create a way around the current limit.
- Stage reached on the Rune 2.0 database (migration 037): enforcement is off (the limit resolver answers "no limit"); the contracts stay. Removing the contracts themselves is a later step.

### XP and Levels

XP, Levels, and XP/Level-based unlock requirements still exist in code. They stay until an explicit task retires them. That task must keep every existing user's earned unlocks.

### Canonical Pages

Canonical Pages are **not** a Rune 2.0 concept. They survive only as legacy Rune 1.x data.

- Until the §42 mapping is implemented as an explicit migration, `is_canonical` keeps governing manuscript totals and export in the running application.
- The cutover moves each canonical Chapter's non-canonical Pages to Unplaced Scenes and clears every `is_canonical` flag.
- After cutover, no Rune 2.0 code reads `is_canonical`. The column, and the trigger that maintains it, may stay as inert compatibility artifacts until an explicit task removes them safely.
- The Rune 2.0 schema (migration 015) has neither: no `is_canonical`, no canonical trigger, no canonical-aware database logic.

---

# 46. Arena

Arena, including Race Yourself and Battle Mode, is **not architecturally central** to Rune 2.0. It does not shape the core architecture.

Arena is:

> Optional legacy writing-session functionality. It may stay if it is cheap to preserve, but it is not part of the central Rune 2.0 proposition.

- Arena is not removed or redesigned as part of Rune 2.0 architecture work.
- Rune 2.0 migrations are not made much more complex just to preserve Arena perfectly.
- Arena's long-term future is evaluated separately.

Focus Mode stays core and belongs to the editor.

---

# 47. Open product decisions

These are genuinely unresolved. They are not decided in this document:

1. Trial length and future subscription price (§43).
2. What remains available after a trial ends without converting, beyond reading and export.
3. Existing-subscriber migration, Stripe migration, grandfathering, the future of the Founding Scribe offer, and the fate of the 15,000-word legacy allowance and pricing cohorts.
4. Trial conversion and cancellation behavior.
5. The replacement unlock model for themes and manuscript fonts (§44).
6. Whether streaks stay visible anywhere in the product, or only as underlying history.
7. Arena's long-term future (§46).
8. The final physical schema name for Workspace Pages (§10).
9. Exact export formatting for Group headings (§4) and the visual scene break between Scenes (§6).
10. Whether and when Revision Notes move into a Revision Issues Collection or revision workflow (§30).
11. Whether whole-manuscript restore from a Milestone ships, and what form it takes (§30).

---

# 48. Architectural north star

The simplest accurate description of Rune 2.0 is:

> **A special manuscript surrounded by a workspace the writer can shape however they think.**

The manuscript gives Rune its opinion.

The workspace gives Rune its flexibility.

The relationship layer connects them.

The experience layer helps the writer finish.

And none of those layers should ever make the writer feel that maintaining Rune is more important than writing the story.