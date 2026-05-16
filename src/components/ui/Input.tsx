import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  serif?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, serif = false, className, id, style, ...props }, ref) => {
    const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, "-")}`;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-widest text-rune-mist"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full rounded border px-3 py-2.5 text-sm outline-none",
            "transition-colors duration-150",
            "bg-transparent placeholder:text-rune-mist/50",
            "border-[var(--color-border)]",
            "focus:border-rune-gold focus:ring-2 focus:ring-rune-gold/20",
            error &&
              "border-rune-crimson focus:border-rune-crimson focus:ring-rune-crimson/20",
            serif && "font-rune-serif",
            className
          )}
          style={{
            background: "color-mix(in srgb, var(--bg-primary) 80%, transparent)",
            color: "var(--text-primary)",
            ...style,
          }}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-rune-crimson">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
