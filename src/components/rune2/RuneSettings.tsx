"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount, exportUserData } from "@/lib/actions/settings";
import { updatePenName } from "@/lib/actions/profile";
import {
  clearSceneCache,
  discardRetiredDraft,
  getOfflineStorageSummary,
  getRetiredDraftText,
  getRetiredDrafts,
  type RetiredDraft,
} from "@/lib/offline/db";
import { flushPendingQueue } from "@/lib/offline/syncEngine";
import { PEN_NAME_MAX_LENGTH } from "@/lib/penName";
import type { Account } from "@/lib/rune2/account";
import {
  countUnsentWorkspaceWork,
  discardStrandedDraft,
  getStrandedDraftText,
  listStrandedDrafts,
  type StrandedDraft,
  type UnsentWorkspaceWork,
} from "@/lib/rune2/workspaceDrafts";
import { useProfileStore } from "@/store/profileStore";
import { FeedbackDialog } from "./Feedback";
import { ACCENTS, APPEARANCES, WRITING_SURFACES, type RunePreferences } from "@/lib/rune2/preferences";
import { resolveTheme, surfaceColours } from "@/lib/rune2/themes";
import { AppBar, useLogOut } from "./AccountMenu";
import { ICON } from "./icons";
import { useResolvedTheme, useRuneAccount, useRunePreferences, useRuneRootProps, useSystemDark } from "./RunePreferences";
import { Tooltip } from "./Tooltip";
import { EDITOR_FONTS } from "./useEditorFont";
import { SUPPORT_EMAIL } from "@/lib/brand";

// Settings (Beta Completion A; grouped and given Appearance in C). Short
// sections, each saying whose it is, each a quiet grouped surface:
//   Writing      account-wide preferences (lib/rune2/preferences.ts) — they
//                follow the writer to every Project and device
//   Appearance   the theme around the writing, and the writing surface
//                (the manuscript's own page) — account-wide too
//   Projects     where a Project's own settings are, and Project Trash
//   This device  the writing kept in this browser until the server has it
//   Account      pen name, email, a copy of the writing, log out — and,
//                set apart from everything else, deleting the account
// Everything else belongs where it is used (a Scene's properties, a View's
// configuration, a Canvas's arrangement, the manuscript's structure) and is
// not repeated here. Each change says it was saved only after the server
// confirms it; a failure puts the control back and says so.

type Status = { text: string; tone?: "danger" | "success" } | null;

export function RuneSettings({
  account,
  trashedCount,
  profileError,
  returnTo = null,
}: {
  account: Account;
  trashedCount: number;
  profileError: string | null;
  /** The Project Settings was opened from, to go back to. */
  returnTo?: { id: string; title: string } | null;
}) {
  const rootProps = useRuneRootProps();
  return (
    <div className="r2 r2-settings" {...rootProps}>
      <AppBar account={account} />
      <main className="r2-settings-main">
        <Link href={returnTo ? `/projects/${returnTo.id}` : "/projects"} className="r2-home-back">
          <ArrowLeft {...ICON} aria-hidden />
          <span className="r2-home-back-label">{returnTo ? returnTo.title : "Projects"}</span>
        </Link>
        <div className="r2-settings-head">
          <h1>Settings</h1>
        </div>
        <SettingsSections account={account} trashedCount={trashedCount} profileError={profileError} />
      </main>
    </div>
  );
}

/**
 * Settings inside a Project (BC-C closeout): the same sections, in a Center
 * Peek over the Project — the Reading Peek's surface and scrim — so the
 * writer's tabs, selection, editors and scroll stay exactly as they were
 * beneath, and closing it (Escape, the scrim, ×) returns them there. Focus
 * goes back to what opened it.
 */
