-- ═══════════════════════════════════════════════════════════════════════════
--  Rune — production catalog capture (READ-ONLY)            Phase 0, Commit B
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Purpose: capture the STRUCTURE of the production database (tables, columns,
--  constraints, indexes, RLS, policies, triggers, functions, grants, views,
--  extensions, cron/webhook presence) plus row counts and a few anonymous
--  integrity counts, so the repository's migrations and schema.sql can be
--  reconciled with what production actually runs. See README.md next to this
--  file for the exact procedure.
--
--  Safety properties:
--   * The first statement makes the rest of this script a READ-ONLY
--     transaction. Any write attempted in the same script fails with
--     "cannot execute ... in a read-only transaction". The `meta` row in the
--     output reports `transaction_read_only`, so you can confirm it was on.
--   * Everything after that is ONE SELECT. It creates, alters, and writes
--     nothing — no temp objects, no functions, no settings.
--   * The only dynamic SQL runs through query_to_xml(), and it is limited to
--     count(*) queries and anonymous aggregate counts written in this file.
--   * No row content is returned: no manuscript text, titles, emails, names,
--     letters, notes, analytics metadata, or user ids. Integrity checks return
--     only numbers.
--   * Secrets are redacted where catalog objects can hold them: function
--     bodies that look like HTTP/webhook/credential code, trigger arguments
--     (database webhooks store URLs/headers there), cron job commands, and
--     role settings (only a whitelist of PostgREST/timeout keys is returned).
--
--  Output: one row per section — (ord, section, item_count, payload jsonb).
--  Written for PostgreSQL 15+ (Supabase).
-- ═══════════════════════════════════════════════════════════════════════════

set transaction read only;

with
-- ── helpers ─────────────────────────────────────────────────────────────────
-- Functions installed by extensions (pgcrypto, uuid-ossp, …) are excluded from
-- the function listing: they are not Rune's schema and only add noise.
ext_funcs as (
  select d.objid as oid
  from pg_depend d
  where d.classid = 'pg_proc'::regclass
    and d.refclassid = 'pg_extension'::regclass
    and d.deptype = 'e'
),
pub_rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         c.reltuples, pg_get_userbyid(c.relowner) as owner
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
pub_cols as (
  select table_name || '.' || column_name as tc
  from information_schema.columns
  where table_schema = 'public'
),

-- ── 00 meta ──────────────────────────────────────────────────────────────────
s_meta as (
  select jsonb_build_object(
    'captured_at', now(),
    'server_version', current_setting('server_version'),
    'server_version_num', current_setting('server_version_num')::int,
    'database', current_database(),
    'current_user', current_user,
    'transaction_read_only', current_setting('transaction_read_only'),
    'catalog_sql_version', 'phase1-t2-1'
  ) as payload, 1 as n
),

-- ── 01 schemas ───────────────────────────────────────────────────────────────
s_schemas as (
  select jsonb_agg(jsonb_build_object(
           'schema', n.nspname,
           'owner', pg_get_userbyid(n.nspowner),
           'anon_usage', has_schema_privilege('anon', n.oid, 'USAGE'),
           'authenticated_usage', has_schema_privilege('authenticated', n.oid, 'USAGE')
         ) order by n.nspname) as payload,
         count(*) as n
  from pg_namespace n
  where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema'
),

-- ── 02 extensions ────────────────────────────────────────────────────────────
s_extensions as (
  select jsonb_agg(jsonb_build_object(
           'name', e.extname, 'version', e.extversion, 'schema', e.extnamespace::regnamespace::text
         ) order by e.extname) as payload,
         count(*) as n
  from pg_extension e
),

-- ── 03 relations (tables/views) with RLS flags ───────────────────────────────
s_relations as (
  select jsonb_agg(jsonb_build_object(
           'table', r.relname,
           'kind', case r.relkind when 'r' then 'table' when 'p' then 'partitioned'
                                  when 'v' then 'view' when 'm' then 'matview' else 'foreign' end,
           'rls_enabled', r.relrowsecurity,
           'rls_forced', r.relforcerowsecurity,
           'owner', r.owner,
           'reltuples_estimate', r.reltuples
         ) order by r.relname) as payload,
         count(*) as n
  from pub_rel r
),

