-- ═══════════════════════════════════════════════════════════════════════════
--  Minimal Supabase shim for PGlite (test-only — never run against a real DB)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Provides just enough of what Supabase gives every project for Rune's
-- schema.sql / migrations / RLS policies / RPCs to load and behave as they do
-- in production:
--
--   * roles:    anon, authenticated (both NOLOGIN), service_role (BYPASSRLS)
--   * schemas:  auth, extensions
--   * auth.users (only the columns handle_new_user() and FKs rely on)
--   * auth.uid() / auth.role() / auth.jwt(), reading the same request GUCs
--     PostgREST sets per request: request.jwt.claim.sub / .role and
--     request.jwt.claims (JSON). Tests impersonate a user with
--       set role authenticated;
--       select set_config('request.jwt.claim.sub', '<uuid>', false),
--              set_config('request.jwt.claim.role', 'authenticated', false);
--   * Supabase's default privileges: objects later created in `public` by the
--     loading role are granted to anon/authenticated/service_role, exactly as
--     on a hosted project, so RLS — not missing grants — is what tests exercise.
--
-- Load this FIRST, before any Rune SQL.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id                  uuid        primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt() ->> 'sub'
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  )
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Supabase default privileges for objects created in `public`.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
