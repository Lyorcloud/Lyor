create table public.mod_content_objects (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.catalog_mod_versions (id) on delete cascade,
  relative_path text not null check (
    char_length(relative_path) between 1 and 1024 and
    relative_path !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|\\|\x00)'
  ),
  provider text not null check (char_length(provider) between 1 and 40),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (version_id, relative_path)
);

comment on table public.mod_content_objects is
  'Metadata for loose mod files. File bytes remain in provider-neutral object storage; absolute local paths are never stored.';

alter table app_private.mod_upload_sessions add column relative_path text;
alter table public.mod_content_objects enable row level security;
alter table public.mod_content_objects force row level security;
create policy mod_content_objects_admin_select on public.mod_content_objects for select to authenticated
using ((select app_private.is_admin()));
revoke all on public.mod_content_objects from public, anon, authenticated;
grant select on public.mod_content_objects to authenticated;

create or replace function public.planaria_create_content_upload_session(
  subject uuid, target_version uuid, relative_file_path text, storage_provider text,
  generated_object_key text, expected_bytes bigint, expected_digest text,
  storage_upload_id text, session_expires_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.planaria_authorize_admin(subject) then raise exception 'admin authorization required' using errcode = '42501'; end if;
  if relative_file_path is null or char_length(relative_file_path) not between 1 and 1024 or
     relative_file_path ~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|\\|\x00)' then
    raise exception 'unsafe relative path' using errcode = '23514';
  end if;
  if not exists (select 1 from public.catalog_mod_versions where id = target_version and publish_state in ('draft', 'ready')) then
    raise exception 'version cannot accept an upload' using errcode = '23514';
  end if;
  insert into app_private.mod_upload_sessions
    (version_id, relative_path, provider, object_key, expected_size, expected_sha256, provider_upload_id, created_by, expires_at)
  values (target_version, relative_file_path, storage_provider, generated_object_key, expected_bytes, expected_digest, storage_upload_id, subject, session_expires_at)
  returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.planaria_create_content_upload_session(uuid, uuid, text, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_create_content_upload_session(uuid, uuid, text, text, text, bigint, text, text, timestamptz) to service_role;

create or replace function public.planaria_finalize_content_upload(subject uuid, upload_session uuid, actual_bytes bigint, actual_digest text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare session_row app_private.mod_upload_sessions%rowtype;
begin
  if not public.planaria_authorize_admin(subject) then raise exception 'admin authorization required' using errcode = '42501'; end if;
  select * into session_row from app_private.mod_upload_sessions where id = upload_session for update;
  if session_row.id is null or session_row.relative_path is null or session_row.state not in ('pending', 'uploading') or
     session_row.expires_at <= now() or session_row.expected_size <> actual_bytes or session_row.expected_sha256 <> actual_digest then
    raise exception 'upload finalization verification failed' using errcode = '23514';
  end if;
  insert into public.mod_content_objects (version_id, relative_path, provider, object_key, byte_size, sha256, verified_at)
  values (session_row.version_id, session_row.relative_path, session_row.provider, session_row.object_key, actual_bytes, actual_digest, now())
  on conflict (version_id, relative_path) do update set provider = excluded.provider, object_key = excluded.object_key,
    byte_size = excluded.byte_size, sha256 = excluded.sha256, verified_at = excluded.verified_at, created_at = now();
  update app_private.mod_upload_sessions set state = 'finalized', finalized_at = now() where id = upload_session;
  return session_row.version_id;
end; $$;
revoke all on function public.planaria_finalize_content_upload(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.planaria_finalize_content_upload(uuid, uuid, bigint, text) to service_role;

create or replace function public.planaria_version_has_verified_content(target_version uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mod_content_objects where version_id = target_version and verified_at is not null)
    or exists (select 1 from public.mod_package_objects where version_id = target_version and verified_at is not null);
$$;
revoke all on function public.planaria_version_has_verified_content(uuid) from public, anon, authenticated;
grant execute on function public.planaria_version_has_verified_content(uuid) to service_role;

create or replace function public.planaria_mark_version_ready(subject uuid, target_version uuid, expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer; declare target_mod text;
begin
  if not public.planaria_authorize_admin(subject) then raise exception 'admin authorization required' using errcode = '42501'; end if;
  update public.catalog_mod_versions version set publish_state = 'ready', updated_at = now()
  where version.id = target_version and version.publish_state = 'draft' and version.updated_at = expected_updated_at
    and jsonb_typeof(version.manifest) = 'object'
    and version.manifest->>'schemaVersion' = version.manifest_schema_version::text
    and version.adapter_id in ('generic-files', 'synthetic-container-fixture')
    and public.planaria_version_has_verified_content(version.id)
  returning version.mod_id into target_mod;
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.catalog_mods set publish_state = 'ready', updated_at = now() where id = target_mod and publish_state = 'draft';
    insert into app_private.planaria_audit_events (actor_user_id, action, entity_type, entity_id, summary)
    values (subject, 'mod.ready', 'mod_version', target_version::text, 'Version passed Ready validation.');
  end if;
  return changed = 1;
end; $$;
revoke all on function public.planaria_mark_version_ready(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_mark_version_ready(uuid, uuid, timestamptz) to service_role;

create or replace function public.planaria_publish_version(subject uuid, target_version uuid, expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer; declare target_mod text;
begin
  if not public.planaria_authorize_admin(subject) then raise exception 'admin authorization required' using errcode = '42501'; end if;
  update public.catalog_mod_versions version set publish_state = 'published', published_at = now(), updated_at = now()
  where version.id = target_version and version.publish_state = 'ready' and version.updated_at = expected_updated_at
    and public.planaria_version_has_verified_content(version.id)
  returning version.mod_id into target_mod;
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.catalog_mods set publish_state = 'published', updated_at = now() where id = target_mod;
    insert into app_private.planaria_audit_events (actor_user_id, action, entity_type, entity_id, summary)
    values (subject, 'mod.published', 'mod_version', target_version::text, 'Version published.');
  end if;
  return changed = 1;
end; $$;
revoke all on function public.planaria_publish_version(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_publish_version(uuid, uuid, timestamptz) to service_role;
