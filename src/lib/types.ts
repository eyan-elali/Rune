export interface UserPreferences {
  fontSize: number;
  lineHeight: number;
  autoSaveDelay: number;
  wideEditor: boolean;
  activeTheme: string;
  activeAvatar: string;
  activeFont: string;
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

export interface Task {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  due_date: string | null; // YYYY-MM-DD plain string
  created_at: string;
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
