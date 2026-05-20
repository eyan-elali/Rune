-- ═══════════════════════════════════════════════════════════════════
--  Rune — Database Schema
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  username      text        unique,
  display_name  text,
  avatar_url    text,
  xp            integer     not null default 0,
  level         integer     not null default 1,
  preferences   jsonb,
  created_at    timestamptz not null default now()
);

-- ── projects ────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  title        text        not null,
  description  text,
  cover_color  text,
  word_count   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── chapters ────────────────────────────────────────────────────────
create table if not exists public.chapters (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects (id) on delete cascade,
  title       text        not null,
  position    integer     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── pages ───────────────────────────────────────────────────────────
create table if not exists public.pages (
  id          uuid        primary key default gen_random_uuid(),
  chapter_id  uuid        not null references public.chapters (id) on delete cascade,
  title       text        not null,
  content     jsonb,
  word_count  integer     not null default 0,
  position    integer     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── game_sessions ────────────────────────────────────────────────────
create table if not exists public.game_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  mode             text        not null,
  words_written    integer     not null default 0,
  duration_seconds integer,
  xp_earned        integer     not null default 0,
  completed        boolean     not null default false,
  enemy_type       text,
  created_at       timestamptz not null default now()
);

-- Existing projects created before enemy_type: run once in Supabase SQL if inserts fail:
-- alter table public.game_sessions add column if not exists enemy_type text;

-- ── xp_events ────────────────────────────────────────────────────────
create table if not exists public.xp_events (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  amount            integer     not null,
  reason            text        not null,
  source_session_id uuid,
  created_at        timestamptz not null default now()
);

-- Run once in Supabase SQL if xp_events already exists:
-- alter table public.xp_events add column if not exists source_session_id uuid;

-- ═══════════════════════════════════════════════════════════════════
--  Row Level Security
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.chapters      enable row level security;
alter table public.pages         enable row level security;
alter table public.game_sessions enable row level security;
alter table public.xp_events     enable row level security;

-- profiles: users manage only their own row
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- projects: users manaehage only their own projects
create policy "projects: select own"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: insert own"
  on public.pmusirojects for insert
  with check (auth.uid() = user_id);

create policy "projects: update own"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: delete own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- chapters: access derived from project ownership
create policy "chapters: select own"
  on public.chapters for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: insert own"
  on public.chapters for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: update own"
  on public.chapters for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: delete own"
  on public.chapters for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

-- pages: access derived from chapter → project ownership
create policy "pages: select own"
  on public.pages for select
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: insert own"
  on public.pages for insert
  with check (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: update own"
  on public.pages for update
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: delete own"
  on public.pages for delete
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

-- game_sessions: users manage only their own sessions
create policy "game_sessions: select own"
  on public.game_sessions for select
  using (auth.uid() = user_id);

create policy "game_sessions: insert own"
  on public.game_sessions for insert
  with check (auth.uid() = user_id);

create policy "game_sessions: update own"
  on public.game_sessions for update
  using (auth.uid() = user_id);

create policy "game_sessions: delete own"
  on public.game_sessions for delete
  using (auth.uid() = user_id);

-- xp_events: users can read and insert their own events
create policy "xp_events: select own"
  on public.xp_events for select
  using (auth.uid() = user_id);

create policy "xp_events: insert own"
  on public.xp_events for insert
  with check (auth.uid() = user_id);

-- ── user_unlockables ─────────────────────────────────────────────────
create table if not exists public.user_unlockables (
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  unlockable_id text        not null,
  unlocked_at   timestamptz not null default now(),
  primary key (user_id, unlockable_id)
);

alter table public.user_unlockables enable row level security;

create policy "user_unlockables: select own"
  on public.user_unlockables for select
  using (auth.uid() = user_id);

create policy "user_unlockables: insert own"
  on public.user_unlockables for insert
  with check (auth.uid() = user_id);

-- ── tasks ────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  text        text        not null,
  completed   boolean     not null default false,
  due_date    date,
  created_at  timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks: select own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks: insert own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks: update own"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "tasks: delete own"
  on public.tasks for delete
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
--  Auto-create profile on signup
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.tasks (user_id, text) values
    (new.id, 'Create your first writing project'),
    (new.id, 'Launch a session in The Arena (Toggle Game Mode)'),
    (new.id, 'Write distraction-free in Focus Mode'),
    (new.id, 'Set a core manuscript page to Canonical'),
    (new.id, 'Customize your editor view settings');

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
