// The manuscript editor's real document schema (StarterKit, configured as
// useSceneEditor configures it) for tests: parse stored TipTap JSON exactly
// as the editor would, and count its words exactly as the editor does.
// Bundled with bundleForTest so '@tiptap/*' resolve from the app.
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const schema = getSchema([StarterKit.configure({ heading: { levels: [1, 2, 3] } })]);

/** The document as the editor loads it; throws if the JSON doesn't fit the schema. */
export function editorDocument(json) {
  const node = schema.nodeFromJSON(json);
  node.check();
  return node;
}

/** useSceneEditor's countWords, verbatim. */
export function editorWordCount(json) {
  const doc = editorDocument(json);
  const text = doc.textBetween(0, doc.content.size, ' ', ' ');
  return text.split(' ').filter((word) => word !== '').length;
}
