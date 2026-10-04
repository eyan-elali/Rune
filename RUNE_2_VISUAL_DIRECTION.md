# Rune 2.0 — Visual Direction

## Purpose

This document defines the visual and interaction direction for Rune 2.0.

It is intentionally **not** a detailed design system. It does not lock exact dimensions, colors, spacing, typography, radii, or component specifications.

Its purpose is to establish how Rune 2.0 should **feel**, what visual principles should guide implementation, and what kinds of design decisions should be avoided.

Rune 2.0 should be designed in the real product and refined iteratively as the interface is built.

---

## Visual North Star

Rune 2.0 is a **serious creative workstation for authors**.

It should feel:

- sleek
- capable
- calm
- professional
- modern
- aesthetically refined
- powerful without appearing complicated

The broad visual reference sits somewhere between **Notion and Obsidian**, without imitating either product.

### What Rune should learn from Obsidian

- compact navigation
- strong hierarchy
- efficient use of space
- information density where it is useful
- powerful project navigation
- an interface capable of handling large, complicated bodies of work

### What Rune should learn from Notion

- restraint
- polish
- whitespace
- quiet controls
- elegant surfaces
- minimal visual noise
- interfaces that disappear when they are not needed

Rune should combine these qualities into its own visual language.

> **At first glance, Rune should feel simple and beautiful. As the writer reaches for more, it should reveal serious depth.**

---

## Core Product Feeling

Rune should feel like software a professional author could comfortably spend hours inside every day.

It should not visually imply that it is only for:

- fantasy writers
- hobbyists
- highly technical users
- productivity enthusiasts
- people who enjoy configuring software for its own sake

The interface should feel credible for writers of literary fiction, fantasy, romance, thrillers, historical fiction, science fiction, and other long-form fiction.

The product should communicate seriousness through **craft, clarity, hierarchy, typography, and restraint**, not decoration.

---

## The Manuscript Comes First Visually

The manuscript is the visual center of Rune.

When the writer is writing:

- the interface should recede
- the central area itself should be the writing environment
- prose should have generous space
- typography should be excellent
- controls should remain contextual and minimal
- unnecessary interface should disappear

Do **not** place the manuscript inside a floating fake sheet of paper or a large card with shadows.

The editor should feel integrated into the application surface.

Rune should not use a permanent Google Docs-style formatting toolbar by default.

Formatting should be available without continuously occupying visual attention.

---

## Project Navigation

A Rune project contains both the **Manuscript** and the **Workspace**.

They should coexist in one compact project navigator rather than being treated as separate applications.

Conceptually:

```text
HOLLOW

▾ Manuscript
  ▾ Part I
      Chapter 1
    ▾ Chapter 2
        Scene 1
        Scene 2
  ▸ Part II

▾ Unplaced Scenes

▾ Workspace
    Characters
    World
    Research
```

The sidebar should be:

- compact
- hierarchical
- efficient
- visually quiet
- capable of supporting large manuscripts
- capable of supporting large workspaces
- easy to scan
- comfortable for frequent navigation

Hierarchy should primarily be expressed through:

- indentation
- typography
- disclosure controls
- subtle icons
- restrained active states
- restrained hover states

Avoid turning every item into a card or heavily boxed row.

The sidebar should lean closer to Obsidian in **density and hierarchy**, but closer to Notion in **visual refinement**.

---

## Progressive Complexity

Rune should never make writers use advanced organizational features merely because those features exist.

A writer may experience only:

```text
Manuscript
    Chapter 1
    Chapter 2
```

Another writer may use:

```text
Manuscript
    Part I
        Chapter 1
            Scene 1
            Scene 2
        Chapter 2

Workspace
    Characters
    World
    Research
```

Both experiences should feel completely native to Rune.

The interface should reveal complexity when the writer asks for it.

### Scenes

Scenes should be available without being forced on the writer.

A newly created Chapter may internally contain its initial Scene while visually behaving simply as a Chapter.

If the writer chooses to use scene structure, the Chapter can expand and expose its Scenes in the navigator.

Rune should not make scene structure feel mandatory for writers who prefer to think only in Chapters.

---

## Chapter and Scene Experience

A Chapter should be able to feel like one continuous piece of writing.

When scene structure is used:

- clicking a Scene should allow the writer to work with that Scene specifically
- clicking the Chapter should present the Chapter as a continuous reading/writing experience
- Scene boundaries should remain structurally real underneath the interface
- the interface should not make the writer feel as if they are editing database fragments

Scene structure should support the manuscript, not dominate it.

---

## Central Content Area

The entire central area should act as the active content surface.

For manuscript writing, it becomes the editor.

For Workspace objects, it becomes the relevant Page, Collection, Entry, Table, Board, or other view.

