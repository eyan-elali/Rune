"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ModeToggle } from "@/components/ui/ModeToggle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const projectId = segments.find(
    (seg, i) => i > 0 && segments[i - 1] === "projects" && UUID_RE.test(seg)
  );

  return segments
    .map((seg, i) => {
      if (UUID_RE.test(seg)) return null;

      let href = "/" + segments.slice(0, i + 1).join("/");
      // No /projects/:id/chapters index route — link to the project workspace
      if (seg === "chapters" && projectId) {
        href = `/projects/${projectId}`;
      }

      return {
        label: SEGMENT_LABELS[seg] ?? seg,
        href,
        isLast: i === segments.length - 1,
      };
    })
    .filter(Boolean) as { label: string; href: string; isLast: boolean }[];
}

export function Header() {
  const crumbs = useBreadcrumbs();

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between px-6"
      style={{
        background: "var(--bg-primary)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-rune-mist/50" />}
              {crumb.isLast ? (
                <span style={{ color: "var(--text-primary)" }}>{crumb.label}</span>
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