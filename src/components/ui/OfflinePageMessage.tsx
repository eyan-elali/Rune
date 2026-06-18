"use client";

import { useRouter } from "next/navigation";

export function OfflinePageMessage() {
  const router = useRouter();

  return (
    <div
      className="flex h-full min-h-96 flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Decorative rule */}
      <div
        style={{
          width: "1px",
          height: "48px",
          background:
            "linear-gradient(to bottom, transparent, var(--color-border-strong), transparent)",
          marginBottom: "32px",
        }}
        aria-hidden
      />

      {/* Sigil */}
      <div
        style={{
          fontFamily: "var(--font-rune-serif)",
          fontSize: "28px",
          color: "var(--color-gold)",
          opacity: 0.5,
          letterSpacing: "0.2em",
          marginBottom: "28px",
          userSelect: "none",
        }}
        aria-hidden
      >
        ✦
      </div>

      <h2
        style={{
          fontFamily: "var(--font-rune-serif)",
          fontSize: "22px",
          fontWeight: 400,
          color: "var(--text-primary)",
          letterSpacing: "0.01em",
          marginBottom: "12px",
          lineHeight: 1.4,
        }}
      >
        This page is not available offline
      </h2>

      <p
        style={{
          fontFamily: "var(--font-rune-sans)",
          fontSize: "14px",
          color: "var(--color-mist)",
          maxWidth: "320px",
          lineHeight: 1.7,
          marginBottom: "36px",
        }}
      >
        Your writing is safe. Return to your last open page to continue.
      </p>

      <button
        onClick={() => router.back()}
        style={{
          fontFamily: "var(--font-rune-sans)",
          fontSize: "13px",
          color: "var(--color-gold)",
          background: "transparent",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "4px",
          padding: "8px 20px",
          cursor: "pointer",
          letterSpacing: "0.05em",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--color-gold)";
          e.currentTarget.style.color = "var(--color-gold)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-strong)";
          e.currentTarget.style.color = "var(--color-gold)";
        }}
      >
        ← Return
      </button>

      {/* Decorative rule bottom */}
      <div
        style={{
          width: "1px",
          height: "48px",
          background:
            "linear-gradient(to bottom, var(--color-border-strong), transparent)",
          marginTop: "32px",
        }}
        aria-hidden
      />
    </div>
  );
}
