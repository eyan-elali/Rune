-- ── Migration 036: Scene History and named Manuscript Milestones ───────────
--
-- Rune 2.0, Milestone 17. Two safety systems for long-form writing, neither
-- of them version control: no branches, no merges, nothing the writer has to
-- manage.
--
-- 1. Scene History (public.scene_revisions) — earlier texts of one Scene.
--
--    A revision is a copy of a Scene's prose (content, word_count, title) at
--    one moment. It is not a live object: never a Scene, never in the ordered
--    total, the allowance, export, search, pickers, references or backlinks,
--    and it carries no properties. It keeps the Scene's identity (scene_id)
--    and two times: saved_at (when that text was last saved: the Scene's
--    updated_at then) and created_at (when it was put in history).
--
--    Checkpoints are taken by the database, on the save path itself
--    (record_scene_revision: AFTER UPDATE OF content on scenes), so every
--    client, device, stale client and queued offline save is covered and no
--    RPC signature changes. On a content change, the text being REPLACED is
--    kept when it has words and differs from the Scene's latest revision, and
--    either
--      * it had been left alone for 30 minutes or more (it is the end of an
--        earlier sitting — "what this Scene looked like yesterday"), or
--      * the Scene's latest revision (or, with none, its creation) is 60
--        minutes old or more (a checkpoint inside a long sitting).
--    Typing inside one sitting therefore adds nothing: at most one revision
--    an hour, plus one per return to the Scene. The live text is the Scene
--    itself, never duplicated into history until it is replaced.
--    The trigger NEVER fails a save: any error becomes a warning (no content
--    in it) and the Scene is saved exactly as sent.
--
--    Retention (prune_scene_revisions, after each new checkpoint, per Scene):
--    every revision of the last 30 days; older ones thinned to the last of
--    each day (UTC); at most 200 per Scene. A revision a Milestone uses is
--    never pruned (and cannot be deleted: its foreign key is NO ACTION).
--
--    Restore (restore_scene_revision) writes the old text through the real
--    save path — save_scene_checked, in the same transaction — so the
--    version guard, the allowance and the word-count triggers all apply. The
--    text it replaces is always kept first (reason 'restore'), and no
--    revision is ever rewound or deleted. Same Scene id; no writing_sessions
--    row (restoring is not writing); placement, properties and references
--    untouched.
--
--    Trash: trashing or restoring a Scene leaves its history alone (Trash
--    never changes content, so no checkpoint either). Its history cannot be
--    opened while it is in Trash. Permanently deleting a Scene deletes its
--    history (scenes_forget_history), except revisions a Milestone uses:
--    those stay, with scene_id null, for the Milestone.
--
-- 2. Manuscript Milestones — the whole manuscript, named, at one moment.
--
--    create_manuscript_milestone(manuscript, name) captures, in one
--    transaction under the per-account lock (which every save and structure
--    change also takes): the Groups and Chapters (id, title, parent, position)
--    as JSON, and for every ACTIVE Scene, placed or Unplaced, its placement
--    (chapter or none, position) and its text, as a scene revision (reason
--    'milestone') — reusing the Scene's latest revision when that already
--    holds exactly this text and title, so an unchanged Scene costs nothing.
--    Scenes in Trash are not part of the manuscript and are not captured.
--    Workspace content is never captured. Creating a Milestone changes no
--    live row: no Scene, Chapter, Group, version, word count or writing
--    history.
--
--    Milestones are read-only snapshots, never branches. Whole-manuscript
--    restore is deliberately NOT here (see the M17 report); a Scene's text
--    from a Milestone can be restored through its Scene History, which lists
--    the Milestone's revision. delete_manuscript_milestone removes only the
--    named Milestone (on the writer's explicit request); its revisions of
--    live Scenes go back under the ordinary retention, and those of Scenes
--    since deleted go with it.
--
-- New: tables scene_revisions, manuscript_milestones,
-- manuscript_milestone_scenes (RLS: the owner reads; clients never write);
-- triggers scenes_record_revision, scenes_forget_history; functions
-- record_scene_revision, forget_scene_history, prune_scene_revisions
-- (internal), list_scene_history, get_scene_revision,
-- restore_scene_revision, create_manuscript_milestone,
-- list_manuscript_milestones, get_manuscript_milestone,
-- delete_manuscript_milestone (owner-checked, SECURITY DEFINER).
-- Nothing else changes: no existing table, column, function, policy or row.
-- save_scene_checked and every other save-path contract are unchanged.
--
-- For the Rune 2.0 database only: it requires 035. Apply BEFORE the app
-- deploy that offers History and Milestones (without it they are refused
-- and nothing is written). Applying it before that deploy is safe: the
-- previous app never reads these tables, and its saves simply start leaving
-- checkpoints.
-- Rollback (deletes all Scene History and every Milestone):
--   drop trigger scenes_record_revision on public.scenes;
--   drop trigger scenes_forget_history on public.scenes;
--   drop function public.list_scene_history(uuid), public.get_scene_revision(uuid),
--     public.restore_scene_revision(uuid, integer),
--     public.create_manuscript_milestone(uuid, text), public.list_manuscript_milestones(uuid),
--     public.get_manuscript_milestone(uuid), public.delete_manuscript_milestone(uuid),
--     public.record_scene_revision(), public.forget_scene_history(),
--     public.prune_scene_revisions(uuid);
--   drop table public.manuscript_milestone_scenes, public.manuscript_milestones, public.scene_revisions;
--   delete from public.schema_migrations where version = '036';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 036 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '036') then
    raise exception 'Migration 036 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '035') then
    raise exception 'Migration 036 requires migration 035 (inline references). Nothing was changed.';
  end if;
  -- As in 024–035: the SECURITY DEFINER functions run as their owner, which
  -- must own the manuscript tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 036 must be applied by the owner of public.scenes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass), current_user;
  end if;
