---
name: project-onboarding
description: Onboarding implementation phases, architecture decisions, and editor embedding approach
metadata:
  type: project
---

Onboarding route is `/onboarding` (outside the `(app)` route group — no AppShell). Redirects to `/dashboard` if user already has projects.

## Phase status

- **Phase 1–4**: Complete. `createProjectWithDraft` creates project/chapter/page in one action. `onboardingStore` coordinates writing/revealing/done phases. `EditorShell` and `RuneEditor` both support `isOnboarding=true`. `has_written_first_words` DB flag persisted on first save. `markFirstWordsSaved()` server action in `src/lib/actions/settings.ts`.
- **Phase 5**: Complete. Continuous onboarding transition — editor mounts directly on `/onboarding` page without a visible route change.

## Phase 5 Architecture (implemented 2026-06-28)

**Flow**: Title page (dark bg) → form fades out → writing canvas fades in on same page → user writes → PageList/ExportToolbar reveal → after first save DB is updated → `startTransition(router.replace(url))` transitions to real editor route in background.

**Key decisions**:
- `EditorShell` is mounted directly on `/onboarding` with all data returned from the extended `createProjectWithDraft` action.
- `createProjectWithDraft` now returns `{ projectId, chapterId, page, chapter, project }` (extended from IDs only).
- URL updated with `window.history.replaceState` immediately when writing scene appears.
- `router.replace()` fires only after `markFirstWordsSaved()` resolves (ensuring `has_written_first_words = true` in DB before the real editor route SSR runs).
- `EditorShell` has new optional prop `onFirstSavePersisted?: () => void` — called inside `handleFirstSave` after the DB write resolves.
- `EditorShellModule` is pre-fetched at module declaration time in `OnboardingClient` so it's likely cached by the time the user presses Begin.
- No AppShell on `/onboarding` → sidebar/header DON'T animate in on first session. PageList and ExportToolbar DO animate in (they're inside EditorShell). Sidebar/header appear normally when user reaches the real editor route (after `router.replace`).

**Files changed**:
- `src/lib/actions/projects.ts` — extended `createProjectWithDraft` return type, page insert now uses `.select().single()`
- `src/components/editor/EditorShell.tsx` — added `onFirstSavePersisted` prop
- `src/app/onboarding/OnboardingClient.tsx` — stage machine: form → exiting → writing; embeds EditorShell in writing stage
- `src/app/globals.css` — added `rune-onboarding-canvas-enter` keyframe + class

**Why:** Goal was to eliminate the visible page transition after pressing Begin, making the experience feel like a single continuous ritual from title entry to first sentence. The router.replace after first save settles the app into the real editor route with correct state.

**How to apply:** If touching onboarding again, understand that the editor is live on `/onboarding` before any Next.js navigation happens. Do not add logic to `(app)/layout.tsx` that assumes users are always in AppShell when they first write.
