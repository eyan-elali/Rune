export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  preferences: Record<string, unknown> | null;
  created_at: string;
}

export interface XpEvent {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_color: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  position: number;
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
  created_at: string;
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
