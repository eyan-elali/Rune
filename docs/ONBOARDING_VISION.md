# Rune Onboarding — Vision & Design Document

> This document defines how Rune brings a new writer from confirmed signup to their first sentence written.
> Read it before touching any onboarding-adjacent code, routing, or empty state.
> It is a product document, not just a technical spec.

---

## North Star

**Rune's onboarding should not feel like onboarding.**

It should feel like writing the first page of a book.

The interface does not introduce itself before the story begins. The story comes first. The UI reveals itself after the writer writes.

When the experience is working, a new user should not notice that they were "onboarded." They should simply notice that they wrote something.

---

## Core Principle

**The story comes first.**

The interface exists to support the story.

Every screen, every choice, every transition in the new-user flow must be measured against one question:

> Does this bring the writer closer to their first sentence, or does it delay it?

If it delays it — without providing something truly essential — it should be removed, deferred, or collapsed.

---

## Activation Definition

Activation is not:
- Account created
- Email confirmed
- Dashboard visited
- Project named
- Chapter named

**Activation is: the writer writes and saves their first meaningful sentence.**

All product decisions in the onboarding path should be optimized for this moment — not for engagement metrics, not for profile completeness, not for feature discovery.

The first sentence is the beginning of the manuscript. Everything before it is prologue. Prologue should be short.

---

## Intended First-Time Journey

```
Email confirmed
    ↓
Arrive at dashboard (or dedicated onboarding route)
    ↓
Single invitation: begin your manuscript
    ↓
Name your story (one field — title only)
    ↓
Editor opens immediately
    ↓
Writer types their first words
    ↓
Auto-save fires — first sentence exists
    ↓
Rune quietly acknowledges the beginning
    ↓
UI reveals itself around the writing, not over it
    ↓
Dashboard becomes meaningful on second visit
```

The path from email confirmation to first sentence should require **no more than two deliberate choices** from the writer:

1. What is your story called?
2. (Begin writing.)

Everything else — chapter names, cover colors, project descriptions, page titles — is infrastructure that can wait until the writer has written something worth organizing.

---

## Design Rules

These are non-negotiable constraints for any onboarding implementation.

### No feature tours.
Rune does not have tooltips that say "This is the sidebar. This is where your chapters live." Writers are not impressed by software explaining itself. Let them discover.

### No checklist onboarding.
No "Complete your setup" progress bar. No "3 of 5 steps complete." This language treats writing like a configuration task. It is the opposite of what Rune is.

### No intrusive modals.
A modal in the first 30 seconds of a writer's experience is an interruption. The only thing allowed to interrupt is the editor. Everything else waits.

### No unnecessary choices before writing.
The onboarding path should ask for the absolute minimum before opening the editor. A title. That is all. Description, cover color, pen name refinement, and settings are all deferred until after the first session.

### Every screen has one job.
- The "begin your story" screen: name the project.
- The editor: write.
- The dashboard on second visit: return to the work.

### The editor should appear as quickly as possible.
The minimum viable path is: name + submit → editor. The faster the writer reaches a blank page with a cursor, the better.

### The manuscript must never move during any reveal animation.
If the UI reveals itself after first writing (sidebar, header, etc.), the text the writer has written must remain stationary. The chrome animates in around the text — not over it, not pushing it, not causing reflow.

### The reveal should happen once.
Once the UI has revealed itself during a session, it does not re-hide and re-reveal. The ceremony is singular.

### The UI should reveal itself around the writing, not interrupt it.
Post-first-save UI changes (if any) should be so subtle that a writer in flow might not notice them at all. The acknowledgement is for when the writer looks up from the page — not a demand for attention mid-sentence.

---

## The "Begin with One Sentence" Moment

When a new user opens the editor for the first time, the experience should feel like opening a blank notebook for the first time.

What that means concretely:

- The page should be clean. No tutorial text, no callout arrows, no floating help buttons.
- The placeholder text in the editor should be literary, not instructional.
  - Good: *"Begin your story..."*
  - Bad: *"Type here to start writing your first chapter."*
- The cursor should be positioned and ready. The writer should be able to type immediately without clicking.
- Nothing should compete for the writer's attention except the blank page.

The first session should feel like Rune got out of the way.

---

## The First Save Acknowledgement

After the writer's first auto-save fires, Rune has the option to make a single, quiet acknowledgement.

This should be:

- **Subtle.** A line of text, not a modal. Not confetti. Not a sound.
- **Literary.** Match the voice of the product. Something like: *"Your story has begun."*
- **Transient.** It appears briefly and fades. It does not need to be dismissed. It does not block writing.
- **Once only.** It should never appear again after the first session.

If the right moment or right copy cannot be found, this acknowledgement should be omitted entirely. Silence is better than sentiment that rings false.

---

## First 100 Words Milestone

When a writer has crossed 100 words in their first session, Rune can acknowledge it — but only barely.

The 100-word mark is not a celebration. It is a quiet note. The writer is in motion. This acknowledgement should feel like a nod from a librarian, not applause from a crowd.

