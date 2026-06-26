export function BetaFeedbackBanner() {
  return (
    <aside
      className="w-full rounded-lg px-6 py-5"
      style={{
        background: "var(--surface-card)",
        border: "1px solid rgba(201, 168, 76, 0.10)",
      }}
      aria-label="Beta feedback"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-6">
        <div className="shrink-0">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-gold)", opacity: 0.7 }}
          >
            Active Beta Phase
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Rune is currently operating in an active development loop. If you run into any
          structural errors, layout desyncs, or workflow bugs while writing, please help
          us refine the engine by reaching out directly to our engineering desk at{" "}
          <a
            href="mailto:contactus@rune-app.com"
            className="transition-all duration-200 hover:underline"
            style={{ color: "var(--color-gold)" }}
          >
            contactus@rune-app.com
          </a>
          .
        </p>
      </div>
    </aside>
  );
}
