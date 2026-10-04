// The Workspace rich-text editor's REAL schema, commands and triggers
// (lib/rune2/workspaceEditorSchema.ts, workspaceEditorCommands.ts,
// workspaceDocument.ts), with TipTap's Editor — for tests. TipTap 3 runs
// headless (element: null) in Node, so the "/" commands and the "@"
// insertion run exactly as in the browser, minus the React node views
// (presentation only: they add no node type). A headless editor installs no
// plugins, so the trigger plugin is run in a ProseMirror EditorState built
// with the editor's own plugins. Bundled with bundleForTest so '@/…' and
// '@tiptap/*' resolve from the app.
export { Editor, getSchema } from '@tiptap/core';
export * from '@/lib/rune2/workspaceEditorSchema';
export * from '@/lib/rune2/workspaceEditorCommands';
export * from '@/lib/rune2/workspaceDocument';
export { EditorState, TextSelection } from '@tiptap/pm/state';