Options (in order of preference):

1. A one-line status change: the word count pill quietly updates its label. Nothing else changes.
2. A barely-visible flash in the corner: *"100 words. Keep going."*
3. Nothing. The writer is writing. Leave them alone.

**No confetti. No celebration modal. No XP flash during a writer's first session.**

The XP system exists for returning writers who have chosen to engage with game mechanics. It should not intrude on the sacred first draft of the first session.

---

## Progressive Feature Discovery

After the writer has written and saved, the dashboard and UI begin to mean something.

Discovery should unfold organically over the first weeks:

**Day 1 — Session 1:**
Writer creates a project, opens the editor, writes. The experience is clean and uninterrupted. On returning to the dashboard, the "Your Story" hero now shows their project. The workspace is no longer empty.

**Day 2–3:**
The writing streak begins. The "0 days" streak card transforms quietly into "1 day." The writer notices without being told.

**Week 1:**
The writer discovers chapters — either because they naturally want to start a new section, or because they navigate to the project page and see the chapter structure.

**Week 2:**
The Arena becomes visible. The writer explores Race Yourself when they're looking for momentum, not because they were directed there on day one.

**Week 3+:**
XP and levels become meaningful. Unlockables appear. The profile page becomes worth visiting.

None of this is taught. None of it is explained upfront. It reveals itself through use.

---

## What a New User Must Never See

These are failure states in the onboarding experience:

- A dashboard full of locked features on the first visit.
- An empty stats section that feels like a checklist of things not done.
- Multiple modals or prompts before reaching the editor.
- A form with more than one required field before writing begins.
- An editor that requires a click before the writer can type.
- Any language that positions writing as a "task to complete."
- The word "onboarding" anywhere in the UI.
- A progress bar measuring how "set up" the account is.
- A "Welcome to Rune!" screen that exists to introduce features.

---

## Onboarding Entry Points

There are two valid entry points to onboarding:

### 1. Post-registration (email confirmed)

The `?registered=1` query param already exists on the dashboard URL after email confirmation. This is the signal that should trigger the new-user experience.

Currently it only fires a Meta Pixel event. In the future, it should also gate an altered dashboard state: the simplified "begin your manuscript" experience rather than the returning-writer dashboard.

### 2. Dashboard with no projects

If a user reaches the dashboard with zero projects and no `?registered=1` param (e.g., they cleared their cookies and re-logged in), the dashboard empty state should serve as the recovery path.

The `YourStoryHero` component already handles this with "Your first story begins here." — this copy is already correct. The CTA button pointing to `/projects` is the gap; it adds an unnecessary step.

---

## Current Flow vs. Target Flow

### Current flow (as of audit date)

```
Email confirmed
→ /dashboard?registered=1
→ Meta Pixel event fires, param stripped
→ Dashboard renders with "Your first story begins here" hero
→ Writer clicks "Begin your manuscript" → /projects
→ Empty project grid with "Create a project" button
→ Writer clicks button → NewProjectModal opens
→ Writer fills: title (required), description (optional), cover color (picker)
→ Submit → /projects/[projectId]
→ Project page shows empty chapter list: "No chapters yet"
→ Writer clicks "Add Chapter"
→ Chapter created, page refreshes
→ Writer must click chapter row to navigate to editor
→ Editor loads
→ Writer must click in the content area before typing
→ First sentence
```

**Total clicks before typing: ~8–10**
**Page transitions: 4**
**Decisions required: title + description + cover color + chapter name**

### Target flow

```
Email confirmed
→ /dashboard?registered=1 (or a dedicated /start route)
→ Single field: "What is your story called?" (title only)
→ Submit (one click)
→ Project created, Chapter 1 created, Page 1 created
→ Editor opens immediately with cursor ready
→ Writer types
→ Auto-save fires
→ Quiet acknowledgement (optional)
→ On next visit → returning-writer dashboard
```

**Total clicks before typing: ~2**
**Page transitions: 1**
**Decisions required: title only**

---

## Files That Will Need to Change

These are the files identified during the audit that touch the new-user path:

| File | Current Role | Onboarding Impact |
|---|---|---|
| `src/app/auth/callback/route.ts` | Redirects to `/dashboard?registered=1` | Could redirect to a `/start` route for new users |
| `src/components/RegistrationTracker.tsx` | Fires Meta Pixel on `?registered=1` | Should also trigger new-user dashboard state |
| `src/app/(app)/dashboard/DashboardContent.tsx` | Renders returning-writer dashboard | Needs a new-user branch keyed on `projects.length === 0 && isNewUser` |
| `src/components/dashboard/YourStoryHero.tsx` | Empty state: "Your first story begins here" → `/projects` | CTA should go directly to project+chapter+editor creation |
| `src/components/projects/NewProjectModal.tsx` | Title + description + color picker | Onboarding variant: title only, no decorative choices |
| `src/lib/actions/chapters.ts` → `createChapter()` | Creates chapter + auto-creates Page 1 | Already creates a page — good. No change needed. |
| `src/components/editor/EditorShell.tsx` | Mounts Tiptap | Should auto-focus editor on first mount |
| `src/components/editor/RuneEditor.tsx` | The editor | Placeholder text already correct; may need first-save detection |
| `src/app/(app)/layout.tsx` | Fetches profile, renders AppShell | Profile has no `has_onboarded` flag — may need to add one |

