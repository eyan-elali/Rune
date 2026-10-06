"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic-link";

// Sign in (Beta Completion E: Rune 2.0's frame, no purchase handoff). A
// sign-in link never creates an account (shouldCreateUser: false): accounts
// are made on Create account, for an invited email.

/** Supabase's own wording, in Rune's. */
function friendlyError(message: string): string {
  if (/signups not allowed/i.test(message)) {
    return "There’s no Sutura account for that email yet. If you’ve been invited, create your account first.";
  }
  if (/invalid login credentials/i.test(message)) return "That email and password don’t match.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first — the link is in the message we sent you.";
  return message;
}

export default function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "magic-link") {
      // Back through /auth/callback, like a confirmation link: it is where a
      // signed-in account is routed (pen name first) — never the Site URL root.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL("/auth/callback?next=/projects", window.location.origin).toString(),
        },
      });
      if (error) setError(friendlyError(error.message));
      else setMagicSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(friendlyError(error.message));
      } else {
        router.push("/projects");
        router.refresh();
      }
    }

    setLoading(false);
  }

  function toggleMode() {
    setMode((m) => (m === "password" ? "magic-link" : "password"));
    setError(null);
  }

  if (magicSent) {
    return (
      <section className="r2-auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">Check your inbox.</h1>
        <p className="r2-auth-lede">
          We sent a sign-in link to <strong>{email}</strong>.
        </p>
        <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => setMagicSent(false)}>
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <section className="r2-auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{mode === "password" ? "Sign in" : "Sign in with a link"}</h1>

      <form onSubmit={handleSubmit} noValidate className="r2-auth-form">
        <label className="r2-auth-field">
          <span>Email</span>
          <input
            className="r2-field r2-field--lg"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </label>

        {mode === "password" && (
          <label className="r2-auth-field">
            <span>Password</span>
            <input
              className="r2-field r2-field--lg"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}

        {error && (
          <p role="alert" className="r2-notice" data-tone="danger">
            {error}
          </p>
        )}

        <button type="submit" className="r2-button r2-button--primary r2-button--lg r2-auth-submit" disabled={loading}>
          {loading ? (mode === "password" ? "Signing in…" : "Sending…") : mode === "password" ? "Sign in" : "Send link"}
        </button>
      </form>

      <button type="button" className="r2-button r2-button--quiet r2-button--sm r2-auth-switch" onClick={toggleMode}>
        {mode === "password" ? "Sign in with a link instead" : "Sign in with a password instead"}
      </button>

      <p className="r2-auth-legal">
        By signing in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <div className="r2-auth-card-foot">
        <p>
          Invited, but no account yet? <Link href="/signup">Create your account</Link>
        </p>
      </div>
    </section>
  );
}