-- ── 04 columns ───────────────────────────────────────────────────────────────
s_columns as (
  select jsonb_agg(jsonb_build_object(
           'table', c.relname,
           'ord', a.attnum,
           'column', a.attname,
           'type', format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'default', pg_get_expr(ad.adbin, ad.adrelid),
           'identity', nullif(a.attidentity, ''),
           'generated', nullif(a.attgenerated, '')
         ) order by c.relname, a.attnum) as payload,
         count(*) as n
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.attnum > 0 and not a.attisdropped
),

-- ── 05 constraints (pk / unique / fk / check / exclusion) ────────────────────
s_constraints as (
  select jsonb_agg(jsonb_build_object(
           'table', c.relname,
           'name', con.conname,
           'type', case con.contype when 'p' then 'primary_key' when 'u' then 'unique'
                                    when 'f' then 'foreign_key' when 'c' then 'check'
                                    when 'x' then 'exclusion' else con.contype::text end,
           'definition', pg_get_constraintdef(con.oid, true),
           'references', case when con.contype = 'f'
                              then con.confrelid::regclass::text end,
           'on_delete', case when con.contype = 'f' then
                          case con.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
                                               when 'c' then 'cascade' when 'n' then 'set null'
                                               when 'd' then 'set default' end end,
           'on_update', case when con.contype = 'f' then
                          case con.confupdtype when 'a' then 'no action' when 'r' then 'restrict'
                                               when 'c' then 'cascade' when 'n' then 'set null'
                                               when 'd' then 'set default' end end,
           'deferrable', con.condeferrable,
           'validated', con.convalidated
         ) order by c.relname, con.conname) as payload,
         count(*) as n
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relnamespace = 'public'::regnamespace
),

-- ── 06 indexes ───────────────────────────────────────────────────────────────
s_indexes as (
  select jsonb_agg(jsonb_build_object(
           'table', t.relname,
           'name', i.relname,
           'definition', pg_get_indexdef(ix.indexrelid),
           'unique', ix.indisunique,
           'primary', ix.indisprimary,
           'valid', ix.indisvalid
         ) order by t.relname, i.relname) as payload,
         count(*) as n
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  where t.relnamespace = 'public'::regnamespace
),

-- ── 07 RLS policies ──────────────────────────────────────────────────────────
s_policies as (
  select jsonb_agg(jsonb_build_object(
           'table', p.tablename,
           'name', p.policyname,
           'permissive', p.permissive,
           'roles', p.roles,
           'command', p.cmd,
           'using', p.qual,
           'with_check', p.with_check
         ) order by p.tablename, p.policyname) as payload,
         count(*) as n
  from pg_policies p
  where p.schemaname = 'public'
),

-- ── 08 triggers (public tables + auth.users), non-internal ───────────────────
-- Trigger ARGUMENTS can hold webhook URLs and auth headers (Supabase database
-- webhooks are triggers calling supabase_functions.http_request(url, headers,
-- …)). The full definition is only returned for triggers with no arguments;
-- otherwise the argument count is reported and the definition withheld.
s_triggers as (
  select jsonb_agg(jsonb_build_object(
           'table', t.tgrelid::regclass::text,
           'name', t.tgname,
           'enabled', t.tgenabled,
           'function', p.pronamespace::regnamespace::text || '.' || p.proname,
           'nargs', t.tgnargs,
           'definition', case when t.tgnargs = 0 then pg_get_triggerdef(t.oid, true) end,
           'definition_redacted', t.tgnargs > 0
         ) order by t.tgrelid::regclass::text, t.tgname) as payload,
         count(*) as n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and (c.relnamespace = 'public'::regnamespace
         or t.tgrelid = to_regclass('auth.users'))
),

