"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium",
        "focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" && [
          "rune-btn-primary",
          "px-6 py-2.5",
        ],
        variant === "ghost" && [
          "border border-rune-gold/50 text-rune-gold",
          "px-4 py-2",
          "transition-colors duration-150",
          "hover:border-rune-gold hover:bg-rune-gold/10",
          "focus-visible:ring-2 focus-visible:ring-rune-gold/50 focus-visible:ring-offset-1",
        ],
        variant === "danger" && [
          "bg-rune-crimson text-rune-parchment",
          "px-4 py-2",
          "transition-colors duration-150",
          "hover:opacity-90",
          "focus-visible:ring-2 focus-visible:ring-rune-crimson/40 focus-visible:ring-offset-1",
        ],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
