create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'tr')),
  theme text not null default 'ice-max' check (theme in ('ice-max', 'dark', 'light')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  mod_id text not null check (char_length(mod_id) between 1 and 120),
  added_at timestamptz not null default now(),
  primary key (user_id, mod_id)
);

create table public.user_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  mod_id text not null check (char_length(mod_id) between 1 and 120),
  added_at timestamptz not null default now(),
  primary key (user_id, mod_id)
);

comment on table public.user_library is
  'Account-level logical Library membership only; never physical installation truth.';

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_label text not null check (char_length(device_label) between 1 and 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index devices_user_id_idx on public.devices (user_id);

create table app_private.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_security_events (
  id bigint generated always as identity primary key,
  event_type text not null check (char_length(event_type) between 1 and 80),
  created_at timestamptz not null default now()
);

comment on table public.admin_security_events is
  'Minimal admin-only authorization test surface; not a Planaria or content-management feature.';

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into app_private.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from app_private.user_roles
    where user_id = (select auth.uid())
      and role in ('admin', 'super_admin')
  );
$$;

revoke all on function app_private.is_admin() from public, anon;
grant execute on function app_private.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
alter table public.user_favorites enable row level security;
alter table public.user_favorites force row level security;
alter table public.user_library enable row level security;
alter table public.user_library force row level security;
alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.admin_security_events enable row level security;
alter table public.admin_security_events force row level security;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete_own on public.profiles for delete to authenticated
using ((select auth.uid()) = user_id);

create policy user_settings_select_own on public.user_settings for select to authenticated
using ((select auth.uid()) = user_id);
create policy user_settings_insert_own on public.user_settings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy user_settings_update_own on public.user_settings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_settings_delete_own on public.user_settings for delete to authenticated
using ((select auth.uid()) = user_id);

create policy user_favorites_select_own on public.user_favorites for select to authenticated
using ((select auth.uid()) = user_id);
create policy user_favorites_insert_own on public.user_favorites for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy user_favorites_update_own on public.user_favorites for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_favorites_delete_own on public.user_favorites for delete to authenticated
using ((select auth.uid()) = user_id);

create policy user_library_select_own on public.user_library for select to authenticated
using ((select auth.uid()) = user_id);
create policy user_library_insert_own on public.user_library for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy user_library_update_own on public.user_library for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_library_delete_own on public.user_library for delete to authenticated
using ((select auth.uid()) = user_id);

create policy devices_select_own on public.devices for select to authenticated
using ((select auth.uid()) = user_id);
create policy devices_insert_own on public.devices for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy devices_update_own on public.devices for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy devices_delete_own on public.devices for delete to authenticated
using ((select auth.uid()) = user_id);

create policy admin_security_events_select_admin on public.admin_security_events
for select to authenticated using ((select app_private.is_admin()));

revoke all on public.profiles, public.user_settings, public.user_favorites,
  public.user_library, public.devices, public.admin_security_events from public, anon;
revoke all on app_private.user_roles from public, anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.user_favorites to authenticated;
grant select, insert, update, delete on public.user_library to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.admin_security_events to authenticated;
