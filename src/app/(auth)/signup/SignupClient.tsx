"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { recordSignupCompletedEvent } from "@/lib/actions/signupAnalytics";
import { PEN_NAME_MAX_LENGTH, getPenNameValidationError, normalizePenName } from "@/lib/penName";

// Create account (Beta Completion E): for the closed beta, with the email an
// invitation was sent to. When the optional Auth hook is enabled (migration
// 052, beta_before_user_created) an email that is not approved is refused
// here, and the writer is pointed at the waitlist; without it, the account
// is made but can't enter Rune until approved (the front door says so).

interface FieldErrors {
  displayName?: string;
  password?: string;
  confirmPassword?: string;
}

export default function SignupClient() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notInvited, setNotInvited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotInvited(false);

    const errors: FieldErrors = {};
    const penNameError = getPenNameValidationError(displayName);
    if (penNameError) errors.displayName = penNameError;
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    if (password !== confirmPassword) errors.confirmPassword = "The passwords don’t match.";
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
      if (/closed beta/i.test(error.message)) setNotInvited(true);
      else setError(error.message);
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
      <p className="r2-auth-lede">Rune is in closed beta. Use the email address your invitation was sent to.</p>

      <form onSubmit={handleSubmit} noValidate className="r2-auth-form">
        <label className="r2-auth-field">
          <span>Pen name</span>
          <input
            className="r2-field"
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
            className="r2-field"
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
            className="r2-field"
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
        <label className="r2-auth-field">
          <span>Confirm password</span>
          <input
            className="r2-field"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            {...field("confirmPassword")}
          />
          {fieldError("confirmPassword")}
        </label>

        {notInvited && (
          <p role="alert" className="r2-notice">
            This email hasn’t been invited yet. Rune is in closed beta — <Link href="/">join the waitlist</Link> and
            we’ll write when there’s a place for you.
          </p>
        )}
        {error && (
          <p role="alert" className="r2-notice" data-tone="danger">
            {error}
          </p>
        )}

        <button type="submit" className="r2-button r2-button--primary r2-auth-submit" disabled={loading}>
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <p className="r2-auth-foot r2-auth-legal">
        By creating an account, you agree to Rune’s <Link href="/terms">Terms</Link> and acknowledge the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p className="r2-auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      <p className="r2-auth-foot">
        Not invited yet? <Link href="/">Join the beta</Link>
      </p>
    </section>
  );
}
