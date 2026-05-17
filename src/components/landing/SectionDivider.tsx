export default function SectionDivider() {
  return (
    <div
      className="relative flex items-center justify-center"
      aria-hidden
      style={{ height: "24px" }}
    >
      {/* Horizontal rule — fades in from edges, peaks at center gap */}
      <div
        className="absolute top-1/2 w-full"
        style={{
          height: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, var(--color-gold) 30%, transparent 46%, transparent 54%, var(--color-gold) 70%, transparent 100%)",
          opacity: 0.15,
          transform: "translateY(-50%)",
        }}
      />
      {/* Center diamond — no background so it sits on the line */}
      <span
        className="relative z-10"
        style={{
          color: "var(--color-gold)",
          fontSize: "0.5rem",
          opacity: 0.4,
          lineHeight: 1,
        }}
      >
        ◆
      </span>
    </div>
  );
}
