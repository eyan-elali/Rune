export interface UserPreferences {
  fontSize: number;
  lineHeight: number;
  autoSaveDelay: number;
  wideEditor: boolean;
  activeTheme: string;
  activeAvatar: string;
  activeFont: string;
  has_completed_editor_tutorial?: boolean;
  has_seen_guides_update_notice?: boolean;
  hideArena?: boolean;
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  preferences: Record<string, unknown> | null;
  created_at: string;
  stripe_customer_id: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_price_id: string | null;
  subscription_period_end: string | null;
  has_written_first_words: boolean;
  is_admin: boolean;
}

export interface XpEvent {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  source_session_id: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_color: string | null;
  word_count: number;
  chapter_goal?: number | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  position: number;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  chapter_id: string;
  title: string;
  content: Record<string, unknown> | null;
  word_count: number;
  position: number;
  is_canonical: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectNote {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  is_completed: boolean;
  is_pinned: boolean;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface GameSession {
  id: string;
  user_id: string;
  mode: string;
  words_written: number;
  duration_seconds: number | null;
  xp_earned: number;
  completed: boolean;
  enemy_type: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  event_name: string;
  project_id: string | null;
  local_date: string | null;
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface AcquisitionAttribution {
  id: string;
  user_id: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
  landing_path: string | null;
  captured_at: string | null;
  created_at: string;
}

export interface FutureLetter {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  created_at: string;
  reveal_at: string;
  revealed_at: string | null;
}

export interface FounderNote {
  id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}