---

## Recommended Implementation Phases

### Phase 1 — Streamline the creation path (no DB changes)

**Goal:** Reduce clicks before editor from 8–10 to 3–4.

**What to do:**
- After `NewProjectModal` creates a project, automatically call `createChapter()` with a default title, then route directly to the editor.
- Remove the chapter step from the new-user path. The writer does not need to name Chapter 1 before their first word.

**Risk:** Low. No schema changes. Purely routing and flow changes.

---

### Phase 2 — Inline project creation on the dashboard

**Goal:** Eliminate the `/projects` page step for new users.

**What to do:**
- When `projects.length === 0`, the `YourStoryHero` empty state renders an inline title input instead of a link to `/projects`.
- On submit: `createProject()` → `createChapter()` → redirect to editor.
- The writer names their story and presses Enter. The next thing they see is a blank page with a cursor.

**Risk:** Low. The creation logic already exists; this is a UI consolidation.

---

### Phase 3 — Auto-focus the editor on first open

**Goal:** Writer can type immediately without clicking.

**What to do:**
- In `RuneEditor.tsx`, after the editor mounts and content is loaded, call `editor.commands.focus()`.
- Guard it with a ref so it only fires on the initial mount, not on page switches.

**Risk:** Very low. One line of Tiptap code.

---

### Phase 4 — First-save detection and quiet acknowledgement

**Goal:** One literary moment when the writer's first words are saved.

**What to do:**
- Add an `has_written_first_words` flag (boolean) to the `profiles` table, defaulting to false.
- After the first successful `updatePage()` save where `wordCount > 0`, check if this flag is false. If so, set it to true and return a signal to the client.
- In `RuneEditor`, when this signal is received, show a transient, literary acknowledgement.

**Risk:** Medium. Requires DB schema change (one column on `profiles`). The check adds a small amount of overhead to the first save only.

**Copy options for the acknowledgement:**
- *"Your story has begun."*
- *"The first words are the hardest. You've written them."*
- *"Begin with one sentence. You did."*

Choose one. Keep it. Never change it.

---

### Phase 5 — Progressive UI reveal (optional, aspirational)

**Goal:** The editor starts in a near-fullscreen state on first visit, and the sidebar + header fade in after the first save.

**What to do:**
- On the first editor visit (detected via `has_written_first_words === false` before the first save), apply a CSS state that hides the sidebar and header.
- After the first save, transition them back in with a slow, opacity-only fade.
- The editor content area does not move. Only the chrome animates.

**Risk:** High. Requires careful coordination between `modeStore`, `EditorShell`, and `AppShell`. The risk of the manuscript reflowing during the animation is real and must be tested thoroughly. This phase should only be attempted after Phases 1–4 are stable.

**Key constraint:** The manuscript must not move. Only the chrome reveals.

---

## What Success Looks Like

A new writer, two minutes after clicking the confirmation link in their email, has:

1. Named their story.
2. Written their first sentence.
3. Watched it save.

They did not read a tutorial. They did not configure settings. They did not click through a welcome screen.

They wrote.

That is the product working.

---

## Anti-Patterns to Guard Against

As onboarding is implemented, these patterns must be actively resisted:

**The Explained Interface.** Adding tooltips, callout arrows, or help text to guide new users through the UI. Rune is intuitive by design. If the interface needs explanation, the interface needs to be redesigned — not annotated.

**The Progress Checklist.** Any implementation that tracks "steps completed" and shows a progress bar. Checklists make writing feel like administration.

**The Forced Profile.** Requiring the writer to set an avatar, bio, or preferences before they write. These are earned features, not prerequisites.

**The Interruption Modal.** Any modal that appears during or immediately after the first writing session to tell the writer something about Rune. If the first session must end with a prompt — for feedback, for rating, for any reason — the answer is: it should not.

**The Loud First Milestone.** Confetti, animation bursts, or celebration screens for saving the first sentence. A quiet acknowledgement is the ceiling. The manuscript is the event. Not the save.

---

## Relationship to Dashboard Vision

This document extends `DASHBOARD_VISION.md`, not replaces it.

The dashboard vision defines how Rune should feel for returning writers. This document defines how Rune should behave for first-time writers.

The principle that connects them:

> The dashboard becomes meaningful after the writer has written. Onboarding's job is to get the writer to write as quickly as possible so the dashboard can begin to mean something.

On a writer's second visit, the onboarding experience is over. The dashboard vision takes over completely.

---

*Created: 2026-06-27*
*This document should be updated as implementation phases are completed. Completed phases should be noted with their completion date and any decisions that changed during implementation.*
