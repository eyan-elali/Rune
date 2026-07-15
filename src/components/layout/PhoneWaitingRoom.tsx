"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import {
  requestDesktopLinkEmail,
  triggerAutomaticDesktopLinkEmail,
  recordPhoneWaitingRoomViewed,
} from "@/lib/actions/waitingRoom";

export type WaitingRoomVariant = "new" | "returning";

// Mirrors the server-side cooldown in waitingRoom.ts. Display-only — the
// server remains the authority on whether a resend actually goes through.
const RESEND_COOLDOWN_MS = 45_000;

const ANTICIPATION_STEPS = [
  "Name your story",
  "Write your first line",
  "Choose your writing space",
  "Begin your manuscript",
];

interface PhoneWaitingRoomProps {
  variant: WaitingRoomVariant;
  initialEmailSentAt: string | null;
}

type SendState = "idle" | "sending" | "sent" | "error";

export function PhoneWaitingRoom({ variant, initialEmailSentAt }: PhoneWaitingRoomProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [signingOut, setSigningOut] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialEmailSentAt);
  const [canResend, setCanResend] = useState(() =>
    initialEmailSentAt
      ? Date.now() - new Date(initialEmailSentAt).getTime() >= RESEND_COOLDOWN_MS
      : true
  );
  const hasTriggeredAuto = useRef(false);
  const hasTrackedView = useRef(false);

  // Deduped server-side (analytics_events unique index), so a StrictMode
  // double-invoke or a fast refresh never produces more than one row.
  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    recordPhoneWaitingRoomViewed().catch(() => {});
  }, []);

  // Automatic desktop-link email: only for a brand-new, zero-project account
  // that has never received one before. The server independently re-checks
  // both conditions and claims the send atomically, so this effect firing
  // twice (or on every mount across repeat visits) can never double-send.
  useEffect(() => {
    if (hasTriggeredAuto.current) return;
    if (variant !== "new" || initialEmailSentAt) return;
    hasTriggeredAuto.current = true;
    triggerAutomaticDesktopLinkEmail()
      .then((result) => {
        if (result.sent) {
          setLastSentAt(new Date().toISOString());
          setCanResend(false);
          setSendState("sent");
        }
      })
      .catch(() => {
        // A failed automatic send must never block the waiting room.
      });
  }, [variant, initialEmailSentAt]);

  // Schedules the flip back to resendable once the cooldown window (started
  // by lastSentAt) elapses. lastSentAt changes always set canResend false
  // synchronously at the call site, so this effect only ever needs to
  // subscribe to the future transition, not assert the current state.
  useEffect(() => {
    if (!lastSentAt) return;
    const remaining = RESEND_COOLDOWN_MS - (Date.now() - new Date(lastSentAt).getTime());
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setCanResend(true), remaining);
    return () => clearTimeout(timeout);
  }, [lastSentAt]);

  async function handleSendLink() {
    setSendState("sending");
    setSendError(null);
    const result = await requestDesktopLinkEmail();
    if (result.ok) {
      setLastSentAt(new Date().toISOString());
      setCanResend(false);
      setSendState("sent");
    } else {
      setSendState("error");
      setSendError(result.error ?? "Couldn't send the email. Try again in a moment.");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function handleCopyLink() {
    const url = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Desktop link copied.", "success");
    } catch {
      showToast("Couldn't copy the link", "error");
    }
  }

  const hasSentBefore = Boolean(lastSentAt);
  const showConfirmation = sendState === "sent" && !canResend;

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10"
      style={{
        background: "var(--bg-primary)",
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <main className="rune-waiting-room w-full max-w-[400px] text-center">
        <span
          className="mb-8 inline-block select-none font-rune-serif text-xl"
          style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
          aria-hidden="true"
        >
          Rune
        </span>

        <h1
          className="font-rune-serif text-3xl font-semibold leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {variant === "new" ? "Welcome to Rune." : "Welcome back."}
        </h1>

        <div className="mt-4 flex flex-col gap-3">
          {variant === "new" ? (
            <>
              <p
                className="font-rune-serif text-base leading-relaxed"
                style={{ color: "var(--text-primary)", opacity: 0.9 }}
              >
                Your account is ready.
              </p>
              <p
                className="font-rune-serif text-base leading-relaxed"
                style={{ color: "var(--text-primary)", opacity: 0.9 }}
              >
                Rune is designed for long-form writing, so your first writing session begins
                on a desktop or supported tablet.
              </p>
            </>
          ) : (
            <p
              className="font-rune-serif text-base leading-relaxed"
              style={{ color: "var(--text-primary)", opacity: 0.9 }}
            >
              Rune is designed for long-form writing, so your manuscript stays on a desktop
              or supported tablet — pick up exactly where you left off.
            </p>
          )}
        </div>

        {variant === "new" && (
          <div className="mt-9">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--onboarding-muted)" }}
            >
              When you open Rune, you&rsquo;ll
            </p>
            <ol className="mt-4 flex flex-col gap-2.5">
              {ANTICIPATION_STEPS.map((step, i) => (
                <li key={step} className="flex items-center justify-center gap-3">
                  <span
                    className="font-rune-serif text-xs italic"
                    style={{ color: "var(--color-gold)" }}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="font-rune-serif text-sm"
                    style={{ color: "var(--text-primary)", opacity: 0.85 }}
                  >
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="mt-8 text-sm italic" style={{ color: "var(--onboarding-muted)" }}>
          Your writing desk will be waiting.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3">
          {showConfirmation ? (
            <div
              className="w-full max-w-[280px] rounded-md border px-5 py-4"
              style={{ borderColor: "var(--color-border-strong)" }}
            >
              <p className="font-rune-serif text-base" style={{ color: "var(--text-primary)" }}>
                Sent.
              </p>
              <p
                className="mt-1.5 text-xs leading-relaxed"
                style={{ color: "var(--onboarding-muted)" }}
              >
                Open the email on your computer when you&rsquo;re ready to begin.
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleSendLink}
              loading={sendState === "sending"}
              disabled={sendState === "sending" || (hasSentBefore && !canResend)}
              className="min-h-[44px] w-full max-w-[280px]"
            >
              {hasSentBefore ? "Send again" : "Email me my desktop link"}
            </Button>
          )}

          {sendState === "error" && sendError && (
            <p role="alert" aria-live="polite" className="text-xs" style={{ color: "var(--color-crimson)" }}>
              {sendError}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={handleCopyLink}
            className="min-h-[44px] w-full max-w-[280px]"
          >
            Copy desktop link
          </Button>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-10 min-h-[44px] text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ color: "var(--onboarding-muted)" }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </main>
    </div>
  );
}
