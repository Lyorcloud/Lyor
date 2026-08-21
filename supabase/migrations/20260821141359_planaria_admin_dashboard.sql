-- Planaria administration is server-authoritative. Desktop clients may read
-- RLS-filtered catalog data and their own access summary, but every mutation
-- is performed by an authenticated Edge Function using these service-only
-- functions. Package/media bytes never enter Postgres.

create table app_private.admin_permissions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  can_manage_admins boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.planaria_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_-]{1,39}$'),
  entity_id text check (entity_id is null or char_length(entity_id) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 500),
  created_at timestamptz not null default now()
);

create index planaria_audit_events_recent_idx
  on app_private.planaria_audit_events (created_at desc, id);
create index planaria_audit_events_actor_idx
  on app_private.planaria_audit_events (actor_user_id);

create table public.catalog_mod_media (
  id uuid primary key default gen_random_uuid(),
  mod_id text not null references public.catalog_mods (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  width integer not null check (width between 320 and 7680),
  height integer not null check (height between 180 and 4320),
  display_order integer not null check (display_order >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index catalog_mod_media_mod_order_idx
  on public.catalog_mod_media (mod_id, display_order);
create index catalog_mod_media_created_by_idx
  on public.catalog_mod_media (created_by);

create table app_private.mod_media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  mod_id text not null references public.catalog_mods (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  provider_upload_id text not null check (char_length(provider_upload_id) between 1 and 512),
  expected_size bigint not null check (expected_size > 0 and expected_size <= 20971520),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_mime_type text not null check (expected_mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  created_by uuid not null references auth.users (id),
  state text not null default 'pending' check (state in ('pending', 'uploading', 'finalized', 'aborted', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index mod_media_upload_sessions_expiry_idx
  on app_private.mod_media_upload_sessions (state, expires_at);
create index mod_media_upload_sessions_mod_idx
  on app_private.mod_media_upload_sessions (mod_id);
create index mod_media_upload_sessions_created_by_idx
  on app_private.mod_media_upload_sessions (created_by);

create index if not exists mod_upload_sessions_version_id_idx
  on app_private.mod_upload_sessions (version_id);
create index if not exists mod_upload_sessions_created_by_idx
  on app_private.mod_upload_sessions (created_by);
create index if not exists billboard_upload_sessions_created_by_idx
  on app_private.billboard_upload_sessions (created_by);

alter table public.catalog_mod_media enable row level security;
alter table public.catalog_mod_media force row level security;

create policy catalog_mod_media_public_select on public.catalog_mod_media
for select to anon, authenticated
using (exists (
  select 1 from public.catalog_mods
  where catalog_mods.id = catalog_mod_media.mod_id
    and catalog_mods.publish_state = 'published'
));

create policy catalog_mod_media_admin_select on public.catalog_mod_media
for select to authenticated using ((select app_private.is_admin()));

revoke all on public.catalog_mod_media from public, anon, authenticated;
grant select on public.catalog_mod_media to anon, authenticated;
revoke all on app_private.admin_permissions,
  app_private.planaria_audit_events,
  app_private.mod_media_upload_sessions
from public, anon, authenticated;

-- Current Supabase projects no longer auto-expose newly created tables. Keep
-- backend capability explicit while desktop/browser roles remain read-only or
-- fully revoked as defined below.
grant select, insert, update, delete on public.catalog_games,
  public.catalog_mods,
  public.catalog_mod_versions,
  public.mod_package_objects,
  public.mod_metrics,
  public.catalog_mod_media,
  public.billboards
to service_role;

-- Milestone 7/8 originally allowed direct authenticated admin writes guarded
-- by RLS. The completed dashboard narrows this further: all privileged writes
-- now require the authenticated Edge boundary and service-only RPCs.
revoke insert, update, delete on public.catalog_games,
  public.catalog_mods,
  public.catalog_mod_versions,
  public.mod_package_objects,
  public.user_entitlements,
  public.billboards
from authenticated;

create or replace function public.planaria_my_access()
returns table (role text, can_manage_admins boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select roles.role,
    roles.role = 'super_admin' or coalesce(permissions.can_manage_admins, false)
  from app_private.user_roles roles
  left join app_private.admin_permissions permissions on permissions.user_id = roles.user_id
  where roles.user_id = (select auth.uid());
$$;

revoke all on function public.planaria_my_access() from public, anon;
grant execute on function public.planaria_my_access() to authenticated;

create or replace function public.planaria_get_access(subject uuid)
returns table (role text, can_manage_admins boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select roles.role,
    roles.role = 'super_admin' or coalesce(permissions.can_manage_admins, false)
  from app_private.user_roles roles
  left join app_private.admin_permissions permissions on permissions.user_id = roles.user_id
  where roles.user_id = subject and roles.role in ('admin', 'super_admin');
$$;

revoke all on function public.planaria_get_access(uuid) from public, anon, authenticated;
grant execute on function public.planaria_get_access(uuid) to service_role;

create or replace function public.planaria_can_manage_admins(subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select subject is not null and exists (
    select 1
    from app_private.user_roles roles
    left join app_private.admin_permissions permissions on permissions.user_id = roles.user_id
    where roles.user_id = subject
      and (roles.role = 'super_admin' or (roles.role = 'admin' and permissions.can_manage_admins))
  );
$$;

revoke all on function public.planaria_can_manage_admins(uuid) from public, anon, authenticated;
grant execute on function public.planaria_can_manage_admins(uuid) to service_role;

create or replace function public.planaria_bootstrap_first_admin(
  subject uuid,
  requested_username text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lyor-planaria-first-admin'));
  if subject is null or requested_username !~ '^[a-z0-9][a-z0-9._-]{2,63}$' or
     not exists (select 1 from auth.users where id = subject) or
     exists (select 1 from app_private.user_roles where role in ('admin', 'super_admin')) then
    return false;
  end if;

  update app_private.user_roles
  set role = 'super_admin', updated_at = now()
  where user_id = subject and role = 'user';
  if not found then return false; end if;

  insert into app_private.planaria_admin_usernames (user_id, username)
  values (subject, requested_username);
  insert into app_private.admin_permissions (user_id, can_manage_admins)
  values (subject, true);
  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, 'admin.bootstrap', 'admin_account', subject::text, 'First super-admin bootstrap completed.');
  return true;
end;
$$;

revoke all on function public.planaria_bootstrap_first_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.planaria_bootstrap_first_admin(uuid, text) to service_role;

create or replace function public.planaria_register_admin_account(
  subject uuid,
  target_user uuid,
  requested_username text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.planaria_can_manage_admins(subject) or target_user is null or
     requested_username !~ '^[a-z0-9][a-z0-9._-]{2,63}$' then
    raise exception 'admin account management denied' using errcode = '42501';
  end if;

  update app_private.user_roles
  set role = 'admin', updated_at = now()
  where user_id = target_user and role = 'user';
  if not found then return false; end if;

  insert into app_private.planaria_admin_usernames (user_id, username)
  values (target_user, requested_username);
  insert into app_private.admin_permissions (user_id, can_manage_admins)
  values (target_user, false)
  on conflict (user_id) do update set can_manage_admins = false, updated_at = now();
  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, 'admin.created', 'admin_account', target_user::text, 'Admin account created.');
  return true;
end;
$$;

revoke all on function public.planaria_register_admin_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.planaria_register_admin_account(uuid, uuid, text) to service_role;

create or replace function public.planaria_mark_version_ready(
  subject uuid,
  target_version uuid,
  expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
declare target_mod text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update public.catalog_mod_versions version
  set publish_state = 'ready', updated_at = now()
  where version.id = target_version
    and version.publish_state = 'draft'
    and version.updated_at = expected_updated_at
    and jsonb_typeof(version.manifest) = 'object'
    and version.manifest->>'schemaVersion' = version.manifest_schema_version::text
    and version.adapter_id in ('generic-files', 'synthetic-container-fixture')
    and exists (
      select 1 from public.mod_package_objects package
      where package.version_id = version.id and package.verified_at is not null
    )
  returning version.mod_id into target_mod;
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.catalog_mods set publish_state = 'ready', updated_at = now()
    where id = target_mod and publish_state = 'draft';
    insert into app_private.planaria_audit_events
      (actor_user_id, action, entity_type, entity_id, summary)
    values (subject, 'mod.ready', 'mod_version', target_version::text, 'Version passed Ready validation.');
  end if;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_mark_version_ready(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_mark_version_ready(uuid, uuid, timestamptz) to service_role;

create or replace function public.planaria_publish_version(
  subject uuid,
  target_version uuid,
  expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
declare target_mod text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update public.catalog_mod_versions version
  set publish_state = 'published', published_at = now(), updated_at = now()
  where version.id = target_version and version.publish_state = 'ready'
    and version.updated_at = expected_updated_at
    and exists (
      select 1 from public.mod_package_objects package
      where package.version_id = version.id and package.verified_at is not null
    )
  returning version.mod_id into target_mod;
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.catalog_mods set publish_state = 'published', updated_at = now()
    where id = target_mod;
    insert into app_private.planaria_audit_events
      (actor_user_id, action, entity_type, entity_id, summary)
    values (subject, 'mod.published', 'mod_version', target_version::text, 'Version published.');
  end if;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_publish_version(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_publish_version(uuid, uuid, timestamptz) to service_role;

create or replace function public.planaria_disable_version(
  subject uuid,
  target_version uuid,
  expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
declare target_mod text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update public.catalog_mod_versions version
  set publish_state = 'disabled', updated_at = now()
  where version.id = target_version and version.publish_state in ('ready', 'published')
    and version.updated_at = expected_updated_at
  returning version.mod_id into target_mod;
  get diagnostics changed = row_count;
  if changed = 1 and not exists (
    select 1 from public.catalog_mod_versions
    where mod_id = target_mod and publish_state = 'published'
  ) then
    update public.catalog_mods set publish_state = 'disabled', updated_at = now()
    where id = target_mod;
  end if;
  if changed = 1 then
    insert into app_private.planaria_audit_events
      (actor_user_id, action, entity_type, entity_id, summary)
    values (subject, 'mod.disabled', 'mod_version', target_version::text, 'Version disabled.');
  end if;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_disable_version(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_disable_version(uuid, uuid, timestamptz) to service_role;

create or replace function public.planaria_get_upload_context(
  subject uuid,
  upload_session uuid
)
returns table (
  object_key text,
  provider_upload_id text,
  expected_size bigint,
  expected_sha256 text,
  state text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select session.object_key, session.provider_upload_id, session.expected_size,
    session.expected_sha256, session.state, session.expires_at
  from app_private.mod_upload_sessions session
  where public.planaria_authorize_admin(subject)
    and session.id = upload_session
    and session.created_by = subject;
$$;

revoke all on function public.planaria_get_upload_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_get_upload_context(uuid, uuid) to service_role;

create or replace function public.planaria_create_mod_media_upload(
  subject uuid,
  target_mod text,
  storage_provider text,
  generated_object_key text,
  storage_upload_id text,
  expected_bytes bigint,
  expected_digest text,
  expected_mime text,
  session_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.planaria_authorize_admin(subject) or not exists (
    select 1 from public.catalog_mods
    where id = target_mod and publish_state in ('draft', 'ready')
  ) then
    raise exception 'admin authorization required or mod immutable' using errcode = '42501';
  end if;
  insert into app_private.mod_media_upload_sessions (
    mod_id, provider, object_key, provider_upload_id, expected_size,
    expected_sha256, expected_mime_type, created_by, expires_at
  ) values (
    target_mod, storage_provider, generated_object_key, storage_upload_id,
    expected_bytes, expected_digest, expected_mime, subject, session_expires_at
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.planaria_create_mod_media_upload(uuid, text, text, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_create_mod_media_upload(uuid, text, text, text, text, bigint, text, text, timestamptz) to service_role;

create or replace function public.planaria_get_mod_media_upload_context(
  subject uuid,
  upload_session uuid
)
returns table (
  object_key text,
  provider_upload_id text,
  expected_size bigint,
  expected_sha256 text,
  expected_mime_type text,
  state text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select session.object_key, session.provider_upload_id, session.expected_size,
    session.expected_sha256, session.expected_mime_type, session.state, session.expires_at
  from app_private.mod_media_upload_sessions session
  where public.planaria_authorize_admin(subject)
    and session.id = upload_session
    and session.created_by = subject;
$$;

revoke all on function public.planaria_get_mod_media_upload_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_get_mod_media_upload_context(uuid, uuid) to service_role;

create or replace function public.planaria_finalize_mod_media_upload(
  subject uuid,
  upload_session uuid,
  actual_bytes bigint,
  actual_digest text,
  actual_mime text,
  actual_width integer,
  actual_height integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare session_row app_private.mod_media_upload_sessions%rowtype;
declare media_id uuid;
declare next_order integer;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  select * into session_row from app_private.mod_media_upload_sessions
  where id = upload_session and created_by = subject for update;
  if session_row.id is null or session_row.state not in ('pending', 'uploading') or
     session_row.expires_at <= now() or session_row.expected_size <> actual_bytes or
     session_row.expected_sha256 <> actual_digest or session_row.expected_mime_type <> actual_mime then
    raise exception 'media finalization verification failed' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('lyor-mod-media-' || session_row.mod_id));
  select coalesce(max(display_order), -1) + 1 into next_order
  from public.catalog_mod_media where mod_id = session_row.mod_id;
  insert into public.catalog_mod_media (
    mod_id, provider, object_key, mime_type, byte_size, sha256,
    width, height, display_order, created_by
  ) values (
    session_row.mod_id, session_row.provider, session_row.object_key, actual_mime,
    actual_bytes, actual_digest, actual_width, actual_height, next_order, subject
  ) returning id into media_id;
  update app_private.mod_media_upload_sessions
  set state = 'finalized', finalized_at = now() where id = upload_session;
  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, 'mod.media_uploaded', 'mod_media', media_id::text, 'Mod image verified and stored.');
  return media_id;
end;
$$;

revoke all on function public.planaria_finalize_mod_media_upload(uuid, uuid, bigint, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.planaria_finalize_mod_media_upload(uuid, uuid, bigint, text, text, integer, integer) to service_role;

create or replace function public.planaria_create_billboard_upload_session(
  subject uuid,
  storage_provider text,
  generated_object_key text,
  storage_upload_id text,
  expected_bytes bigint,
  expected_digest text,
  expected_mime text,
  session_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  insert into app_private.billboard_upload_sessions (
    provider, object_key, provider_upload_id, expected_size,
    expected_sha256, expected_mime_type, created_by, expires_at
  ) values (
    storage_provider, generated_object_key, storage_upload_id, expected_bytes,
    expected_digest, expected_mime, subject, session_expires_at
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.planaria_create_billboard_upload_session(uuid, text, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_create_billboard_upload_session(uuid, text, text, text, bigint, text, text, timestamptz) to service_role;

create or replace function public.planaria_get_billboard_upload_context(
  subject uuid,
  upload_session uuid
)
returns table (
  object_key text,
  provider_upload_id text,
  expected_size bigint,
  expected_sha256 text,
  expected_mime_type text,
  state text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select session.object_key, session.provider_upload_id, session.expected_size,
    session.expected_sha256, session.expected_mime_type, session.state, session.expires_at
  from app_private.billboard_upload_sessions session
  where public.planaria_authorize_admin(subject)
    and session.id = upload_session
    and session.created_by = subject;
$$;

revoke all on function public.planaria_get_billboard_upload_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_get_billboard_upload_context(uuid, uuid) to service_role;

create or replace function public.planaria_finalize_billboard_upload(
  subject uuid,
  upload_session uuid,
  actual_bytes bigint,
  actual_digest text,
  actual_mime text,
  actual_width integer,
  actual_height integer,
  actual_duration_ms integer,
  requested_alt_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare session_row app_private.billboard_upload_sessions%rowtype;
declare billboard_id uuid;
declare next_order integer;
declare media_kind text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  select * into session_row from app_private.billboard_upload_sessions
  where id = upload_session and created_by = subject for update;
  if session_row.id is null or session_row.state <> 'pending' or
     session_row.expires_at <= now() or session_row.expected_size <> actual_bytes or
     session_row.expected_sha256 <> actual_digest or session_row.expected_mime_type <> actual_mime or
     char_length(requested_alt_text) not between 1 and 240 then
    raise exception 'billboard finalization verification failed' using errcode = '23514';
  end if;
  media_kind := case when actual_mime = 'video/mp4' then 'video' else 'image' end;
  perform pg_advisory_xact_lock(hashtext('lyor-billboard-order'));
  select coalesce(max(display_order), -1) + 1 into next_order
  from public.billboards where publish_state in ('draft', 'published');
  insert into public.billboards (
    media_type, provider, object_key, mime_type, byte_size, sha256,
    width, height, duration_ms, alt_text, display_order, created_by
  ) values (
    media_kind, session_row.provider, session_row.object_key, actual_mime,
    actual_bytes, actual_digest, actual_width, actual_height,
    case when media_kind = 'video' then actual_duration_ms else null end,
    requested_alt_text, next_order, subject
  ) returning id into billboard_id;
  update app_private.billboard_upload_sessions
  set state = 'finalized' where id = upload_session;
  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, 'billboard.uploaded', 'billboard', billboard_id::text, 'Billboard media verified and stored.');
  return billboard_id;
end;
$$;

revoke all on function public.planaria_finalize_billboard_upload(uuid, uuid, bigint, text, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.planaria_finalize_billboard_upload(uuid, uuid, bigint, text, text, integer, integer, integer, text) to service_role;

create or replace function public.planaria_save_mod_draft(
  subject uuid,
  mod_identifier text,
  mod_name text,
  mod_summary text,
  target_game text,
  target_version uuid,
  version_name text,
  target_edition text,
  target_game_version_range text,
  target_manifest_schema_version smallint,
  target_manifest jsonb,
  target_adapter text,
  expected_updated_at timestamptz
)
returns table (version_id uuid, mod_updated_at timestamptz, version_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare saved_version_id uuid;
declare saved_mod_updated_at timestamptz;
declare saved_version_updated_at timestamptz;
begin
  if not public.planaria_authorize_admin(subject) or
     mod_identifier !~ '^[a-z0-9][a-z0-9-]{0,119}$' or
     char_length(mod_name) not between 1 and 160 or
     char_length(mod_summary) > 2000 or
     char_length(version_name) not between 1 and 80 or
     target_edition not in ('legacy', 'enhanced', 'standard') or
     target_manifest_schema_version not in (1, 2) or
     target_adapter not in ('generic-files', 'synthetic-container-fixture') or
     target_manifest is null or jsonb_typeof(target_manifest) <> 'object' or
     not exists (select 1 from public.catalog_games where id = target_game and enabled) then
    raise exception 'invalid or unauthorized draft' using errcode = '23514';
  end if;

  insert into public.catalog_mods (id, name, summary, game_id, publish_state, created_by)
  values (mod_identifier, mod_name, mod_summary, target_game, 'draft', subject)
  on conflict (id) do update
  set name = excluded.name,
      summary = excluded.summary,
      game_id = excluded.game_id,
      publish_state = 'draft',
      updated_at = now()
  where catalog_mods.publish_state in ('draft', 'ready')
    and (expected_updated_at is null or catalog_mods.updated_at = expected_updated_at)
  returning updated_at into saved_mod_updated_at;

  if saved_mod_updated_at is null then
    raise exception 'draft conflict or immutable state' using errcode = '40001';
  end if;

  if target_version is null then
    insert into public.catalog_mod_versions (
      mod_id, version, game_edition, game_version_range,
      manifest_schema_version, manifest, adapter_id, publish_state, created_by
    ) values (
      mod_identifier, version_name, target_edition, target_game_version_range,
      target_manifest_schema_version, target_manifest, target_adapter, 'draft', subject
    ) returning id, updated_at into saved_version_id, saved_version_updated_at;
  else
    update public.catalog_mod_versions as catalog_version
    set version = version_name,
        game_edition = target_edition,
        game_version_range = target_game_version_range,
        manifest_schema_version = target_manifest_schema_version,
        manifest = target_manifest,
        adapter_id = target_adapter,
        publish_state = 'draft',
        updated_at = now()
    where catalog_version.id = target_version
      and catalog_version.mod_id = mod_identifier
      and catalog_version.publish_state in ('draft', 'ready')
      and (expected_updated_at is null or catalog_version.updated_at = expected_updated_at)
    returning catalog_version.id, catalog_version.updated_at into saved_version_id, saved_version_updated_at;
    if saved_version_id is null then
      raise exception 'version conflict or immutable state' using errcode = '40001';
    end if;
  end if;

  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, 'mod.draft.saved', 'mod_version', saved_version_id::text, 'Mod draft saved through the admin boundary.');

  return query select saved_version_id, saved_mod_updated_at, saved_version_updated_at;
end;
$$;

revoke all on function public.planaria_save_mod_draft(uuid, text, text, text, text, uuid, text, text, text, smallint, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_save_mod_draft(uuid, text, text, text, text, uuid, text, text, text, smallint, jsonb, text, timestamptz) to service_role;

create or replace function public.planaria_list_admin_accounts(subject uuid)
returns table (
  user_id uuid,
  email text,
  username text,
  role text,
  can_manage_admins boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select users.id, users.email::text, names.username, roles.role,
    roles.role = 'super_admin' or coalesce(permissions.can_manage_admins, false),
    users.created_at, users.last_sign_in_at
  from auth.users users
  join app_private.user_roles roles on roles.user_id = users.id
  left join app_private.planaria_admin_usernames names on names.user_id = users.id
  left join app_private.admin_permissions permissions on permissions.user_id = users.id
  where public.planaria_can_manage_admins(subject)
    and roles.role in ('admin', 'super_admin')
  order by users.created_at desc;
$$;

revoke all on function public.planaria_list_admin_accounts(uuid) from public, anon, authenticated;
grant execute on function public.planaria_list_admin_accounts(uuid) to service_role;

create or replace function public.planaria_recent_audit(subject uuid, maximum_rows integer default 20)
returns table (
  id uuid,
  actor_user_id uuid,
  action text,
  entity_type text,
  entity_id text,
  summary text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select audit.id, audit.actor_user_id, audit.action, audit.entity_type,
    audit.entity_id, audit.summary, audit.created_at
  from app_private.planaria_audit_events audit
  where public.planaria_authorize_admin(subject)
  order by audit.created_at desc, audit.id
  limit least(greatest(maximum_rows, 1), 50);
$$;

revoke all on function public.planaria_recent_audit(uuid, integer) from public, anon, authenticated;
grant execute on function public.planaria_recent_audit(uuid, integer) to service_role;

create or replace function public.planaria_record_audit(
  subject uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id text,
  audit_summary text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.planaria_authorize_admin(subject) or
     audit_action !~ '^[a-z][a-z0-9_.-]{1,79}$' or
     audit_entity_type !~ '^[a-z][a-z0-9_-]{1,39}$' or
     (audit_entity_id is not null and char_length(audit_entity_id) not between 1 and 160) or
     char_length(audit_summary) > 500 then
    raise exception 'invalid audit event' using errcode = '23514';
  end if;
  insert into app_private.planaria_audit_events
    (actor_user_id, action, entity_type, entity_id, summary)
  values (subject, audit_action, audit_entity_type, audit_entity_id, audit_summary);
end;
$$;

revoke all on function public.planaria_record_audit(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.planaria_record_audit(uuid, text, text, text, text) to service_role;

create or replace function public.planaria_abort_mod_media_upload(subject uuid, upload_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare stored_object_key text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update app_private.mod_media_upload_sessions
  set state = 'aborted'
  where id = upload_session and created_by = subject and state in ('pending', 'uploading', 'failed')
  returning object_key into stored_object_key;
  if stored_object_key is null then
    raise exception 'upload session cannot be aborted' using errcode = '23514';
  end if;
  return stored_object_key;
end;
$$;

revoke all on function public.planaria_abort_mod_media_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_abort_mod_media_upload(uuid, uuid) to service_role;

create or replace function public.planaria_abort_billboard_upload(subject uuid, upload_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare stored_object_key text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update app_private.billboard_upload_sessions
  set state = 'aborted'
  where id = upload_session and created_by = subject and state in ('pending', 'failed')
  returning object_key into stored_object_key;
  if stored_object_key is null then
    raise exception 'upload session cannot be aborted' using errcode = '23514';
  end if;
  return stored_object_key;
end;
$$;

revoke all on function public.planaria_abort_billboard_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_abort_billboard_upload(uuid, uuid) to service_role;