end
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.scene_revisions (
  id            uuid        default gen_random_uuid() not null,
  manuscript_id uuid        not null,
  -- The Scene this text belongs to; null only once the Scene is permanently
  -- deleted and a Milestone still uses this revision.
  scene_id      uuid,
  title         text        not null,
  content       jsonb,
  word_count    integer     not null,
  saved_at      timestamptz not null,
  created_at    timestamptz default now() not null,
  reason        text        not null
);

alter table public.scene_revisions add constraint scene_revisions_pkey primary key (id);
alter table public.scene_revisions add constraint scene_revisions_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
alter table public.scene_revisions add constraint scene_revisions_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete set null;
alter table public.scene_revisions add constraint scene_revisions_reason_check
  check (reason in ('checkpoint', 'restore', 'milestone'));
alter table public.scene_revisions add constraint scene_revisions_word_count_check
  check (word_count >= 0);

create index scene_revisions_scene_id_created_at_idx on public.scene_revisions (scene_id, created_at desc);
create index scene_revisions_manuscript_id_idx on public.scene_revisions (manuscript_id);

create table public.manuscript_milestones (
  id               uuid        default gen_random_uuid() not null,
  manuscript_id    uuid        not null,
  name             text        not null,
  created_at       timestamptz default now() not null,
  -- { "groups":   [{ id, title, parent_group_id, position }],
  --   "chapters": [{ id, title, group_id, position }] } — as they were.
  structure        jsonb       not null,
  manuscript_words integer     not null,
  unplaced_words   integer     not null,
  scene_count      integer     not null
);

alter table public.manuscript_milestones add constraint manuscript_milestones_pkey primary key (id);
alter table public.manuscript_milestones add constraint manuscript_milestones_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
alter table public.manuscript_milestones add constraint manuscript_milestones_name_check
  check (name = btrim(name) and char_length(name) between 1 and 120);
alter table public.manuscript_milestones add constraint manuscript_milestones_structure_check
  check (jsonb_typeof(structure -> 'groups') = 'array' and jsonb_typeof(structure -> 'chapters') = 'array');

create index manuscript_milestones_manuscript_id_created_at_idx on public.manuscript_milestones (manuscript_id, created_at desc);

