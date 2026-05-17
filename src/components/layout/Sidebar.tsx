"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  User,
  Settings,
  LogOut,
  Swords,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfileStore } from "@/store/profileStore";
import { useModeStore } from "@/store/modeStore";
import { useUIStore } from "@/store/uiStore";
import { useToastStore } from "@/store/toastStore";
import type { UserPreferences } from "@/lib/types";
import { xpProgressInCurrentLevel } from "@/lib/xp";
import { cn } from "@/lib/utils";

const AVATAR_SIGIL: Record<string, string> = {
  quill: "✒",
  "skull-roses": "☠",
  "crescent-moon": "☽",
  ouroboros: "∞",
  hourglass: "⌛",
};

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
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-r-md border-l-2 py-2.5 text-sm transition-colors duration-150",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "border-rune-gold bg-rune-gold/10 text-rune-gold"
          : "border-transparent hover:bg-rune-gold/5"
      )}
      style={active ? undefined : { color: "var(--text-primary)", opacity: 0.65 }}
    >
      <Icon size={16} aria-hidden="true" />
      {!collapsed && label}
    </Link>
  );
}

function MiniXpBar() {
  const profile = useProfileStore((s) => s.profile);
  const [mounted, setMounted] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !profile) return;
    const { percent } = xpProgressInCurrentLevel(profile.xp);
    const t = setTimeout(() => setDisplayPercent(percent), 60);
    return () => clearTimeout(t);
  }, [mounted, profile]);

  if (!mounted || !profile) return <div className="h-1" />;

  return (
    <div
      className="h-1 w-full overflow-hidden"
      style={{ background: "rgba(201, 168, 76, 0.12)" }}
      role="presentation"
      aria-hidden
    >
      <div
        className="h-full"
        style={{
          width: `${displayPercent}%`,
          background: "linear-gradient(90deg, var(--color-gold-dim), var(--color-gold))",
          transition: "width 0.8s ease-out",
        }}
      />
    </div>
  );
}

export function Sidebar({ displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const mode = useModeStore((s) => s.mode);
  const profile = useProfileStore((s) => s.profile);
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUIStore();
  const showToast = useToastStore((s) => s.showToast);

  const prefs = (profile?.preferences ?? {}) as Partial<UserPreferences>;
  const activeAvatar = prefs.activeAvatar ?? "quill";
  const sigil = AVATAR_SIGIL[activeAvatar] ?? "✒";

  const initial = displayName.trim().charAt(0).toUpperCase() || "W";

  // Restore collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("rune-sidebar-collapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem("rune-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Cmd+B keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyB") {
        e.preventDefault();
        toggleSidebar();
        showToast(sidebarCollapsed ? "Sidebar shown" : "Sidebar hidden", "info");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, sidebarCollapsed, showToast]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside
      className="flex h-full w-full min-h-0 flex-col overflow-hidden"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Wordmark + collapse toggle */}
      <div className="flex flex-col">
        <div
          className={cn(
            "flex items-center py-5",
            sidebarCollapsed ? "justify-center px-0" : "justify-between px-6"
          )}
        >
          {!sidebarCollapsed && (
            <span
              className="font-rune-serif text-2xl text-rune-gold"
              style={{ letterSpacing: "0.25em" }}
            >
              Rune
            </span>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-rune-gold/10"
            title={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={14} style={{ color: "var(--color-mist)" }} />
            ) : (
              <ChevronLeft size={14} style={{ color: "var(--color-mist)" }} />
            )}
          </button>
        </div>
        <div
          className="mx-auto h-px w-[92%] shrink-0"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />
      </div>

      {/* User identity */}
      <div className="flex flex-col">
        <div
          className={cn(
            "flex items-center py-4",
            sidebarCollapsed ? "justify-center px-0" : "gap-3 px-5"
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              title={sidebarCollapsed ? displayName : undefined}
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
              style={{
                background: "rgba(201, 168, 76, 0.12)",
                border: "1px solid rgba(201, 168, 76, 0.25)",
                color: "var(--color-gold)",
              }}
              aria-label={`Avatar: ${activeAvatar}`}
              title={sidebarCollapsed ? displayName : undefined}
            >
              {sigil}
            </div>
          )}
          {!sidebarCollapsed && (
            <span
              className="truncate text-sm"
              style={{ color: "var(--text-primary)", opacity: 0.8 }}
            >
              {displayName}
            </span>
          )}
        </div>
        <MiniXpBar />
      </div>

      {/* Primary navigation */}
      <nav
        className={cn("flex-1 py-3", sidebarCollapsed ? "px-0" : "px-2")}
        aria-label="Main navigation"
      >
        <ul className="flex flex-col gap-0.5" role="list">
          {NAV_LINKS.map(({ href, label, icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                label={label}
                icon={icon}
                collapsed={sidebarCollapsed}
                active={
                  pathname === href || pathname.startsWith(`${href}/`)
                }
              />
            </li>
          ))}
          {mode === "game" && (
            <li>
              <NavLink
                href="/games"
                label="Arena"
                icon={Swords}
                collapsed={sidebarCollapsed}
                active={pathname === "/games" || pathname.startsWith("/games/")}
              />
            </li>
          )}
        </ul>
      </nav>

      {/* Bottom: settings + sign out */}
      <div className="flex flex-col">
        <div
          className="mx-auto h-px w-[92%] shrink-0"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />
        <div className={cn("pb-4 pt-3", sidebarCollapsed ? "px-0" : "px-2")}>
          <NavLink
            href="/settings"
            label="Settings"
            icon={Settings}
            collapsed={sidebarCollapsed}
            active={pathname === "/settings"}
          />
          <button
            type="button"
            onClick={handleSignOut}
            title={sidebarCollapsed ? "Sign out" : undefined}
            className={cn(
              "mt-0.5 flex w-full items-center rounded-r-md border-l-2 border-transparent py-2.5 text-sm transition-colors hover:border-rune-crimson/50 hover:bg-rune-crimson/10 hover:text-rune-crimson",
              sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
            )}
            style={{ color: "var(--text-primary)", opacity: 0.45 }}
          >
            <LogOut size={16} aria-hidden="true" />
            {!sidebarCollapsed && "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
