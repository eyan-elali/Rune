// Where things are on the drawn shell, in its logical pixels — read from the
// rendered shell (npm run measure:a), not guessed. The camera frames these;
// the pointer travels between them. If the app's stylesheet moves the shell,
// re-measure and update here.

/** The window the shell is drawn at: a narrow desktop window, navigator docked. */
export const SHELL = { width: 712, height: 1000, navWidth: 252 };

/** The composition's two anchors: under the copy, and the whole clear frame. */
export const ANCHOR = { copy: { ax: 540, ay: 1080 }, clear: { ax: 540, ay: 900 } };

export const GEOMETRY = {
  /** The navigator: the first root row's top, a row's height, the gap above a section. */
  nav: { top: 47, row: 28, sectionGap: 15 },
  /** The centre of Chapter 1's prose measure, and the top of its last paragraph. */
  proseEnd: { x: 482, y: 508 },
  /** The Board's first lane, and the Collection's eyebrow above it. */
  board: { x: 280, y: 297, eyebrow: 150 },
  /** The Canvas's top-left (the content region, under the tab band and context bar). */
  canvas: { x: 252, y: 82 },
};
