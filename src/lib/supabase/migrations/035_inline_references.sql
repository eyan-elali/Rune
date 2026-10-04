-- ── Migration 035: Inline references in Workspace rich text ─────────────────
--
-- Rune 2.0, Milestone 16 (Connected Workspace Pages). A Workspace Page or a
-- Collection Entry body may now point at the story from inside its text —
-- "Nerai first appears in @Chapter 4" — as an inline reference node in its
-- TipTap JSON:
--
--   { "type": "reference",
--     "attrs": { "targetType": "entry" | "page" | "scene" | "chapter",
--                "targetId": "<canonical uuid>", "label": "<title when inserted>" } }
--
-- The document is the only record of what it mentions. Each mention is ALSO a
-- row of object_references, so the one backlink system (028) shows it under
-- "Referenced by" — but that row is DERIVED: this migration's trigger
-- recomputes a document's inline rows from its content on every content
-- write (the same UPDATE, the same transaction), whichever client, device or
-- queued offline save made it. Nothing else can write an inline row; nothing
-- maintains a backlink by hand; plain text is never read for references.
--
-- public.object_references — CHANGED:
--   * origin: 'link' (every existing row — a Relationship value or an
--     Inspector link, written by the 028/032 functions) or 'inline' (derived
--     from a Page's or Entry's content by the trigger below). An inline row is
--     never a Relationship value. The once-key includes origin, so a Page may
--     both link to Nerai from the Inspector and mention her in its text.
--   * target_chapter_id + target_type 'chapter': a Chapter can be a target
--     (a real FK, ON DELETE CASCADE — a Chapter is removed only by
--     delete_chapter, which keeps its Scenes). Only inline references point
--     at Chapters today; add_object_reference and every Relationship still
--     take Entries, Pages and Scenes only. A Chapter is never a source.
--   * reference_object_project, workspace_object_active, check_object_reference,
--     guard_workspace_trash and the select policy learn the Chapter end.
--   * add_object_reference / remove_object_reference see only 'link' rows: an
--     inline row is never "the same link", never removed from the Inspector.
--
-- The trigger (sync_workspace_inline_references, SECURITY DEFINER; clients
-- still cannot write object_references), AFTER INSERT and AFTER UPDATE OF
-- content on workspace_documents and workspace_collection_entries:
--   * reads every node of type "reference" with a known targetType and a
--     well-formed targetId, in document order, once each;
--   * keeps only targets that exist in the document's own Project, and never
--     the document itself;
--   * deletes the document's inline rows whose target is no longer in it,
--     orders the rest by first appearance, and inserts the new ones whose
--     target is active (a mention of an object in Trash stays in the text;
--     its row, if it had one, stays dormant and returns with the object);
--   * NEVER fails the save: any error is reported as a warning (no content in
--     it) and the document is saved exactly as sent.
--   A permanently deleted target takes its row with it (FK cascade); the
--   node stays in the text, where the editor shows its label as unavailable
--   (architecture §28: the writer's sentence is never deleted).
--
-- Nothing here touches a Scene, Chapter, Group or Manuscript row, a Scene's
-- content, version or words, the Scene save path or any word-count function.
-- Workspace content saves are unchanged: the same UPDATE, the same version
-- bump, the same RLS; the trigger only adds derived rows beside them.
--
-- For the Rune 2.0 database only: it requires 034. Apply BEFORE the app
-- deploy that uses it. The previous app ignores origin and target_chapter_id,
-- and inline references (which it cannot create) appear to it as generic
-- links. The new app offers inline references only once this is applied.
-- Rollback (drops every inline reference; the text keeps its nodes):
--   drop trigger workspace_documents_inline_references_insert on public.workspace_documents;
--   drop trigger workspace_documents_inline_references_update on public.workspace_documents;
--   drop trigger workspace_collection_entries_inline_references_insert on public.workspace_collection_entries;
--   drop trigger workspace_collection_entries_inline_references_update on public.workspace_collection_entries;
--   drop function public.sync_workspace_inline_references();
--   delete from public.object_references where origin = 'inline' or target_type = 'chapter';
--   alter table public.object_references drop column origin, drop column target_chapter_id;
--   then re-create the constraints, policy and functions changed here exactly
--   as 028, 030, 031 and 032 define them.
--   delete from public.schema_migrations where version = '035';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 035 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '035') then
    raise exception 'Migration 035 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '034') then
    raise exception 'Migration 035 requires migration 034 (view column widths). Nothing was changed.';
  end if;
  -- As in 024–034: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.object_references'::regclass) <> current_user then
    raise exception 'Migration 035 must be applied by the owner of public.object_references (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.object_references'::regclass), current_user;
  end if;
