-- ── Migration 043: Revision Note items and reading anchors ───────────────────
--
-- Rune 2.0, Milestone 21C.2. A Revision Note becomes a lightweight revision
-- ITEM: still one row, one target (the Manuscript, a Group, a Chapter or a
-- Scene — 040), still plain text and never prose — but it may now carry:
--
--   * details      — an optional longer description under the note's text;
--   * resolved_at  — when the writer marked it done (null: unresolved). The
--                    only workflow state there is: no priority, due date,
--                    assignee, label or status;
--   * anchor       — for a SCENE note made from a passage of that Scene while
--                    reading: the selected text, a little of what came before
--                    and after it, where it was (character offsets in the
--                    Scene's plain text, as the app derives it) and the Scene
--                    version it was taken from. Best effort, never a
--                    reference the prose must honour: the Scene's text holds
--                    no mark of any kind, the app relocates the passage by
--                    its words when the Scene is read again, and a note whose
--                    passage can no longer be found keeps its quoted text and
--                    says so. It is never deleted or hidden for that.
--
-- public.revision_notes — CHANGED: three nullable columns (details,
--   resolved_at, anchor). A blank details is never stored (check); an anchor
--   is allowed on a Scene note only (check), is a small object of exactly
--   those keys (revision_note_anchor_valid, enforced by the row trigger), and
--   never changes once set. Every existing row satisfies all of it unchanged.
-- revision_note_json — REDEFINED (a superset): also returns details,
--   resolved_at and anchor. The 039/040 functions keep using it.
-- revision_notes_check_target — REDEFINED (a superset): also refuses a
--   malformed anchor, an anchor on anything but a Scene note, and a change
--   to an anchor.
-- NEW, SECURITY DEFINER, owner-checked, authenticated may execute:
--   create_revision_note_item(id, target_type, target_id, body, details, resolved, anchor)
--     — create_revision_note with the item fields (a note made offline and
--     resolved before it was sent lands resolved); an anchor on anything but
--     a Scene is 'invalid'. Same idempotence by client id.
--   update_revision_note_item(id, body, details, resolved, base_version)
--     — writes text, details and the resolved state together, under the same
--     version rule ('conflict' when base_version is stale, null = write
--     regardless; 'missing'; 'unavailable'). A write that changes nothing is
--     'ok' without a version bump. Resolving keeps the time it was first
--     resolved; unresolving clears it. The anchor never changes after
--     creation (its passage is the one the note was written about).
-- create_revision_note, update_revision_note and delete_revision_note are
--   UNCHANGED (a stale client's note writes keep working; update_revision_note
--   leaves details, resolved_at and anchor exactly as they are).
--
-- Nothing here touches a Scene, Chapter, Group or Manuscript row, trigger,
-- policy or function: a note's details, resolution or anchor never changes a
-- Scene's version, words, history, writing sessions, totals, Milestones,
-- search or export.
--
-- For the Rune 2.0 database only: it requires 042. Apply BEFORE the app deploy
-- that offers details, resolving and reading anchors (that app probes
-- revision_notes.resolved_at and uses the plain 039/040 functions until the
-- probe succeeds). The previous app keeps working unchanged.
-- Rollback (loses every note's details, resolution and anchor; the notes stay):
--   drop function public.create_revision_note_item(uuid, text, uuid, text, text, boolean, jsonb);
--   drop function public.update_revision_note_item(uuid, text, text, boolean, integer);
--   restore the 040 definition of revision_notes_check_target (from schema.sql at 042);
--   alter table public.revision_notes drop column anchor, drop column resolved_at, drop column details;
--   drop function public.revision_note_anchor_valid(jsonb);
--   restore the 039 definition of revision_note_json (from schema.sql at 042);
--   delete from public.schema_migrations where version = '043';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 043 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '043') then
    raise exception 'Migration 043 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '042') then
    raise exception 'Migration 043 requires migration 042 (Timeline Views). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.revision_notes'::regclass) <> current_user then
    raise exception 'Migration 043 must be applied by the owner of public.revision_notes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.revision_notes'::regclass), current_user;
  end if;
end
$$;

-- ── The anchor's shape ──────────────────────────────────────────────────────

