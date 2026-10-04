-- ── Migration 038: Scene Revision Notes ─────────────────────────────────────
--
-- Rune 2.0, Milestone 18. A Scene may carry one revision note: plain text the
-- writer leaves for the next pass ("Nerai's motive is unclear here"), kept
-- beside the Scene and never inside its prose.
--
-- A note is supporting text, not manuscript:
--   * it lives in its own table, anchored by the Scene's stable id (scene_id),
--     so it follows the Scene wherever it moves — another Chapter, Unplaced
--     Scenes, back again — with no work at all: a move never touches it;
--   * writing it never touches the Scene row, so the Scene's version,
--     updated_at, word_count, history checkpoints, the ordered manuscript
--     total, writing sessions and Today are all untouched (there is no
--     trigger on scenes here, and save_scene_revision_note never writes
--     scenes);
--   * it is not exported, searched, counted, captured by Milestones, or
--     copied by duplicate_project_checked.
--
-- Trash: a trashed Scene keeps its note (nothing is written when a Scene goes
-- to Trash or comes back); while the Scene is in Trash the note is hidden by
-- RLS and cannot be written, as the Scene itself cannot. Permanently deleting
-- the Scene deletes its note (FK ON DELETE CASCADE) — the same rule as the
-- Scene's own rows; a Project's deletion takes it the same way.
--
-- Writes: only through save_scene_revision_note (SECURITY DEFINER, owner-
-- checked, the Scene must be active). It takes the version the client last
-- saw (0 = "there was no note"; null = write regardless, the writer's
-- explicit "keep mine") and answers 'conflict' with the stored note instead
-- of overwriting a newer one. A blank note removes the row: no note and an
-- empty note are the same thing.
--
-- New: table scene_revision_notes (RLS: the owner reads the notes of active
-- Scenes; clients never write), function save_scene_revision_note. Nothing
-- else changes: no existing table, column, function, policy or row.
--
-- For the Rune 2.0 database only: it requires 037. Apply BEFORE the app deploy
-- that offers Scene revision notes (the app probes the table and hides the
-- note until it exists). Applying it earlier is safe: nothing reads it.
-- Rollback (deletes every Scene revision note):
--   drop function public.save_scene_revision_note(uuid, text, integer);
--   drop table public.scene_revision_notes;
--   delete from public.schema_migrations where version = '038';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 038 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '038') then
    raise exception 'Migration 038 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '037') then
    raise exception 'Migration 038 requires migration 037 (manuscript workflow). Nothing was changed.';
  end if;
  -- As in 024–037: the SECURITY DEFINER function runs as its owner, which
  -- must own the manuscript tables or it would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 038 must be applied by the owner of public.scenes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass), current_user;
  end if;
end
$$;

-- ── Table ───────────────────────────────────────────────────────────────────

create table public.scene_revision_notes (
  -- The Scene's canonical id: one note per Scene, whatever its placement.
  scene_id      uuid        not null,
  -- The Scene's Manuscript (a Scene never changes Manuscript), for listing.
  manuscript_id uuid        not null,
  body          text        not null,
  version       integer     default 1 not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

alter table public.scene_revision_notes add constraint scene_revision_notes_pkey primary key (scene_id);
alter table public.scene_revision_notes add constraint scene_revision_notes_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete cascade;
alter table public.scene_revision_notes add constraint scene_revision_notes_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
-- Never blank — some character other than whitespace, newlines included (a
-- blank note is no row) — and never unbounded.
alter table public.scene_revision_notes add constraint scene_revision_notes_body_check
  check (body ~ '\S' and char_length(body) <= 20000);
alter table public.scene_revision_notes add constraint scene_revision_notes_version_check
  check (version >= 1);

create index scene_revision_notes_manuscript_id_idx on public.scene_revision_notes (manuscript_id);

-- ── RLS: the owner reads the notes of active Scenes; nobody writes directly ─

alter table public.scene_revision_notes enable row level security;

create policy "scene_revision_notes: select own" on public.scene_revision_notes
  as permissive for select to authenticated
  using (exists (select 1 from public.scenes s
                   join public.manuscripts m on m.id = s.manuscript_id
                   join public.projects p on p.id = m.project_id
                 where s.id = scene_revision_notes.scene_id
                   and s.trashed_at is null
                   and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.scene_revision_notes from anon, authenticated;

-- ── Writing a note ──────────────────────────────────────────────────────────

-- Saves one Scene's note. p_base_version: the version the client last saw
-- (0 = no note); null = write regardless. A blank body removes the note.
-- Never writes the Scene.
create function public.save_scene_revision_note(p_scene_id uuid, p_body text, p_base_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_note public.scene_revision_notes%rowtype;
  v_current integer;
  v_body text := coalesce(p_body, '');
begin
  select s.manuscript_id into v_manuscript_id
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_scene_id and s.trashed_at is null and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;

  if char_length(v_body) > 20000 then
    return jsonb_build_object('status', 'error', 'error', 'A revision note can be at most 20,000 characters');
  end if;

  select n.* into v_note from public.scene_revision_notes n where n.scene_id = p_scene_id for update;
  v_current := case when found then v_note.version else 0 end;

  if p_base_version is not null and p_base_version <> v_current then
    return jsonb_build_object('status', 'conflict', 'note',
      case when v_current = 0 then null
           else jsonb_build_object('scene_id', v_note.scene_id, 'body', v_note.body,
                                   'version', v_note.version, 'updated_at', v_note.updated_at) end);
  end if;

  if v_body !~ '\S' then
    delete from public.scene_revision_notes n where n.scene_id = p_scene_id;
    return jsonb_build_object('status', 'ok', 'note', null);
  end if;

  if v_current = 0 then
    insert into public.scene_revision_notes (scene_id, manuscript_id, body)
    values (p_scene_id, v_manuscript_id, v_body)
    on conflict (scene_id) do nothing
    returning * into v_note;
    if not found then
      -- Another save created it first: never overwrite it unseen.
      select n.* into v_note from public.scene_revision_notes n where n.scene_id = p_scene_id;
      if p_base_version is not null then
        return jsonb_build_object('status', 'conflict', 'note',
          jsonb_build_object('scene_id', v_note.scene_id, 'body', v_note.body,
                             'version', v_note.version, 'updated_at', v_note.updated_at));
      end if;
      update public.scene_revision_notes n
         set body = v_body, version = n.version + 1, updated_at = now()
       where n.scene_id = p_scene_id
      returning * into v_note;
    end if;
  else
    update public.scene_revision_notes n
       set body = v_body, version = n.version + 1, updated_at = now()
     where n.scene_id = p_scene_id
    returning * into v_note;
  end if;

  return jsonb_build_object('status', 'ok', 'note',
    jsonb_build_object('scene_id', v_note.scene_id, 'body', v_note.body,
                       'version', v_note.version, 'updated_at', v_note.updated_at));
end;
$function$;

revoke execute on function public.save_scene_revision_note(uuid, text, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('038', '038_scene_revision_notes.sql', now(), 'Scene revision notes (scene_revision_notes: one plain-text note per Scene, anchored by scene_id; follows moves, kept through Trash, deleted with the Scene; RLS: owner reads notes of active Scenes; written only by save_scene_revision_note, version-checked, never touching the Scene row)');
