-- ── Migration 050: attachment sweep deletes the row first, then the bytes ────
--
-- Rune 2.0, Beta Completion. The sweep of attachments nothing references
-- (047) removed the BYTES first and only then the rows, and
-- delete_workspace_attachments refused a row that had gained a reference
-- meanwhile. A placement made between list_unreferenced_attachments and
-- delete_workspace_attachments — a device draft replayed after being offline
-- for longer than the grace period, say — therefore ended as a row whose
-- bytes were gone: "Image unavailable" for good. Two rules from now on:
-- bytes are never removed while a row still references them, and a row
-- never outlives its bytes.
--
-- public.delete_workspace_attachments(project, ids) — REDEFINED, same
--   signature. Owner-checked as before. In ONE transaction, under the
--   Project's Workspace lock (lock_project_workspace — the lock every
--   placement write holds, so no placement is made while it decides):
--     1. of the given ids, deletes the attachment rows of the Project that
--        are STILL unreferenced (no placement on any Canvas, active or in
--        Trash — the same predicate as before; a row referenced meanwhile is
--        kept, with its bytes);
--     2. records the storage keys of every deleted row (original and display
--        derivative, grouped per bucket, as delete_trashed_project does) in
--        project_storage_purges (user_id = the caller, project_id = the
--        Project).
--   Returns {status: 'ok', deleted: [ids], purges: [{id, storage_bucket,
--   storage_keys}]}: the server then removes the bytes of each purge and
--   deletes the purge row; a purge it cannot finish stays recorded and is
--   retried by the same sweep that finishes a deleted Project's purges.
--   Bytes live outside the database, so the durable record — written in the
--   same transaction as the row's deletion — is what keeps them from being
--   orphaned.
--
-- list_unreferenced_attachments, create_workspace_attachment, the
-- workspace_attachments table and project_storage_purges are not changed.
-- No manuscript row, trigger, policy, grant or other function changes.
--
-- Apply BEFORE the app deploy that sweeps row-first. The previous app keeps
-- working: it removes bytes first and then calls this function, which deletes
-- the rows and records purges the app never carries out — the keys recorded
-- then point at bytes already removed; the purge sweep of the new app removes
-- nothing (object storage ignores a missing key) and clears the records. The
-- new app on a database without this migration gets no `purges` back and
-- removes the bytes of the deleted ids itself, as before.
-- Rollback (the sweep returns to bytes-first; carry out recorded purges
-- first, or their bytes stay behind):
--   re-create public.delete_workspace_attachments(uuid, uuid[]) from 047;
--   delete from public.schema_migrations where version = '050';
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 050 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '050') then
    raise exception 'Migration 050 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '049') then
    raise exception 'Migration 050 requires migration 049 (Project Trash / project_storage_purges). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_attachments') <> current_user then
    raise exception 'Migration 050 must be applied by the owner of public.workspace_attachments (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_attachments'), current_user;
  end if;
end $$;

-- ── delete_workspace_attachments: rows first, bytes owed as a purge ─────────

create or replace function public.delete_workspace_attachments(p_project_id uuid, p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ids uuid[];
  v_deleted uuid[];
  v_purge public.project_storage_purges%rowtype;
  v_purges jsonb := '[]'::jsonb;
  v_bucket text;
  v_keys text[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  v_ids := coalesce(p_ids, array[]::uuid[]);
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('status', 'ok', 'deleted', '[]'::jsonb, 'purges', '[]'::jsonb);
  end if;

  -- No placement of this Project is written while this decides (every
  -- placement write holds the same lock).
  perform public.lock_project_workspace(p_project_id);

  -- The rows themselves, locked: a placement insert in flight (holding a key
  -- share on its attachment) finishes before the reference check below.
  perform 1 from public.workspace_attachments a
    where a.project_id = p_project_id and a.id = any(v_ids)
    for update;

  -- Still unreferenced: no placement on any Canvas, active or in Trash.
  select coalesce(array_agg(a.id order by a.created_at, a.id), array[]::uuid[]) into v_deleted
    from public.workspace_attachments a
   where a.project_id = p_project_id
     and a.id = any(v_ids)
     and not exists (select 1 from public.workspace_canvas_items i where i.attachment_id = a.id);

  if cardinality(v_deleted) = 0 then
    return jsonb_build_object('status', 'ok', 'deleted', '[]'::jsonb, 'purges', '[]'::jsonb);
  end if;

  -- Their bytes, owed a removal: every storage key, per bucket (one in practice).
  for v_bucket, v_keys in
    select a.storage_bucket,
           array_agg(k.key order by k.key)
      from public.workspace_attachments a
      cross join lateral (values (a.storage_key), (a.display_key)) as k(key)
     where a.project_id = p_project_id and a.id = any(v_deleted) and k.key is not null
     group by a.storage_bucket
  loop
    insert into public.project_storage_purges (user_id, project_id, storage_bucket, storage_keys)
    values (auth.uid(), p_project_id, v_bucket, v_keys)
    returning * into v_purge;
    v_purges := v_purges || jsonb_build_object('id', v_purge.id, 'storage_bucket', v_purge.storage_bucket, 'storage_keys', to_jsonb(v_purge.storage_keys));
  end loop;

  delete from public.workspace_attachments a
   where a.project_id = p_project_id and a.id = any(v_deleted);

  return jsonb_build_object('status', 'ok', 'deleted', to_jsonb(v_deleted), 'purges', v_purges);
end;
$function$;

revoke execute on function public.delete_workspace_attachments(uuid, uuid[]) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('050', '050_attachment_purge.sql', now(), 'Attachment sweep row-first: delete_workspace_attachments (same signature) deletes, under the Project Workspace lock, only the given rows still unreferenced and records their storage keys in project_storage_purges in the same transaction, returning deleted ids and purges for the server to remove the bytes and clear; bytes are never removed while referenced and a row never outlives its bytes. Fixes rows left without bytes by a placement made between list and delete');
