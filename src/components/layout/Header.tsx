"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useModeStore } from "@/store/modeStore";
import { cn } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  profile: "Profile & Stats",
  settings: "Settings",
  games: "Games",
  race: "Word Race",
  battle: "Battle",
  unlockables: "Unlockables",
  chapters: "Chapters",
};

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return segments
    .map((seg, i) => {
      if (UUID_RE.test(seg)) return null;
      return {
        label: SEGMENT_LABELS[seg] ?? seg,
        href: "/" + segments.slice(0, i + 1).join("/"),
        isLast: i === segments.length - 1,
      };
    })
    .filter(Boolean) as { label: string; href: string; isLast: boolean }[];
}

function ModeToggle() {
  const { mode, setMode } = useModeStore();
  const isFocus = mode === "focus";

  return (
    <div
      className="relative flex items-center rounded-full p-[3px] text-xs"
      style={{ border: "1px solid var(--color-border-strong)" }}
      role="group"
      aria-label="Writing mode"
    >
      {/* Sliding gold pill */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-[3px] rounded-full bg-rune-gold transition-all duration-200"
        style={{
          left: isFocus ? "3px" : "50%",
          right: isFocus ? "50%" : "3px",
        }}
      />

      <button
        onClick={() => setMode("focus")}
        aria-pressed={isFocus}
        className={cn(
          "relative z-10 rounded-full px-3.5 py-1 font-rune-sans transition-colors duration-150",
          isFocus ? "text-rune-ink" : "text-rune-mist hover:text-rune-gold"
        )}
      >
        Focus
      </button>
      <button
        onClick={() => setMode("game")}
        aria-pressed={!isFocus}
        className={cn(
          "relative z-10 rounded-full px-3.5 py-1 font-rune-sans transition-colors duration-150",
          !isFocus ? "text-rune-ink" : "text-rune-mist hover:text-rune-gold"
        )}
      >
        Game
      </button>
    </div>
  );
}

export function Header() {
  const crumbs = useBreadcrumbs();

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between px-6"
      style={{
        background: "var(--color-ink)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  size={12}
                  className="text-rune-mist/50"
                  aria-hidden="true"
                />
              )}
              {crumb.isLast ? (
                <span className="text-rune-parchment/80">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-rune-mist transition-colors hover:text-rune-gold"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <ModeToggle />
    </header>
  );
}