end
$$;

-- ── object_references: origin and the Chapter end ──────────────────────────

alter table public.object_references
  add column origin            text default 'link' not null,
  add column target_chapter_id uuid;

alter table public.object_references add constraint object_references_origin_check
  check (origin in ('link', 'inline'));
-- A mention in text is never a Relationship value.
alter table public.object_references add constraint object_references_inline_generic
  check (origin = 'link' or (property_id is null and scene_property_id is null));

alter table public.object_references drop constraint object_references_target_type_check;
alter table public.object_references add constraint object_references_target_type_check
  check (target_type in ('entry', 'page', 'scene', 'chapter'));
alter table public.object_references drop constraint object_references_target_matches_type;
alter table public.object_references add constraint object_references_target_matches_type
  check (target_type = 'entry' and target_entry_id is not null
           and target_document_id is null and target_scene_id is null and target_chapter_id is null
      or target_type = 'page' and target_document_id is not null
           and target_entry_id is null and target_scene_id is null and target_chapter_id is null
      or target_type = 'scene' and target_scene_id is not null
           and target_entry_id is null and target_document_id is null and target_chapter_id is null
      or target_type = 'chapter' and target_chapter_id is not null
           and target_entry_id is null and target_document_id is null and target_scene_id is null);

-- Once per source, target, property and origin.
alter table public.object_references drop constraint object_references_once_key;
alter table public.object_references add constraint object_references_once_key
  unique nulls not distinct (source_entry_id, source_document_id, source_scene_id,
                             target_entry_id, target_document_id, target_scene_id, target_chapter_id,
                             property_id, scene_property_id, origin);

-- A permanently deleted Chapter takes the references to it — never their sources.
alter table public.object_references add constraint object_references_target_chapter_id_fkey
  foreign key (target_chapter_id) references public.chapters(id) on delete cascade;

create index object_references_target_chapter_id_idx on public.object_references using btree (target_chapter_id)
  where target_chapter_id is not null;

-- As 028, with a Chapter's Project (its Manuscript's).
create or replace function public.reference_object_project(p_type text, p_id uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select case p_type
    when 'entry' then (select e.project_id from public.workspace_collection_entries e where e.id = p_id)
    when 'page'  then (select d.project_id from public.workspace_documents d where d.id = p_id)
    when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_id)
    when 'chapter' then (select m.project_id from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where c.id = p_id)
  end;
$function$;

-- As 031, with a Chapter: active while it exists (Chapters have no Trash yet).
create or replace function public.workspace_object_active(p_type text, p_id uuid)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select case p_type
    when 'page' then exists (select 1 from public.workspace_documents d where d.id = p_id and d.trashed_at is null)
    when 'folder' then exists (select 1 from public.workspace_folders f where f.id = p_id and f.trashed_at is null)
    when 'collection' then exists (select 1 from public.workspace_collections c where c.id = p_id and c.trashed_at is null)
    when 'entry' then exists (select 1 from public.workspace_collection_entries e
                                join public.workspace_collections c on c.id = e.collection_id
                               where e.id = p_id and e.trashed_at is null and c.trashed_at is null)
    when 'scene' then exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is null)
    when 'chapter' then exists (select 1 from public.chapters c where c.id = p_id)
    else false
  end;
$function$;

