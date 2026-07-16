export default function AppLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32">
      <style>{`
        @keyframes rune-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .rune-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid color-mix(in srgb, var(--color-gold) 18%, transparent);
          border-top-color: var(--color-gold);
          border-radius: 50%;
          animation: rune-spin 0.9s linear infinite;
        }
      `}</style>
      <div className="rune-spinner" aria-hidden />
      <p
        className="font-rune-serif italic"
        style={{ color: "var(--color-mist)", fontSize: "0.875rem" }}
      >
        Turning pages&hellip;
      </p>
    </div>
  );
}