-- An object of exactly: text (the passage, 1–2000 characters with a word in
-- it), before and after (context, at most 200 characters each), from and to
-- (offsets, 0 <= from < to), scene_version (>= 1). Nothing else.
create function public.revision_note_anchor_valid(p_anchor jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select p_anchor is not null
     and jsonb_typeof(p_anchor) = 'object'
     and (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p_anchor) k)
         = array['after', 'before', 'from', 'scene_version', 'text', 'to']
     and jsonb_typeof(p_anchor->'text') = 'string'
     and (p_anchor->>'text') ~ '\S'
     and char_length(p_anchor->>'text') <= 2000
     and jsonb_typeof(p_anchor->'before') = 'string'
     and char_length(p_anchor->>'before') <= 200
     and jsonb_typeof(p_anchor->'after') = 'string'
     and char_length(p_anchor->>'after') <= 200
     and jsonb_typeof(p_anchor->'from') = 'number'
     and jsonb_typeof(p_anchor->'to') = 'number'
     and (p_anchor->>'from')::numeric = floor((p_anchor->>'from')::numeric)
     and (p_anchor->>'to')::numeric = floor((p_anchor->>'to')::numeric)
     and (p_anchor->>'from')::numeric >= 0
     and (p_anchor->>'to')::numeric > (p_anchor->>'from')::numeric
     and jsonb_typeof(p_anchor->'scene_version') = 'number'
     and (p_anchor->>'scene_version')::numeric >= 1;
$function$;

revoke execute on function public.revision_note_anchor_valid(jsonb) from public, anon, authenticated;

-- ── Table ───────────────────────────────────────────────────────────────────

alter table public.revision_notes add column details text;
alter table public.revision_notes add column resolved_at timestamptz;
alter table public.revision_notes add column anchor jsonb;

alter table public.revision_notes add constraint revision_notes_details_check
  check (details is null or (details ~ '\S' and char_length(details) <= 20000));
alter table public.revision_notes add constraint revision_notes_anchor_check
  check (anchor is null or target_type = 'scene');

-- ── Integrity: the anchor's shape, and that it never changes ────────────────

create or replace function public.revision_notes_check_target()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.project_id <> old.project_id or new.manuscript_id <> old.manuscript_id
       or new.target_type <> old.target_type or new.target_id <> old.target_id
       or new.scene_id is distinct from old.scene_id or new.chapter_id is distinct from old.chapter_id
       or new.group_id is distinct from old.group_id then
      raise exception 'A revision note keeps its target';
    end if;
    if new.anchor is distinct from old.anchor then
      raise exception 'A revision note keeps its anchor';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.manuscripts m where m.id = new.manuscript_id and m.project_id = new.project_id) then
    raise exception 'A revision note''s Manuscript must be its Project''s';
  end if;
  if new.target_type = 'scene'
     and not exists (select 1 from public.scenes s where s.id = new.scene_id and s.manuscript_id = new.manuscript_id) then
    raise exception 'A revision note''s Scene must be of its Manuscript';
  end if;
  if new.anchor is not null and (new.target_type <> 'scene' or not public.revision_note_anchor_valid(new.anchor)) then
    raise exception 'A revision note''s anchor must be a passage of its Scene';
  end if;
  return new;
end;
$function$;

-- ── Reading a note ──────────────────────────────────────────────────────────

create or replace function public.revision_note_json(n public.revision_notes)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_build_object('id', n.id, 'project_id', n.project_id, 'target_type', n.target_type,
                            'target_id', n.target_id, 'body', n.body, 'version', n.version,
                            'created_at', n.created_at, 'updated_at', n.updated_at,
                            'details', n.details, 'resolved_at', n.resolved_at, 'anchor', n.anchor);
$function$;

-- ── Writing an item ─────────────────────────────────────────────────────────

