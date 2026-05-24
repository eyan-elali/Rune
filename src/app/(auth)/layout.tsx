import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{
        background:
          "radial-gradient(ellipse at 50% 35%, var(--color-sepia) 0%, var(--color-ink) 72%)",
      }}
    >
      {/* Wordmark */}
      <div className="mb-10 flex flex-col items-center gap-1 select-none">
        <span
          className="font-rune-serif text-5xl text-rune-gold"
          style={{ letterSpacing: "0.3em" }}
        >
          Rune
        </span>
        <span className="text-[10px] uppercase tracking-[0.35em] text-rune-mist">
          Write Fearlessly
        </span>
      </div>

      {children}
    </div>
  );
}
