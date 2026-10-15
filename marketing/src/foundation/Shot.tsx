import type { CSSProperties, ReactNode } from "react";

// The product, framed. A window onto the real shell drawn at its own logical
// size and scaled up for a phone-sized canvas — a crop of the app, not a
// device: no laptop, no glass, no perspective. The window is placed on the
// canvas; it may run off the canvas's right and bottom edges (`bleed`), so it
// reads as part of a larger screen. Only its open corners are rounded, with
// the app's hairline and a shadow too soft to read as a floating card.
//
// The camera is the logical point at the window's top-left, and the scale.
// Creatives move it rarely and little.

export type ShotWindow = { x: number; y: number; width: number; height: number };

export function Shot({
  window: w,
  logical,
  scale,
  camera = { x: 0, y: 0 },
  bleed = { right: true, bottom: true },
  opacity = 1,
  children,
}: {
  window: ShotWindow;
  logical: { width: number; height: number };
  scale: number;
  camera?: { x: number; y: number };
  bleed?: { right?: boolean; bottom?: boolean };
  opacity?: number;
  children: ReactNode;
}) {
  const r = 14;
  const radius = `${r}px ${bleed.right ? 0 : r}px ${bleed.right || bleed.bottom ? 0 : r}px ${bleed.bottom ? 0 : r}px`;
  return (
    <div
      style={
        {
          position: "absolute",
          left: w.x,
          top: w.y,
          width: w.width,
          height: w.height,
          overflow: "hidden",
          borderRadius: radius,
          borderStyle: "solid",
          borderColor: "var(--r2-border-strong)",
          borderWidth: `1px ${bleed.right ? 0 : 1}px ${bleed.bottom ? 0 : 1}px 1px`,
          background: "var(--r2-shell-bg)",
          boxShadow: "0 30px 80px -40px rgba(var(--r2-palette-shadow), 0.28)",
          opacity,
        } as CSSProperties
      }
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: logical.width,
          height: logical.height,
          transformOrigin: "0 0",
          transform: `scale(${scale}) translate(${-camera.x}px, ${-camera.y}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
