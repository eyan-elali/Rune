-- ── Migration 055: Attachment registration checks what it is given ──────────
--
-- Rune 2.0, pre-beta security audit (uploads and object storage).
-- create_workspace_attachment (047) is SECURITY DEFINER and executable by
-- any signed-in account (Supabase's default privilege on public functions),
-- so a client can call it directly, around the upload route that validates
-- an image. 047 only checked that the Project is the caller's: the storage
-- key, display key, MIME type, kind, bucket and byte size were taken as
-- given. A row registered that way could name another Project's object key
-- as its display derivative (the unique (bucket, key) constraint stops this
-- for the original only), carry a non-image MIME type for the serve path,
-- or claim a kind or bucket the app never writes. Keys are unguessable
-- UUID paths, so nothing was reachable in practice; the database now
-- enforces the structure regardless.
--
-- public.create_workspace_attachment — REPLACED (same signature and result
--   shape). Besides the owner check, it now refuses, as {status: 'error'}:
--   * p_kind other than 'image';
--   * p_storage_bucket other than 'workspace-attachments';
--   * p_mime_type outside image/png, image/jpeg, image/gif, image/webp;
--   * p_byte_size outside 1 … 10 485 760 (the app's MAX_IMAGE_BYTES);
--   * p_width / p_height not both positive;
--   * p_storage_key not of the form '<project id>/<attachment id>/original.<ext>'
--     and p_display_key (when given) not '<project id>/<attachment id>/display.<ext>'
--     — the layout storageKeyFor (lib/rune2/attachments.ts) has always
--     written, so a row can only ever name bytes stored for it;
--   * p_display_key given without positive p_display_width / p_display_height,
--     or the other way round.
--   An existing row with the same id is returned as before (idempotent
--   retry), still only when it belongs to p_project_id.
--
-- Existing rows: untouched. Every row the app has registered already has
-- this shape. No table, policy, trigger, index or other function changes.
-- The app's upload route keeps validating first; this is the database's
-- own copy of the rule, for callers that skip the route.
--
-- Apply BEFORE or AFTER the app deploy: the app's calls are unchanged.
-- Rollback: re-create 047's create_workspace_attachment body from
-- schema.sql at 054, then
--   delete from public.schema_migrations where version = '055';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 055 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '055') then
    raise exception 'Migration 055 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '047') then
    raise exception 'Migration 055 requires migration 047 (workspace attachments). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_attachments') <> current_user then
    raise exception 'Migration 055 must be applied by the owner of public.workspace_attachments (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_attachments'), current_user;
  end if;
end $$;

create or replace function public.create_workspace_attachment(
  p_id uuid,
  p_project_id uuid,
  p_kind text,
  p_file_name text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_storage_bucket text,
  p_storage_key text,
  p_display_key text default null,
  p_display_width integer default null,
  p_display_height integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.workspace_attachments%rowtype;
  v_mime text := lower(btrim(coalesce(p_mime_type, '')));
  v_prefix text;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  if p_id is null then
    return jsonb_build_object('status', 'error', 'error', 'An attachment needs an id');
  end if;
  select a.* into v_row from public.workspace_attachments a where a.id = p_id;
  if found then
    if v_row.project_id <> p_project_id then
      return jsonb_build_object('status', 'error', 'error', 'That id belongs to another project');
    end if;
    return jsonb_build_object('status', 'ok', 'attachment', to_jsonb(v_row));
  end if;

  -- What the app stores, and nothing else (lib/rune2/attachments.ts).
  if coalesce(p_kind, 'image') <> 'image' then
    return jsonb_build_object('status', 'error', 'error', 'Rune can hold images only');
  end if;
  if p_storage_bucket is distinct from 'workspace-attachments' then
    return jsonb_build_object('status', 'error', 'error', 'That is not where attachments live');
  end if;
  if v_mime not in ('image/png', 'image/jpeg', 'image/gif', 'image/webp') then
    return jsonb_build_object('status', 'error', 'error', 'Rune can hold PNG, JPEG, GIF and WebP images.');
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    return jsonb_build_object('status', 'error', 'error', 'An image can be up to 10 MB.');
  end if;
  if coalesce(p_width, 0) < 1 or coalesce(p_height, 0) < 1 then
    return jsonb_build_object('status', 'error', 'error', 'That image couldn’t be read.');
  end if;
  v_prefix := p_project_id::text || '/' || p_id::text || '/';
  if p_storage_key is null or p_storage_key !~ ('^' || v_prefix || 'original\.[a-z0-9]{1,8}$') then
    return jsonb_build_object('status', 'error', 'error', 'That storage key is not this attachment’s');
  end if;
  if p_display_key is not null and p_display_key !~ ('^' || v_prefix || 'display\.[a-z0-9]{1,8}$') then
    return jsonb_build_object('status', 'error', 'error', 'That display key is not this attachment’s');
  end if;
  if (p_display_key is null) <> (p_display_width is null and p_display_height is null)
     or (p_display_key is not null and (coalesce(p_display_width, 0) < 1 or coalesce(p_display_height, 0) < 1)) then
    return jsonb_build_object('status', 'error', 'error', 'That image couldn’t be read.');
  end if;

  insert into public.workspace_attachments
    (id, project_id, kind, file_name, mime_type, byte_size, width, height, storage_bucket, storage_key, display_key, display_width, display_height)
  values
    (p_id, p_project_id, 'image', left(btrim(coalesce(p_file_name, '')), 255), v_mime,
     p_byte_size, p_width, p_height, p_storage_bucket, p_storage_key, p_display_key, p_display_width, p_display_height)
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'attachment', to_jsonb(v_row));
exception
  when others then
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$function$;

revoke execute on function public.create_workspace_attachment(uuid, uuid, text, text, text, integer, integer, integer, text, text, text, integer, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('055', '055_attachment_registration_hardening.sql', now(), 'create_workspace_attachment (same signature) refuses a kind other than image, a bucket other than workspace-attachments, a non-image MIME type, a byte size outside 1–10 MB, non-positive dimensions, and storage/display keys outside <project>/<id>/original|display.<ext>; a signed-in client calling it around the upload route can no longer register foreign keys or non-image types');
