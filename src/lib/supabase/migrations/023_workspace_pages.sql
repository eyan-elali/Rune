-- ── Migration 023: Workspace Pages (public.workspace_documents) ──────────────
--
-- Rune 2.0 Workspace, Milestone 6. The first Workspace object (architecture
-- §9–10): a Page — a freeform supporting document beside the Manuscript
-- ("Magic System Notes", "Ending Ideas", "Research").
--
-- public.workspace_documents — NEW. One row is one Workspace Page.
--   * Physically NOT "pages" (architecture §10, invariant 30): Rune 1.x's
--     `pages` table is manuscript prose on production, and Scenes live in
--     `scenes`. A Workspace Page is neither: it is not manuscript prose, never
--     counts toward any manuscript or account word total, and is never
--     written by the Scene save path (save_scene_checked and the offline
--     queue). Nothing in this migration touches a manuscript table.
--   * Belongs directly to one Project (project_id), and can never move to
--     another (trigger workspace_documents_forbid_project_reassignment).
--     Deleting a Project removes its Workspace Pages with it.
--   * title is optional (null = untitled; never blank), at most 200 characters.
--   * content is TipTap JSON (a JSON object), empty doc by default.
--   * version: bumped by the database whenever content changes — never by a
--     title change, so renaming a Page cannot turn an in-flight content save
--     into a false conflict. Clients cannot set it; they compare against it
--     (update … where version = expected).
--   * created_at / updated_at are set by the database.
--   * No hierarchy, position, properties or Trash yet: a Project's Pages are a
--     flat list in creation order. The Workspace tree (WorkspaceNode) will
--     place Pages separately from owning them (§14), so none of that belongs
--     on this row.
--
-- RLS: a writer reads, creates and updates Pages only in their own Projects.
-- There is no DELETE for clients (no privilege, no policy): deletion in Rune
-- 2.0 is recoverable (§26, Trash), and Trash does not exist yet.
--
-- For the Rune 2.0 database only: it requires 022. Nothing existing changes,
-- so it is safe to apply before the app deploy that uses it.
-- Rollback (drops every Workspace Page):
--   drop table public.workspace_documents;
--   drop function public.stamp_workspace_document();
--   drop function public.forbid_project_reassignment();
--   delete from public.schema_migrations where version = '023';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 023 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '023') then
    raise exception 'Migration 023 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '022') then
    raise exception 'Migration 023 requires migration 022 (manuscript groups). Nothing was changed.';
  end if;
end
$$;

create table public.workspace_documents (
  id          uuid        default gen_random_uuid() not null,
  project_id  uuid        not null,
  title       text,                                                   -- null = untitled
  content     jsonb       default '{"type": "doc", "content": []}'::jsonb not null,
  version     integer     default 1     not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

alter table public.workspace_documents add constraint workspace_documents_pkey primary key (id);
alter table public.workspace_documents add constraint workspace_documents_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_documents add constraint workspace_documents_title_check
  check (title is null or (btrim(title) <> '' and char_length(title) <= 200));
alter table public.workspace_documents add constraint workspace_documents_content_is_object
  check (jsonb_typeof(content) = 'object');

-- A Project's Pages in creation order (the navigator's list).
create index workspace_documents_project_id_created_at_idx
  on public.workspace_documents using btree (project_id, created_at);

-- A Workspace Page keeps its Project for life.
create function public.forbid_project_reassignment()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'A row of % cannot move to another Project', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- The database owns version and timestamps: a new Page starts at version 1;
-- an update bumps version only when content changes (a rename never does),
-- and moves updated_at whenever anything changes.
create function public.stamp_workspace_document()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.version := case when new.content is distinct from old.content then old.version + 1 else old.version end;
  new.updated_at := case when new.content is distinct from old.content or new.title is distinct from old.title
                         then now() else old.updated_at end;
  return new;
end;
$function$;

revoke execute on function public.forbid_project_reassignment() from public, anon;
revoke execute on function public.stamp_workspace_document() from public, anon;

create trigger workspace_documents_forbid_project_reassignment before update of project_id on public.workspace_documents
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_documents_stamp before insert or update on public.workspace_documents
  for each row execute function public.stamp_workspace_document();

-- RLS: your own Projects' Pages only. No DELETE for clients until Trash exists.
alter table public.workspace_documents enable row level security;

create policy "workspace_documents: select own" on public.workspace_documents
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));
create policy "workspace_documents: insert own" on public.workspace_documents
  as permissive for insert to authenticated
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));
create policy "workspace_documents: update own" on public.workspace_documents
  as permissive for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));

revoke delete on public.workspace_documents from anon, authenticated;

insert into public.schema_migrations (version, name, applied_at, note)
values ('023', '023_workspace_pages.sql', now(), 'Workspace Pages (workspace_documents): per-Project freeform documents, content-versioned, RLS by Project owner, no client DELETE');
