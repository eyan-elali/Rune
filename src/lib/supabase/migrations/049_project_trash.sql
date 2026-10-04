-- ── Migration 049: Project Trash and permanent Project deletion ─────────────
--
-- Rune 2.0, Beta Completion A. Deleting a Project becomes recoverable: the
-- ordinary action moves it to Trash, and only a Project already in Trash can
-- be deleted permanently. Nothing here reads, writes or moves a Scene, a
-- Chapter or any Workspace object; a Project's content is never touched by
-- moving it to Trash or back.
--
-- public.projects — CHANGED.
--   * trashed_at (NEW, null = active): when the Project went to Trash. A
--     trashed Project keeps every row it owns, exactly as it was; the app
--     leaves it out of the Projects list and will not open it (it offers
--     Restore instead). Its rows stay readable by their owner under the
--     existing policies, and the existing write functions keep accepting a
--     trashed Project's writes — a save queued offline on another device, or
--     an editor left open, still lands in the Project rather than being lost,
--     and is there when the Project is restored.
--   * Only the database moves a Project in or out of Trash
--     (projects_protect_trashed_at: a client UPDATE of trashed_at is refused).
--   * Client DELETE is REVOKED. A Project is deleted only by
--     delete_trashed_project, which refuses an active Project.
--
-- public.trash_project(project) / public.restore_project(project) — NEW.
--   Owner-checked; idempotent (trashing a trashed Project, or restoring an
--   active one, changes nothing and reports ok). updated_at is not changed,
--   so a restored Project returns to its place in the list.
--
-- public.delete_trashed_project(project) — NEW. Owner-checked; refuses an
--   active Project. In ONE transaction: records the Project's attachment
--   bytes (every storage key of its workspace_attachments, originals and
--   display derivatives) in project_storage_purges, then deletes the Project,
--   whose rows all go with it (every Project-owned table cascades from
--   projects or from its Manuscript). Returns the purge to carry out. The
--   server then removes those bytes from object storage and deletes the
--   purge row; a purge it could not finish stays recorded and is retried
--   (bytes live outside the database, so they can never be removed by the
--   same transaction — the durable record is what keeps them from being
--   orphaned).
--
-- public.project_storage_purges — NEW. Object-storage bytes owed a removal
--   after their Project was deleted: user_id, project_id (no FK: the Project
--   is gone), storage_bucket, storage_keys. Inserted only by
--   delete_trashed_project; the owner reads and deletes their own rows (the
--   server, as the writer, after the bytes are removed). Holds file names of
--   nothing and no content — only opaque keys.
--
-- Apply BEFORE the app deploy that offers Project Trash. The previous app
-- keeps working, except that its permanent "Delete project" is refused (no
-- DELETE privilege); it has no other use of DELETE on projects.
-- Rollback (Projects in Trash become active again; recorded purges are lost —
-- remove their bytes first):
--   drop function public.delete_trashed_project(uuid);
--   drop function public.restore_project(uuid);
--   drop function public.trash_project(uuid);
--   drop table public.project_storage_purges;
--   drop trigger projects_protect_trashed_at on public.projects;
--   drop function public.protect_project_trashed_at();
--   alter table public.projects drop column trashed_at;
--   grant delete on public.projects to authenticated;
--   delete from public.schema_migrations where version = '049';
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 049 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '049') then
    raise exception 'Migration 049 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '048') then
    raise exception 'Migration 049 requires migration 048 (Canvas note promotion). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects') <> current_user then
    raise exception 'Migration 049 must be applied by the owner of public.projects (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects'), current_user;
  end if;
end $$;

-- ── Projects: trashed_at ────────────────────────────────────────────────────

alter table public.projects add column trashed_at timestamp with time zone;

create or replace function public.protect_project_trashed_at()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.trashed_at is distinct from old.trashed_at
     and current_user in ('anon', 'authenticated') then
    raise exception 'A Project moves to and from Trash only through trash_project and restore_project'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger projects_protect_trashed_at before update of trashed_at on public.projects
  for each row execute function public.protect_project_trashed_at();

revoke delete on public.projects from anon;
revoke delete on public.projects from authenticated;

-- ── Storage purges ──────────────────────────────────────────────────────────

create table public.project_storage_purges (
  id             uuid        default gen_random_uuid() not null,
  user_id        uuid        not null,
  project_id     uuid        not null,
  storage_bucket text        not null,
  storage_keys   text[]      not null,
  created_at     timestamp with time zone default now() not null,
  constraint project_storage_purges_pkey primary key (id)
);

create index project_storage_purges_user_id_idx on public.project_storage_purges (user_id);

alter table public.project_storage_purges enable row level security;

create policy "project_storage_purges: select own" on public.project_storage_purges
  as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy "project_storage_purges: delete own" on public.project_storage_purges
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));

revoke all on public.project_storage_purges from anon;
revoke insert, update, truncate, references, trigger on public.project_storage_purges from authenticated;

-- ── Trash / restore / permanent deletion ────────────────────────────────────

create or replace function public.trash_project(p_project_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project public.projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_project
    from public.projects
   where id = p_project_id and user_id = auth.uid()
     for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  if v_project.trashed_at is null then
    update public.projects set trashed_at = now() where id = p_project_id
    returning * into v_project;
  end if;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_project));
end;
$function$;

create or replace function public.restore_project(p_project_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project public.projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_project
    from public.projects
   where id = p_project_id and user_id = auth.uid()
     for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  if v_project.trashed_at is not null then
    update public.projects set trashed_at = null where id = p_project_id
    returning * into v_project;
  end if;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_project));
end;
$function$;

create or replace function public.delete_trashed_project(p_project_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project public.projects%rowtype;
  v_purge public.project_storage_purges%rowtype;
  v_bucket text;
  v_keys text[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_project
    from public.projects
   where id = p_project_id and user_id = auth.uid()
     for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  if v_project.trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Only a Project in Trash can be deleted permanently');
  end if;

  -- No attachment of this Project is registered or swept meanwhile.
  perform public.lock_project_workspace(p_project_id);

  -- Every object-storage key the Project's attachments hold, per bucket (one in practice).
  for v_bucket, v_keys in
    select a.storage_bucket,
           array_agg(k.key order by k.key)
      from public.workspace_attachments a
      cross join lateral (values (a.storage_key), (a.display_key)) as k(key)
     where a.project_id = p_project_id and k.key is not null
     group by a.storage_bucket
  loop
    insert into public.project_storage_purges (user_id, project_id, storage_bucket, storage_keys)
    values (auth.uid(), p_project_id, v_bucket, v_keys)
    returning * into v_purge;
  end loop;

  delete from public.projects where id = p_project_id;

  return jsonb_build_object(
    'status', 'ok',
    'purges', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'storage_bucket', p.storage_bucket, 'storage_keys', to_jsonb(p.storage_keys)))
                          from public.project_storage_purges p
                         where p.project_id = p_project_id and p.user_id = auth.uid()), '[]'::jsonb));
end;
$function$;

revoke execute on function public.trash_project(uuid) from public, anon;
revoke execute on function public.restore_project(uuid) from public, anon;
revoke execute on function public.delete_trashed_project(uuid) from public, anon;
revoke execute on function public.protect_project_trashed_at() from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('049', '049_project_trash.sql', now(), 'Project Trash (BC-A): projects.trashed_at (client writes refused, projects_protect_trashed_at); trash_project / restore_project (owner-checked, idempotent, content untouched); client DELETE on projects revoked — delete_trashed_project deletes only a trashed Project, cascading every Project-owned row, and records its attachment storage keys in project_storage_purges (owner select/delete) for the server to remove the bytes');
