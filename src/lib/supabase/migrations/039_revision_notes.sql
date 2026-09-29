-- ── Migration 039: Revision Notes on Chapters and Scenes ─────────────────────
--
-- Rune 2.0, pre-Milestone 19. Replaces 038's one-note-per-Scene model with
-- discrete Revision Notes: any number of short plain-text notes, each attached
-- to exactly ONE Chapter or ONE Scene. The writer sees them by context — a
-- Scene shows its own notes and its current Chapter's; a Chapter shows its own
-- and those of every active Scene in it — but that aggregation is derived by
-- the app from the live manuscript structure. Nothing is ever copied or
-- duplicated to aggregate it.
--
-- A note is supporting text, not manuscript:
--   * it lives in its own table, anchored by the target's stable id, so a
--     Scene's notes follow the Scene through every move (another Chapter,
--     Unplaced Scenes, back again) with no work at all, and a Chapter's notes
--     follow the Chapter into and out of Groups;
--   * writing one never touches a Scene or Chapter row (no trigger on scenes
--     or chapters), so versions, updated_at, word counts, history checkpoints,
--     the ordered manuscript total, writing sessions and Today are untouched;
--   * it is not exported, searched, counted, captured by Milestones, or copied
--     by duplicate_project_checked. There is no status, priority, due date or
--     resolved state: no revision workflow is prescribed.
--
-- Trash: nothing is written when a Scene or Chapter goes to Trash or comes
-- back. RLS hides the notes of a trashed target (a Chapter in Trash takes its
-- Scenes with it, 037, so their notes are hidden too) and the functions refuse
-- to write them ('unavailable'); restore shows them again. Permanent deletion
-- of a Scene or Chapter deletes its notes (FK ON DELETE CASCADE), as does the
-- Project's deletion. delete_chapter ("remove this Chapter, keep its Scenes")
-- deletes the Chapter, so its Chapter notes go with it; its Scenes, now
-- Unplaced, keep theirs.
--
-- public.revision_notes — NEW:
--   id, project_id, manuscript_id, target_type ('scene' | 'chapter'),
--   scene_id | chapter_id (exactly one, by target_type), target_id (= that
--   one, for readers that want a single column), body (never blank, at most
--   20,000 characters), version (bumped by every edit), created_at, updated_at.
--   A Chapter target must be of the same Manuscript (composite FK); a Scene
--   target's Manuscript and the Manuscript's Project are checked by the
--   revision_notes_check_target trigger, which also makes the target, Project
--   and Manuscript of a note immutable.
--
-- Writes only through SECURITY DEFINER, owner-checked functions:
--   create_revision_note(id, target_type, target_id, body) — the client picks
--     the id, so a retried create is idempotent (the same id answers 'ok' with
--     the stored note, never a second row);
--   update_revision_note(id, body, base_version) — 'conflict' with the stored
--     note when base_version is stale (null = write regardless: the writer's
--     explicit "keep mine"); 'missing' when the note is gone;
--   delete_revision_note(id, base_version) — deletes that one note; 'conflict'
--     when it changed since base_version; a note already gone is 'ok'.
--   A blank note is never stored: create and update refuse it ('blank').
--
-- 038 → 039: every scene_revision_notes row (active and trashed Scenes alike)
-- is copied into revision_notes as a Scene note with the same body,
-- created_at and updated_at. The copy is counted and must match, or nothing
-- changes. The old table is then KEPT, renamed scene_revision_notes_038 —
-- clients can no longer read it — as the untouched original until a later
-- migration drops it deliberately. save_scene_revision_note is dropped, so an
-- M18 client still open cannot write a note nobody would see (its note field
-- keeps its text and says "Not saved yet"; after reload, notes appear in the
-- new model). The M18 app's probe of scene_revision_notes fails after this,
-- so a stale client simply hides its note field.
--
-- For the Rune 2.0 database only: it requires 038. Apply together with the
-- app deploy that offers Revision Notes (the new app probes revision_notes and
-- hides notes until it exists).
-- Rollback (deletes every note written since 039; 038's notes are intact in the archive):
--   drop function public.create_revision_note(uuid, text, uuid, text);
--   drop function public.update_revision_note(uuid, text, integer);
--   drop function public.delete_revision_note(uuid, integer);
--   drop table public.revision_notes;
--   drop function public.revision_notes_check_target();
--   alter table public.scene_revision_notes_038 rename to scene_revision_notes;
--   grant select on public.scene_revision_notes to authenticated;
--   -- then re-run the "Writing a note" section of 038 (save_scene_revision_note and its revoke);
--   delete from public.schema_migrations where version = '039';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 039 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '039') then
    raise exception 'Migration 039 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '038') then
    raise exception 'Migration 039 requires migration 038 (Scene revision notes). Nothing was changed.';
  end if;
  if to_regclass('public.scene_revision_notes') is null then
    raise exception 'Migration 039 expects public.scene_revision_notes from 038. Nothing was changed.';
  end if;
  -- As in 024–038: the SECURITY DEFINER functions run as their owner, which
  -- must own the manuscript tables or it would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 039 must be applied by the owner of public.scenes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass), current_user;
  end if;
