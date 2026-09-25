"use client";

import Link from "next/link";

export default function Rune2Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="r2 flex h-dvh flex-col items-center justify-center gap-3 text-sm">
      <p style={{ color: "var(--r2-muted)" }}>The manuscript couldn’t be loaded.</p>
      <div className="flex gap-4">
        <button type="button" onClick={reset} style={{ color: "var(--r2-accent)" }}>
          Try again
        </button>
        <Link href="/dashboard" style={{ color: "var(--r2-muted)" }}>
          Back to Rune
        </Link>
      </div>
    </div>
  );
}