create table public.manuscript_milestone_scenes (
  milestone_id uuid    not null,
  -- The Scene's identity at the time (no FK: the Scene may since be deleted).
  scene_id     uuid    not null,
  revision_id  uuid    not null,
  -- Its Chapter then (an id in structure.chapters), or null for Unplaced.
  chapter_id   uuid,
  position     integer not null
);

alter table public.manuscript_milestone_scenes add constraint manuscript_milestone_scenes_pkey primary key (milestone_id, scene_id);
alter table public.manuscript_milestone_scenes add constraint manuscript_milestone_scenes_milestone_id_fkey
  foreign key (milestone_id) references public.manuscript_milestones(id) on delete cascade;
-- NO ACTION: a revision a Milestone uses cannot be deleted (pruning skips it).
alter table public.manuscript_milestone_scenes add constraint manuscript_milestone_scenes_revision_id_fkey
  foreign key (revision_id) references public.scene_revisions(id);

create index manuscript_milestone_scenes_revision_id_idx on public.manuscript_milestone_scenes (revision_id);

-- ── RLS: the owner reads; nobody writes directly ────────────────────────────

alter table public.scene_revisions enable row level security;
alter table public.manuscript_milestones enable row level security;
alter table public.manuscript_milestone_scenes enable row level security;

create policy "scene_revisions: select own" on public.scene_revisions
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = scene_revisions.manuscript_id and p.user_id = (select auth.uid())));
create policy "manuscript_milestones: select own" on public.manuscript_milestones
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = manuscript_milestones.manuscript_id and p.user_id = (select auth.uid())));
create policy "manuscript_milestone_scenes: select own" on public.manuscript_milestone_scenes
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscript_milestones ms
                   join public.manuscripts m on m.id = ms.manuscript_id
                   join public.projects p on p.id = m.project_id
                 where ms.id = manuscript_milestone_scenes.milestone_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.scene_revisions from anon, authenticated;
revoke insert, update, delete on public.manuscript_milestones from anon, authenticated;
revoke insert, update, delete on public.manuscript_milestone_scenes from anon, authenticated;

-- ── Retention ───────────────────────────────────────────────────────────────

-- One Scene's history, thinned: every revision of the last 30 days, the last
-- of each earlier day (UTC), and never more than 200. Revisions a Milestone
-- uses are neither counted nor deleted.
create function public.prune_scene_revisions(p_scene_id uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  delete from public.scene_revisions r
   using (select r2.id,
                 r2.created_at,
                 row_number() over (partition by (r2.created_at at time zone 'UTC')::date
                                    order by r2.created_at desc, r2.id desc) as day_rank,
                 row_number() over (order by r2.created_at desc, r2.id desc) as recency
            from public.scene_revisions r2
           where r2.scene_id = p_scene_id
             and not exists (select 1 from public.manuscript_milestone_scenes ms where ms.revision_id = r2.id)) k
   where r.id = k.id
     and (k.recency > 200 or (k.created_at < now() - interval '30 days' and k.day_rank > 1));
$function$;

-- ── Checkpoints on the save path ────────────────────────────────────────────

-- AFTER UPDATE OF content on scenes. Keeps the text being replaced when it
-- has words, is not already the latest revision, and ends a sitting (left
-- alone 30 minutes) or the latest checkpoint is an hour old. Inside
-- restore_scene_revision (rune.scene_restore = this Scene) it is always kept,
-- as 'restore'. Never fails the save.
create function public.record_scene_revision()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_restore boolean := coalesce(current_setting('rune.scene_restore', true), '') = old.id::text;
  v_latest public.scene_revisions%rowtype;
begin
  begin
    if old.word_count <= 0 or old.content is null then
      return null;
    end if;
    select r.* into v_latest
      from public.scene_revisions r
     where r.scene_id = old.id
     order by r.created_at desc, r.id desc
     limit 1;
    if found and v_latest.content = old.content then
      return null;
    end if;
    if not v_restore
       and now() - old.updated_at < interval '30 minutes'
       and now() - coalesce(v_latest.created_at, old.created_at) < interval '60 minutes' then
      return null;
    end if;
    insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, reason)
    values (old.manuscript_id, old.id, old.title, old.content, old.word_count, old.updated_at,
            case when v_restore then 'restore' else 'checkpoint' end);
    perform public.prune_scene_revisions(old.id);
  exception when others then
    -- The writer's text is saved regardless; only this checkpoint is missed.
    raise warning 'Scene history for % was not recorded (%)', old.id, sqlstate;
  end;
  return null;
