export function BetaFeedbackBanner() {
  return (
    <p
      className="text-center text-xs leading-relaxed"
      style={{ color: "var(--color-mist)", opacity: 0.45 }}
    >
      Rune is still being forged. Found something strange?{" "}
      <a
        href="mailto:contacts@rune-app.com"
        className="underline-offset-2 transition-opacity duration-200 hover:opacity-80"
        style={{ color: "inherit", textDecoration: "underline" }}
      >
        Let us know.
      </a>
    </p>
  );
}
