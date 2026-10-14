// While a Scene or an Entry is being created there is nothing to type into:
// its editor (or name field) appears only once the server has made it, and
// then takes focus. If a text surface still held focus meanwhile — the Scene
// above it in the Chapter, an Entry's body, a cell — the writer's next words
// would land there instead (or, typed at a control, nowhere). So creation
// first lets go of any text entry; keystrokes then reach nothing editable
// until the new surface is ready and focused.

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    const text = ["text", "search", "url", "email", "tel", "number", "password", ""].includes(type);
    return text && !el.readOnly && !el.disabled;
  }
  return false;
}

/**
 * Blurs the focused element if it accepts text, and clears a caret left in a
 * writable surface — a blurred editor keeps its DOM selection (so does one
 * the writer left by clicking "+ Scene"), and some input (IME, dictation,
 * insertText) acts on the selection, not on focus. Returns whether focus was
 * released.
 */
export function releaseTextEntry(
  active: Element | null = document.activeElement,
  selection: Selection | null = typeof window === "undefined" ? null : window.getSelection()
): boolean {
  const released = isTextEntry(active);
  if (released) active.blur();
  const anchor = selection && selection.rangeCount > 0 ? selection.anchorNode : null;
  if (anchor) {
    const at = anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement;
    const inReleased = released && active.contains(anchor);
    if (inReleased || at?.closest('[contenteditable="true"]')) selection!.removeAllRanges();
  }
  return released;
}
