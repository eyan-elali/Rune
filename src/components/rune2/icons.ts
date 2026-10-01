// Rune 2.0 icon sizing (Milestone 21A).
//
// One icon family (lucide), one stroke, two sizes. Spread these onto a lucide
// icon instead of writing `size` and `strokeWidth` by hand, so every glyph in
// the shell sits on the same grid as the CSS tokens (--r2-icon, --r2-icon-sm,
// --r2-icon-stroke in rune2.css).
//
//   <Plus {...ICON} aria-hidden />          routine controls, rows, menus, actions
//   <X {...ICON_SM} aria-hidden />          inline marks: inside text, tabs, chips
//   <Check {...ICON_SM_BOLD} aria-hidden /> a mark that must read at 12px (a tick,
//                                           a disclosure chevron)
//   <Check {...ICON_CHECK} />               the tick inside a 15px checkbox

export const ICON_STROKE = 1.75;
export const ICON_STROKE_BOLD = 2;

export const ICON = { size: 14, strokeWidth: ICON_STROKE } as const;
export const ICON_SM = { size: 12, strokeWidth: ICON_STROKE } as const;
export const ICON_SM_BOLD = { size: 12, strokeWidth: ICON_STROKE_BOLD } as const;
export const ICON_CHECK = { size: 11, strokeWidth: 2.5 } as const;
