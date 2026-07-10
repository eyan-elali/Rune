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
  | "reached_100_words"
  | "reached_500_words"
  | "reached_2000_words"
  | "reached_5000_words"
  | "reached_10000_words"
  | "reached_15000_words"
  // Retention (distinct local calendar days with real writing, not sessions/opens)
  | "second_writing_day"
  | "third_writing_day"
  // Feature use
  | "export_completed"
  | "arena_session_completed"
  | "revision_note_created"
  // Revenue and lifecycle
  | "subscription_started"
  | "subscription_cancelled"
  | "account_deleted";
