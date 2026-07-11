// Shared pen-name rules for Rune's `profiles.display_name` column — the
// established source of truth for a writer's user-facing identity (distinct
// from the separate, optional `username` field). Used by both signup and
// the /complete-profile remediation flow so the two paths can never drift.

export const PEN_NAME_MIN_LENGTH = 2;
export const PEN_NAME_MAX_LENGTH = 40;

// Letters/marks/numbers from any script (covers accented characters and
// non-English scripts), plus spaces and the punctuation real names commonly
// use. Anything outside this allow-list — including control characters —
// is rejected implicitly.
const PEN_NAME_PATTERN = /^[\p{L}\p{M}\p{N} '’.-]+$/u;
const HAS_VISIBLE_CHARACTER = /[\p{L}\p{N}]/u;

/** True when a stored or in-progress pen name should be treated as absent. */
export function isPenNameMissing(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function normalizePenName(value: string): string {
  return value.trim();
}

/** Returns a calm, user-facing error string, or null if the pen name is valid. */
export function getPenNameValidationError(raw: string): string | null {
  const trimmed = normalizePenName(raw);

  if (trimmed.length === 0) {
    return "Enter a pen name.";
  }
  if (trimmed.length < PEN_NAME_MIN_LENGTH) {
    return "Pen name must be at least 2 characters.";
  }
  if (trimmed.length > PEN_NAME_MAX_LENGTH) {
    return "Pen name must be 40 characters or fewer.";
  }
  if (!PEN_NAME_PATTERN.test(trimmed) || !HAS_VISIBLE_CHARACTER.test(trimmed)) {
    return "Pen name can only include letters, spaces, apostrophes, hyphens, and periods.";
  }
  return null;
}
