create table public.catalog_games (
  id text primary key check (id ~ '^(gta5-(legacy|enhanced)|game-[a-z0-9-]+)$'),
  edition text not null check (edition in ('legacy', 'enhanced', 'standard')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_mods (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  name text not null check (char_length(name) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 2000),
  game_id text not null references public.catalog_games (id),
  publish_state text not null default 'draft' check (publish_state in ('draft', 'ready', 'published', 'disabled')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_mods_game_id_idx on public.catalog_mods (game_id);
create index catalog_mods_public_order_idx on public.catalog_mods (publish_state, updated_at desc);

create table public.catalog_mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id text not null references public.catalog_mods (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 80),
  game_edition text not null check (game_edition in ('legacy', 'enhanced', 'standard')),
  game_version_range text check (game_version_range is null or char_length(game_version_range) between 1 and 80),
  manifest_schema_version smallint not null check (manifest_schema_version in (1, 2)),
  manifest jsonb not null,
  adapter_id text not null check (char_length(adapter_id) between 1 and 120),
  publish_state text not null default 'draft' check (publish_state in ('draft', 'ready', 'published', 'disabled')),
  published_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mod_id, version)
);

create index catalog_mod_versions_mod_state_idx on public.catalog_mod_versions (mod_id, publish_state);

create table public.mod_package_objects (
  version_id uuid primary key references public.catalog_mod_versions (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.mod_package_objects is
  'Metadata only. Multi-GB ZIP/7Z/RAR bytes live in provider-neutral object storage, never Postgres.';

create table public.user_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  mod_id text not null references public.catalog_mods (id) on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, mod_id)
);

create table public.mod_metrics (
  mod_id text primary key references public.catalog_mods (id) on delete cascade,
  completed_downloads bigint not null default 0 check (completed_downloads >= 0),
  completed_installs bigint not null default 0 check (completed_installs >= 0),
  favorites bigint not null default 0 check (favorites >= 0),
  updated_at timestamptz not null default now()
);

create table app_private.planaria_admin_usernames (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  created_at timestamptz not null default now()
);

create table app_private.mod_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.catalog_mod_versions (id) on delete cascade,
  provider text not null,
  object_key text not null unique,
  expected_size bigint not null check (expected_size >= 0),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  provider_upload_id text not null,
  state text not null default 'pending' check (state in ('pending', 'uploading', 'finalized', 'aborted', 'failed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finalized_at timestamptz
);

create index mod_upload_sessions_expiry_idx on app_private.mod_upload_sessions (state, expires_at);

create table app_private.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  mod_id text not null references public.catalog_mods (id) on delete cascade,
  event_name text not null check (event_name in ('download_requested', 'download_started', 'download_completed', 'download_failed', 'install_completed', 'favorite')),
  idempotency_key uuid not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, event_name, idempotency_key)
);

create or replace function app_private.protect_published_mod_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publish_state = 'published' and (
    new.mod_id is distinct from old.mod_id or
    new.version is distinct from old.version or
    new.game_edition is distinct from old.game_edition or
    new.game_version_range is distinct from old.game_version_range or
    new.manifest_schema_version is distinct from old.manifest_schema_version or
    new.manifest is distinct from old.manifest or
    new.adapter_id is distinct from old.adapter_id or
    new.created_by is distinct from old.created_by or
    new.publish_state not in ('published', 'disabled')
  ) then
    raise exception 'published mod versions are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_published_mod_version() from public, anon, authenticated;
create trigger protect_published_mod_version before update on public.catalog_mod_versions
for each row execute function app_private.protect_published_mod_version();

alter table public.catalog_games enable row level security;
alter table public.catalog_games force row level security;
alter table public.catalog_mods enable row level security;
alter table public.catalog_mods force row level security;
alter table public.catalog_mod_versions enable row level security;
alter table public.catalog_mod_versions force row level security;
alter table public.mod_package_objects enable row level security;
alter table public.mod_package_objects force row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;
alter table public.mod_metrics enable row level security;
alter table public.mod_metrics force row level security;

create policy catalog_games_public_select on public.catalog_games for select to anon, authenticated
using (enabled);
create policy catalog_games_admin_select on public.catalog_games for select to authenticated
using ((select app_private.is_admin()));
create policy catalog_games_admin_insert on public.catalog_games for insert to authenticated
with check ((select app_private.is_admin()));
create policy catalog_games_admin_update on public.catalog_games for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy catalog_games_admin_delete on public.catalog_games for delete to authenticated
using ((select app_private.is_admin()));

create policy catalog_mods_public_select on public.catalog_mods for select to anon, authenticated
using (publish_state = 'published');
create policy catalog_mods_admin_select on public.catalog_mods for select to authenticated
using ((select app_private.is_admin()));
create policy catalog_mods_admin_insert on public.catalog_mods for insert to authenticated
with check ((select app_private.is_admin()) and created_by = (select auth.uid()));
create policy catalog_mods_admin_update on public.catalog_mods for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy catalog_mods_admin_delete on public.catalog_mods for delete to authenticated
using ((select app_private.is_admin()));

create policy catalog_versions_public_select on public.catalog_mod_versions for select to anon, authenticated
using (publish_state = 'published');
create policy catalog_versions_admin_select on public.catalog_mod_versions for select to authenticated
using ((select app_private.is_admin()));
create policy catalog_versions_admin_insert on public.catalog_mod_versions for insert to authenticated
with check ((select app_private.is_admin()) and created_by = (select auth.uid()));
create policy catalog_versions_admin_update on public.catalog_mod_versions for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy catalog_versions_admin_delete on public.catalog_mod_versions for delete to authenticated
using ((select app_private.is_admin()));

create policy package_objects_admin_select on public.mod_package_objects for select to authenticated
using ((select app_private.is_admin()));
create policy package_objects_admin_insert on public.mod_package_objects for insert to authenticated
with check ((select app_private.is_admin()));
create policy package_objects_admin_update on public.mod_package_objects for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy package_objects_admin_delete on public.mod_package_objects for delete to authenticated
using ((select app_private.is_admin()));

create policy entitlements_select_own on public.user_entitlements for select to authenticated
using ((select auth.uid()) = user_id);
create policy entitlements_admin_insert on public.user_entitlements for insert to authenticated
with check ((select app_private.is_admin()));
create policy entitlements_admin_update on public.user_entitlements for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy entitlements_admin_delete on public.user_entitlements for delete to authenticated
using ((select app_private.is_admin()));

create policy mod_metrics_public_select on public.mod_metrics for select to anon, authenticated using (true);

revoke all on public.catalog_games, public.catalog_mods, public.catalog_mod_versions,
  public.mod_package_objects, public.user_entitlements, public.mod_metrics from public, anon, authenticated;
grant select on public.catalog_games, public.catalog_mods, public.catalog_mod_versions, public.mod_metrics to anon, authenticated;
grant insert, update, delete on public.catalog_games, public.catalog_mods, public.catalog_mod_versions to authenticated;
grant select, insert, update, delete on public.mod_package_objects, public.user_entitlements to authenticated;

revoke all on app_private.planaria_admin_usernames, app_private.mod_upload_sessions,
  app_private.analytics_events from public, anon, authenticated;

comment on table app_private.planaria_admin_usernames is
  'Optional server-owned username mapping. Passwords remain exclusively in Supabase Auth.';

create or replace function public.planaria_authorize_admin(subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select subject is not null and exists (
    select 1 from app_private.user_roles
    where user_id = subject and role in ('admin', 'super_admin')
  );
$$;

revoke all on function public.planaria_authorize_admin(uuid) from public, anon, authenticated;
grant execute on function public.planaria_authorize_admin(uuid) to service_role;

create or replace function public.planaria_create_upload_session(
  subject uuid,
  target_version uuid,
  storage_provider text,
  generated_object_key text,
  expected_bytes bigint,
  expected_digest text,
  storage_upload_id text,
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
  if not exists (select 1 from public.catalog_mod_versions where id = target_version and publish_state in ('draft', 'ready')) then
    raise exception 'version cannot accept an upload' using errcode = '23514';
  end if;
  insert into app_private.mod_upload_sessions (
    version_id, provider, object_key, expected_size, expected_sha256,
    provider_upload_id, created_by, expires_at
  ) values (
    target_version, storage_provider, generated_object_key, expected_bytes,
    expected_digest, storage_upload_id, subject, session_expires_at
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.planaria_create_upload_session(uuid, uuid, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_create_upload_session(uuid, uuid, text, text, bigint, text, text, timestamptz) to service_role;

create or replace function public.planaria_finalize_upload(
  subject uuid,
  upload_session uuid,
  actual_bytes bigint,
  actual_digest text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare session_row app_private.mod_upload_sessions%rowtype;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  select * into session_row from app_private.mod_upload_sessions
  where id = upload_session for update;
  if session_row.id is null or session_row.state not in ('pending', 'uploading') or
     session_row.expires_at <= now() or session_row.expected_size <> actual_bytes or
     session_row.expected_sha256 <> actual_digest then
    raise exception 'upload finalization verification failed' using errcode = '23514';
  end if;
  insert into public.mod_package_objects (version_id, provider, object_key, byte_size, sha256, verified_at)
  values (session_row.version_id, session_row.provider, session_row.object_key, actual_bytes, actual_digest, now());
  update app_private.mod_upload_sessions set state = 'finalized', finalized_at = now() where id = upload_session;
  return session_row.version_id;
end;
$$;

revoke all on function public.planaria_finalize_upload(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.planaria_finalize_upload(uuid, uuid, bigint, text) to service_role;

create or replace function public.planaria_abort_upload(subject uuid, upload_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update app_private.mod_upload_sessions set state = 'aborted'
  where id = upload_session and state in ('pending', 'uploading');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_abort_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_abort_upload(uuid, uuid) to service_role;

create or replace function public.planaria_delete_package_metadata(subject uuid, target_version uuid, expected_object_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  if exists (select 1 from public.catalog_mod_versions where id = target_version and publish_state = 'published') then
    raise exception 'published package is immutable' using errcode = '23514';
  end if;
  delete from public.mod_package_objects where version_id = target_version and object_key = expected_object_key;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_delete_package_metadata(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.planaria_delete_package_metadata(uuid, uuid, text) to service_role;

create or replace function public.planaria_publish_version(subject uuid, target_version uuid, expected_updated_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update public.catalog_mod_versions
  set publish_state = 'published', published_at = now(), updated_at = now()
  where id = target_version and publish_state = 'ready' and updated_at = expected_updated_at
    and exists (select 1 from public.mod_package_objects where version_id = target_version and verified_at is not null);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_publish_version(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.planaria_publish_version(uuid, uuid, timestamptz) to service_role;

create or replace function public.planaria_get_download_metadata(subject uuid, target_version uuid)
returns table (provider text, object_key text, byte_size bigint, sha256 text)
language sql
stable
security definer
set search_path = ''
as $$
  select package.provider, package.object_key, package.byte_size, package.sha256
  from public.mod_package_objects package
  join public.catalog_mod_versions version on version.id = package.version_id
  where version.id = target_version and version.publish_state = 'published'
    and (public.planaria_authorize_admin(subject) or exists (
      select 1 from public.user_entitlements entitlement
      where entitlement.user_id = subject and entitlement.mod_id = version.mod_id
        and (entitlement.expires_at is null or entitlement.expires_at > now())
    ));
$$;

revoke all on function public.planaria_get_download_metadata(uuid, uuid) from public, anon, authenticated;
grant execute on function public.planaria_get_download_metadata(uuid, uuid) to service_role;

create or replace function public.planaria_record_event(
  subject uuid,
  target_mod text,
  event_type text,
  event_key uuid,
  server_verified boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare inserted integer;
begin
  if event_type not in ('download_requested', 'download_started', 'download_completed', 'download_failed', 'install_completed', 'favorite') or
     (event_type = 'download_completed' and not server_verified) then
    return false;
  end if;
  insert into app_private.analytics_events (user_id, mod_id, event_name, idempotency_key, verified)
  values (subject, target_mod, event_type, event_key, server_verified)
  on conflict (user_id, event_name, idempotency_key) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    insert into public.mod_metrics (mod_id, completed_downloads, completed_installs, favorites)
    values (
      target_mod,
      case when event_type = 'download_completed' then 1 else 0 end,
      case when event_type = 'install_completed' and server_verified then 1 else 0 end,
      case when event_type = 'favorite' then 1 else 0 end
    )
    on conflict (mod_id) do update set
      completed_downloads = public.mod_metrics.completed_downloads + excluded.completed_downloads,
      completed_installs = public.mod_metrics.completed_installs + excluded.completed_installs,
      favorites = public.mod_metrics.favorites + excluded.favorites,
      updated_at = now();
  end if;
  return inserted = 1;
end;
$$;

revoke all on function public.planaria_record_event(uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.planaria_record_event(uuid, text, text, uuid, boolean) to service_role;
