"use client";

interface GuideButtonProps {
  onClick: () => void;
  label?: string;
}

export function GuideButton({ onClick, label = "Page Guide" }: GuideButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-opacity duration-150 hover:opacity-80"
      style={{
        background: "color-mix(in srgb, var(--color-gold) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-gold) 20%, transparent)",
        color: "var(--color-mist)",
      }}
    >
      ?
    </button>
  );
}
