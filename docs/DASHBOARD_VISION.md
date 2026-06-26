# Rune Dashboard — Vision & Design Philosophy

> This document is the long-term design philosophy for the Rune dashboard.
> Read it before making any dashboard change, no matter how small.
> It is a living document. Update it as Rune evolves.

---

## 1. Purpose

The Rune dashboard is not an admin panel. It is not a statistics page. It is not a home screen in the conventional sense.

**Its single purpose is to make a writer open their manuscript.**

Every element on the dashboard should serve one of two jobs:

1. Remove friction between the writer and their current work.
2. Quietly communicate that Rune is a deep, serious workspace worth returning to.

If an element does neither of these things, it does not belong on the dashboard.

The dashboard should feel like walking into a study where your manuscript is already open on the desk. The work is waiting. The room is calm. Everything you need is close. Nothing demands your attention.

---

## 2. Core Philosophy

### Writing always comes first.

The primary action on every dashboard visit is returning to the manuscript. Everything below the fold, every secondary card, every stat — all of it is subordinate to the act of opening the editor.

### The editor is sacred.

The dashboard is a threshold. The editor is the destination. The dashboard must never feel more interesting than the work itself. It should make writing feel closer, not further away.

### Continue Writing is always the hero.

The most recently touched chapter is the most important piece of information on the entire page. It must be immediately visible without scrolling, and it must be the highest-affordance action on the screen.

### Discovery over tutorials.

Rune does not explain itself with popups, tooltips, or onboarding flows. Features reveal themselves as users engage. The dashboard should make users curious about what Rune contains — not anxious about what they haven't set up.

### Invitation over interruption.

Secondary features — the Arena, writing goals, the task manager, analytics — should appear as invitations, not obligations. A new user should never feel overwhelmed by locked features or a list of things they "should" configure.

### Calm over clutter.

Restraint is a design value. The dashboard should feel like it has room to breathe. Whitespace is intentional. The Dark Academia aesthetic requires quiet elegance, not feature density.

### Serious over gimmicky.

Even gamified elements — the Arena, battle records, race stats — must be presented with gravity. Rune is for people writing novels. The tone must always honour that.

### Show depth without overwhelming.

A new user should sense that Rune contains more than they can see today. An experienced user should find the depth they've earned. But neither should feel lost or badgered.

### Rune should feel like a writer's study, not an admin dashboard.

Labels should feel like pages in a journal, not column headers in a spreadsheet. Data should feel like progress, not metrics. The writing streak should feel like a quiet ritual, not a game score.

---

## 3. Emotional Goals

When a writer opens Rune and sees the dashboard, they should feel:

**Calm.** The room is quiet. There is no noise, no alerts demanding attention, no red dots, no badges. Everything is in order.

**Welcomed back.** The dashboard acknowledges that the writer has been here before. Their manuscript is waiting. Their progress is visible. Rune remembers them.

**Motivated — gently.** Not pressured. Not guilty. The writing streak, if active, should feel like a reward, not a threat. Goals should feel like an aspiration, not a to-do list.

**Curious.** Features that are locked, unexplored, or recently discovered should invite the writer to explore when they're ready.

**Focused.** The dashboard should clear the way, not add to the noise. After a few seconds on the dashboard, the natural impulse should be to open the editor.

**Never overwhelmed.** Especially on first visit. A blank project list should feel like possibility, not emptiness.

**Never guilty.** Gaps in the writing streak, empty stats, low word counts — these should never be presented in a way that makes a writer feel bad about where they are.

---

## 4. Dashboard Hierarchy

The dashboard has a clear hierarchy of importance. Every layout decision must respect this order.

### Tier 1 — The Return (hero)

**Continue Writing.** The most recently touched chapter, with a single, prominent action to re-enter the editor.

This is the first thing a returning user sees. It should be above the fold on all common viewport sizes. It takes the most space. Its button is the largest interactive element on the page.

*Why:* Most dashboard visits are return visits. The writer already has a project. They do not need to be told what Rune is — they need to be back inside their manuscript within seconds.

### Tier 2 — Today's Intent

**Tasks** (Scribe) or a light empty state (Free). What does the writer intend to accomplish today?