Avoid unnecessary nested surfaces and large containers.

The content itself should dominate the screen.

---

## Application Chrome

Rune should use very little permanent chrome.

Prefer:

- compact tabs
- quiet breadcrumbs
- small contextual actions
- contextual menus
- an optional right-side panel
- controls that appear where they are useful

Avoid:

- large permanent toolbars
- multiple competing navigation bars
- excessive button rows
- large application headers
- browser-like tab clutter
- controls that are always visible simply because a feature exists

When uncertain, prefer **less interface**.

---

## Tabs

Rune may support a small working set of open objects.

For example:

```text
Chapter 14
Nerai
Ending Ideas
```

Tabs exist to help a writer move quickly between manuscript work and supporting material.

They should be:

- visually quiet
- compact
- subordinate to the active content
- sleek enough that they do not disrupt the writing experience

They should not make Rune feel like a browser or IDE.

Focus-oriented writing experiences may hide them entirely.

---

## Right-Side Context Panel

Rune should have one optional physical right-side panel.

Different actions may open different content inside the same panel.

For example:

- **Notes** opens writing or Scene notes
- **Inspector** opens properties, relationships, backlinks, metadata, or other structural information

Notes and Inspector may have separate actions because they serve different mental purposes.

They should generally share the same physical panel rather than creating multiple simultaneous right sidebars.

When the panel is closed, the central writing area should regain the space.

---

## Contextual Actions

Actions should appear when relevant rather than being globally permanent.

For example, a Chapter context may expose:

- Add Scene
- Notes
- Inspector
- More

A Character Page or Workspace Page may expose a different set.

Do not accumulate every possible action into one universal toolbar.

---

## Color Direction

Rune's interface should be primarily neutral.

A recognizable **ink blue** should provide Rune's visual identity through restrained use such as:

- active states
- selection
- focus
- highlights
- subtle accents
- occasional surface tinting

Rune should not become a predominantly blue application.

### Application themes

Rune should eventually support:

- a refined light application theme
- a deep ink/navy dark application theme

### Editor background

The editor background is independent of the application theme.

A writer should be able to choose a preferred writing surface regardless of whether the surrounding application is light or dark.

The writing surface is something users may stare at for hours, so this preference should be treated as meaningful rather than decorative.

---

## Visual Restraint

Rune should avoid decoration for decoration's sake.

Avoid:

- fantasy motifs
- faux parchment everywhere
- ornamental flourishes
- excessive serif usage outside places where it improves the experience
- oversized cards
- generic SaaS gradients
- heavy shadows
- excessive border radius
- loud color
- unnecessary animation

Rune's identity should come from:

- typography
- spacing
- hierarchy
- motion
- subtle color
- iconography
- interaction quality
- the manuscript experience itself

---

## What Rune 2.0 Should Not Feel Like

Rune 2.0 should not feel:

- whimsical
- fantasy-specific
- dark-academia themed
- game-like
- cute
- excessively decorative
- like generic SaaS
- like a developer IDE
- like Microsoft Word
- like Notion with a manuscript feature
- like Obsidian with prettier colors

Notion and Obsidian are references, not templates.

Rune should develop its own identity through implementation.

---

## Build Philosophy

The visual language should be **discovered through the real product**.

Do not prematurely lock exact:

- sidebar widths
- row heights
- colors
- typography
- spacing
- radii
- icon sizes
- panel dimensions
- control placement

Build the smallest real interface, use it, inspect it, and refine it.

Prefer implementation-led design:

```text
Build
→ inspect
→ use
→ identify friction
→ refine
→ add the next capability
```

Do not attempt to fully design Rune 2.0 before meaningful UI exists on screen.

Durable visual principles discovered during implementation can be added to this document over time.

---

## Rune 2.0 Shell Principle

Rune 2.0 should be built as a new shell from a blank visual slate.

It should not inherit the current Rune AppShell or current Rune visual language by default.

Existing reliable product logic may be reused where appropriate, especially around:

- editing
- saving
- offline resilience
- manuscript persistence
- word counting
- authentication
- other proven infrastructure

But the Rune 2.0 presentation architecture should be new.

The temporary development flow may be:

```text
Current Rune
    ↓
Rune 2.0 entry
    ↓
New Rune 2.0 shell
    ↓
Real Project
    ↓
Manuscript + Workspace
```

The goal is to let Rune 2.0 grow independently until it is ready to replace the old interface.

---

## Current Visual Principle Summary

> **Professional, calm, powerful, and understated.**

> **Obsidian-like capability and density where useful.**

> **Notion-like restraint and aesthetic clarity.**

> **The manuscript dominates. The interface recedes.**

> **Complexity appears only when the writer asks for it.**

> **Rune should feel designed for serious authors without feeling intimidating.**
