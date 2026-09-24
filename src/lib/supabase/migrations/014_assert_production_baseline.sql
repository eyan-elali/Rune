-- ── Migration 014: assert the production baseline (read-only checks) ─────────
--
-- Rune 2.0 Phase 0. The 2026-09-24 production catalog showed that several
-- load-bearing objects exist in production but in no tracked migration (they
-- were applied by hand in the SQL editor), and that some tracked files no
-- longer describe production. They are now part of the baseline
-- (src/lib/supabase/schema.sql).
--
-- This migration records that adoption as EXECUTABLE CHECKS instead of DDL.
-- It changes no schema object and no data. It only reads the catalog, and
-- aborts (rolling back) with a list of every mismatch if the database is not
-- the baseline Rune's code and upcoming Rune 2.0 migrations depend on. On
-- success it records itself in the ledger.
--
-- Why checks and not "reconciliation DDL": almost every production table
-- predates the numbered migrations, so re-creating them with guarded DDL would
-- duplicate schema.sql, and every guarded DDL statement run against production
-- is a chance to mutate it. Here, production can only pass or abort.
--
-- Rollback: nothing to roll back except its ledger row:
--   delete from public.schema_migrations where version = '014';
--
-- Requires 013. Apply as ONE script. Follow tools/db-audit/STAGING.md.

do $$
declare
  problems text[] := '{}';
  t text;
  n int;
  cfg text[];
  args text;
