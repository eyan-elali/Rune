// Central registry of analytics event names Rune currently intends to support.
// No DB calls here — see src/lib/actions/analytics.ts for the write path.
// Add new events here first so callers never scatter raw string literals.

export type AnalyticsEventName =
  // Acquisition and account
  | "signup_completed"
  | "email_verified"
  | "onboarding_started"
  | "onboarding_completed"
  // Writing activation
  | "project_created"
  | "first_sentence_written"
  | "editor_opened"
  | "first_character_typed"
  | "first_save"
  | "first_sync_completed"
  // Writing milestones (real words — writing_sessions.words_added, never projects.word_count)
  | "words_100"
  | "words_500"
  | "words_2000"
  | "words_5000"
  | "words_10000"
  | "words_15000"
  // Retention
  | "second_writing_session"
  | "third_writing_session"
  // Feature use
  | "export_completed"
  | "arena_session_completed"
  | "revision_note_created"
  // Revenue and lifecycle
  | "subscription_started"
  | "subscription_cancelled"
  | "account_deleted";
