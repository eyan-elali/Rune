-- ── Migration 040: Revision Notes on the Manuscript and its Groups ──────────
--
-- Rune 2.0, pre-Milestone 19B. Revision Notes become the one revision-note
-- feature: a note targets exactly ONE of the Manuscript, a Group ("Part I"),
-- a Chapter or a Scene. Still one table, one row per note; the app derives
-- what each level shows from the live manuscript structure (a Chapter's view
-- includes its Scenes' notes, a Group's its descendants', the Manuscript's
-- everything) — nothing is copied to aggregate, and no move rewrites a note.
--
-- public.revision_notes — CHANGED:
--   * NEW column group_id (a Group target), with a composite FK to
--     manuscript_groups(id, manuscript_id): same Manuscript by construction,
--     deleted with the Group (only an empty Group can be deleted; the app
--     says its notes go with it).
--   * target_type accepts 'manuscript' (target_id = manuscript_id; no
--     scene/chapter/group) and 'group' (group_id, mirrored in target_id).
--     revision_notes_target_check is replaced accordingly; every existing
--     Scene and Chapter note satisfies the new check unchanged.
--   * revision_notes_check_target also keeps group_id fixed.
--   * The select policy shows Manuscript notes to the Project's owner and
--     Group notes while the Group exists; Scene and Chapter notes exactly as
--     in 039 (hidden while their target is in Trash).
-- revision_note_target_active and create_revision_note (same signatures)
-- learn the two new targets. update_revision_note and delete_revision_note
-- are unchanged. No existing note row changes.
--
-- The project checklist, folded in. The Rune 2.0 shell's "Revision Notes"
-- panel used to list project_notes (a Rune 1.x checklist). It now shows
-- Revision Notes, so every OPEN project_notes item (not completed, with text,
-- whose writer owns the Project) is copied as a Manuscript note: the same id,
-- text, created_at and updated_at (pin state is not carried: Revision Notes
-- have no pinning). Completed items are not copied — they were done — and
-- project_notes itself is left exactly as it is: nothing is deleted, and the
-- Rune 1.x pages that still read it keep working. The copy is counted, or
-- nothing changes. Idempotent by id (on conflict do nothing).
--
-- For the Rune 2.0 database only: it requires 039. Apply BEFORE the app deploy
-- that offers Manuscript and Group notes (that app probes
-- revision_notes.group_id). The 039 app keeps working: it lists and filters by
-- Scene and Chapter only, and never sees the new targets in its views.
-- Rollback (deletes every Manuscript and Group note, including the copied
-- checklist items — project_notes still holds the originals):
--   delete from public.revision_notes where target_type in ('manuscript', 'group');
--   restore the 039 definitions of revision_notes_check_target,
--     revision_note_target_active, create_revision_note, the select policy and
--     revision_notes_target_check (from schema.sql at 039);
--   alter table public.revision_notes drop column group_id;
--   delete from public.schema_migrations where version = '040';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 040 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '040') then
    raise exception 'Migration 040 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '039') then
    raise exception 'Migration 040 requires migration 039 (Revision Notes). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.revision_notes'::regclass) <> current_user then
    raise exception 'Migration 040 must be applied by the owner of public.revision_notes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.revision_notes'::regclass), current_user;
  end if;
end
$$;

-- ── Table ───────────────────────────────────────────────────────────────────

alter table public.revision_notes add column group_id uuid;
alter table public.revision_notes add constraint revision_notes_group_same_manuscript_fkey
  foreign key (group_id, manuscript_id) references public.manuscript_groups(id, manuscript_id) on delete cascade;
create index revision_notes_group_id_idx on public.revision_notes (group_id) where group_id is not null;

alter table public.revision_notes drop constraint revision_notes_target_check;
alter table public.revision_notes add constraint revision_notes_target_check
  check ((target_type = 'scene' and scene_id is not null and chapter_id is null and group_id is null and target_id = scene_id)
      or (target_type = 'chapter' and chapter_id is not null and scene_id is null and group_id is null and target_id = chapter_id)
      or (target_type = 'group' and group_id is not null and scene_id is null and chapter_id is null and target_id = group_id)
      or (target_type = 'manuscript' and scene_id is null and chapter_id is null and group_id is null and target_id = manuscript_id));

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