-- create_revision_note (040) with details and an anchor. p_note_id is chosen
-- by the client, so a retried create answers with the note it already made.
-- Never writes a Scene, Chapter, Group or Manuscript.
create function public.create_revision_note_item(
  p_note_id uuid, p_target_type text, p_target_id uuid, p_body text, p_details text, p_resolved boolean, p_anchor jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_project_id uuid;
  v_note public.revision_notes%rowtype;
  v_body text := coalesce(p_body, '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if auth.uid() is null or p_note_id is null or p_target_id is null then
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;
  if p_target_type is null or p_target_type not in ('scene', 'chapter', 'group', 'manuscript') then
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;
  if v_body !~ '\S' then
    return jsonb_build_object('status', 'error', 'error', 'blank');
  end if;
  if char_length(v_body) > 20000 or (v_details is not null and char_length(v_details) > 20000) then
    return jsonb_build_object('status', 'error', 'error', 'too_long');
  end if;
  if p_anchor is not null and (p_target_type <> 'scene' or not public.revision_note_anchor_valid(p_anchor)) then
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;

  -- A retry of a create that already landed.
  select n.* into v_note from public.revision_notes n where n.id = p_note_id;
  if found then
    if exists (select 1 from public.projects p where p.id = v_note.project_id and p.user_id = auth.uid())
       and v_note.target_type = p_target_type and v_note.target_id = p_target_id then
      return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
    end if;
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;

  if not public.revision_note_target_active(p_target_type, p_target_id) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  case p_target_type
    when 'scene' then
      select s.manuscript_id, m.project_id into v_manuscript_id, v_project_id
        from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_target_id;
    when 'chapter' then
      select c.manuscript_id, m.project_id into v_manuscript_id, v_project_id
        from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where c.id = p_target_id;
    when 'group' then
      select g.manuscript_id, m.project_id into v_manuscript_id, v_project_id
        from public.manuscript_groups g join public.manuscripts m on m.id = g.manuscript_id where g.id = p_target_id;
    else
      select m.id, m.project_id into v_manuscript_id, v_project_id
        from public.manuscripts m where m.id = p_target_id;
  end case;

  insert into public.revision_notes
    (id, project_id, manuscript_id, target_type, scene_id, chapter_id, group_id, target_id, body, details, resolved_at, anchor)
  values (p_note_id, v_project_id, v_manuscript_id, p_target_type,
          case when p_target_type = 'scene' then p_target_id end,
          case when p_target_type = 'chapter' then p_target_id end,
          case when p_target_type = 'group' then p_target_id end,
          p_target_id, v_body, v_details, case when coalesce(p_resolved, false) then now() end, p_anchor)
  on conflict (id) do nothing
  returning * into v_note;
  if not found then
    -- The same create, racing itself: answer with what landed.
    select n.* into v_note from public.revision_notes n where n.id = p_note_id;
    if v_note.project_id <> v_project_id or v_note.target_id <> p_target_id then
      return jsonb_build_object('status', 'error', 'error', 'invalid');
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
end;
$function$;

-- Writes a note's text, details and resolved state together. p_base_version:
-- the version the change was based on; null = write regardless. A write that
-- changes nothing is 'ok' whatever the version (a retry that already landed).
create function public.update_revision_note_item(
  p_note_id uuid, p_body text, p_details text, p_resolved boolean, p_base_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_note public.revision_notes%rowtype;
  v_body text := coalesce(p_body, '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_resolved boolean := coalesce(p_resolved, false);
begin
  select n.* into v_note
    from public.revision_notes n
    join public.projects p on p.id = n.project_id
   where n.id = p_note_id and p.user_id = auth.uid()
   for update of n;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if not public.revision_note_target_active(v_note.target_type, v_note.target_id) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if v_body !~ '\S' then
    return jsonb_build_object('status', 'error', 'error', 'blank');
  end if;
  if char_length(v_body) > 20000 or (v_details is not null and char_length(v_details) > 20000) then
    return jsonb_build_object('status', 'error', 'error', 'too_long');
  end if;
  if v_note.body = v_body and v_note.details is not distinct from v_details
     and (v_note.resolved_at is not null) = v_resolved then
    return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
  end if;
  if p_base_version is not null and p_base_version <> v_note.version then
    return jsonb_build_object('status', 'conflict', 'note', public.revision_note_json(v_note));
  end if;

  update public.revision_notes n
     set body = v_body,
         details = v_details,
         resolved_at = case when v_resolved then coalesce(n.resolved_at, now()) else null end,
         version = n.version + 1,
         updated_at = now()
   where n.id = p_note_id
  returning * into v_note;
  return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
end;
$function$;

revoke execute on function public.create_revision_note_item(uuid, text, uuid, text, text, boolean, jsonb) from public, anon;
revoke execute on function public.update_revision_note_item(uuid, text, text, boolean, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('043', '043_revision_note_items.sql', now(), 'Revision Note items: revision_notes.details, resolved_at and anchor (a Scene note''s passage — text, context, offsets, Scene version — best effort, never a mark in the prose; shape checked by the row trigger, never changed); revision_note_json returns them; create_revision_note_item and update_revision_note_item; create/update/delete_revision_note unchanged; no manuscript row, trigger or policy changes');
