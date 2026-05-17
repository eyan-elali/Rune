-- writing_goals: per-user goals (daily global or project total)
create table if not exists writing_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  type        text not null check (type in ('daily_global', 'project_total')),
  target_words integer not null,
  created_at  timestamptz not null default now()
);

alter table writing_goals enable row level security;

create policy "Users manage own goals"
  on writing_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- writing_sessions: tracks words added per day per project (all writing, not just games)
create table if not exists writing_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  project_id   uuid references projects(id) on delete cascade,
  words_added  integer not null default 0,
  session_date date not null default current_date,
  created_at   timestamptz not null default now(),
  unique(user_id, project_id, session_date)
);

alter table writing_sessions enable row level security;

create policy "Users manage own writing sessions"
  on writing_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