end;
$function$;

create trigger scenes_record_revision
  after update of content on public.scenes
  for each row when (old.content is distinct from new.content)
  execute function public.record_scene_revision();

-- BEFORE DELETE on scenes: permanent deletion takes the Scene's history with
-- it, except revisions a Milestone uses (their scene_id becomes null).
create function public.forget_scene_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  delete from public.scene_revisions r
   where r.scene_id = old.id
     and not exists (select 1 from public.manuscript_milestone_scenes ms where ms.revision_id = r.id);
  return old;
end;
$function$;

create trigger scenes_forget_history
  before delete on public.scenes
  for each row execute function public.forget_scene_history();

revoke execute on function public.prune_scene_revisions(uuid) from public, anon, authenticated;
revoke execute on function public.record_scene_revision() from public, anon, authenticated;
revoke execute on function public.forget_scene_history() from public, anon, authenticated;

-- ── Scene History ───────────────────────────────────────────────────────────

-- One active Scene of the caller's: its current state and its history,
-- newest first — no content. `current`: this revision holds the Scene's
-- current text. `milestones`: the names of the Milestones that use it.
create function public.list_scene_history(p_scene_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select s.* into v_scene
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_scene_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;
  if v_scene.trashed_at is not null then
    return jsonb_build_object('status', 'error', 'error', 'Restore this scene from Trash first');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'scene', jsonb_build_object('id', v_scene.id, 'title', v_scene.title, 'version', v_scene.version,
                                'word_count', v_scene.word_count, 'updated_at', v_scene.updated_at),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'title', r.title, 'word_count', r.word_count,
               'saved_at', r.saved_at, 'created_at', r.created_at, 'reason', r.reason,
               'current', r.content is not distinct from v_scene.content,
               'milestones', coalesce((select jsonb_agg(ml.name order by ml.created_at)
                                         from public.manuscript_milestone_scenes ms
                                         join public.manuscript_milestones ml on ml.id = ms.milestone_id
                                        where ms.revision_id = r.id), '[]'::jsonb))
             order by r.saved_at desc, r.created_at desc, r.id desc)
        from public.scene_revisions r
       where r.scene_id = v_scene.id), '[]'::jsonb));
end;
$function$;

