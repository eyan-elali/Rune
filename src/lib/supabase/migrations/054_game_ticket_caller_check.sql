-- ── Migration 054: increment_game_ticket spends the caller's ticket only ─────
--
-- Rune 2.0, pre-beta security audit (sections G + H: RLS and RPC). The one
-- defect the adversarial audit found in the database:
--
-- public.increment_game_ticket(p_user_id, p_week_start) — the legacy Arena
--   ticket counter (migration 005) — was SECURITY DEFINER with NO check that
--   p_user_id is the caller, NO pinned search_path, and EXECUTE granted to
--   PUBLIC (so to anon as well). Any client holding only the public anon key
--   could therefore, for ANY account: spend that writer's weekly Arena
--   tickets (tickets_used + 1 per call, unbounded) and create game_tickets
--   rows for them for any week. RLS did not apply (SECURITY DEFINER), and no
--   row of the victim was ever readable — the harm was denial of the legacy
--   Arena allowance and planted rows, not disclosure. The Rune 2.0 app on
--   this branch does not call the function; Rune 1.x clients call it with
--   the signed-in writer's own id, which keeps working.
--
-- public.increment_game_ticket — REDEFINED, same signature and result
--   (void). search_path pinned to ''. A signed-in writer may spend only their
--   own ticket (p_user_id = auth.uid()); the server (service_role) may spend
--   anyone's, as before; anything else raises 42501 and writes nothing.
--   EXECUTE revoked from PUBLIC and anon; granted to authenticated and
--   service_role.
--
-- public.touch_pricing_entitlement_updated_at() — search_path pinned to ''
--   (hygiene: the one remaining function in public without a pinned path; a
--   trigger on a table no client can write, so not exploitable, but every
--   function in public now pins its path and the audit test holds the line).
--
-- Proven by tools/sync-harness/tests/security-rpc.test.mjs (fails before
-- this migration, passes after) and tests/security-rls.test.mjs.
--
-- Apply any time; no app change is needed. Must be applied by the owner of
-- public.game_tickets (the postgres role).
-- Rollback (restores the vulnerable 005 definition — not recommended):
--   create or replace function public.increment_game_ticket(p_user_id uuid, p_week_start date) returns void
--     language plpgsql security definer as $$ begin
--       insert into public.game_tickets (user_id, week_start, tickets_used) values (p_user_id, p_week_start, 1)
--       on conflict (user_id, week_start) do update set tickets_used = game_tickets.tickets_used + 1; end $$;
--   grant execute on function public.increment_game_ticket(uuid, date) to public;
--   alter function public.touch_pricing_entitlement_updated_at() reset search_path;
--   delete from public.schema_migrations where version = '054';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 054 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '054') then
    raise exception 'Migration 054 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '053') then
    raise exception 'Migration 054 requires migration 053 (profile invariant). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'game_tickets') <> current_user then
    raise exception 'Migration 054 must be applied by the owner of public.game_tickets (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'game_tickets'), current_user;
  end if;
end $$;

-- ── The caller's ticket only ────────────────────────────────────────────────

create or replace function public.increment_game_ticket(p_user_id uuid, p_week_start date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS. The server
  -- (service_role) may spend any writer's ticket; a writer only their own.
  if p_user_id is null
     or (auth.role() is distinct from 'service_role' and (auth.uid() is null or p_user_id <> auth.uid())) then
    raise exception 'A writer can spend only their own game tickets' using errcode = '42501';
  end if;

  insert into public.game_tickets (user_id, week_start, tickets_used)
  values (p_user_id, p_week_start, 1)
  on conflict (user_id, week_start)
  do update set tickets_used = game_tickets.tickets_used + 1;
end;
$function$;

revoke all on function public.increment_game_ticket(uuid, date) from public, anon;
grant execute on function public.increment_game_ticket(uuid, date) to authenticated, service_role;

-- ── Hygiene: every function in public pins its search_path ─────────────────

alter function public.touch_pricing_entitlement_updated_at() set search_path = '';

insert into public.schema_migrations (version, name, applied_at, note)
values ('054', '054_game_ticket_caller_check.sql', now(), 'Security audit: increment_game_ticket (same signature) spends only the caller''s own ticket (service_role any), search_path pinned, EXECUTE revoked from public/anon — before this any anon client could spend any writer''s legacy Arena tickets; touch_pricing_entitlement_updated_at search_path pinned');
