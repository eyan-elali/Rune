/**
 * Dispatched on window (detail: the restored Scene, as the server now holds
 * it) after Scene History restores an earlier text, so an open editor of that
 * Scene shows the restored text and takes it as its confirmed baseline —
 * without counting it as typed words (useSceneEditor), and the writing
 * surface's held copy follows (Rune2Writing).
 */
export const SCENE_RESTORED_EVENT = "rune-scene-restored";