This sits close to the hero, but below it. It is not decorative — it is functional. A writer with tasks will scan this and feel oriented. A writer without tasks will see a quiet invitation.

*Why:* The task manager grounds the session in intention. It connects the act of returning to the manuscript with a sense of direction.

### Tier 3 — Momentum

**Writing streak, manuscript goal, writing statistics.** Evidence that the writer is building something real over time.

These cards communicate progress. They are not the reason the writer visits — but they are the reason the writer returns. Seen over weeks and months, these elements build a sense of narrative momentum.

*Why:* Writing a novel is a long game. The dashboard should make the writer feel like they are making progress on something that matters, not just accumulating sessions.

### Tier 4 — The Manuscript

**Recent projects, recent pages.** Quick links back into the work.

This is a secondary navigation layer. Writers who have multiple projects, or who want to jump to a specific page rather than their most recent work, use this section.

*Why:* The Continue Writing hero is optimized for the most common case. This section handles everything else.

### Tier 5 — The Horizon

**Arena preview (game mode), explore links, unlockables hints.** Features the writer hasn't fully explored yet.

These elements should appear quiet and inviting — not prominent or demanding. They exist to communicate that Rune has more to offer when the writer is ready.

*Why:* Discovery should happen naturally, not through forced onboarding. The horizon makes Rune feel deep without being overwhelming.

---

## 5. New User Experience

Rune does not have onboarding popups. Rune does not have a tutorial wizard. Rune does not have a "complete your profile" checklist.

The new user experience is **embedded in the dashboard itself**.

### What a new user sees

A new user with no projects sees:

- A calm, beautiful welcome with their name.
- A clear, single invitation to start a project.
- A quiet hint of what the rest of Rune contains — task manager, goals, streak, Arena — without any of it feeling like homework.
- No locked-feature anxiety. Premium sections should feel like future potential, not like things being withheld.

### How discovery unfolds

Week 1: The writer creates a project and starts writing. The Continue Writing hero appears. The writing streak begins. The word count grows.

Week 2: The writer notices the writing streak card. They start thinking about consistency.

Week 3: A few Arena cards appear in Game Mode. The writer tries Race Yourself.

Week 4: The writer earns enough XP to unlock a new theme. The unlockables page becomes meaningful.

The dashboard does not need to explain any of this. The features reveal themselves through use.

### New user empty states

Empty states must never feel like failure. They must feel like invitation.

- No project: "Your manuscript begins here." + Create Project button.
- No writing streak: "Start your streak today." (soft, no pressure).
- No goal set: A gentle "+ Set a manuscript goal" CTA, not a locked card screaming "UPGRADE".
- No tasks: "Nothing due today." (neutral, clean).

---

## 6. Free Tier Philosophy

The free tier is a complete writing experience, not a degraded one.

Free tier writers can write, organize their manuscript, and enter game mode with a weekly ticket. That is a real product. It should feel like one.

### How premium sections should appear to free users

Premium sections — tasks, writing streak, analytics, goals — should appear in the dashboard, but as gentle, honest invitations rather than hard gates.

The `UpgradeTeaser` component today uses a dashed border and a lock icon. This is correct in principle: it signals difference without aggression.

The key rules:

**Never let the dashboard feel like a collection of locked boxes.** If most dashboard sections are showing "Upgrade to Scribe", the dashboard feels broken. Premium sections should not all cluster together or dominate the layout.

**Make the free experience feel intentional and complete.** The Continue Writing hero, the project links, the basic stats, and the game mode preview are all available to free users. These should feel like a coherent experience, not a stripped-down one.

**Premium teasers should show what's possible, not what's missing.** "Track your writing streak" is better than "Writing streak — locked". The language should be future-oriented, not deficit-oriented.

**Never gate the primary action.** Continue Writing, creating projects, and opening the editor must never be behind a paywall. The dashboard's most important element must always work.

---

## 7. Design Principles

These are the rules that every future dashboard element must pass before being added.

1. **Writing first.** Does this element help a writer return to their manuscript, or does it compete with that goal?

2. **Earned presence.** Every card, section, or element must justify its position. If a writer with an active manuscript doesn't benefit from it, it probably doesn't belong at the top of the dashboard.

