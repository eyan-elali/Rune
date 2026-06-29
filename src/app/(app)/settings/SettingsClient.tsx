"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, Feather } from "lucide-react";
import { AvatarGlyph } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  updateProfile,
  updatePreferences,
  exportUserData,
  deleteAccount,
} from "@/lib/actions/settings";
import { createPortalSession } from "@/lib/actions/billing";
import { getOfflineStorageSummary, clearPageCache } from "@/lib/offline/db";
import { flushPendingQueue } from "@/lib/offline/syncEngine";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import { UNLOCKABLES, requirementLabel } from "@/lib/unlockables";
import { createClient } from "@/lib/supabase/client";
import { PricingTable } from "@/components/billing/PricingTable";
import type { Profile, UserPreferences } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/subscription";
import { resolveThemeId } from "@/lib/themes";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "account" | "editor" | "appearance" | "billing" | "sync" | "danger";

export interface SettingsClientProps {
  profile: Profile | null;
  email: string;
  unlockedIds: Set<string>;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-widest"
      style={{ color: "var(--color-mist)" }}
    >
      {children}
    </h2>
  );
}

function SettingRow({
  label,
  description,
  last,
  children,
}: {
  label: string;
  description?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-8 py-4"
      style={{ borderBottom: last ? "none" : "1px solid var(--color-border)" }}
    >
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-mist)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
      style={{
        background: checked
          ? "var(--color-gold)"
          : "rgba(201, 168, 76, 0.12)",
        border: `1px solid ${checked ? "var(--color-gold)" : "var(--color-border-strong)"}`,
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full transition-transform duration-200"
        style={{
          background: checked ? "var(--color-ink)" : "var(--color-mist)",
          transform: checked ? "translateX(24px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

function SegmentGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="flex overflow-hidden rounded"
      role="group"
      aria-label={label}
      style={{ border: "1px solid var(--color-border-strong)" }}
    >
      {options.map((opt, i) => (
        <button
          key={String(opt.value)}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rune-gold"
          style={{
            background:
              value === opt.value ? "var(--color-gold)" : "transparent",
            color:
              value === opt.value ? "var(--text-on-accent)" : "var(--color-mist)",
            borderLeft:
              i > 0 ? "1px solid var(--color-border-strong)" : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SavedBadge({ show }: { show: boolean }) {
  return (
    <span
      className="text-xs transition-opacity duration-300"
      style={{ color: "var(--color-sage)", opacity: show ? 1 : 0 }}
      aria-live="polite"
    >
      Saved
    </span>
  );
}

function Card({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="rounded-lg p-6"
      style={{
        background: danger ? "rgba(139, 46, 46, 0.08)" : "var(--surface-card)",
        border: `1px solid ${danger ? "rgba(139, 46, 46, 0.3)" : "var(--color-border)"}`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Account Tab ──────────────────────────────────────────────────────────────

function FeaturesCard() {
  const storeProfile = useProfileStore((s) => s.profile);
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const prefs = (storeProfile?.preferences ?? {}) as Partial<UserPreferences>;
  const hideArena = prefs.hideArena === true;

  async function handleToggle(value: boolean) {
    setPreferences({ hideArena: value });
    await updatePreferences({ hideArena: value });
  }

  return (
    <Card>
      <SectionTitle>Features</SectionTitle>
      <SettingRow
        label="Show Arena"
        description="Display the Arena in the sidebar and dashboard. Disable to hide game mode from the app."
        last
      >
        <Toggle
          checked={!hideArena}
          onChange={(v) => handleToggle(!v)}
          label="Show Arena"
        />
      </SettingRow>
    </Card>
  );
}

function AccountTab({
  profile,
  email,
}: {
  profile: Profile | null;
  email: string;
}) {
  const setProfile = useProfileStore((s) => s.setProfile);
  const storeProfile = useProfileStore((s) => s.profile);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "saving" | "sent" | "error"
  >("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSaveProfile() {
    setUsernameError(null);
    setProfileSaving(true);
    const { error } = await updateProfile({
      display_name: displayName.trim() || undefined,
      username: username.trim() || undefined,
    });
    setProfileSaving(false);
    if (error) {
      setUsernameError(error);
      return;
    }
    if (storeProfile) {
      setProfile({
        ...storeProfile,
        display_name: displayName.trim() || storeProfile.display_name,
        username: username.trim() || storeProfile.username,
      });
    }
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  async function handleEmailChange() {
    if (!newEmail.trim()) return;
    setEmailStatus("saving");
    setEmailError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      setEmailError(error.message);
      setEmailStatus("error");
    } else {
      setEmailStatus("sent");
    }
  }

  async function handlePasswordChange() {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    setPasswordStatus("saving");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (authError) {
      setPasswordError("Current password is incorrect");
      setPasswordStatus("error");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordStatus("error");
      return;
    }
    setPasswordStatus("saved");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      setPasswordStatus("idle");
      setShowPasswordForm(false);
    }, 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <FeaturesCard />
      <Card>
        <SectionTitle>Identity</SectionTitle>
        <div className="mt-5 flex flex-col gap-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
          />
          <Input
            label="Username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(null);
            }}
            placeholder="@username"
            error={usernameError ?? undefined}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} loading={profileSaving}>
              Save changes
            </Button>
            <SavedBadge show={profileSaved} />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Email</SectionTitle>
        <SettingRow label="Email address" description={email} last>
          {!showEmailForm && emailStatus !== "sent" ? (
            <button
              type="button"
              className="text-xs hover:underline"
              style={{ color: "var(--color-gold)" }}
              onClick={() => setShowEmailForm(true)}
            >
              Change
            </button>
          ) : null}
        </SettingRow>

        {showEmailForm && emailStatus !== "sent" && (
          <div className="mt-3 flex flex-col gap-3">
            <Input
              label="New email address"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              error={emailError ?? undefined}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleEmailChange}
                loading={emailStatus === "saving"}
              >
                Send confirmation
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowEmailForm(false);
                  setNewEmail("");
                  setEmailError(null);
                  setEmailStatus("idle");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {emailStatus === "sent" && (
          <p className="mt-3 text-xs" style={{ color: "var(--color-sage)" }}>
            Confirmation sent — check your inbox to complete the change.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>Password</SectionTitle>
        {!showPasswordForm ? (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm hover:underline"
              style={{ color: "var(--color-gold)" }}
              onClick={() => setShowPasswordForm(true)}
            >
              Change password
            </button>
          </div>
        ) : passwordStatus === "saved" ? (
          <p className="mt-3 text-sm" style={{ color: "var(--color-sage)" }}>
            Password updated successfully.
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={passwordError ?? undefined}
            />
            <div className="flex gap-2">
              <Button
                onClick={handlePasswordChange}
                loading={passwordStatus === "saving"}
              >
                Update password
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordError(null);
                  setPasswordStatus("idle");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Editor Tab ───────────────────────────────────────────────────────────────

function EditorTab() {
  const storeProfile = useProfileStore((s) => s.profile);
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const prefs = (storeProfile?.preferences ?? {}) as Partial<UserPreferences>;

  const fontSize = prefs.fontSize ?? 18;
  const lineHeight = prefs.lineHeight ?? 1.9;
  const wideEditor = prefs.wideEditor ?? false;

  const [localFontSize, setLocalFontSize] = useState(fontSize);
  const fontSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    setLocalFontSize(prefs.fontSize ?? 18);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.fontSize]);

  async function savePref(updates: Partial<UserPreferences>) {
    setPreferences(updates);
    await updatePreferences(updates);
  }

  function handleFontSizeChange(val: number) {
    setLocalFontSize(val);
    clearTimeout(fontSaveTimer.current);
    fontSaveTimer.current = setTimeout(() => savePref({ fontSize: val }), 500);
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Feather size={20} className="text-[var(--color-gold)]" aria-hidden />
        <SectionTitle>Editor preferences</SectionTitle>
      </div>
      <div className="mt-1">
        <SettingRow label="Font size" description={`${localFontSize}px`}>
          <div className="flex items-center gap-3">
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--color-mist)" }}
            >
              16
            </span>
            <input
              type="range"
              min={16}
              max={22}
              step={1}
              value={localFontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="w-28"
              style={{ accentColor: "var(--color-gold)" }}
              aria-label="Font size"
            />
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--color-mist)" }}
            >
              22
            </span>
          </div>
        </SettingRow>

        <SettingRow label="Line height">
          <SegmentGroup
            label="Line height"
            value={lineHeight}
            onChange={(v) => savePref({ lineHeight: v })}
            options={[
              { label: "Compact", value: 1.7 },
              { label: "Relaxed", value: 1.9 },
              { label: "Spacious", value: 2.2 },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Wide line width"
          description="Expand the writing column for broader screens"
          last
        >
          <Toggle
            checked={wideEditor}
            onChange={(v) => savePref({ wideEditor: v })}
            label="Wide line width"
          />
        </SettingRow>
      </div>
    </Card>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────

function AppearanceTab({ unlockedIds }: { unlockedIds: Set<string> }) {
  const storeProfile = useProfileStore((s) => s.profile);
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const prefs = (storeProfile?.preferences ?? {}) as Partial<UserPreferences>;

  const activeTheme = resolveThemeId(prefs.activeTheme);
  const activeAvatar = prefs.activeAvatar ?? "quill";
  const activeFont = prefs.activeFont ?? "font-classical";

  const themes = UNLOCKABLES.filter((u) => u.type === "theme");
  const avatars = UNLOCKABLES.filter((u) => u.type === "avatar");
  const fonts = UNLOCKABLES.filter((u) => u.type === "font");

  function isItemUnlocked(id: string) {
    const item = UNLOCKABLES.find((u) => u.id === id);
    return item?.requirement === null || unlockedIds.has(id);
  }

  async function selectTheme(id: string) {
    if (!isItemUnlocked(id)) return;
    setPreferences({ activeTheme: id });
    await updatePreferences({ activeTheme: id });
  }

  async function selectAvatar(id: string) {
    if (!isItemUnlocked(id)) return;
    setPreferences({ activeAvatar: id });
    await updatePreferences({ activeAvatar: id });
  }

  async function selectFont(id: string) {
    if (!isItemUnlocked(id)) return;
    setPreferences({ activeFont: id });
    await updatePreferences({ activeFont: id });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle>Theme</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {themes.map((theme) => {
            const unlocked = isItemUnlocked(theme.id);
            const active = activeTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                disabled={!unlocked}
                onClick={() => selectTheme(theme.id)}
                className="relative flex flex-col items-start rounded-lg p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
                style={{
                  background: active
                    ? "rgba(184, 146, 42, 0.1)"
                    : "var(--bg-secondary)",
                  border: `1px solid ${active ? "var(--color-gold)" : "var(--color-border)"}`,
                  opacity: unlocked ? 1 : 0.45,
                  cursor: unlocked ? "pointer" : "not-allowed",
                }}
                aria-pressed={active}
                aria-label={`${theme.name}${!unlocked ? " — locked" : ""}`}
              >
                {!unlocked && (
                  <Lock
                    size={12}
                    className="absolute right-3 top-3"
                    style={{ color: "var(--color-mist)" }}
                    aria-hidden
                  />
                )}
                {active ? (
                  <span
                    className="absolute right-3 top-3 text-xs"
                    style={{ color: "var(--color-gold)" }}
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : theme.id === "parchment" ? (
                  <span
                    className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest"
                    style={{
                      background: "rgba(184, 146, 42, 0.1)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-mist)",
                    }}
                    aria-hidden
                  >
                    Default
                  </span>
                ) : null}
                <p
                  className="font-rune-serif text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {theme.name}
                </p>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: "var(--color-mist)" }}
                >
                  {unlocked
                    ? theme.description
                    : requirementLabel(theme.requirement)}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Font Pack</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {fonts.map((font) => {
            const unlocked = isItemUnlocked(font.id);
            const active = activeFont === font.id;
            return (
              <button
                key={font.id}
                type="button"
                disabled={!unlocked}
                onClick={() => selectFont(font.id)}
                className="relative flex flex-col items-start rounded-lg p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
                style={{
                  background: active
                    ? "rgba(184, 146, 42, 0.1)"
                    : "var(--bg-secondary)",
                  border: `1px solid ${active ? "var(--color-gold)" : "var(--color-border)"}`,
                  opacity: unlocked ? 1 : 0.45,
                  cursor: unlocked ? "pointer" : "not-allowed",
                }}
                aria-pressed={active}
                aria-label={`${font.name}${!unlocked ? " — locked" : ""}`}
              >
                {!unlocked && (
                  <Lock
                    size={12}
                    className="absolute right-3 top-3"
                    style={{ color: "var(--color-mist)" }}
                    aria-hidden
                  />
                )}
                {active && (
                  <span
                    className="absolute right-3 top-3 text-xs"
                    style={{ color: "var(--color-gold)" }}
                    aria-hidden
                  >
                    ✓
                  </span>
                )}
                <p
                  className="font-rune-serif text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {font.name}
                </p>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: "var(--color-mist)" }}
                >
                  {unlocked
                    ? font.description
                    : requirementLabel(font.requirement)}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Avatar</SectionTitle>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {avatars.map((avatar) => {
            const unlocked = isItemUnlocked(avatar.id);
            const active = activeAvatar === avatar.id;
            return (
              <button
                key={avatar.id}
                type="button"
                disabled={!unlocked}
                onClick={() => selectAvatar(avatar.id)}
                className="relative flex flex-col items-center gap-2 rounded-lg p-3 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
                style={{
                  background: active
                    ? "rgba(184, 146, 42, 0.1)"
                    : "var(--bg-secondary)",
                  border: `1px solid ${active ? "var(--color-gold)" : "var(--color-border)"}`,
                  opacity: unlocked ? 1 : 0.4,
                  cursor: unlocked ? "pointer" : "not-allowed",
                  filter: unlocked ? "none" : "grayscale(1)",
                }}
                aria-pressed={active}
                aria-label={`${avatar.name}${!unlocked ? " — locked" : ""}`}
              >
                {!unlocked && (
                  <Lock
                    size={10}
                    className="absolute right-2 top-2"
                    style={{ color: "var(--color-mist)" }}
                    aria-hidden
                  />
                )}
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full font-rune-serif text-lg"
                  style={{
                    background: unlocked
                      ? "rgba(201, 168, 76, 0.12)"
                      : "rgba(107, 101, 96, 0.12)",
                    border: `1px solid ${unlocked ? "rgba(201, 168, 76, 0.25)" : "rgba(107, 101, 96, 0.25)"}`,
                    color: unlocked
                      ? "var(--color-gold)"
                      : "var(--color-mist)",
                  }}
                  aria-hidden
                >
                  <AvatarGlyph id={avatar.id} />
                </div>
                <p
                  className="text-center text-[10px] leading-tight"
                  style={{
                    color: unlocked
                      ? "var(--text-primary)"
                      : "var(--color-mist)",
                  }}
                >
                  {avatar.name}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Link
        href="/profile/unlockables"
        className="flex items-center justify-between rounded-lg p-4 transition-colors duration-150 hover:opacity-80"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Unlockables gallery
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-mist)" }}>
            View all themes, fonts, and avatars you can earn
          </p>
        </div>
        <span style={{ color: "var(--color-gold)" }} aria-hidden>
          →
        </span>
      </Link>
    </div>
  );
}

// ─── Sync Tab ─────────────────────────────────────────────────────────────────

function SyncTab() {
  const showToast = useToastStore((s) => s.showToast);
  const [summary, setSummary] = useState<{
    pending: number;
    conflicts: number;
    cached: number;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function loadSummary() {
    const s = await getOfflineStorageSummary();
    setSummary(s);
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const result = await flushPendingQueue();
      await loadSummary();
      const parts: string[] = [];
      if (result.synced > 0)
        parts.push(`${result.synced} synced`);
      if (result.conflicts > 0)
        parts.push(`${result.conflicts} conflict${result.conflicts !== 1 ? "s" : ""}`);
      if (result.failed > 0)
        parts.push(`${result.failed} failed`);
      const message = parts.length > 0 ? parts.join(", ") : "Nothing to sync";
      const type =
        result.failed > 0 || result.conflicts > 0 ? "error" : "success";
      showToast(message, type);
    } catch {
      showToast("Sync failed. Try again.", "error");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleClearCache() {
    setIsClearing(true);
    try {
      const cleared = await clearPageCache();
      await loadSummary();
      setConfirmClear(false);
      showToast(
        cleared > 0
          ? `Cleared ${cleared} cached page${cleared !== 1 ? "s" : ""}.`
          : "No cached pages to clear.",
        "success"
      );
    } catch {
      showToast("Could not clear cache.", "error");
    } finally {
      setIsClearing(false);
    }
  }

  const hasConflicts = (summary?.conflicts ?? 0) > 0;

  const stats = [
    {
      label: "Pending syncs",
      value: summary?.pending ?? "—",
      danger: false,
    },
    {
      label: "Conflicts",
      value: summary?.conflicts ?? "—",
      danger: hasConflicts,
    },
    {
      label: "Cached pages",
      value: summary?.cached ?? "—",
      danger: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle>Offline storage</SectionTitle>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {stats.map(({ label, value, danger }) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center rounded-lg py-5"
              style={{
                background: "var(--bg-secondary)",
                border: `1px solid ${danger ? "rgba(139,46,46,0.35)" : "var(--color-border)"}`,
              }}
            >
              <span
                className="font-rune-serif text-3xl tabular-nums"
                style={{
                  color: danger ? "var(--color-crimson)" : "var(--color-gold)",
                }}
              >
                {value}
              </span>
              <span
                className="mt-1.5 text-center text-xs leading-snug"
                style={{ color: "var(--color-mist)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {hasConflicts && (
        <div
          className="rounded-lg px-4 py-3 text-sm leading-relaxed"
          role="status"
          style={{
            background: "rgba(139,46,46,0.07)",
            border: "1px solid rgba(139,46,46,0.25)",
            color: "var(--color-mist)",
          }}
        >
          <span
            className="font-rune-serif font-semibold"
            style={{ color: "var(--color-crimson)" }}
          >
            Some pages need review.
          </span>{" "}
          Open the conflicted page to choose which version to keep.
        </div>
      )}

      <Card>
        <SectionTitle>Actions</SectionTitle>
        <div className="mt-4 flex flex-col gap-0">
          <SettingRow
            label="Sync now"
            description="Upload all pending local writes to the server"
          >
            <Button
              variant="ghost"
              onClick={handleSyncNow}
              loading={isSyncing}
            >
              Sync now
            </Button>
          </SettingRow>

          <SettingRow label="Clear cached pages" description="Frees space — only removes read-only cache, never pending or conflicted writes" last>
            {!confirmClear ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmClear(true)}
              >
                Clear cache
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  onClick={handleClearCache}
                  loading={isClearing}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </SettingRow>
        </div>
      </Card>
    </div>
  );
}

// ─── Danger Zone Tab ──────────────────────────────────────────────────────────

function DangerTab() {
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const canDelete = deleteConfirm === "DELETE";

  async function handleExport() {
    setIsExporting(true);
    try {
      const { data, error } = await exportUserData();
      if (error || !data) return;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rune-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (!canDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccount();
    if (error) {
      setDeleteError(error);
      setIsDeleting(false);
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Export all my data
        </p>
        <p
          className="mb-4 mt-1 text-xs"
          style={{ color: "var(--color-mist)" }}
        >
          Download a JSON file of all your projects, chapters, and pages.
        </p>
        <Button variant="ghost" onClick={handleExport} loading={isExporting}>
          Export data
        </Button>
      </Card>

      <Card danger>
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-crimson)" }}
        >
          Delete account
        </p>
        <p
          className="mb-5 mt-1 text-xs"
          style={{ color: "var(--color-mist)" }}
        >
          Permanently deletes your account and all associated data. This cannot
          be undone.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="delete-confirm"
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              className="w-40 rounded border px-3 py-2 text-sm outline-none transition-colors duration-150"
              style={{
                background: "rgba(26, 22, 20, 0.8)",
                color: "var(--color-parchment)",
                borderColor: canDelete
                  ? "var(--color-crimson)"
                  : "var(--color-border)",
              }}
            />
          </div>
          {deleteError && (
            <p className="text-xs" style={{ color: "var(--color-crimson)" }}>
              {deleteError}
            </p>
          )}
          <div>
            <Button
              variant="danger"
              disabled={!canDelete}
              loading={isDeleting}
              onClick={handleDeleteAccount}
            >
              Delete account permanently
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab({ subscriptionTier, profile }: { subscriptionTier: SubscriptionTier; profile: Profile | null }) {
  const [isPending, startTransition] = useTransition();

  const tierLabels: Record<SubscriptionTier, string> = {
    free: "Free",
    scribe: "Scribe",
  };

  const statusColors: Record<string, string> = {
    active: "var(--color-sage)",
    past_due: "var(--color-crimson)",
    canceled: "var(--color-mist)",
    inactive: "var(--color-mist)",
  };

  const status = profile?.subscription_status ?? "inactive";
  const periodEnd = profile?.subscription_period_end
    ? new Date(profile.subscription_period_end).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  function handleManageSubscription() {
    startTransition(async () => {
      const { url, error } = await createPortalSession();
      if (url && !error) window.location.href = url;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Current plan card */}
      <Card>
        <SectionTitle>Current plan</SectionTitle>

        {status === "past_due" && (
          <div
            className="mt-4 rounded-lg px-4 py-3 text-sm"
            role="alert"
            style={{
              background: "rgba(139,46,46,0.1)",
              border: "1px solid rgba(139,46,46,0.3)",
              color: "var(--color-crimson)",
            }}
          >
            Your last payment failed. Update your payment method to keep access.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="font-rune-serif text-2xl" style={{ color: "var(--color-gold)" }}>
              {tierLabels[subscriptionTier]}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: statusColors[status] ?? "var(--color-mist)" }}
                aria-hidden
              />
              <p className="text-xs capitalize" style={{ color: statusColors[status] ?? "var(--color-mist)" }}>
                {status}
              </p>
            </div>
            {periodEnd && subscriptionTier !== "free" && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                Next billing date: {periodEnd}
              </p>
            )}
          </div>

          {subscriptionTier !== "free" && (
            <Button
              variant="ghost"
              onClick={handleManageSubscription}
              loading={isPending}
            >
              Manage Subscription
            </Button>
          )}
        </div>
      </Card>

      {/* Pricing table */}
      <div>
        <p className="mb-6 text-xs uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
          Plans
        </p>
        <PricingTable currentTier={subscriptionTier} isLoggedIn={true} />
      </div>
    </div>
  );
}

// ─── Settings page shell ──────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "editor", label: "Editor" },
  { id: "appearance", label: "Appearance" },
  { id: "billing", label: "Billing" },
  { id: "sync", label: "Sync" },
  { id: "danger", label: "Danger Zone" },
];

export function SettingsClient({
  profile,
  email,
  unlockedIds,
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const showToast = useToastStore((s) => s.showToast);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);

  const initialTab: Tab = searchParams.get("tab") === "billing" ? "billing" : "account";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const setProfile = useProfileStore((s) => s.setProfile);

  useEffect(() => {
    if (profile) setProfile(profile);
  }, [profile, setProfile]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "true") {
      const tierLabels: Record<SubscriptionTier, string> = { free: "Free", scribe: "Scribe" };
      showToast(`Welcome to ${tierLabels[subscriptionTier]}! Your plan is now active.`, "success");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("upgraded");
      router.replace(`${pathname}?${params.toString()}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "mx-auto px-8 py-12",
        activeTab === "billing" ? "max-w-6xl" : "max-w-2xl"
      )}
    >
      <h1
        className="!mb-8 font-rune-serif text-4xl"
        style={{ color: "var(--text-primary)" }}
      >
        Settings
      </h1>

      {/* Tab bar */}
      <div
        className="mb-8 flex gap-1 rounded-lg p-1"
        role="tablist"
        aria-label="Settings sections"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded px-3 py-2 text-sm transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
            )}
            style={{
              background:
                activeTab === tab.id ? "var(--color-gold)" : "transparent",
              color:
                tab.id === "danger"
                  ? activeTab === tab.id
                    ? "var(--color-crimson)"
                    : "rgba(139, 46, 46, 0.5)"
                  : activeTab === tab.id
                  ? "var(--text-on-accent)"
                  : "var(--color-mist)",
              fontWeight: activeTab === tab.id ? 500 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div
        id="panel-account"
        role="tabpanel"
        aria-labelledby="tab-account"
        hidden={activeTab !== "account"}
      >
        <AccountTab profile={profile} email={email} />
      </div>
      <div
        id="panel-editor"
        role="tabpanel"
        aria-labelledby="tab-editor"
        hidden={activeTab !== "editor"}
      >
        <EditorTab />
      </div>
      <div
        id="panel-appearance"
        role="tabpanel"
        aria-labelledby="tab-appearance"
        hidden={activeTab !== "appearance"}
      >
        <AppearanceTab unlockedIds={unlockedIds} />
      </div>
      <div
        id="panel-billing"
        role="tabpanel"
        aria-labelledby="tab-billing"
        hidden={activeTab !== "billing"}
      >
        <BillingTab subscriptionTier={subscriptionTier} profile={profile} />
      </div>
      <div
        id="panel-sync"
        role="tabpanel"
        aria-labelledby="tab-sync"
        hidden={activeTab !== "sync"}
      >
        <SyncTab />
      </div>
      <div
        id="panel-danger"
        role="tabpanel"
        aria-labelledby="tab-danger"
        hidden={activeTab !== "danger"}
      >
        <DangerTab />
      </div>
    </div>
  );
}
