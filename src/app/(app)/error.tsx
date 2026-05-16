"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-32 text-center">
      <p
        className="text-[10px] uppercase tracking-[0.4em]"
        style={{ color: "var(--color-crimson)", opacity: 0.7 }}
      >
        ✦ &nbsp;An error occurred&nbsp; ✦
      </p>
      <h1
        className="font-rune-serif text-3xl"
        style={{ color: "var(--color-parchment)" }}
      >
        Something went wrong
      </h1>
      {error.message && (
        <p
          className="max-w-sm text-sm leading-relaxed"
          style={{ color: "var(--color-mist)" }}
        >
          {error.message}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded px-5 py-2 text-sm transition-all duration-150 hover:opacity-90"
          style={{ background: "var(--color-gold)", color: "var(--color-ink)" }}
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="text-sm transition-colors hover:text-rune-gold"
          style={{ color: "var(--color-mist)" }}
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