end
$$;

-- ── Table ───────────────────────────────────────────────────────────────────

create table public.revision_notes (
  id            uuid        default gen_random_uuid() not null,
  project_id    uuid        not null,
  manuscript_id uuid        not null,
  target_type   text        not null,
  scene_id      uuid,
  chapter_id    uuid,
  target_id     uuid        not null,
  body          text        not null,
  version       integer     default 1 not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

alter table public.revision_notes add constraint revision_notes_pkey primary key (id);
alter table public.revision_notes add constraint revision_notes_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.revision_notes add constraint revision_notes_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
alter table public.revision_notes add constraint revision_notes_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete cascade;
-- Same Manuscript by construction (chapters_id_manuscript_id_key).
alter table public.revision_notes add constraint revision_notes_chapter_same_manuscript_fkey
  foreign key (chapter_id, manuscript_id) references public.chapters(id, manuscript_id) on delete cascade;
-- Exactly one target, named by target_type, mirrored in target_id.
alter table public.revision_notes add constraint revision_notes_target_check
  check ((target_type = 'scene' and scene_id is not null and chapter_id is null and target_id = scene_id)
      or (target_type = 'chapter' and chapter_id is not null and scene_id is null and target_id = chapter_id));
-- Never blank — some character other than whitespace — and never unbounded.
alter table public.revision_notes add constraint revision_notes_body_check
  check (body ~ '\S' and char_length(body) <= 20000);
alter table public.revision_notes add constraint revision_notes_version_check
  check (version >= 1);

create index revision_notes_project_id_idx on public.revision_notes (project_id);
create index revision_notes_scene_id_idx on public.revision_notes (scene_id) where scene_id is not null;
create index revision_notes_chapter_id_idx on public.revision_notes (chapter_id) where chapter_id is not null;
create index revision_notes_manuscript_id_idx on public.revision_notes (manuscript_id);

-- ── Integrity: the target is of the note's Manuscript, and never changes ────

create function public.revision_notes_check_target()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.project_id <> old.project_id or new.manuscript_id <> old.manuscript_id
       or new.target_type <> old.target_type or new.target_id <> old.target_id
       or new.scene_id is distinct from old.scene_id or new.chapter_id is distinct from old.chapter_id then
      raise exception 'A revision note keeps its target';
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
  return new;
end;
$function$;

revoke execute on function public.revision_notes_check_target() from public, anon, authenticated;

create trigger revision_notes_check_target
  before insert or update on public.revision_notes
  for each row execute function public.revision_notes_check_target();

-- ── RLS: the owner reads the notes of active targets; nobody writes directly ─

alter table public.revision_notes enable row level security;

create policy "revision_notes: select own" on public.revision_notes
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                  where p.id = revision_notes.project_id
                    and p.user_id = (select auth.uid()))
         and case revision_notes.target_type
               when 'scene' then exists (select 1 from public.scenes s
                                          where s.id = revision_notes.scene_id and s.trashed_at is null)
               else exists (select 1 from public.chapters c
                             where c.id = revision_notes.chapter_id and c.trashed_at is null)
             end);

revoke insert, update, delete on public.revision_notes from anon, authenticated;

-- ── Functions ───────────────────────────────────────────────────────────────

-- A note as the app reads it.
create function public.revision_note_json(n public.revision_notes)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_build_object('id', n.id, 'project_id', n.project_id, 'target_type', n.target_type,
                            'target_id', n.target_id, 'body', n.body, 'version', n.version,
                            'created_at', n.created_at, 'updated_at', n.updated_at);
$function$;

revoke execute on function public.revision_note_json(public.revision_notes) from public, anon, authenticated;

