// Rune 2.0 onboarding (Beta Completion E): which step an account is on,
// worked out from the server's record (account_onboarding, migration 052).
// Pure, so the pages and the tests agree.
//
// The journey is account-level and happens once:
//   welcome → path ("new" | "import") → title or import → model → appearance → arrival
// Everything up to the Project lives on the server; after it, the steps are
// presentation only, so a refresh resumes at the mental model with the
// Project already made — never a second Project.

export type OnboardingPath = "new" | "import";

export type OnboardingRow = {
  path: OnboardingPath | null;
  project_id: string | null;
  completed_at: string | null;
};

export type OnboardingStep = "welcome" | "path" | "title" | "import" | "model";

/**
 * Whether the account belongs in onboarding. An account with a record goes
 * there until it is complete. An account without one goes there only if it
 * is new — never a Project of its own (active or in Trash) and nothing
 * written — so a writer from before onboarding existed is never sent back.
 */
export function needsOnboarding(row: OnboardingRow | null, account: { projectsEver: number; hasWritten: boolean }): boolean {
  if (row) return row.completed_at === null;
  return account.projectsEver === 0 && !account.hasWritten;
}

/** Where an unfinished journey resumes. */
export function onboardingStep(row: OnboardingRow | null, projectExists: boolean): OnboardingStep {
  if (!row) return "welcome";
  if (row.project_id && projectExists) return "model";
  if (row.path === "new") return "title";
  if (row.path === "import") return "import";
  return "path";
}

export function readOnboardingRow(v: unknown): OnboardingRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const completed = r.completed_at;
  return {
    path: r.path === "new" || r.path === "import" ? r.path : null,
    project_id: typeof r.project_id === "string" ? r.project_id : null,
    completed_at:
      typeof completed === "string" ? completed : completed instanceof Date ? completed.toISOString() : null,
  };
}
