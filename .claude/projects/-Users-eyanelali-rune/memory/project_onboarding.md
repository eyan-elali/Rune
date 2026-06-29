---
name: project-onboarding
description: Onboarding flow — current architecture (simplified 3-stage form, no embedded editor)
metadata:
  type: project
---

Onboarding is a 3-stage client-side flow entirely on `/onboarding`. No embedded editor, no AppShell, no route tricks.

## Current architecture (simplified 2026-06-28)

**Stage 1 — Title:** `Welcome to Rune. / Every story begins somewhere.` heading. User types title, presses `Begin →`. Title stored in local state only — no API call. Exit animation (fade + scale 280ms) plays before advancing.

**Stage 2 — Sentence:** `Begin with one sentence. / It does not have to be perfect.` heading. Auto-growing `<textarea>` with gold border. Enter submits; newlines stripped. Autofocuses on mount. Requires at least one non-whitespace character.

**Stage 3 — Transitioning:** One of 5 literary lines (random) shown for ≥1100ms while the API call runs in `Promise.all`. On success → `router.replace` to `/projects/[id]/chapters/[id]`.

**CSS:** `rune-step-enter` keyframe (fade + translateY 8px → 0) applied to sentence stage and transition overlay mounts.

## API route `/api/onboarding` (POST)

Accepts `{ title, firstSentence }`. Atomically:
1. Checks subscription tier / project count
2. Creates project → Chapter 1 → Page 1 with Tiptap JSON content from `firstSentence`
3. Sets `word_count` (tokens ≥ 2 chars)
4. Updates `profiles.has_written_first_words = true`

Returns `{ projectId, chapterId }` only.

## Guard (`/onboarding/page.tsx`)

Redirects to `/dashboard` if `count > 0` OR `has_written_first_words === true`. New users with no projects see the flow.

## What was removed

- Embedded `EditorShell` on `/onboarding`
- `?reveal=1` query param logic
- AppShell reveal animation
- First-sentence detection in `RuneEditor`
- `/api/onboarding/first-words` route
- `isOnboarding` prop on `EditorShell` and `RuneEditor`
- `onFirstSavePersisted` / `onFirstSentenceSaved` callbacks

**Why:** The previous approach was fragile — it mounted the full editor on /onboarding, used a fetch-not-server-action workaround to prevent Next.js route refresh, and required detecting punctuation in Tiptap to trigger the transition. The new approach has zero editor complexity: the sentence is captured as plain text, saved server-side as Tiptap JSON, and the user lands in the normal editor with content already present.

**How to apply:** If debugging onboarding, all logic is in `OnboardingClient.tsx` and `/api/onboarding/route.ts`. `EditorShell` and `RuneEditor` have no awareness of onboarding state.
