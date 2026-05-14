"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SidebarProps {
  displayName: string;
  avatarUrl: string | null;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: BookOpen },
  { href: "/profile", label: "Profile & Stats", icon: User },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-r-md border-l-2 px-3 py-2.5 text-sm transition-colors duration-150",
        active
          ? "border-rune-gold bg-rune-gold/10 text-rune-gold"
          : "border-transparent text-rune-parchment/60 hover:bg-rune-gold/5 hover:text-rune-parchment"
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function Sidebar({ displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const initial = displayName.trim().charAt(0).toUpperCase() || "W";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside
      className="flex h-screen w-[260px] shrink-0 flex-col"
      style={{
        background: "var(--color-sepia)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Wordmark */}
      <div
        className="flex items-center px-6 py-5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span
          className="font-rune-serif text-2xl text-rune-gold"
          style={{ letterSpacing: "0.25em" }}
        >
          Rune
        </span>
      </div>

      {/* User identity */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rune-gold/20 text-xs font-semibold text-rune-gold">
            {initial}
          </div>
        )}
        <span className="truncate text-sm text-rune-parchment/80">
          {displayName}
        </span>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 px-2 py-3" aria-label="Main navigation">
        <ul className="flex flex-col gap-0.5" role="list">
          {NAV_LINKS.map(({ href, label, icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                label={label}
                icon={icon}
                active={
                  pathname === href || pathname.startsWith(`${href}/`)
                }
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom: settings + sign out */}
      <div
        className="px-2 pb-4 pt-3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname === "/settings"}
        />
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-0.5 flex w-full items-center gap-3 rounded-r-md border-l-2 border-transparent px-3 py-2.5 text-sm text-rune-parchment/40 transition-colors hover:border-rune-crimson/50 hover:bg-rune-crimson/10 hover:text-rune-crimson"
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