-- As 032, with the Chapter end and origin (both kept for life).
create or replace function public.check_object_reference()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
  v_scene_property public.scene_property_definitions%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.project_id, new.source_type, new.source_entry_id, new.source_document_id, new.source_scene_id,
        new.target_type, new.target_entry_id, new.target_document_id, new.target_scene_id, new.target_chapter_id,
        new.property_id, new.scene_property_id, new.origin)
       is distinct from
       (old.project_id, old.source_type, old.source_entry_id, old.source_document_id, old.source_scene_id,
        old.target_type, old.target_entry_id, old.target_document_id, old.target_scene_id, old.target_chapter_id,
        old.property_id, old.scene_property_id, old.origin) then
      raise exception 'A reference keeps its source, target and property for life' using errcode = 'check_violation';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    return new;
  end if;

  if public.reference_object_project(new.source_type, coalesce(new.source_entry_id, new.source_document_id, new.source_scene_id))
       is distinct from new.project_id
     or public.reference_object_project(new.target_type,
          coalesce(new.target_entry_id, new.target_document_id, new.target_scene_id, new.target_chapter_id))
       is distinct from new.project_id then
    raise exception 'Both ends of a reference must be in its Project' using errcode = 'check_violation';
  end if;

  if new.property_id is not null then
    select pr.* into v_property
      from public.workspace_collection_properties pr
      join public.workspace_collection_entries e on e.collection_id = pr.collection_id
     where pr.id = new.property_id and e.id = new.source_entry_id and pr.type = 'relationship';
    if not found then
      raise exception 'Not a Relationship property of the Entry''s Collection' using errcode = 'check_violation';
    end if;
    if new.target_type <> v_property.relation_target
       or (v_property.relation_target = 'entry'
           and not exists (select 1 from public.workspace_collection_entries t
                            where t.id = new.target_entry_id and t.collection_id = v_property.relation_collection_id)) then
      raise exception 'The Relationship "%" cannot point to that', v_property.name using errcode = 'check_violation';
    end if;
    if not v_property.relation_many
       and exists (select 1 from public.object_references r
                    where r.property_id = new.property_id and r.source_entry_id = new.source_entry_id) then
      raise exception 'The Relationship "%" holds one value', v_property.name using errcode = 'check_violation';
    end if;
  end if;

  if new.scene_property_id is not null then
    select pr.* into v_scene_property
      from public.scene_property_definitions pr
      join public.scenes s on s.manuscript_id = pr.manuscript_id
     where pr.id = new.scene_property_id and s.id = new.source_scene_id and pr.type = 'relationship';
    if not found then
      raise exception 'Not a Relationship property of the Scene''s Manuscript' using errcode = 'check_violation';
    end if;
    if new.target_type <> v_scene_property.relation_target
       or (v_scene_property.relation_target = 'entry'
           and not exists (select 1 from public.workspace_collection_entries t
                            where t.id = new.target_entry_id and t.collection_id = v_scene_property.relation_collection_id)) then
      raise exception 'The Relationship "%" cannot point to that', v_scene_property.name using errcode = 'check_violation';
    end if;
    if not v_scene_property.relation_many
       and exists (select 1 from public.object_references r
                    where r.scene_property_id = new.scene_property_id and r.source_scene_id = new.source_scene_id) then
      raise exception 'The Relationship "%" holds one value', v_scene_property.name using errcode = 'check_violation';
    end if;
  end if;

  new.created_at := now();
  return new;
end;
$function$;

-- As 030, with the Chapter end.
create or replace function public.guard_workspace_trash()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_table_name = 'object_references' then
    if not public.workspace_object_active(new.source_type, coalesce(new.source_entry_id, new.source_document_id, new.source_scene_id))
       or not public.workspace_object_active(new.target_type,
            coalesce(new.target_entry_id, new.target_document_id, new.target_scene_id, new.target_chapter_id)) then
      raise exception 'Nothing can be linked to or from an item in Trash' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'workspace_collection_properties' then
    if tg_op = 'INSERT' and not public.workspace_object_active('collection', new.collection_id) then
      raise exception 'This collection is in Trash' using errcode = 'check_violation';
    end if;
    if new.relation_collection_id is not null
       and (tg_op = 'INSERT' or new.relation_collection_id is distinct from old.relation_collection_id)
       and not public.workspace_object_active('collection', new.relation_collection_id) then
      raise exception 'That collection is in Trash' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'workspace_collection_views' then
    if not public.workspace_object_active('collection', new.collection_id) then
      raise exception 'This collection is in Trash' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$function$;