begin
  -- ── ledger ──
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 014 requires migration 013 (public.schema_migrations is missing). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '014') then
    raise exception 'Migration 014 has already been applied. Nothing was changed.';
  end if;

  -- ── RLS enabled on every Rune table ──
  foreach t in array array[
    'acquisition_attribution','analytics_events','analytics_excluded_users','chapters',
    'deleted_accounts','founder_notes','future_letters','game_sessions','game_tickets',
    'pages','profiles','project_notes','projects','subscription_events',
    'user_pricing_entitlements','user_unlockables','writing_goals','writing_sessions',
    'xp_events','schema_migrations']
  loop
    if to_regclass('public.' || t) is null then
      problems := problems || format('table public.%s is missing', t);
    elsif not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      problems := problems || format('RLS is not enabled on public.%s', t);
    end if;
  end loop;

  -- ── production-only columns the app depends on ──
  -- (table, column, format_type, not null, default or null)
  declare
    c record;
    got record;
  begin
    for c in
      select * from (values
        ('projects',        'is_pinned',    'boolean',  true,  'false'),
        ('projects',        'chapter_goal', 'integer',  false, null),
        ('writing_sessions','page_id',      'uuid',     false, null),
        ('game_sessions',   'meta',         'jsonb',    false, '''{}''::jsonb'),
        ('pages',           'is_canonical', 'boolean',  true,  'false'),
        ('pages',           'version',      'integer',  true,  '1'),
        ('pages',           'chapter_id',   'uuid',     true,  null),
        ('chapters',        'is_completed', 'boolean',  false, 'false'),
        ('subscription_events', 'stripe_event_id', 'text', true, null)
      ) v(tbl, col, typ, nn, def)
    loop
      select format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as nn,
             pg_get_expr(d.adbin, d.adrelid) as def
        into got
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = to_regclass('public.' || c.tbl) and a.attname = c.col
         and a.attnum > 0 and not a.attisdropped;
      if not found then
        problems := problems || format('column %s.%s is missing', c.tbl, c.col);
      elsif got.typ <> c.typ or got.nn <> c.nn or got.def is distinct from c.def then
        problems := problems || format('column %s.%s is %s%s default %s (expected %s%s default %s)',
          c.tbl, c.col, got.typ, case when got.nn then ' not null' else '' end, coalesce(got.def, 'none'),
          c.typ, case when c.nn then ' not null' else '' end, coalesce(c.def, 'none'));
      end if;
    end loop;
  end;

  if exists (select 1 from pg_attribute where attrelid = to_regclass('public.subscription_events')
             and attname = 'payload' and attnum > 0 and not attisdropped) then
    problems := problems || 'subscription_events.payload exists (production has no payload column)'::text;
  end if;

  -- ── foreign keys whose delete behavior matters for manuscript safety ──
  declare
    f record;
    got_del "char";
  begin
    for f in
      select * from (values
        ('writing_sessions_page_id_fkey', 'writing_sessions', 'pages'),
        ('pages_chapter_id_fkey',         'pages',            'chapters'),
        ('chapters_project_id_fkey',      'chapters',         'projects')
      ) v(name, tbl, ref)
    loop
      select confdeltype into got_del from pg_constraint
       where conname = f.name and conrelid = to_regclass('public.' || f.tbl)
         and contype = 'f' and confrelid = to_regclass('public.' || f.ref);
      if not found then
        problems := problems || format('foreign key %s (%s → %s) is missing', f.name, f.tbl, f.ref);
      elsif got_del <> 'c' then
        problems := problems || format('foreign key %s is not ON DELETE CASCADE (confdeltype %s)', f.name, got_del);
      end if;
    end loop;
  end;

  -- ── writing_sessions uniqueness: partial unique indexes, not migration 002's constraint ──
  foreach t in array array[
    'unique_user_page_date_idx', 'unique_user_project_date_null_page_idx',
    'writing_sessions_null_project_unique', 'writing_sessions_page_unique', 'writing_sessions_project_unique']
  loop
    if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'writing_sessions' and indexname = t) then
      problems := problems || format('index writing_sessions.%s is missing', t);
    end if;
  end loop;
  if exists (select 1 from pg_constraint where conrelid = to_regclass('public.writing_sessions') and contype = 'u') then
    problems := problems || 'writing_sessions has a table-level unique constraint (production has none)'::text;
  end if;

  -- ── triggers ──
  declare
    tr record;
  begin
    for tr in
      select * from (values
        ('public.pages',    'page_version_trigger',             'increment_page_version'),
        ('public.pages',    'trg_page_updated',                 'bump_project_updated_at'),
        ('public.pages',    'enforce_single_canonical',         'enforce_single_canonical_page'),
        ('public.profiles', 'profiles_protect_is_admin',        'protect_is_admin'),
        ('public.profiles', 'profiles_protect_billing_columns', 'protect_billing_columns'),
        ('auth.users',      'on_auth_user_created',             'handle_new_user')
      ) v(tbl, name, fn)
    loop
      select count(*) into n from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
       where tg.tgrelid = to_regclass(tr.tbl) and tg.tgname = tr.name and not tg.tgisinternal
         and p.proname = tr.fn and p.pronamespace = 'public'::regnamespace;
      if n <> 1 then
        problems := problems || format('trigger %s on %s → public.%s: found %s (expected 1)', tr.name, tr.tbl, tr.fn, n);
      end if;
    end loop;
  end;

  -- ── save-path RPC contracts: exactly one overload, frozen identity args, pinned search_path, INVOKER ──
  declare
    r record;
  begin
    for r in
      select * from (values
        ('save_page_checked',          'p_page_id uuid, p_content jsonb, p_word_count integer, p_expected_version integer'),
        ('insert_page_checked',        'p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer'),
        ('account_word_total',         'p_candidate_page_id uuid, p_candidate_word_count integer'),
        ('duplicate_project_checked',  'p_project_id uuid'),
        ('free_word_limit_for_caller', ''),
        ('lock_account_word_budget',   '')
      ) v(name, identity_args)
    loop
      select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = r.name;
      if n <> 1 then
        problems := problems || format('function %s has %s overloads (expected exactly 1)', r.name, n);
        continue;
      end if;
      select pg_get_function_identity_arguments(oid), proconfig into args, cfg
        from pg_proc where pronamespace = 'public'::regnamespace and proname = r.name;
      if args <> r.identity_args then
        problems := problems || format('function %s(%s) — expected (%s)', r.name, args, r.identity_args);
      end if;
      if cfg is null or not ('search_path=""' = any(cfg)) then
        problems := problems || format('function %s does not pin search_path='''' (config %s)', r.name, cfg);
      end if;
      if (select prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname = r.name) then
        problems := problems || format('function %s is SECURITY DEFINER (expected INVOKER — RLS is its ownership check)', r.name);
      end if;
    end loop;
  end;

  -- ── trigger functions whose bodies caused or prevent known incidents ──
  select proconfig into cfg from pg_proc where oid = to_regprocedure('public.bump_project_updated_at()');
  if cfg is null or not ('search_path=""' = any(cfg)) then
    problems := problems || 'bump_project_updated_at() does not pin search_path='''' (July 2026 incident fix, migration 012)'::text;
  end if;
  if to_regprocedure('public.handle_new_user()') is null then
    problems := problems || 'handle_new_user() is missing'::text;
  elsif (select prosrc from pg_proc where oid = to_regprocedure('public.handle_new_user()')) not like '%public.user_pricing_entitlements%' then
    problems := problems || 'handle_new_user() does not create pricing entitlements (migration 007 regression?)'::text;
  end if;

  -- ── documented absence: the app calls this RPC, production never had it ──
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'increment_writing_session') then
    problems := problems || 'increment_writing_session exists (the baseline records it as absent; recordWordsWritten falls back to a direct upsert)'::text;
  end if;

  -- ── manuscript RLS: the exact policy set Rune 2.0 ownership changes must account for ──
  declare
    pol record;
    have text;
  begin
    for pol in
      select * from (values
        ('projects', 'Users can manage their own projects,projects: delete own,projects: insert own,projects: select own,projects: update own'),
        ('chapters', 'Users can manage chapters of their projects,chapters: delete own,chapters: insert own,chapters: select own,chapters: update own'),
        ('pages',    'Users can manage pages in their chapters,pages: delete own,pages: insert own,pages: select own,pages: update own')
      ) v(tbl, names)
    loop
      select string_agg(policyname, ',' order by policyname collate "C") into have
        from pg_policies where schemaname = 'public' and tablename = pol.tbl;
      if have is distinct from pol.names then
        problems := problems || format('policies on %s are [%s], expected [%s]', pol.tbl, coalesce(have, ''), pol.names);
      end if;
    end loop;
  end;

  if array_length(problems, 1) is not null then
    raise exception E'Migration 014: this database does not match the 2026-09-24 production baseline. Nothing was changed.\n  - %',
      array_to_string(problems, E'\n  - ');
  end if;
end
$$;

insert into public.schema_migrations (version, name, applied_at, note) values
  ('014', '014_assert_production_baseline.sql', now(),
   'baseline assertions passed: production-only columns, FK cascades, writing_sessions indexes, triggers, save-path RPC contracts, manuscript RLS policy set');