-- ── 09 functions in public (excluding extension-owned) ──────────────────────
-- Bodies that look like they could embed credentials or outbound HTTP calls
-- are withheld (md5 + length only) — share those separately after review.
pub_funcs as (
  select p.*,
         (p.prosrc ~* '(net\.http_|http_request|bearer|apikey|api_key|service_role_key|secret|password|authorization)') as looks_sensitive
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.oid not in (select oid from ext_funcs)
),
s_functions as (
  select jsonb_agg(jsonb_build_object(
           'name', f.proname,
           'identity_args', pg_get_function_identity_arguments(f.oid),
           'result', pg_get_function_result(f.oid),
           'kind', f.prokind,
           'language', l.lanname,
           'security_definer', f.prosecdef,
           'volatility', f.provolatile,
           'config', f.proconfig,
           'owner', pg_get_userbyid(f.proowner),
           'acl', f.proacl::text,
           'acl_is_default', f.proacl is null,
           'body_md5', md5(f.prosrc),
           'body_length', length(f.prosrc),
           'definition_redacted', f.looks_sensitive,
           'definition', case when f.prokind in ('f', 'p') and not f.looks_sensitive
                              then pg_get_functiondef(f.oid) end
         ) order by f.proname, pg_get_function_identity_arguments(f.oid)) as payload,
         count(*) as n
  from pub_funcs f
  join pg_language l on l.oid = f.prolang
),

-- ── 10 overloads ─────────────────────────────────────────────────────────────
s_overloads as (
  select coalesce(jsonb_agg(jsonb_build_object('name', o.proname, 'count', o.cnt, 'signatures', o.sigs)
                            order by o.proname), '[]'::jsonb) as payload,
         count(*) as n
  from (
    select f.proname, count(*) as cnt,
           jsonb_agg(pg_get_function_identity_arguments(f.oid)) as sigs
    from pub_funcs f
    group by f.proname
    having count(*) > 1
  ) o
),

-- ── 11 function EXECUTE grants (explicit ACL entries) ────────────────────────
-- A null ACL means Postgres defaults (EXECUTE granted to PUBLIC); those are
-- flagged by acl_is_default in section 09.
s_function_grants as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'function', g.proname || '(' || g.args || ')',
           'grantee', g.grantee,
           'privilege', g.privilege_type
         ) order by g.proname, g.args, g.grantee), '[]'::jsonb) as payload,
         count(*) as n
  from (
    select f.proname, pg_get_function_identity_arguments(f.oid) as args,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
           a.privilege_type
    from pub_funcs f
    cross join lateral aclexplode(f.proacl) a
  ) g
),

-- ── 12 table grants for API roles ────────────────────────────────────────────
s_table_grants as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege_type
         ) order by g.table_name, g.grantee, g.privilege_type), '[]'::jsonb) as payload,
         count(*) as n
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
),

-- ── 13 views / materialized views ────────────────────────────────────────────
s_views as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', r.relname, 'kind', r.relkind, 'definition', pg_get_viewdef(r.oid, true)
         ) order by r.relname), '[]'::jsonb) as payload,
         count(*) as n
  from pub_rel r
  where r.relkind in ('v', 'm')
),

-- ── 14 sequences (count only — Rune uses uuid keys) ──────────────────────────
s_sequences as (
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) as payload,
         count(*) as n
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
),

-- ── 15 realtime publications touching public tables ──────────────────────────
s_publications as (
  select coalesce(jsonb_agg(jsonb_build_object('publication', pt.pubname, 'table', pt.tablename)
                            order by pt.pubname, pt.tablename), '[]'::jsonb) as payload,
         count(*) as n
  from pg_publication_tables pt
  where pt.schemaname = 'public'
),

-- ── 16 roles (names + security-relevant flags only) ──────────────────────────
s_roles as (
  select jsonb_agg(jsonb_build_object(
           'role', r.rolname, 'can_login', r.rolcanlogin,
           'superuser', r.rolsuper, 'bypass_rls', r.rolbypassrls
         ) order by r.rolname) as payload,
         count(*) as n
  from pg_roles r
  where r.rolname not like 'pg\_%'
),

