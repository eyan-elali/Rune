import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      data-theme="candlelight"
      style={{ background: "var(--color-ink)", color: "var(--color-parchment)" }}
    >
      {/* Minimal header */}
      <header
        className="sticky top-0 z-10 px-6 py-4 sm:px-10"
        style={{
          background: "rgba(26,22,20,0.72)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <Link
            href="/"
            className="inline-block transition-opacity duration-150 hover:opacity-80"
            aria-label="Return to Rune home"
          >
            <span
              className="font-rune-serif text-lg select-none"
              style={{ color: "var(--color-gold)", letterSpacing: "0.28em" }}
            >
              Rune
            </span>
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="px-6 py-16 sm:px-10 sm:py-20">
        <div className="mx-auto w-full max-w-[680px]">
          {children}
        </div>
      </main>

      {/* Minimal footer */}
      <footer
        className="px-6 py-10 sm:px-10"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div className="mx-auto w-full max-w-[680px] flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link
            href="/"
            className="font-rune-serif text-sm select-none transition-opacity duration-150 hover:opacity-80"
            style={{ color: "var(--color-gold)", letterSpacing: "0.22em" }}
          >
            Rune
          </Link>
          <div
            className="flex items-center gap-5 text-xs"
            style={{ color: "var(--color-mist)", opacity: 0.5 }}
          >
            <Link
              href="/terms"
              className="transition-opacity duration-150 hover:opacity-100"
            >
              Terms of Service
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/privacy"
              className="transition-opacity duration-150 hover:opacity-100"
            >
              Privacy Policy
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/"
              className="transition-opacity duration-150 hover:opacity-100"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