-- One revision of the caller's, with its text, for a read-only preview.
create function public.get_scene_revision(p_revision_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_rev public.scene_revisions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select r.* into v_rev
    from public.scene_revisions r
    join public.manuscripts m on m.id = r.manuscript_id
    join public.projects p on p.id = m.project_id
   where r.id = p_revision_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Version not found');
  end if;
  return jsonb_build_object('status', 'ok', 'revision', jsonb_build_object(
    'id', v_rev.id, 'scene_id', v_rev.scene_id, 'title', v_rev.title, 'content', v_rev.content,
    'word_count', v_rev.word_count, 'saved_at', v_rev.saved_at, 'created_at', v_rev.created_at,
    'reason', v_rev.reason));
end;
$function$;

-- Makes an earlier text of a Scene its current text: a NEW save of that
-- text through save_scene_checked (version guard, allowance, word-count
-- triggers), after keeping the text it replaces ('restore'). Statuses:
-- ok (with version, updated_at, word_count, scene_id) | unchanged | version_mismatch |
-- word_limit_blocked | error. Only the caller's own active Scene; nothing
-- but its content, words, version and updated_at changes.
create function public.restore_scene_revision(p_revision_id uuid, p_expected_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rev public.scene_revisions%rowtype;
  v_scene public.scenes%rowtype;
  v_result jsonb;
begin
  perform public.lock_account_word_budget();
  select r.* into v_rev
    from public.scene_revisions r
    join public.manuscripts m on m.id = r.manuscript_id
    join public.projects p on p.id = m.project_id
   where r.id = p_revision_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Version not found');
  end if;
  if v_rev.scene_id is null then
    return jsonb_build_object('status', 'error', 'error', 'This scene no longer exists');
  end if;
  select s.* into v_scene from public.scenes s where s.id = v_rev.scene_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'This scene no longer exists');
  end if;
  if v_scene.trashed_at is not null then
    return jsonb_build_object('status', 'error', 'error', 'Restore this scene from Trash first');
  end if;
  if p_expected_version is null or v_scene.version <> p_expected_version then
    return jsonb_build_object('status', 'version_mismatch');
  end if;
  if v_scene.content is not distinct from v_rev.content then
    return jsonb_build_object('status', 'unchanged', 'version', v_scene.version,
                              'updated_at', v_scene.updated_at, 'word_count', v_scene.word_count);
  end if;

  perform set_config('rune.scene_restore', v_scene.id::text, true);
  v_result := public.save_scene_checked(v_scene.id, v_rev.content, v_rev.word_count, p_expected_version);
  perform set_config('rune.scene_restore', '', true);

  if v_result ->> 'status' = 'ok' then
    return v_result || jsonb_build_object('word_count', v_rev.word_count, 'scene_id', v_scene.id);
  end if;
  return v_result;
end;
$function$;

-- ── Manuscript Milestones ───────────────────────────────────────────────────

-- Names the whole manuscript as it is now. One transaction under the
-- per-account lock; changes no live row.
create function public.create_manuscript_milestone(p_manuscript_id uuid, p_name text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_scene public.scenes%rowtype;
  v_latest public.scene_revisions%rowtype;
  v_revision uuid;
  v_count integer := 0;
begin
  perform public.lock_account_word_budget();
  if not exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                  where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  if v_name = '' then
    return jsonb_build_object('status', 'error', 'error', 'Give the milestone a name');
  end if;
  if char_length(v_name) > 120 then
    return jsonb_build_object('status', 'error', 'error', 'Keep the name to 120 characters');
  end if;

  insert into public.manuscript_milestones (manuscript_id, name, structure, manuscript_words, unplaced_words, scene_count)
  values (
    p_manuscript_id,
    v_name,
    jsonb_build_object(
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title,
                                                              'parent_group_id', g.parent_group_id, 'position', g.position)
                                           order by g.position, g.id)
                            from public.manuscript_groups g where g.manuscript_id = p_manuscript_id), '[]'::jsonb),
      'chapters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title,
                                                                'group_id', c.group_id, 'position', c.position)
                                             order by c.position, c.id)
                              from public.chapters c where c.manuscript_id = p_manuscript_id), '[]'::jsonb)),
    public.ordered_manuscript_word_total(p_manuscript_id),
    (select coalesce(sum(s.word_count), 0)::int from public.scenes s
      where s.manuscript_id = p_manuscript_id and s.chapter_id is null and s.trashed_at is null),
    0)
  returning id into v_id;

  for v_scene in
    select s.* from public.scenes s
     where s.manuscript_id = p_manuscript_id and s.trashed_at is null
     order by s.chapter_id nulls last, s.position, s.id
  loop
    v_revision := null;
    select r.* into v_latest
      from public.scene_revisions r
     where r.scene_id = v_scene.id
     order by r.created_at desc, r.id desc
     limit 1;
    if found and v_latest.content is not distinct from v_scene.content and v_latest.title = v_scene.title then
      v_revision := v_latest.id;
    else
      insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, reason)
      values (v_scene.manuscript_id, v_scene.id, v_scene.title, v_scene.content, v_scene.word_count,
              v_scene.updated_at, 'milestone')
      returning id into v_revision;
    end if;
    insert into public.manuscript_milestone_scenes (milestone_id, scene_id, revision_id, chapter_id, position)
    values (v_id, v_scene.id, v_revision, v_scene.chapter_id, v_scene.position);
    v_count := v_count + 1;
  end loop;

  update public.manuscript_milestones set scene_count = v_count where id = v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$function$;

