"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinBetaWaitlist } from "@/lib/actions/beta";
import { WAITLIST_NAME_MAX, WAITLIST_WRITES_MAX } from "@/lib/beta";
import { useModalFocus } from "@/components/rune2/useModalFocus";

// The front door's two small interactive pieces (Beta Completion E).

/**
 * Join the beta: the waitlist. An email, and — only if the writer wants — a
 * name and a line about what they write. The answer is the same whether the
 * address was new or already there (the waitlist never says), and joining
 * grants nothing: access is given by hand.
 *
 * One material panel, the beta surface. `collapsed` (the front door): the
 * panel holds the closed-beta `note` and a single Join the beta button; the
 * form opens over the page in a small material sheet (its first control,
 * the email, focused by useModalFocus; Escape or Not now folds it, focus
 * back on Join the beta), so the front door
 * never grows or moves. Otherwise (an account without access) the form sits
 * in the panel itself. Joined, the panel says so, in either case.
 */
export function WaitlistForm({
  defaultEmail = "",
  collapsed = false,
  note,
}: {
  defaultEmail?: string;
  collapsed?: boolean;
  note?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [writes, setWrites] = useState("");
  const [state, setState] = useState<"editing" | "sending" | "joined">("editing");
  const [error, setError] = useState<string | null>(null);
  const answer = useRef<HTMLParagraphElement>(null);
  const joinButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Folded without joining: focus back on Join the beta.
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) joinButton.current?.focus({ preventScroll: true });
  }, [open]);

  // The sheet closes on the answer; focus goes to the answer, not to <body>.
  useEffect(() => {
    if (state === "joined" && collapsed) answer.current?.focus({ preventScroll: true });
  }, [state, collapsed]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const r = await joinBetaWaitlist({ email, name, writes });
      if (r.error !== null) {
        setError(r.error);
        setState("editing");
        return;
      }
      setState("joined");
      setOpen(false);
    } catch {
      setError("You appear to be offline. Try again when you’re connected.");
      setState("editing");
    }
  }

  if (state === "joined") {
    return (
      <div className="r2-material r2-front-panel">
        <p ref={answer} tabIndex={-1} className="r2-front-note" role="status">
          <strong>You’re on the list.</strong> We’ll write to <strong>{email.trim()}</strong> when there’s a place for you.
        </p>
      </div>
    );
  }

  const close = () => {
    if (state === "sending") return;
    setError(null);
    setOpen(false);
  };

  const form = (
    <form
      className="r2-front-form"
      onSubmit={submit}
      aria-label={collapsed ? undefined : "Join the beta"}
      aria-describedby="waitlist-purpose"
      noValidate
    >
      <label className="r2-front-field">
        <span>Email</span>
        <input
          className="r2-field r2-field--lg"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>
      <label className="r2-front-field">
        <span>
          Name <em>optional</em>
        </span>
        <input
          className="r2-field r2-field--lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={WAITLIST_NAME_MAX}
        />
      </label>
      <label className="r2-front-field">
        <span>
          What do you write? <em>optional</em>
        </span>
        <input
          className="r2-field r2-field--lg"
          value={writes}
          onChange={(e) => setWrites(e.target.value)}
          maxLength={WAITLIST_WRITES_MAX}
          placeholder="A fantasy trilogy, a first literary novel…"
        />
      </label>
      {error && (
        <p role="alert" className="r2-notice" data-tone="danger">
          {error}
        </p>
      )}
      <div className="r2-front-form-actions">
        {collapsed && (
          <button type="button" className="r2-button r2-button--quiet r2-button--lg" disabled={state === "sending"} onClick={close}>
            Not now
          </button>
        )}
        <button
          type="submit"
          className="r2-button r2-button--primary r2-button--lg"
          disabled={state === "sending" || !email.trim()}
        >
          {state === "sending" ? "Joining…" : "Join the beta"}
        </button>
      </div>
    </form>
  );

  const purpose = (
    <p id="waitlist-purpose" className="r2-front-purpose">
      Join the closed-beta waitlist. We’ll use your email only to contact you about Sutura beta access.
    </p>
  );

  if (!collapsed) {
    return (
      <div className="r2-material r2-front-panel">
        {note}
        {purpose}
        {form}
      </div>
    );
  }

  return (
    <>
      <div className="r2-material r2-front-panel">
        <div className="r2-front-panel-head">
          {note}
          <button
            ref={joinButton}
            type="button"
            className="r2-button r2-button--primary r2-button--lg"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Join the beta
          </button>
        </div>
      </div>
      {open && (
        <WaitlistSheet onClose={close}>
          {purpose}
          {form}
        </WaitlistSheet>
      )}
    </>
  );
}

/** The waitlist's sheet: one small material surface over a light scrim. */
function WaitlistSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(ref);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="r2-front-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="r2-material r2-front-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Join the beta</h2>
        {children}
      </div>
    </div>
  );
}

/** Sign out, for an account without access (it has no writing to wait for). */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="r2-button r2-button--quiet r2-button--sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
