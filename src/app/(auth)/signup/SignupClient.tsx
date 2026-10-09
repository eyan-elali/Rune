"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { recordSignupCompletedEvent } from "@/lib/actions/signupAnalytics";
import { PEN_NAME_MAX_LENGTH, getPenNameValidationError, normalizePenName } from "@/lib/penName";

// Create account: open to anyone during Early Access — no invitation, no
// approval (migration 056). Supabase Auth validates the email, applies its
// own sign-up rate limits and sends the confirmation link.
//
// One password field, no confirmation: the same 8-character rule, and a
// mistyped password is never a lockout — the account is confirmed (and
// signed in) by the emailed link, and Sign in offers a sign-in link for any
// later visit. The field is labelled "Name"; it is still the pen name
// (profiles.display_name), with the same rules.

interface FieldErrors {
  displayName?: string;
  password?: string;
}

export default function SignupClient() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const errors: FieldErrors = {};
    const penNameError = getPenNameValidationError(displayName, "name");
    if (penNameError) errors.displayName = penNameError;
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: normalizePenName(displayName) },
        emailRedirectTo: (() => {
          const u = new URL("/auth/callback", window.location.origin);
          u.searchParams.set("next", "/projects");
          u.searchParams.set("intent", "signup");
          return u.toString();
        })(),
      },
    });

    if (error) {
      setError(error.message);
    } else {
      // Best-effort, fire-and-forget — analytics must never block or fail signup.
      // No server-side hook exists for this event: signUp() talks directly to
      // Supabase's REST API, and no session exists yet (email confirmation is
      // required) for a server component/action to derive identity from instead.
      if (data.user) {
        void recordSignupCompletedEvent(data.user.id).catch(() => {});
      }
      setConfirmed(true);
    }
    setLoading(false);
  }

  if (confirmed) {
    return (
      <section className="r2-auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">Check your email.</h1>
        <p className="r2-auth-lede">
          We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.
        </p>
        <p className="r2-auth-foot">
          <Link href="/login">Back to sign in</Link>
        </p>
      </section>
    );
  }

  const field = (id: keyof FieldErrors) =>
    fieldErrors[id]
      ? { "aria-invalid": true as const, "aria-describedby": `signup-${id}-error` }
      : {};
  const fieldError = (id: keyof FieldErrors) =>
    fieldErrors[id] ? (
      <span id={`signup-${id}-error`} className="r2-auth-field-error">
        {fieldErrors[id]}
      </span>
    ) : null;

  return (
    <section className="r2-auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">Create your account</h1>
      <p className="r2-auth-lede">Sutura is in Early Access, and free for now.</p>

      <form onSubmit={handleSubmit} noValidate className="r2-auth-form">
        <label className="r2-auth-field">
          <span>Name</span>
          <input
            className="r2-field r2-field--lg"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            required
            maxLength={PEN_NAME_MAX_LENGTH}
            {...field("displayName")}
          />
          {fieldError("displayName")}
        </label>
        <label className="r2-auth-field">
          <span>Email</span>
          <input
            className="r2-field r2-field--lg"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="r2-auth-field">
          <span>Password</span>
          <input
            className="r2-field r2-field--lg"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            {...field("password")}
          />
          {fieldError("password")}
        </label>
        {error && (
          <p role="alert" className="r2-notice" data-tone="danger">
            {error}
          </p>
        )}

        <button type="submit" className="r2-button r2-button--primary r2-button--lg r2-auth-submit" disabled={loading}>
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <p className="r2-auth-legal">
        By creating an account, you agree to Sutura’s <Link href="/terms">Terms</Link> and acknowledge the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <div className="r2-auth-card-foot">
        <p>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
