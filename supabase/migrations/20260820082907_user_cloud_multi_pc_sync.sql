alter table public.user_favorites rename column added_at to created_at;

alter table public.user_settings
  add column account_preferences jsonb not null default '{}'::jsonb,
  add constraint user_settings_account_preferences_object
    check (jsonb_typeof(account_preferences) = 'object'),
  add constraint user_settings_account_preferences_size
    check (octet_length(account_preferences::text) <= 4096);

alter table public.user_library rename column added_at to created_at;
alter table public.user_library
  add column first_installed_at timestamptz not null default now(),
  add column last_installed_at timestamptz not null default now(),
  add column last_installed_version text
    check (last_installed_version is null or char_length(last_installed_version) between 1 and 80),
  add column updated_at timestamptz not null default now();

alter table public.devices rename column device_label to device_name;
alter table public.devices
  drop constraint devices_pkey,
  add column os text not null default 'unknown'
    check (char_length(os) between 1 and 80),
  add column architecture text not null default 'unknown'
    check (char_length(architecture) between 1 and 40),
  add column app_version text not null default 'unknown'
    check (char_length(app_version) between 1 and 40),
  add column updated_at timestamptz not null default now(),
  add primary key (id, user_id);

create table public.device_installation_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  mod_id text not null check (char_length(mod_id) between 1 and 120),
  summary_state text not null
    check (summary_state in ('installed', 'not_installed', 'unknown', 'needs_attention')),
  installed_version text
    check (installed_version is null or char_length(installed_version) between 1 and 80),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, mod_id),
  foreign key (device_id, user_id)
    references public.devices (id, user_id) on delete cascade
);

comment on table public.device_installation_summaries is
  'Non-authoritative device summary only. It contains no path, journal, backup, cache, staging, ownership, or physical file truth.';

create index device_installation_summaries_user_id_idx
  on public.device_installation_summaries (user_id);

create table public.user_sync_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null check (char_length(event_name) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_sync_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint user_sync_events_metadata_size check (octet_length(metadata::text) <= 2048)
);

create index user_sync_events_user_id_idx on public.user_sync_events (user_id);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon;
grant execute on function app_private.set_updated_at() to authenticated;

create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function app_private.set_updated_at();

create or replace function app_private.preserve_library_first_install()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_installed_at = old.first_installed_at;
  return new;
end;
$$;

revoke all on function app_private.preserve_library_first_install() from public, anon;
grant execute on function app_private.preserve_library_first_install() to authenticated;

create trigger user_library_preserve_first_install before update on public.user_library
for each row execute function app_private.preserve_library_first_install();
create trigger user_library_set_updated_at before update on public.user_library
for each row execute function app_private.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
for each row execute function app_private.set_updated_at();
create trigger device_summaries_set_updated_at before update on public.device_installation_summaries
for each row execute function app_private.set_updated_at();

alter table public.device_installation_summaries enable row level security;
alter table public.device_installation_summaries force row level security;
alter table public.user_sync_events enable row level security;
alter table public.user_sync_events force row level security;

create policy device_summaries_select_own on public.device_installation_summaries
for select to authenticated using ((select auth.uid()) = user_id);
create policy device_summaries_insert_own on public.device_installation_summaries
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy device_summaries_update_own on public.device_installation_summaries
for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy device_summaries_delete_own on public.device_installation_summaries
for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_sync_events_select_own on public.user_sync_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy user_sync_events_insert_own on public.user_sync_events
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_sync_events_delete_own on public.user_sync_events
for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.device_installation_summaries, public.user_sync_events
from public, anon;
grant select, insert, update, delete on public.device_installation_summaries
to authenticated;
grant select, insert, delete on public.user_sync_events to authenticated;
