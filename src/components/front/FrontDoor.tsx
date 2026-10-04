"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinBetaWaitlist } from "@/lib/actions/beta";
import { WAITLIST_NAME_MAX, WAITLIST_WRITES_MAX } from "@/lib/beta";

// The front door's two small interactive pieces (Beta Completion E).

/**
 * Join the beta: the waitlist. An email, and — only if the writer wants — a
 * name and a line about what they write. The answer is the same whether the
 * address was new or already there (the waitlist never says), and joining
 * grants nothing: access is given by hand.
 */
export function WaitlistForm({ defaultEmail = "", collapsed = false }: { defaultEmail?: string; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [writes, setWrites] = useState("");
  const [state, setState] = useState<"editing" | "sending" | "joined">("editing");
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setError("You appear to be offline. Try again when you’re connected.");
      setState("editing");
    }
  }

  if (state === "joined") {
    return (
      <p className="r2-front-note" role="status">
        You’re on the list. We’ll write to <strong>{email.trim()}</strong> when there’s a place for you.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="r2-front-actions">
        <button type="button" className="r2-button r2-button--primary r2-front-primary" onClick={() => setOpen(true)}>
          Join the beta
        </button>
      </div>
    );
  }

  return (
    <form className="r2-front-form" onSubmit={submit} aria-label="Join the beta" aria-describedby="waitlist-purpose" noValidate>
      <p id="waitlist-purpose" className="r2-front-purpose">
        Join the closed-beta waitlist. We’ll use your email only to contact you about Sutura beta access.
      </p>
      <label className="r2-front-field">
        <span>Email</span>
        <input
          className="r2-field"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus={collapsed}
          placeholder="you@example.com"
        />
      </label>
      <label className="r2-front-field">
        <span>
          Name <em>optional</em>
        </span>
        <input
          className="r2-field"
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
          className="r2-field"
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
      <div className="r2-front-actions">
        <button type="submit" className="r2-button r2-button--primary r2-front-primary" disabled={state === "sending" || !email.trim()}>
          {state === "sending" ? "Joining…" : "Join the beta"}
        </button>
      </div>
    </form>
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
