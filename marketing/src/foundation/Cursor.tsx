import { mix } from "./time";

// A pointer, when a creative needs to show that something was chosen: the
// system arrow, at the shell's own scale, moving in eased straight lines and
// pressing by darkening a touch — no rings, no ripples, no enlarged clicks.
// Positions are in the shot's logical pixels, so it sits on the UI it points at.

export type CursorKey = { t: number; x: number; y: number };

/** Where the pointer is at `now` (seconds), easing between keys. */
export function cursorAt(keys: readonly CursorKey[], now: number, ease: (t: number) => number) {
  if (now <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (now <= b.t) {
      const p = ease((now - a.t) / Math.max(b.t - a.t, 1e-6));
      return { t: now, x: mix(a.x, b.x, p), y: mix(a.y, b.y, p) };
    }
  }
  return keys[keys.length - 1];
}

export function Cursor({
  x,
  y,
  opacity,
  pressed = false,
  size = 1,
}: {
  x: number;
  y: number;
  opacity: number;
  pressed?: boolean;
  /** Relative to the system arrow; a creative framed closer than the shell may draw it a little larger. */
  size?: number;
}) {
  return (
    <svg
      width={14 * size}
      height={20 * size}
      viewBox="0 0 14 20"
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        transform: `scale(${pressed ? 0.94 : 1})`,
        transformOrigin: "1px 1px",
        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <path
        d="M1 1 L1 15.5 L4.6 12.2 L7.1 18 L9.5 17 L7.1 11.3 L12 11.3 Z"
        fill={pressed ? "#2a2a2a" : "#111"}
        stroke="#fff"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
