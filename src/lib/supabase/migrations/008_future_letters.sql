-- Private letters writers leave for themselves during onboarding, tied to
-- the project created in the same request. Not shown anywhere in the
-- product yet — resurfacing UI/notifications are a future phase.
create table if not exists public.future_letters (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  project_id   uuid        not null references public.projects (id) on delete cascade,
  content      text        not null,
  created_at   timestamptz not null default now(),
  reveal_at    timestamptz not null default (now() + interval '1 year'),
  revealed_at  timestamptz
);

alter table public.future_letters enable row level security;

create policy "future_letters: select own"
  on public.future_letters for select
  using (auth.uid() = user_id);

create policy "future_letters: insert own"
  on public.future_letters for insert
  with check (auth.uid() = user_id);

create policy "future_letters: update own"
  on public.future_letters for update
  using (auth.uid() = user_id);

create policy "future_letters: delete own"
  on public.future_letters for delete
  using (auth.uid() = user_id);