-- Whether a note's target is the caller's and active (not in Trash).
create function public.revision_note_target_active(p_target_type text, p_target_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select case p_target_type
    when 'scene' then exists (
      select 1 from public.scenes s
        join public.manuscripts m on m.id = s.manuscript_id
        join public.projects p on p.id = m.project_id
       where s.id = p_target_id and s.trashed_at is null and p.user_id = auth.uid())
    when 'chapter' then exists (
      select 1 from public.chapters c
        join public.manuscripts m on m.id = c.manuscript_id
        join public.projects p on p.id = m.project_id
       where c.id = p_target_id and c.trashed_at is null and p.user_id = auth.uid())
    else false
  end;
$function$;

revoke execute on function public.revision_note_target_active(text, uuid) from public, anon, authenticated;

-- Creates one note. p_note_id is chosen by the client, so a retried create
-- answers with the note it already made. Never writes a Scene or Chapter.
create function public.create_revision_note(p_note_id uuid, p_target_type text, p_target_id uuid, p_body text)
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
begin
  if auth.uid() is null or p_note_id is null or p_target_id is null then
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;
  if p_target_type is null or p_target_type not in ('scene', 'chapter') then
    return jsonb_build_object('status', 'error', 'error', 'invalid');
  end if;
  if v_body !~ '\S' then
    return jsonb_build_object('status', 'error', 'error', 'blank');
  end if;
  if char_length(v_body) > 20000 then
    return jsonb_build_object('status', 'error', 'error', 'too_long');
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
  if p_target_type = 'scene' then
    select s.manuscript_id, m.project_id into v_manuscript_id, v_project_id
      from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
     where s.id = p_target_id;
  else
    select c.manuscript_id, m.project_id into v_manuscript_id, v_project_id
      from public.chapters c join public.manuscripts m on m.id = c.manuscript_id
     where c.id = p_target_id;
  end if;

  insert into public.revision_notes (id, project_id, manuscript_id, target_type, scene_id, chapter_id, target_id, body)
  values (p_note_id, v_project_id, v_manuscript_id, p_target_type,
          case when p_target_type = 'scene' then p_target_id end,
          case when p_target_type = 'chapter' then p_target_id end,
          p_target_id, v_body)
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

-- Edits one note's text. p_base_version: the version the client's text was
-- based on; null = write regardless. Saving the text already stored is 'ok'
-- whatever the version (a retry that already landed).
create function public.update_revision_note(p_note_id uuid, p_body text, p_base_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_note public.revision_notes%rowtype;
  v_body text := coalesce(p_body, '');
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
  if char_length(v_body) > 20000 then
    return jsonb_build_object('status', 'error', 'error', 'too_long');
  end if;
  if v_note.body = v_body then
    return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
  end if;
  if p_base_version is not null and p_base_version <> v_note.version then
    return jsonb_build_object('status', 'conflict', 'note', public.revision_note_json(v_note));
  end if;

  update public.revision_notes n
     set body = v_body, version = n.version + 1, updated_at = now()
   where n.id = p_note_id
  returning * into v_note;
  return jsonb_build_object('status', 'ok', 'note', public.revision_note_json(v_note));
end;
$function$;

-- Deletes one note, and only that note. A note already gone is 'ok'; one
-- changed since p_base_version is 'conflict' (null = delete regardless).
create function public.delete_revision_note(p_note_id uuid, p_base_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_note public.revision_notes%rowtype;
begin
  select n.* into v_note
    from public.revision_notes n
    join public.projects p on p.id = n.project_id
   where n.id = p_note_id and p.user_id = auth.uid()
   for update of n;
  if not found then
    return jsonb_build_object('status', 'ok');
  end if;
  if not public.revision_note_target_active(v_note.target_type, v_note.target_id) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_base_version is not null and p_base_version <> v_note.version then
    return jsonb_build_object('status', 'conflict', 'note', public.revision_note_json(v_note));
  end if;
  delete from public.revision_notes n where n.id = p_note_id;
  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.create_revision_note(uuid, text, uuid, text) from public, anon;
revoke execute on function public.update_revision_note(uuid, text, integer) from public, anon;
revoke execute on function public.delete_revision_note(uuid, integer) from public, anon;

-- ── 038's notes, carried over ───────────────────────────────────────────────

insert into public.revision_notes
  (project_id, manuscript_id, target_type, scene_id, chapter_id, target_id, body, version, created_at, updated_at)
select m.project_id, o.manuscript_id, 'scene', o.scene_id, null, o.scene_id, o.body, 1, o.created_at, o.updated_at
  from public.scene_revision_notes o
  join public.manuscripts m on m.id = o.manuscript_id;

do $$
declare
  v_old bigint;
  v_copied bigint;
begin
  select count(*) into v_old from public.scene_revision_notes;
  select count(*) into v_copied
    from public.scene_revision_notes o
    join public.revision_notes n on n.target_type = 'scene' and n.scene_id = o.scene_id and n.body = o.body;
  if v_old <> v_copied then
    raise exception 'Migration 039 copied % of % Scene revision notes. Nothing was changed.', v_copied, v_old;
  end if;
end
$$;

-- The original, kept untouched and out of clients' reach.
drop function public.save_scene_revision_note(uuid, text, integer);
alter table public.scene_revision_notes rename to scene_revision_notes_038;
drop policy "scene_revision_notes: select own" on public.scene_revision_notes_038;
revoke all on public.scene_revision_notes_038 from anon, authenticated;

insert into public.schema_migrations (version, name, applied_at, note)
values ('039', '039_revision_notes.sql', now(), 'Revision Notes on Chapters and Scenes (revision_notes: many discrete plain-text notes, each on one Chapter or one Scene, anchored by id; hidden while the target is in Trash, deleted with it; written only by create/update/delete_revision_note, id-idempotent and version-checked, never touching Scene or Chapter rows). 038 notes copied as Scene notes; scene_revision_notes kept as scene_revision_notes_038 (no client access); save_scene_revision_note dropped');
