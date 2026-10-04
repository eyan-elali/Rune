-- ── Migration 029: Project Search ───────────────────────────────────────────
--
-- Rune 2.0 Workspace, Milestone 12. Search is a Project-level service, not a
-- content object (architecture §29): it reads what the writer has written and
-- never changes it. Titles are matched in the app, from the Project's
-- structure it has already loaded; this adds the one thing the app cannot do
-- without reading every piece of prose — finding text INSIDE Scenes, Pages
-- and Entries.
--
-- public.rich_text_plain(doc jsonb) → text — NEW. The human-readable text of
-- a stored rich-text document (TipTap JSON): the text of every text node
-- (type "text"), in document order, joined by a space and with whitespace collapsed, so a phrase that
-- runs across a mark ("she was *never* going") reads as written and two
-- paragraphs never run together. Keys, attributes, marks and node types are
-- never text. IMMUTABLE; derived on read, never stored.
--
-- public.search_project_content(project uuid, query text, limit int) — NEW.
-- Every Scene (placed or Unplaced), Workspace Page and Collection Entry of
-- the Project whose text contains the query (ignoring case, as typed —
-- no operators, no stemming), with a short excerpt around the first match:
--   → jsonb [{ type: 'scene' | 'page' | 'entry', id, snippet }, …]
-- SECURITY INVOKER: it reads through the caller's own Row Level Security,
-- and additionally returns nothing unless the caller owns the Project — no
-- other writer's and no other Project's text is ever read. A query shorter
-- than two characters returns nothing; at most `limit` rows (1–200).
--
-- No table, column, index, trigger or policy is added or changed, no row is
-- written, and no second copy of any prose is kept: the excerpt is computed
-- per request. Nothing here touches a Scene's content, version or words, the
-- save path, or any manuscript function.
--
-- Scale: each search reads the Project's rich text once. That is fine for
-- a beta novel and its notes; if it stops being fine, a derived, trigger-kept
-- search column or a trigram index can replace the inner read without
-- changing this function's contract.
--
-- For the Rune 2.0 database only: it requires 028. Apply BEFORE or AFTER the
-- app deploy that uses it: without it, Project Search finds titles only.
-- Rollback:
--   drop function public.search_project_content(uuid, text, integer);
--   drop function public.rich_text_plain(jsonb);
--   delete from public.schema_migrations where version = '029';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 029 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '029') then
    raise exception 'Migration 029 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '028') then
    raise exception 'Migration 029 requires migration 028 (references). Nothing was changed.';
  end if;
end
$$;

create or replace function public.rich_text_plain(p_doc jsonb)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  select coalesce(btrim(regexp_replace(string_agg(t #>> '{}', ' ' order by n), '\s+', ' ', 'g')), '')
    from jsonb_path_query(coalesce(p_doc, '{}'::jsonb), 'strict $.** ? (@.type == "text").text ? (@.type() == "string")')
         with ordinality as x(t, n);
$function$;

create or replace function public.search_project_content(p_project_id uuid, p_query text, p_limit integer default 100)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with q as (
    select lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))) as q
  ),
  owned as (
    select p.id from public.projects p where p.id = p_project_id and p.user_id = auth.uid()
  ),
  texts as (
    select 'scene'::text as object_type, s.id as object_id, public.rich_text_plain(s.content) as body, 0 as kind_rank
      from public.scenes s
      join public.manuscripts m on m.id = s.manuscript_id
      join owned o on o.id = m.project_id
    union all
    select 'page', d.id, public.rich_text_plain(d.content), 1
      from public.workspace_documents d
      join owned o on o.id = d.project_id
    union all
    select 'entry', e.id, public.rich_text_plain(e.content), 2
      from public.workspace_collection_entries e
      join owned o on o.id = e.project_id
  ),
  found as (
    select t.object_type, t.object_id, t.body, t.kind_rank, strpos(lower(t.body), q.q) as at, length(q.q) as len
      from texts t, q
     where length(q.q) >= 2
       and strpos(lower(t.body), q.q) > 0
  ),
  windowed as (
    select f.*, greatest(f.at - 60, 1) as w_from, least(f.at + f.len + 80, length(f.body) + 1) as w_to
      from found f
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', r.object_type, 'id', r.object_id, 'snippet', r.snippet)
                            order by r.kind_rank, r.object_id), '[]'::jsonb)
    from (
      select w.object_type,
             w.object_id,
             w.kind_rank,
             -- An excerpt around the first match, trimmed to whole words, with
             -- an ellipsis where the text goes on.
             case when w.w_from > 1 then '…' else '' end
               || btrim(regexp_replace(regexp_replace(substr(w.body, w.w_from, w.w_to - w.w_from),
                    case when w.w_from > 1 then '^\S*\s' else '^' end, ''),
                    case when w.w_to <= length(w.body) then '\s\S*$' else '$' end, ''))
               || case when w.w_to <= length(w.body) then '…' else '' end as snippet
        from windowed w
       order by w.kind_rank, w.object_id
       limit greatest(1, least(coalesce(p_limit, 100), 200))
    ) r;
$function$;

revoke execute on function public.rich_text_plain(jsonb) from public, anon;
revoke execute on function public.search_project_content(uuid, text, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('029', '029_project_search.sql', now(), 'Project Search: search_project_content (text inside the Project''s Scenes, Pages and Entries, with an excerpt; SECURITY INVOKER, owner-only, read-only) over rich_text_plain (the readable text of a rich-text document, derived on read, never stored); no table, row, policy or manuscript function changes');