-- ── RLS ─────────────────────────────────────────────────────────────────────

drop policy "revision_notes: select own" on public.revision_notes;
create policy "revision_notes: select own" on public.revision_notes
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                  where p.id = revision_notes.project_id
                    and p.user_id = (select auth.uid()))
         and case revision_notes.target_type
               when 'scene' then exists (select 1 from public.scenes s
                                          where s.id = revision_notes.scene_id and s.trashed_at is null)
               when 'chapter' then exists (select 1 from public.chapters c
                                            where c.id = revision_notes.chapter_id and c.trashed_at is null)
               when 'group' then exists (select 1 from public.manuscript_groups g
                                          where g.id = revision_notes.group_id)
               else true
             end);

-- ── Functions ───────────────────────────────────────────────────────────────

create or replace function public.revision_note_target_active(p_target_type text, p_target_id uuid)
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
    when 'group' then exists (
      select 1 from public.manuscript_groups g
        join public.manuscripts m on m.id = g.manuscript_id
        join public.projects p on p.id = m.project_id
       where g.id = p_target_id and p.user_id = auth.uid())
    when 'manuscript' then exists (
      select 1 from public.manuscripts m
        join public.projects p on p.id = m.project_id
       where m.id = p_target_id and p.user_id = auth.uid())
    else false
  end;
$function$;

create or replace function public.create_revision_note(p_note_id uuid, p_target_type text, p_target_id uuid, p_body text)
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
  if p_target_type is null or p_target_type not in ('scene', 'chapter', 'group', 'manuscript') then
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

  insert into public.revision_notes (id, project_id, manuscript_id, target_type, scene_id, chapter_id, group_id, target_id, body)
  values (p_note_id, v_project_id, v_manuscript_id, p_target_type,
          case when p_target_type = 'scene' then p_target_id end,
          case when p_target_type = 'chapter' then p_target_id end,
          case when p_target_type = 'group' then p_target_id end,
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

-- ── The project checklist's open items, as Manuscript notes ─────────────────

insert into public.revision_notes
  (id, project_id, manuscript_id, target_type, scene_id, chapter_id, group_id, target_id, body, version, created_at, updated_at)
select pn.id, pn.project_id, m.id, 'manuscript', null, null, null, m.id, pn.content, 1, pn.created_at, pn.updated_at
  from public.project_notes pn
  join public.projects p on p.id = pn.project_id and p.user_id = pn.user_id
  join public.manuscripts m on m.project_id = pn.project_id
 where not pn.is_completed
   and pn.content ~ '\S'
   and char_length(pn.content) <= 20000
on conflict (id) do nothing;

do $$
declare
  v_expected bigint;
  v_copied bigint;
begin
  select count(*), count(n.id) into v_expected, v_copied
    from public.project_notes pn
    join public.projects p on p.id = pn.project_id and p.user_id = pn.user_id
    join public.manuscripts m on m.project_id = pn.project_id
    left join public.revision_notes n
      on n.id = pn.id and n.target_type = 'manuscript' and n.manuscript_id = m.id and n.body = pn.content
   where not pn.is_completed
     and pn.content ~ '\S'
     and char_length(pn.content) <= 20000;
  if v_expected <> v_copied then
    raise exception 'Migration 040 carried % of % open checklist notes. Nothing was changed.', v_copied, v_expected;
  end if;
end
$$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('040', '040_revision_note_scopes.sql', now(), 'Revision Notes on the Manuscript and on Groups (revision_notes.group_id; target_type manuscript | group | chapter | scene); open project_notes items copied as Manuscript notes (same id, text and times; project_notes untouched); create_revision_note, revision_note_target_active, revision_notes_check_target and the select policy redefined; no existing note changes');