3. **One action per card.** Every card has a single, clear purpose. Cards should not try to do two things at once.

4. **Empty states are not failures.** Every card must look intentional and calm when it has no data. A card that looks broken when empty will make the dashboard feel broken for new users.

5. **No guilt.** Do not present metrics in a way that makes writers feel bad about their output. Progress visualizations should feel motivating, not accusatory.

6. **Restraint with numbers.** Statistics are context, not the point. A writer's total word count is meaningful. A writer's WPM-per-session is probably not dashboard material. Ask: does showing this number make the writer want to write more, or does it make them feel like they're being measured?

7. **Hierarchy is sacred.** New features always enter at Tier 4 or Tier 5. They do not push Continue Writing or momentum down the page.

8. **Locked features must not dominate.** If a feature is gated, its teaser should take the same space as the feature it replaces — no more. Premium upsells should never feel like the dashboard's main message.

9. **Typography carries tone.** Dashboard copy uses the Dark Academia voice: calm, literary, unhurried. Never breathless, never urgent, never salesy. Serif for titles and emphasis. Sans for labels and metadata.

10. **No emojis as icons.** The current dashboard uses 🏆, 📖, ✦ as stat icons. These should be replaced with intentional iconography or typographic marks that match the aesthetic. Emojis break the tone.

---

## 8. Future Evolution

Rune will grow. The dashboard must grow with it without becoming cluttered.

### The guiding principle for all future additions

**The dashboard does not become more complex as Rune adds features. It becomes more personalised.**

A writer in their first week sees a simple, inviting dashboard. A writer in their twelfth month sees a dashboard that reflects their specific manuscript, their momentum, their goals, and their Arena history. The information density grows with the user's engagement — not with Rune's feature count.

### How to add new features to the dashboard

1. Ask: does this feature help a writer return to their manuscript, or track meaningful progress?
2. If yes: does it belong at the top (Tier 1–2), the middle (Tier 3–4), or the horizon (Tier 5)?
3. Tier 1 and Tier 2 are essentially locked. Do not add features there without deliberate restructuring.
4. New features enter at Tier 4–5 first. They earn their way up through proven value.
5. If the dashboard becomes visually crowded, consider collapsing sections before adding more content.

### Specific future systems

**Arena improvements.** New game modes, seasonal events, leaderboards — these should surface on the dashboard through the Game Mode view, not the Normal Mode view. The Normal Mode dashboard is a writer's study. The Game Mode dashboard is the Arena lobby. Keep them architecturally separate.

**Analytics and heatmaps.** Writing heatmaps and session analytics belong in the profile or a dedicated stats section, not on the main dashboard. The dashboard should surface a single meaningful number or visual — not a full analytics suite. Surface a "words this week" number, link to the full heatmap.

**Writing goals.** Goals should evolve from a single manuscript target into potentially a daily goal + manuscript target + chapter milestone. As goals grow in complexity, consider a dedicated goals section with its own hierarchy, rather than expanding the current GoalSection card grid.

**Seasons.** If Rune introduces seasonal challenges or writing seasons (NaNoWriMo-style month-long events), they should appear as a distinct, time-bound banner — never permanent dashboard real estate. Seasons appear when active and disappear when complete.

**Achievements.** Achievement unlocks should appear as lightweight moments — a toast notification when earned, visible on the profile page. The dashboard should never become an achievements leaderboard. If an achievement is highly meaningful (first 10,000 words, first battle won), a brief contextual mention in the dashboard can be appropriate, but only at the moment of earning it.

**Future multiplayer.** 1v1 Race and multiplayer modes should surface in the Game Mode dashboard view as a separate section below the solo Arena options. They should never crowd the Normal Mode dashboard.

### The test of a well-evolved dashboard

In two years, after Rune has added goals, seasons, achievements, multiplayer, and analytics — open the dashboard on a fresh account and ask:

> Can a new writer understand what to do in the first five seconds?

If the answer is still yes, the dashboard has evolved well. If the first five seconds are now spent reading or making sense of complexity, the dashboard has lost its way and needs a pruning pass.

Pruning is not failure. It is maintenance. Schedule it.

---

*Last updated: 2026-06-26*
*This document should be updated whenever the dashboard architecture changes significantly or new features are added.*
