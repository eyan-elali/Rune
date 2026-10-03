-- ── Migration 051: Trash visibility for Entry values and Collection Views ───
--
-- Rune 2.0, Beta Completion B closeout. Two read policies written before
-- Trash existed (026, 027) still checked Project ownership only, so a
-- writer's reads returned the property values of Entries in Trash and the
-- Views of a Collection in Trash, while the Entries and Collections
-- themselves were hidden (030). Read-only, the writer's own data, never
-- another account's — but it put Trash data in front of the shell. From now
-- on both tables follow the rule every other Workspace table follows: a row
-- is readable only while the object that owns it is ACTIVE.
--
-- public.workspace_entry_values — policy "workspace_entry_values: select own"
--   REDEFINED: the value's Entry must be active (trashed_at IS NULL) and its
--   Collection active, in the caller's Project, exactly as
--   "workspace_collection_entries: select own" (030) decides whether the
--   Entry itself is readable. A value is never readable when its Entry is not.
-- public.workspace_collection_views — policy "workspace_collection_views:
--   select own" REDEFINED: the View's Collection must be active, in the
--   caller's Project, exactly as "workspace_collections: select own" (030)
--   decides whether the Collection itself is readable.
--
-- Nothing else changes: no write policy (clients never write either table —
-- every change goes through set_workspace_entry_value /
-- set_workspace_entry_relationship and the View functions, SECURITY DEFINER),
-- no grant, no function, no manuscript table. Trash, restore, permanent
-- deletion, Project Search and read_project_backup run as SECURITY DEFINER
-- and are unaffected: Trash is listed from list_workspace_trash and a backup
-- includes Trash as before. Restoring an Entry or a Collection makes its
-- values / Views readable again at once (nothing of theirs is changed by
-- Trash).
--
-- Apply after 050. Safe with the current app in either order: the app only
-- reads these tables through the loader, and ignores rows it cannot match to
-- an active object.
-- Rollback (the policies return to ownership only; Trash data is readable again):
--   drop policy "workspace_entry_values: select own" on public.workspace_entry_values;
--   create policy "workspace_entry_values: select own" on public.workspace_entry_values
--     as permissive for select to authenticated
--     using (exists (select 1 from public.projects p
--                    where p.id = workspace_entry_values.project_id and p.user_id = (select auth.uid())));
--   drop policy "workspace_collection_views: select own" on public.workspace_collection_views;
--   create policy "workspace_collection_views: select own" on public.workspace_collection_views
--     as permissive for select to authenticated
--     using (exists (select 1 from public.projects p
--                    where p.id = workspace_collection_views.project_id and p.user_id = (select auth.uid())));
--   delete from public.schema_migrations where version = '051';
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 051 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '051') then
    raise exception 'Migration 051 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '050') then
    raise exception 'Migration 051 requires migration 050 (attachment purge). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_entry_values') <> current_user then
    raise exception 'Migration 051 must be applied by the owner of public.workspace_entry_values (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_entry_values'), current_user;
  end if;
end $$;

-- ── Entry values: readable only while the Entry (and its Collection) is active ──

drop policy "workspace_entry_values: select own" on public.workspace_entry_values;
create policy "workspace_entry_values: select own" on public.workspace_entry_values
  as permissive for select to authenticated
  using (exists (select 1 from public.workspace_collection_entries e
                 join public.workspace_collections c on c.id = e.collection_id
                 join public.projects p on p.id = c.project_id
                 where e.id = workspace_entry_values.entry_id
                   and e.trashed_at is null and c.trashed_at is null
                   and e.project_id = workspace_entry_values.project_id
                   and p.id = workspace_entry_values.project_id and p.user_id = (select auth.uid())));

-- ── Collection Views: readable only while the Collection is active ──────────

drop policy "workspace_collection_views: select own" on public.workspace_collection_views;
create policy "workspace_collection_views: select own" on public.workspace_collection_views
  as permissive for select to authenticated
  using (exists (select 1 from public.workspace_collections c
                 join public.projects p on p.id = c.project_id
                 where c.id = workspace_collection_views.collection_id and c.trashed_at is null
                   and p.id = workspace_collection_views.project_id and p.user_id = (select auth.uid())));

insert into public.schema_migrations (version, name, applied_at, note)
values ('051', '051_trash_visibility_values_views.sql', now(), 'Trash visibility (BC-B closeout): workspace_entry_values and workspace_collection_views select policies now require the owning Entry (and its Collection) / the owning Collection to be active, as every other Workspace table''s do since 030; ownership and Project isolation unchanged, no write policy, grant or function changes');