export function SettingsPeek({ onClose }: { onClose: () => void }) {
  const account = useRuneAccount();
  const [trashedCount, setTrashedCount] = useState<number | null>(null);
  const [returnFocus] = useState(() => (typeof document !== "undefined" ? document.activeElement : null));
  const close = useCallback(() => {
    onClose();
    // Back to what opened it — the account control, when the menu that held
    // "Settings" had already gone by the time the peek arrived.
    const el =
      returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus !== document.body
        ? returnFocus
        : document.querySelector<HTMLElement>(".r2-account--nav");
    if (el) requestAnimationFrame(() => el.focus());
  }, [onClose, returnFocus]);

  // The count Settings' Projects section mentions, read under the writer's own access.
  useEffect(() => {
    let live = true;
    void createClient()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .not("trashed_at", "is", null)
      .then(({ count }) => {
        if (live) setTrashedCount(count ?? 0);
      });
    return () => {
      live = false;
    };
  }, []);

  // Escape closes — unless something inside handled it (a dialog, a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".r2-dialog-backdrop")) return;
      e.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="r2-peek" role="dialog" aria-modal="true" aria-labelledby="r2-settings-peek-title">
      <div className="r2-reader-scrim" aria-hidden onMouseDown={close} />
      <div className="r2-peek-surface r2-settings-peek">
        <header className="r2-peek-bar">
          <h2 id="r2-settings-peek-title">Settings</h2>
          <Tooltip label="Close">
            <button type="button" className="r2-icon-button" aria-label="Close Settings" autoFocus onClick={close}>
              <X {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </header>
        <div className="r2-peek-body">
          <div className="r2-settings-main r2-settings-main--peek">
            {account ? (
              <SettingsSections account={account} trashedCount={trashedCount} profileError={null} />
            ) : (
              <p className="r2-settings-scope">Settings aren’t available here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every section of Settings — the one implementation, on its page and in the Project's peek. */
export function SettingsSections({
  account,
  trashedCount,
  profileError,
}: {
  account: Account;
  /** Projects in Trash, or null while not yet known. */
  trashedCount: number | null;
  profileError: string | null;
}) {
  const prefs = useRunePreferences();
  const [status, setStatus] = useState<Partial<Record<keyof RunePreferences, Status>>>({});

  async function change<K extends keyof RunePreferences>(key: K, value: RunePreferences[K]) {
    setStatus((s) => ({ ...s, [key]: { text: "Saving…" } }));
    const error = await prefs.update({ [key]: value } as Partial<RunePreferences>);
    setStatus((s) => ({ ...s, [key]: error ? { text: error, tone: "danger" } : { text: "Saved.", tone: "success" } }));
  }

  return (
    <>
        <section className="r2-settings-section" aria-labelledby="settings-writing">
          <h2 id="settings-writing">Writing</h2>
          <p className="r2-settings-scope">For all your projects, on every device.</p>
          <div className="r2-settings-rows">
            <Row
              label="Manuscript type"
              help="How your manuscript reads while you write and in Reading Mode. The rest of Sutura is unchanged."
              status={status.editorFont}
            >
              <div className="r2-segmented" role="group" aria-label="Manuscript type">
                {EDITOR_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={prefs.editorFont === f.id}
                    onClick={() => void change("editorFont", f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Check spelling" help="Your browser underlines words it doesn’t recognise as you write." status={status.spellcheck}>
              <button
                type="button"
                role="switch"
                className="r2-switch"
                aria-checked={prefs.spellcheck}
                aria-label="Check spelling"
                onClick={() => void change("spellcheck", !prefs.spellcheck)}
              />
            </Row>
          </div>
        </section>

        <section className="r2-settings-section" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance">Appearance</h2>
          <p className="r2-settings-scope">For all your projects, on every device.</p>
          <div className="r2-settings-rows">
            <Row
              label="Theme"
              help={<ThemeHelp />}
              status={status.appearance}
            >
              <div className="r2-segmented" role="group" aria-label="Theme">
                {APPEARANCES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={prefs.appearance === a.id}
                    onClick={() => void change("appearance", a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              label="Accent colour"
              help={`${ACCENTS.find((a) => a.id === prefs.accent)?.label ?? "Sutura Blue"} — for selection, focus and the active tab. Never your prose or your page.`}
              status={status.accent}
              labelId="settings-accent-label"
            >
              <AccentPicker value={prefs.accent} onChange={(id) => void change("accent", id)} />
            </Row>
            <div className="r2-settings-row r2-settings-row--stacked">
              <div className="r2-settings-row-text">
                <div className="r2-settings-row-label" id="settings-surface-label">
                  Writing surface
                </div>
                <p className="r2-settings-row-help">
                  The page your manuscript is written and read on. Default follows the theme; the others stay the same in
                  every theme.
                </p>
              </div>
              <SurfacePicker value={prefs.writingSurface} onChange={(id) => void change("writingSurface", id)} />
              <p className="r2-settings-status" role="status" data-tone={status.writingSurface?.tone}>
                {status.writingSurface?.text ?? ""}
              </p>
            </div>
          </div>
        </section>

        <section className="r2-settings-section" aria-labelledby="settings-projects">
          <h2 id="settings-projects">Projects</h2>
          <p className="r2-settings-scope">
            A project’s own settings — its title, export, backup, moving it to Trash — are in its menu: open the project
            and choose its title.
          </p>
          <div className="r2-settings-rows">
            <Row
              label="Trash"
              help={
                trashedCount !== null && trashedCount > 0
                  ? `${trashedCount.toLocaleString()} ${trashedCount === 1 ? "project" : "projects"} in Trash, kept whole until you restore or delete them.`
                  : "Projects you move to Trash are kept whole until you restore or delete them."
              }
            >
              <Link href="/projects/trash" className="r2-button r2-button--sm">
                Open Trash
              </Link>
            </Row>
          </div>
        </section>

        <DeviceSection />

        <AccountSection account={account} profileError={profileError} />

        <AboutSection />
    </>
  );
}

/**
 * About (Beta Completion E): that Rune is in closed beta, what that means,
 * and the ways to reach us — feedback, support, and the legal pages.
 */
function AboutSection() {
  const [feedback, setFeedback] = useState(false);
  return (
    <section className="r2-settings-section" aria-labelledby="settings-about">
      <h2 id="settings-about">
        About Sutura <span className="r2-beta-tag">Beta</span>
      </h2>
      <p className="r2-settings-scope">
        Sutura is in closed beta: free, with everything in it open to you. Some things will change as we learn from the
        writers using it — your feedback is how we decide what.
      </p>
      <div className="r2-settings-rows">
        <Row label="Feedback" help="Something confusing, something broken, or an idea.">
          <button type="button" className="r2-button r2-button--sm" onClick={() => setFeedback(true)}>
            Send feedback
          </button>
        </Row>
        <Row label="Support" help="For anything about your account or your writing.">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="r2-settings-row-value">
            {SUPPORT_EMAIL}
          </a>
        </Row>
        <Row label="Privacy and terms">
          <span className="r2-settings-links">
            <Link href="/privacy" className="r2-button r2-button--quiet r2-button--sm">
              Privacy Policy
            </Link>
            <Link href="/terms" className="r2-button r2-button--quiet r2-button--sm">
              Terms
            </Link>
          </span>
        </Row>
      </div>
      {feedback && <FeedbackDialog where={{ surface: "settings", projectId: null }} onClose={() => setFeedback(false)} />}
    </section>
  );
}

function Row({
  label,
  help,
  status,
  children,
  danger,
  labelId,
}: {
  label: string;
  help?: React.ReactNode;
  status?: Status;
  children?: React.ReactNode;
  danger?: boolean;
  /** An id for the label, for a control that names itself by it. */
  labelId?: string;
}) {
  return (
    <div className={`r2-settings-row${danger ? " r2-settings-danger" : ""}`}>
      <div className="r2-settings-row-text">
        <div className="r2-settings-row-label" id={labelId}>
          {label}
        </div>
        {help && <p className="r2-settings-row-help">{help}</p>}
        {status !== undefined && (
          <p className="r2-settings-status" role="status" data-tone={status?.tone}>
            {status?.text ?? ""}
          </p>
        )}
      </div>
      {children && <div className="r2-settings-row-actions">{children}</div>}
    </div>
  );
}

/** Under Theme: what System is doing on this device right now. */
function ThemeHelp() {
  const { appearance } = useRunePreferences();
  const dark = useSystemDark();
  if (appearance !== "system") return "Sutura around your writing: the navigator, panels, menus and views.";
  return `Follows this device’s appearance — ${resolveTheme("system", dark) === "dark" ? "Dark" : "Light"} right now.`;
}

/**
 * The writing surfaces as a row of small pages, each in its own colours with
 * a line of its own ink, the chosen one ringed. A radio group: arrows move
 * between them, as in any set of choices.
 */
function SurfacePicker({ value, onChange }: { value: RunePreferences["writingSurface"]; onChange: (id: RunePreferences["writingSurface"]) => void }) {
  const theme = useResolvedTheme();
  const onKeyDown = radioArrows(WRITING_SURFACES.map((s) => s.id), value, onChange);
  return (
    <div className="r2-surfaces" role="radiogroup" aria-labelledby="settings-surface-label" onKeyDown={onKeyDown}>
      {WRITING_SURFACES.map((s) => {
        const c = surfaceColours(s.id, theme);
        const chosen = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            data-choice={s.id}
            className="r2-surface-option"
            onClick={() => onChange(s.id)}
          >
            <span className="r2-surface-swatch" style={{ background: c["ms-bg"], color: c["ms-ink"] }} aria-hidden>
              <span className="r2-surface-swatch-text">Aa</span>
              <span className="r2-surface-swatch-line" style={{ background: c["ms-faint"] }} />
            </span>
            <span className="r2-surface-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Arrow keys move the choice within a radio group, as in any set of choices. */
function radioArrows<T extends string>(ids: readonly T[], value: T, onChange: (id: T) => void) {
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ids[(ids.indexOf(value) + step + ids.length) % ids.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-choice="${next}"]`)?.focus();
  };
}

/** The accents as small dots in their own colour for the theme showing, the chosen one ringed. */
function AccentPicker({ value, onChange }: { value: RunePreferences["accent"]; onChange: (id: RunePreferences["accent"]) => void }) {
  const theme = useResolvedTheme();
  const onKeyDown = radioArrows(ACCENTS.map((a) => a.id), value, onChange);
  return (
    <div className="r2-accents" role="radiogroup" aria-labelledby="settings-accent-label" onKeyDown={onKeyDown}>
      {ACCENTS.map((a) => {
        const chosen = value === a.id;
        return (
          <Tooltip key={a.id} label={a.label}>
            <button
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={a.label}
              tabIndex={chosen ? 0 : -1}
              data-choice={a.id}
              className="r2-accent-option"
              style={{ background: a.values[theme].accent }}
              onClick={() => onChange(a.id)}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

// ── This device ─────────────────────────────────────────────────────────────
// The offline save queue (IndexedDB): writing waiting to reach the server,
// conflicts to resolve in their scene, unsent drafts whose scene is gone (copy
// or discard — never dropped silently), and the read-only cache.

type Summary = { pending: number; failed: number; failedReason: string | null; conflicts: number; retired: number; cached: number };

const STRANDED_NOUN: Record<StrandedDraft["kind"], string> = { page: "page", entry: "entry", canvas: "canvas" };

function DeviceSection() {
  const userId = useProfileStore((s) => s.profile?.id);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [workspace, setWorkspace] = useState<UnsentWorkspaceWork | null>(null);
  const [drafts, setDrafts] = useState<RetiredDraft[]>([]);
  const [stranded, setStranded] = useState<StrandedDraft[]>([]);
  const [busy, setBusy] = useState<"sync" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  // What this device holds for this writer: the manuscript queue, the
  // Workspace's unsent drafts, and drafts whose object is gone for good.
  const read = useCallback(async () => {
    const [s, w, st] = await Promise.all([
      getOfflineStorageSummary(userId),
      userId ? countUnsentWorkspaceWork(userId) : null,
      userId ? listStrandedDrafts(userId) : [],
    ]);
    const d = s.retired > 0 ? await getRetiredDrafts() : [];
    return { s, w, st, d };
  }, [userId]);

  const load = useCallback(async () => {
    const { s, w, st, d } = await read();
    setSummary(s);
    setWorkspace(w);
    setStranded(st);
    setDrafts(d);
  }, [read]);

  // Read once on arrival (and again after each action).
  useEffect(() => {
    let live = true;
    void read().then(({ s, w, st, d }) => {
      if (!live) return;
      setSummary(s);
      setWorkspace(w);
      setStranded(st);
      setDrafts(d);
    });
    return () => {
      live = false;
    };
  }, [read]);

  async function syncNow() {
    setBusy("sync");
    setStatus(null);
    try {
      const r = await flushPendingQueue({ includeUnsupported: true });
      const parts: string[] = [];
      if (r.synced > 0) parts.push(`${r.synced} saved`);
      if (r.conflicts > 0) parts.push(`${r.conflicts} need${r.conflicts === 1 ? "s" : ""} review`);
      if (r.failed > 0) parts.push(`${r.failed} couldn’t be sent yet`);
      setStatus({
        text: parts.length > 0 ? `${parts.join(", ")}.` : "Nothing was waiting.",
        tone: r.failed > 0 || r.conflicts > 0 ? "danger" : "success",
      });
    } catch {
      setStatus({ text: "Couldn’t reach Sutura. Your writing stays on this device.", tone: "danger" });
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function clearCache() {
    setBusy("clear");
    setStatus(null);
    try {
      const n = await clearSceneCache();
      setStatus({ text: n > 0 ? `Cleared ${n} cached scene${n === 1 ? "" : "s"}.` : "There was nothing to clear.", tone: "success" });
    } catch {
      setStatus({ text: "The cache couldn’t be cleared.", tone: "danger" });
    } finally {
      setConfirmClear(false);
      setBusy(null);
      await load();
    }
  }

  async function copyDraft(sceneId: string) {
    const text = await getRetiredDraftText(sceneId);
    if (text === null) {
      setStatus({ text: "That draft is no longer here.", tone: "danger" });
      await load();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ text: "Draft copied.", tone: "success" });
    } catch {
      setStatus({ text: "It couldn’t be copied. Check your browser’s clipboard permission.", tone: "danger" });
    }
  }

  async function discardDraft(sceneId: string) {
    const ok = await discardRetiredDraft(sceneId);
    setConfirmDiscard(null);
    setStatus(ok ? { text: "Draft discarded.", tone: "success" } : { text: "That draft couldn’t be discarded.", tone: "danger" });
    await load();
  }

  const waiting = summary ? summary.pending : null;
  const workspaceParts = workspace
    ? [
        workspace.documents ? `${workspace.documents} page${workspace.documents === 1 ? "" : "s"} or entr${workspace.documents === 1 ? "y" : "ies"}` : null,
        workspace.notes ? `${workspace.notes} revision note${workspace.notes === 1 ? "" : "s"}` : null,
        workspace.canvases ? `${workspace.canvases} canvas${workspace.canvases === 1 ? "" : "es"}` : null,
      ].filter((p): p is string => p !== null)
    : [];

  async function copyStranded(d: StrandedDraft) {
    const text = userId ? await getStrandedDraftText(d.kind, d.id, userId) : null;
    if (text === null) {
      setStatus({ text: "That draft is no longer here.", tone: "danger" });
      await load();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ text: "Draft copied.", tone: "success" });
    } catch {
      setStatus({ text: "It couldn’t be copied. Check your browser’s clipboard permission.", tone: "danger" });
    }
  }

  async function discardStranded(d: StrandedDraft) {
    const ok = userId ? await discardStrandedDraft(d.kind, d.id, userId) : false;
    setConfirmDiscard(null);
    setStatus(ok ? { text: "Draft discarded.", tone: "success" } : { text: "That draft couldn’t be discarded.", tone: "danger" });
    await load();
  }

  return (
    <section className="r2-settings-section" aria-labelledby="settings-device">
      <h2 id="settings-device">This device</h2>
      <p className="r2-settings-scope">Only this browser. Writing is kept here until Sutura has it.</p>
      <div className="r2-settings-rows">
        <Row
          label="Writing waiting to be saved"
          help={
            summary === null
              ? "Checking…"
              : waiting === 0 && summary.conflicts === 0 && workspaceParts.length === 0
                ? "Everything written here has been saved to Sutura."
                : [
                    waiting ? `${waiting} scene${waiting === 1 ? "" : "s"} waiting to be sent` : null,
                    // A save that failed is still kept and retried; its reason (never prose) says what Rune saw last.
                    summary.failed && summary.failedReason
                      ? `${summary.failed === 1 ? "The last attempt" : "The last attempts"} failed: ${summary.failedReason}`
                      : null,
                    summary.conflicts
                      ? `${summary.conflicts} scene${summary.conflicts === 1 ? "" : "s"} to review — open ${summary.conflicts === 1 ? "it" : "each"} to choose which version to keep`
                      : null,
                    workspaceParts.length > 0
                      ? `Unsent workspace writing in ${workspaceParts.join(", ")} — it is sent when you open ${workspaceParts.length === 1 && !workspaceParts[0].includes("note") ? "it" : "its project"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(". ") + "."
          }
          status={status}
        >
          <button type="button" className="r2-button r2-button--sm" disabled={busy !== null} onClick={() => void syncNow()}>
            {busy === "sync" ? "Sending…" : "Send now"}
          </button>
        </Row>

        {(drafts.length > 0 || stranded.length > 0) && (
          <div className="r2-settings-row">
            <div className="r2-settings-row-text">
              <div className="r2-settings-row-label">Unsent drafts</div>
              <p className="r2-settings-row-help">
                Written to scenes, pages, entries or canvases that no longer exist in Sutura, so they can’t be saved there.
                Nothing was discarded: copy the text to keep it, or discard it.
              </p>
              <div className="r2-settings-drafts">
                {stranded.map((d) => (
                  <div key={`${d.kind}:${d.id}`} className="r2-settings-draft">
                    <span className="r2-settings-row-value">
                      {d.kind === "canvas"
                        ? `Canvas · ${d.notes} note${d.notes === 1 ? "" : "s"} · ${d.words.toLocaleString()} word${d.words === 1 ? "" : "s"}`
                        : `${STRANDED_NOUN[d.kind][0].toUpperCase()}${STRANDED_NOUN[d.kind].slice(1)} · ${d.words.toLocaleString()} word${d.words === 1 ? "" : "s"}`}
                    </span>
                    {confirmDiscard === `${d.kind}:${d.id}` ? (
                      <span className="r2-settings-row-actions">
                        <button type="button" className="r2-button r2-button--danger r2-button--sm" onClick={() => void discardStranded(d)}>
                          Discard draft
                        </button>
                        <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirmDiscard(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="r2-settings-row-actions">
                        <button type="button" className="r2-button r2-button--sm" onClick={() => void copyStranded(d)}>
                          Copy text
                        </button>
                        <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirmDiscard(`${d.kind}:${d.id}`)}>
                          Discard…
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {drafts.map((d) => (
                  <div key={d.sceneId} className="r2-settings-draft">
                    <span className="r2-settings-row-value">
                      {d.title ?? "Untitled scene"} · {d.wordCount.toLocaleString()} word{d.wordCount === 1 ? "" : "s"}
                    </span>
                    {confirmDiscard === d.sceneId ? (
                      <span className="r2-settings-row-actions">
                        <button type="button" className="r2-button r2-button--danger r2-button--sm" onClick={() => void discardDraft(d.sceneId)}>
                          Discard draft
                        </button>
                        <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirmDiscard(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="r2-settings-row-actions">
                        <button type="button" className="r2-button r2-button--sm" onClick={() => void copyDraft(d.sceneId)}>
                          Copy text
                        </button>
                        <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirmDiscard(d.sceneId)}>
                          Discard…
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <Row
          label="Cached scenes"
          help={`${summary ? summary.cached.toLocaleString() : "—"} kept for reading offline. Clearing frees space; it never removes writing waiting to be saved.`}
        >
          {confirmClear ? (
            <>
              <button type="button" className="r2-button r2-button--sm" disabled={busy !== null} onClick={() => void clearCache()}>
                {busy === "clear" ? "Clearing…" : "Clear cache"}
              </button>
              <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="r2-button r2-button--quiet r2-button--sm" disabled={busy !== null} onClick={() => setConfirmClear(true)}>
              Clear…
            </button>
          )}
        </Row>
      </div>
    </section>
  );
}

// ── Account ─────────────────────────────────────────────────────────────────

function AccountSection({ account, profileError }: { account: Account; profileError: string | null }) {
  const router = useRouter();
  const [penName, setPenName] = useState(account.penName ?? "");
  const [savedPenName, setSavedPenName] = useState(account.penName ?? "");
  const [penStatus, setPenStatus] = useState<Status>(profileError ? { text: "Your profile couldn’t be loaded.", tone: "danger" } : null);
  const [savingPen, setSavingPen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<Status>(null);
  const out = useLogOut();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);

  async function savePen(e: FormEvent) {
    e.preventDefault();
    if (savingPen || penName.trim() === savedPenName) return;
    setSavingPen(true);
    setPenStatus({ text: "Saving…" });
    try {
      const r = await updatePenName(penName);
      if (r.error !== null) setPenStatus({ text: r.error, tone: "danger" });
      else {
        setSavedPenName(r.data);
        setPenName(r.data);
        setPenStatus({ text: "Saved.", tone: "success" });
        router.refresh();
      }
    } catch {
      setPenStatus({ text: "You appear to be offline. Nothing was changed.", tone: "danger" });
    } finally {
      setSavingPen(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportStatus(null);
    try {
      const { data, error } = await exportUserData();
      if (error || !data) {
        setExportStatus({ text: "Your writing couldn’t be read for the download. Try again.", tone: "danger" });
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sutura-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus({ text: "Saved to your downloads.", tone: "success" });
    } catch {
      setExportStatus({ text: "You appear to be offline. Try again when you’re connected.", tone: "danger" });
    } finally {
      setExporting(false);
    }
  }

  async function removeAccount() {
    if (confirmDelete !== "DELETE" || deleting) return;
    setDeleting(true);
    setDeleteStatus(null);
    try {
      const { error } = await deleteAccount();
      if (error) {
        setDeleteStatus({ text: error, tone: "danger" });
        setDeleting(false);
        return;
      }
      await createClient().auth.signOut();
      window.location.href = "/";
    } catch {
      setDeleteStatus({ text: "You appear to be offline. Nothing was deleted.", tone: "danger" });
      setDeleting(false);
    }
  }

  return (
    <section className="r2-settings-section" aria-labelledby="settings-account">
      <h2 id="settings-account">Account</h2>
      <div className="r2-settings-rows">
        <div className="r2-settings-row">
          <form className="r2-settings-row-text" onSubmit={savePen}>
            <label htmlFor="settings-pen-name" className="r2-settings-row-label">
              Pen name
            </label>
            <p className="r2-settings-row-help">The name Sutura uses for you.</p>
            <div className="r2-settings-confirm r2-settings-pen">
              <input
                id="settings-pen-name"
                className="r2-field"
                value={penName}
                maxLength={PEN_NAME_MAX_LENGTH}
                autoComplete="nickname"
                disabled={savingPen}
                onChange={(e) => setPenName(e.target.value)}
              />
              <button type="submit" className="r2-button r2-button--sm" disabled={savingPen || penName.trim() === savedPenName || !penName.trim()}>
                Save
              </button>
            </div>
            <p className="r2-settings-status" role="status" data-tone={penStatus?.tone}>
              {penStatus?.text ?? ""}
            </p>
          </form>
        </div>
        <Row label="Email" help="The address you sign in with.">
          <span className="r2-settings-row-value">{account.email}</span>
        </Row>
        <Row
          label="Download your writing"
          help="Every project’s manuscript — chapters and scenes — as one JSON file. For a complete copy of one project, use its backup."
          status={exportStatus}
        >
          <button type="button" className="r2-button r2-button--sm" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? "Preparing…" : "Download"}
          </button>
        </Row>
        <Row label="Log out" status={out.error ? { text: out.error, tone: "danger" } : undefined}>
          <button type="button" className="r2-button r2-button--sm" disabled={out.busy} onClick={out.logOut}>
            {out.busy ? "Logging out…" : "Log out"}
          </button>
          {out.dialog}
        </Row>
      </div>
      {/* Set apart: the one irreversible thing on this page. */}
      <div className="r2-settings-rows r2-settings-rows--danger">
        <Row
          label="Delete account"
          help="Permanently deletes your account and every project in it, including Trash. This can’t be undone."
          status={deleteStatus}
          danger
        >
          {confirmDelete === null ? (
            <button type="button" className="r2-button r2-button--quiet r2-button--sm" data-tone="danger" onClick={() => setConfirmDelete("")}>
              Delete account…
            </button>
          ) : (
            <span className="r2-settings-confirm">
              <label htmlFor="settings-delete-confirm" className="r2-settings-row-help">
                Type DELETE to confirm
              </label>
              <input
                id="settings-delete-confirm"
                className="r2-field r2-field--sm"
                value={confirmDelete}
                autoComplete="off"
                spellCheck={false}
                placeholder="DELETE"
                autoFocus
                disabled={deleting}
                onChange={(e) => setConfirmDelete(e.target.value)}
              />
              <button
                type="button"
                className="r2-button r2-button--danger r2-button--sm"
                disabled={confirmDelete !== "DELETE" || deleting}
                onClick={() => void removeAccount()}
              >
                {deleting ? "Deleting…" : "Delete account permanently"}
              </button>
              <button type="button" className="r2-button r2-button--quiet r2-button--sm" disabled={deleting} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
            </span>
          )}
        </Row>
      </div>
    </section>
  );
}