-- The Manuscript's Milestones, newest first — names, times and totals only.
create function public.list_manuscript_milestones(p_manuscript_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                  where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  return jsonb_build_object('status', 'ok', 'milestones', coalesce((
    select jsonb_agg(jsonb_build_object('id', ml.id, 'name', ml.name, 'created_at', ml.created_at,
                                        'manuscript_words', ml.manuscript_words, 'unplaced_words', ml.unplaced_words,
                                        'scene_count', ml.scene_count)
                     order by ml.created_at desc, ml.id desc)
      from public.manuscript_milestones ml where ml.manuscript_id = p_manuscript_id), '[]'::jsonb));
end;
$function$;

-- One Milestone, whole: its structure and every Scene's placement and text
-- as it was. For the read-only snapshot view.
create function public.get_manuscript_milestone(p_milestone_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_ml public.manuscript_milestones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select ml.* into v_ml
    from public.manuscript_milestones ml
    join public.manuscripts m on m.id = ml.manuscript_id
    join public.projects p on p.id = m.project_id
   where ml.id = p_milestone_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Milestone not found');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'milestone', jsonb_build_object('id', v_ml.id, 'name', v_ml.name, 'created_at', v_ml.created_at,
                                    'manuscript_words', v_ml.manuscript_words, 'unplaced_words', v_ml.unplaced_words,
                                    'scene_count', v_ml.scene_count, 'structure', v_ml.structure),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object('scene_id', ms.scene_id, 'chapter_id', ms.chapter_id, 'position', ms.position,
                                          'revision_id', r.id, 'title', r.title, 'content', r.content,
                                          'word_count', r.word_count)
                       order by ms.chapter_id nulls last, ms.position, ms.scene_id)
        from public.manuscript_milestone_scenes ms
        join public.scene_revisions r on r.id = ms.revision_id
       where ms.milestone_id = v_ml.id), '[]'::jsonb));
end;
$function$;

-- Deletes one named Milestone, on the writer's explicit request. Its
-- revisions of live Scenes stay, under the ordinary retention; revisions it
-- alone kept for Scenes since deleted go with it.
create function public.delete_manuscript_milestone(p_milestone_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_revisions uuid[];
begin
  perform public.lock_account_word_budget();
  if not exists (select 1 from public.manuscript_milestones ml
                   join public.manuscripts m on m.id = ml.manuscript_id
                   join public.projects p on p.id = m.project_id
                  where ml.id = p_milestone_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Milestone not found');
  end if;
  select coalesce(array_agg(ms.revision_id), '{}') into v_revisions
    from public.manuscript_milestone_scenes ms where ms.milestone_id = p_milestone_id;
  delete from public.manuscript_milestones where id = p_milestone_id;
  delete from public.scene_revisions r
   where r.id = any (v_revisions)
     and r.scene_id is null
     and not exists (select 1 from public.manuscript_milestone_scenes ms where ms.revision_id = r.id);
  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.list_scene_history(uuid) from public, anon;
revoke execute on function public.get_scene_revision(uuid) from public, anon;
revoke execute on function public.restore_scene_revision(uuid, integer) from public, anon;
revoke execute on function public.create_manuscript_milestone(uuid, text) from public, anon;
revoke execute on function public.list_manuscript_milestones(uuid) from public, anon;
revoke execute on function public.get_manuscript_milestone(uuid) from public, anon;
revoke execute on function public.delete_manuscript_milestone(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('036', '036_scene_history_milestones.sql', now(), 'Scene History (scene_revisions: checkpoints taken on the save path by an AFTER UPDATE OF content trigger that never fails the save — the replaced text after a 30-minute pause or an hour after the last checkpoint; 30-day/daily/200 retention; restore_scene_revision saves through save_scene_checked after keeping the replaced text) and named Manuscript Milestones (manuscript_milestones + manuscript_milestone_scenes: Groups, Chapters and every active Scene''s placement and text, reusing unchanged revisions; read-only; no live row changes)');
