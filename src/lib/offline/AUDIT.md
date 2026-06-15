# Offline Sync — Autosave Audit

Audit conducted before implementing the local-first offline layer.

---

## RuneEditor.tsx

| Item | Variable / Location |
|---|---|
| Current page ID | `currentPage?.id` (prop); mutable ref: `currentPageRef.current`; switch detection: `prevPageIdRef.current` |
| Current project ID | `projectId` (prop, `string`) |
| `updatePage` call sites | (1) debounced `onUpdate` ~line 153; (2) page-switch flush ~line 269; (3) retry path ~line 215 |
| Debounce duration | `autoSaveDelayRef.current` — default `prefs.autoSaveDelay ?? 1500` ms, min 100 ms |
| Word count delta | `const delta = wordCount - lastSavedWordCountRef.current` (~line 145); paste words deducted before `recordWordsWritten` |
| Save status indicator | `isSaving` (editorStore) → `✦` star, bottom-right, opacity 0.35 + pulse when saving; local `showSaved` state (formerly "Saved" text, now drives the star visibility) |

## src/lib/actions/pages.ts

| Item | Finding |
|---|---|
| `updatePage` signature | `(id: string, content: Record<string, unknown>, wordCount: number) → Promise<ActionResult<Page>>` |
| Columns updated | `content`, `word_count`, `updated_at` (client-set `new Date().toISOString()`) |
| `updated_at` from DB | Not read back — set manually, not from trigger return |

`recordWordsWritten` exists in `src/lib/actions/writingStats.ts`:
signature: `(projectId: string | null, wordsAdded: number, pageId: string | null) → Promise<void>`
The existing call in RuneEditor (line 173) matches this signature exactly — do NOT remove it.

## src/store/editorStore.ts

Fields: `currentProjectId`, `currentChapterId`, `currentPageId` (all `string | null`, default `null`),
`isSaving: boolean` (default `false`), `lastSaved: Date | null` (default `null`).

## src/store/profileStore.ts

No `addXp` method. Has `updateXp(xp: number, level: number)`.
Part 9 pre-flight: add `addXp(amount: number)` that calls `levelFromXp(newXp)` before proceeding.

## SQL Typo Found in Prompt

Prompt migration had `NEW.version = OLD.versio` — fixed to `NEW.version = OLD.version + 1` in the created SQL file.
