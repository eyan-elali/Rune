// Central registry of analytics event names Rune currently intends to support.
// No DB calls here — see src/lib/actions/analytics.ts for the write path.
// Add new events here first so callers never scatter raw string literals.

export type AnalyticsEventName =
  // The signed-out front door (anonymous rows, user_id null; metadata is the
  // visit's campaign fields, referrer host, device class and, for a click,
  // placement header | hero | final | feature) — lib/launchMetrics.ts
  | "landing_viewed"
  | "landing_cta_clicked"
  // Acquisition and account
  | "signup_completed"
  | "email_verified"
  | "onboarding_started"
  | "onboarding_completed"
  // Closed beta and Rune 2.0 onboarding (Beta Completion E). Never content:
  // no titles, prose, feedback text or email addresses in metadata.
  | "beta_waitlist_joined"
  | "beta_access_accepted"
  | "onboarding_path_new"
  | "onboarding_path_import"
  | "first_project_opened"
  | "first_workspace_object_created"
  | "feedback_submitted"
  // Writing activation
  | "project_created"
  | "first_sentence_written"
  | "editor_opened"
  | "first_character_typed"
  | "first_save"
  | "first_sync_completed"
  // ACTIVATION — the canonical "activated writer" (lib/launchMetrics.ts): the
  // first credited typed manuscript words in the writer's own Project. Once
  // per account; local_date = the writer's local day of that writing.
  | "first_words_written"
  // Writing milestones (real words — writing_sessions.words_added, never projects.word_count)
  | "reached_100_words"
  | "reached_500_words"
  | "reached_2000_words"
  | "reached_5000_words"
  | "reached_10000_words"
  | "reached_15000_words"
  // Retention (distinct local calendar days with real writing, not sessions/opens;
  // local_date = that day, from 2026-10-13)
  | "second_writing_day"
  | "third_writing_day"
  // Feature use
  | "export_completed"
  | "arena_session_completed"
  | "revision_note_created"
  // Phone waiting room (mobile -> desktop activation)
  | "phone_waiting_room_viewed"
  | "desktop_link_requested"
  | "desktop_link_copied"
  // Revenue and lifecycle
  | "subscription_started"
  | "subscription_cancelled"
  | "account_deleted";