-- As 030: shown while both ends are active; in Trash it is kept, dormant.
drop policy "object_references: select own" on public.object_references;
create policy "object_references: select own" on public.object_references
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = object_references.project_id and p.user_id = (select auth.uid()))
         and public.workspace_object_active(object_references.source_type,
               coalesce(object_references.source_entry_id, object_references.source_document_id, object_references.source_scene_id))
         and public.workspace_object_active(object_references.target_type,
               coalesce(object_references.target_entry_id, object_references.target_document_id,
                        object_references.target_scene_id, object_references.target_chapter_id)));

-- As 032, except that only LINKS are found and counted — never a mention in
-- a document's text (origin 'inline'), which only its text can change.
create or replace function public.add_object_reference(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_reference public.object_references%rowtype;
begin
  if p_source_type is null or p_source_type not in ('entry', 'page', 'scene')
     or p_target_type is null or p_target_type not in ('entry', 'page', 'scene') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown object type');
  end if;
  v_project_id := public.reference_object_project(p_source_type, p_source_id);
  if v_project_id is null or not exists (select 1 from public.projects p where p.id = v_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Source not found');
  end if;
  perform public.lock_project_workspace(v_project_id);
  -- Another writer's object, or one of another Project, is simply not found.
  if public.reference_object_project(p_target_type, p_target_id) is distinct from v_project_id then
    return jsonb_build_object('status', 'error', 'error', 'Target not found');
  end if;
  if p_source_type = p_target_type and p_source_id = p_target_id then
    return jsonb_build_object('status', 'error', 'error', 'An object cannot reference itself');
  end if;

  select r.* into v_reference from public.object_references r
   where r.property_id is null and r.scene_property_id is null and r.origin = 'link'
     and r.source_type = p_source_type and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
     and r.target_type = p_target_type and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = p_target_id;
  if found then
    return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
  end if;
  if (select count(*) from public.object_references r
       where r.property_id is null and r.scene_property_id is null and r.origin = 'link' and r.source_type = p_source_type
         and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id) >= 500 then
    return jsonb_build_object('status', 'error', 'error', 'Too many links');
  end if;

  insert into public.object_references
    (project_id, source_type, source_entry_id, source_document_id, source_scene_id,
     target_type, target_entry_id, target_document_id, target_scene_id, position)
  select v_project_id, p_source_type,
         case when p_source_type = 'entry' then p_source_id end,
         case when p_source_type = 'page' then p_source_id end,
         case when p_source_type = 'scene' then p_source_id end,
         p_target_type,
         case when p_target_type = 'entry' then p_target_id end,
         case when p_target_type = 'page' then p_target_id end,
         case when p_target_type = 'scene' then p_target_id end,
         coalesce(max(r.position), 0) + 1
    from public.object_references r
   where r.property_id is null and r.scene_property_id is null and r.origin = 'link' and r.source_type = p_source_type
     and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
  returning * into v_reference;

  return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
end;
$function$;

-- As 032: removes one LINK — never a Relationship value, never a mention in
-- a document's text, never either object.
create or replace function public.remove_object_reference(p_reference_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_reference public.object_references%rowtype;
begin
  select r.* into v_reference
    from public.object_references r
    join public.projects p on p.id = r.project_id
   where r.id = p_reference_id and p.user_id = auth.uid() and r.property_id is null and r.scene_property_id is null
     and r.origin = 'link';
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Reference not found');
  end if;
  perform public.lock_project_workspace(v_reference.project_id);
  delete from public.object_references r where r.id = p_reference_id;
  return jsonb_build_object('status', 'ok');
end;
$function$;

-- ── Inline references, derived from content ─────────────────────────────────

-- A Page's or Entry's inline references, recomputed from the content just
-- written (see the header). Runs in the save's own transaction; never fails it.
create function public.sync_workspace_inline_references()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_source_type text := case tg_table_name when 'workspace_documents' then 'page' else 'entry' end;
  v_types text[];
  v_ids uuid[];
begin
  begin
    -- The document's mentions: known kinds, well-formed ids, in this Project,
    -- never itself — once each, in order of first appearance.
    select coalesce(array_agg(m.target_type order by m.first_at), '{}'),
           coalesce(array_agg(m.target_id order by m.first_at), '{}')
      into v_types, v_ids
      from (select f.target_type, f.target_id, min(f.at) as first_at
              from (select n.node #>> '{attrs,targetType}' as target_type,
                           case when n.node #>> '{attrs,targetId}'
                                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                then (n.node #>> '{attrs,targetId}')::uuid end as target_id,
                           n.at
                      from jsonb_path_query(new.content, 'strict $.**') with ordinality as n(node, at)
                     where jsonb_typeof(n.node) = 'object'
                       and n.node ->> 'type' = 'reference'
                       and n.node #>> '{attrs,targetType}' in ('entry', 'page', 'scene', 'chapter')) f
             where f.target_id is not null
               and not (f.target_type = v_source_type and f.target_id = new.id)
             group by f.target_type, f.target_id) m
     where public.reference_object_project(m.target_type, m.target_id) = new.project_id;

    -- Mentions no longer in the text go (dormant ones included).
    delete from public.object_references r
     where r.origin = 'inline'
       and (case v_source_type when 'page' then r.source_document_id else r.source_entry_id end) = new.id
       and not exists (select 1 from unnest(v_types, v_ids) as w(t, i)
                        where w.t = r.target_type
                          and w.i = coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id, r.target_chapter_id));

    -- The rest in the text's order; new ones only to an active target.
    update public.object_references r
       set position = w.ord
      from unnest(v_types, v_ids) with ordinality as w(t, i, ord)
     where r.origin = 'inline'
       and (case v_source_type when 'page' then r.source_document_id else r.source_entry_id end) = new.id
       and r.target_type = w.t
       and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id, r.target_chapter_id) = w.i
       and r.position <> w.ord;

    insert into public.object_references
      (project_id, source_type, source_entry_id, source_document_id,
       target_type, target_entry_id, target_document_id, target_scene_id, target_chapter_id, position, origin)
    select new.project_id, v_source_type,
           case when v_source_type = 'entry' then new.id end,
           case when v_source_type = 'page' then new.id end,
           w.t,
           case when w.t = 'entry' then w.i end,
           case when w.t = 'page' then w.i end,
           case when w.t = 'scene' then w.i end,
           case when w.t = 'chapter' then w.i end,
           w.ord, 'inline'
      from unnest(v_types, v_ids) with ordinality as w(t, i, ord)
     where public.workspace_object_active(w.t, w.i)
       and not exists (select 1 from public.object_references r
                        where r.origin = 'inline'
                          and (case v_source_type when 'page' then r.source_document_id else r.source_entry_id end) = new.id
                          and r.target_type = w.t
                          and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id, r.target_chapter_id) = w.i);
  exception when others then
    -- The writer's text is saved regardless; its backlinks catch up on the next save.
    raise warning 'Inline references of % % were not updated (%)', v_source_type, new.id, sqlstate;
  end;
  return null;
end;
$function$;

revoke execute on function public.sync_workspace_inline_references() from public, anon, authenticated;

create trigger workspace_documents_inline_references_insert
  after insert on public.workspace_documents
  for each row execute function public.sync_workspace_inline_references();
create trigger workspace_documents_inline_references_update
  after update of content on public.workspace_documents
  for each row when (old.content is distinct from new.content)
  execute function public.sync_workspace_inline_references();
create trigger workspace_collection_entries_inline_references_insert
  after insert on public.workspace_collection_entries
  for each row execute function public.sync_workspace_inline_references();
create trigger workspace_collection_entries_inline_references_update
  after update of content on public.workspace_collection_entries
  for each row when (old.content is distinct from new.content)
  execute function public.sync_workspace_inline_references();

insert into public.schema_migrations (version, name, applied_at, note)
values ('035', '035_inline_references.sql', now(), 'Inline references in Workspace rich text: object_references.origin (link | inline) and a Chapter target (target_chapter_id); a Page''s or Entry''s inline rows are derived from its content by an AFTER trigger on every content write (never failing the save), so mentions feed the one backlink system; add/remove_object_reference see links only');