-- ── 17 role settings (whitelisted keys only — never secrets) ─────────────────
s_role_settings as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'role', coalesce(pg_get_userbyid(s.setrole), '(all roles)'),
           'setting', kv.setting
         ) order by s.setrole, kv.setting), '[]'::jsonb) as payload,
         count(*) as n
  from pg_db_role_setting s
  cross join lateral unnest(s.setconfig) as kv(setting)
  where (s.setdatabase = 0 or s.setdatabase = (select oid from pg_database where datname = current_database()))
    and kv.setting ~* '^(pgrst\.db_(max_rows|schemas|extra_search_path|pre_request)|statement_timeout|search_path|default_transaction_read_only)='
),

-- ── 18 event triggers (database-wide) ─────────────────────────────────────────
-- Supabase installs several of its own; Rune-relevant ones call a function in
-- `public` (e.g. the platform's rls_auto_enable). Added in catalog version
-- phase0-d-1 — earlier snapshots do not have this section.
s_event_triggers as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', e.evtname,
           'event', e.evtevent,
           'function', p.pronamespace::regnamespace::text || '.' || p.proname,
           'enabled', e.evtenabled,
           'tags', e.evttags,
           'owner', pg_get_userbyid(e.evtowner)
         ) order by e.evtname), '[]'::jsonb) as payload,
         count(*) as n
  from pg_event_trigger e
  join pg_proc p on p.oid = e.evtfoid
),

