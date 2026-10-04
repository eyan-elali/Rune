"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPenNameValidationError, PEN_NAME_MAX_LENGTH } from "@/lib/penName";
import { completePenName } from "@/lib/actions/profile";

export default function CompleteProfileClient({ initialPenName = "" }: { initialPenName?: string }) {
  const router = useRouter();
  const [penName, setPenName] = useState(initialPenName);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = getPenNameValidationError(penName);
    if (validationError) {
      setFieldError(validationError);
      return;
    }
    setFieldError(undefined);
    setLoading(true);

    const result = await completePenName(penName);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push(result.redirectTo ?? "/projects");
    router.refresh();
  }

  return (
    <section className="r2-auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">Choose your pen name.</h1>
      <p className="r2-auth-lede">The name Sutura uses for you. You can change it later in Settings.</p>

      <form onSubmit={handleSubmit} noValidate className="r2-auth-form">
        <label className="r2-auth-field">
          <span>Pen name</span>
          <input
            className="r2-field"
            type="text"
            value={penName}
            onChange={(e) => setPenName(e.target.value)}
            autoComplete="name"
            autoFocus
            required
            maxLength={PEN_NAME_MAX_LENGTH}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "pen-name-error" : undefined}
          />
          {fieldError && (
            <span id="pen-name-error" className="r2-auth-field-error">
              {fieldError}
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="r2-notice" data-tone="danger">
            {error}
          </p>
        )}

        <button type="submit" className="r2-button r2-button--primary r2-auth-submit" disabled={loading}>
          {loading ? "Saving…" : "Continue"}
        </button>
      </form>
    </section>
  );
}