-- ── dynamic probes (row counts, cron/webhook presence, integrity counts) ─────
-- Each probe is a query written in THIS file that returns a single column `j`
-- (base64-encoded JSON, so any value survives the XML round trip). A probe
-- only runs if every table.column it needs exists, so a missing column skips
-- the probe instead of aborting the capture.
probes(section, key, requires, sql) as (
  -- exact row counts for every public base table
  select 'row_counts', r.relname, array[]::text[],
         format('select encode(convert_to(count(*)::text, ''UTF8''), ''base64'') as j from public.%I', r.relname)
  from pub_rel r where r.relkind in ('r', 'p')

  union all
  -- cron jobs: schedule + command fingerprint only (commands can hold secrets)
  select 'cron_jobs', 'jobs', array[]::text[],
         $q$select encode(convert_to(coalesce(jsonb_agg(jsonb_build_object(
              'jobname', jobname, 'schedule', schedule, 'active', active,
              'database', database, 'username', username,
              'command_md5', md5(command), 'command_length', length(command),
              'mentions_public_tables', command ~* '(projects|chapters|pages|writing_sessions|profiles)'
            )), '[]'::jsonb)::text, 'UTF8'), 'base64') as j from cron.job$q$
  where to_regclass('cron.job') is not null

  union all
  -- database webhooks registry (count only; definitions appear, redacted, as triggers)
  select 'webhooks', 'supabase_functions_hooks', array[]::text[],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from supabase_functions.hooks$q$
  where to_regclass('supabase_functions.hooks') is not null

  union all
  -- ── anonymous integrity counts (numbers only; no ids, no content) ──
  select 'integrity', 'chapters_with_canonical_page', array['pages.is_canonical'],
         $q$select encode(convert_to(count(distinct chapter_id)::text, 'UTF8'), 'base64') as j
            from public.pages where is_canonical$q$
  union all
  select 'integrity', 'chapters_with_multiple_canonical_pages', array['pages.is_canonical'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from (
              select chapter_id from public.pages where is_canonical
              group by chapter_id having count(*) > 1) x$q$
  union all
  select 'integrity', 'noncanonical_pages_in_canonical_chapters', array['pages.is_canonical'],
         $q$select encode(convert_to(jsonb_build_object(
              'pages', count(*), 'words', coalesce(sum(p.word_count), 0))::text, 'UTF8'), 'base64') as j
            from public.pages p
            where not p.is_canonical
              and exists (select 1 from public.pages c where c.chapter_id = p.chapter_id and c.is_canonical)$q$
  union all
  select 'integrity', 'canonical_pages_with_zero_words_whose_siblings_have_words', array['pages.is_canonical'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j
            from public.pages c
            where c.is_canonical and c.word_count = 0
              and exists (select 1 from public.pages s where s.chapter_id = c.chapter_id
                          and not s.is_canonical and s.word_count > 0)$q$
  union all
  select 'integrity', 'chapters_without_pages', array['pages.chapter_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j
            from public.chapters c where not exists (select 1 from public.pages p where p.chapter_id = c.id)$q$
  union all
  select 'integrity', 'projects_without_chapters', array['chapters.project_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j
            from public.projects pr where not exists (select 1 from public.chapters c where c.project_id = pr.id)$q$
  union all
  select 'integrity', 'max_pages_per_chapter', array['pages.chapter_id'],
         $q$select encode(convert_to(coalesce(max(n), 0)::text, 'UTF8'), 'base64') as j
            from (select count(*) as n from public.pages group by chapter_id) x$q$
  union all
  select 'integrity', 'max_pages_per_project', array['pages.chapter_id', 'chapters.project_id'],
         $q$select encode(convert_to(coalesce(max(n), 0)::text, 'UTF8'), 'base64') as j
            from (select count(*) as n from public.pages p join public.chapters c on c.id = p.chapter_id
                  group by c.project_id) x$q$
  union all
  select 'integrity', 'max_chapters_per_project', array['chapters.project_id'],
         $q$select encode(convert_to(coalesce(max(n), 0)::text, 'UTF8'), 'base64') as j
            from (select count(*) as n from public.chapters group by project_id) x$q$
  union all
  select 'integrity', 'chapter_position_tie_groups', array['chapters.project_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from (
              select 1 from public.chapters group by project_id, position having count(*) > 1) x$q$
  union all
  select 'integrity', 'page_position_tie_groups', array['pages.chapter_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from (
              select 1 from public.pages group by chapter_id, position having count(*) > 1) x$q$
  union all
  select 'integrity', 'pages_null_content', array['pages.content'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from public.pages where content is null$q$
  union all
  select 'integrity', 'pages_zero_words', array['pages.word_count'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from public.pages where word_count = 0$q$
  union all
  select 'integrity', 'projects_stored_word_count_mismatch', array['pages.is_canonical', 'chapters.project_id'],
         -- projects.word_count vs the canonical-aware total recalculateProjectWordCount computes
         $q$select encode(convert_to(jsonb_build_object(
              'mismatched_projects', count(*) filter (where pr.word_count <> coalesce(t.total, 0)),
              'projects', count(*))::text, 'UTF8'), 'base64') as j
            from public.projects pr
            left join (
              select c.project_id, sum(case when exists (select 1 from public.pages k
                                                           where k.chapter_id = c.id and k.is_canonical)
                                            then (select coalesce(sum(k.word_count), 0) from public.pages k
                                                  where k.chapter_id = c.id and k.is_canonical)
                                            else (select coalesce(sum(k.word_count), 0) from public.pages k
                                                  where k.chapter_id = c.id) end) as total
              from public.chapters c group by c.project_id
            ) t on t.project_id = pr.id$q$
  union all
  select 'integrity', 'writing_sessions_page_id_usage', array['writing_sessions.page_id', 'pages.id'],
         $q$select encode(convert_to(jsonb_build_object(
              'rows_with_page_id', count(*) filter (where ws.page_id is not null),
              'rows_without_page_id', count(*) filter (where ws.page_id is null),
              'rows_whose_page_no_longer_exists', count(*) filter (
                 where ws.page_id is not null
                   and not exists (select 1 from public.pages p where p.id = ws.page_id))
            )::text, 'UTF8'), 'base64') as j
            from public.writing_sessions ws$q$
  union all
  -- ── Rune 2.0 manuscript (migration 015+); skipped on a Rune 1.x database ──
  select 'integrity', 'projects_without_manuscript', array['manuscripts.project_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j
            from public.projects pr where not exists (select 1 from public.manuscripts m where m.project_id = pr.id)$q$
  union all
  select 'integrity', 'scenes_placement', array['scenes.chapter_id'],
         $q$select encode(convert_to(jsonb_build_object(
              'placed', count(*) filter (where chapter_id is not null),
              'unplaced', count(*) filter (where chapter_id is null))::text, 'UTF8'), 'base64') as j
            from public.scenes$q$
  union all
  select 'integrity', 'scene_position_tie_groups', array['scenes.chapter_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from (
              select 1 from public.scenes where chapter_id is not null
              group by chapter_id, position having count(*) > 1) x$q$
  union all
  select 'integrity', 'writing_sessions_multi_rows_per_user_project_day', array[]::text[],
         -- >0 means the migration-002 unique(user_id, project_id, session_date) is not in force
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j from (
              select 1 from public.writing_sessions
              group by user_id, project_id, session_date having count(*) > 1) x$q$
  union all
  select 'integrity', 'users_with_same_title_projects_created_within_10_min', array[]::text[],
         -- sizing signal for duplicate onboarding submissions; counts only
         $q$select encode(convert_to(count(distinct a.user_id)::text, 'UTF8'), 'base64') as j
            from public.projects a join public.projects b
              on b.user_id = a.user_id and b.id <> a.id and b.title = a.title
             and b.created_at between a.created_at and a.created_at + interval '10 minutes'$q$
  union all
  select 'integrity', 'profiles_without_pricing_entitlement', array['user_pricing_entitlements.user_id'],
         $q$select encode(convert_to(count(*)::text, 'UTF8'), 'base64') as j
            from public.profiles p
            where not exists (select 1 from public.user_pricing_entitlements e where e.user_id = p.id)$q$
),
probe_results as (
  select p.section, p.key,
         case when not exists (select 1 from unnest(p.requires) r(tc) where r.tc not in (select tc from pub_cols))
              then convert_from(decode(
                     (xpath('/row/j/text()', query_to_xml(p.sql, false, true, '')))[1]::text,
                     'base64'), 'UTF8')::jsonb
         end as value,
         exists (select 1 from unnest(p.requires) r(tc) where r.tc not in (select tc from pub_cols)) as skipped
  from probes p
),
s_probes as (
  select section,
         jsonb_object_agg(key, case when skipped then '"skipped: required column missing"'::jsonb else value end) as payload,
         count(*) as n
  from probe_results
  group by section
)

-- ── output ───────────────────────────────────────────────────────────────────
select ord, section, item_count, payload
from (
            select  0 as ord, 'meta'            as section, n as item_count, payload from s_meta
  union all select  1, 'schemas',          n, payload from s_schemas
  union all select  2, 'extensions',       n, payload from s_extensions
  union all select  3, 'relations',        n, payload from s_relations
  union all select  4, 'columns',          n, payload from s_columns
  union all select  5, 'constraints',      n, payload from s_constraints
  union all select  6, 'indexes',          n, payload from s_indexes
  union all select  7, 'policies',         n, payload from s_policies
  union all select  8, 'triggers',         n, payload from s_triggers
  union all select  9, 'functions',        n, payload from s_functions
  union all select 10, 'overloads',        n, payload from s_overloads
  union all select 11, 'function_grants',  n, payload from s_function_grants
  union all select 12, 'table_grants',     n, payload from s_table_grants
  union all select 13, 'views',            n, payload from s_views
  union all select 14, 'sequences',        n, payload from s_sequences
  union all select 15, 'publications',     n, payload from s_publications
  union all select 16, 'roles',            n, payload from s_roles
  union all select 17, 'role_settings',    n, payload from s_role_settings
  union all select 18, 'event_triggers',   n, payload from s_event_triggers
  union all select 20 + row_number() over (order by section), section, n, payload from s_probes
) out
order by ord;
