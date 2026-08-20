create table public.billboards (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video')),
  provider text not null check (char_length(provider) between 1 and 40),
  object_key text not null unique check (char_length(object_key) between 1 and 512),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'video/mp4')),
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  width integer not null check (width between 320 and 7680),
  height integer not null check (height between 180 and 4320),
  duration_ms integer check (
    (media_type = 'image' and duration_ms is null) or
    (media_type = 'video' and duration_ms between 100 and 120000)
  ),
  alt_text text not null check (char_length(alt_text) between 1 and 240),
  display_order integer not null check (display_order >= 0),
  publish_state text not null default 'draft' check (publish_state in ('draft', 'published', 'disabled')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index billboards_active_order_unique on public.billboards (display_order)
where publish_state in ('draft', 'published');
create index billboards_public_order_idx on public.billboards (publish_state, display_order);

create table app_private.billboard_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  object_key text not null unique,
  provider_upload_id text not null,
  expected_size bigint not null check (expected_size > 0),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_mime_type text not null,
  created_by uuid not null references auth.users (id),
  state text not null default 'pending' check (state in ('pending', 'finalized', 'aborted', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function app_private.protect_published_billboard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publish_state = 'published' and (
    new.media_type is distinct from old.media_type or
    new.provider is distinct from old.provider or
    new.object_key is distinct from old.object_key or
    new.mime_type is distinct from old.mime_type or
    new.byte_size is distinct from old.byte_size or
    new.sha256 is distinct from old.sha256 or
    new.width is distinct from old.width or
    new.height is distinct from old.height or
    new.duration_ms is distinct from old.duration_ms or
    new.created_by is distinct from old.created_by or
    new.publish_state not in ('published', 'disabled')
  ) then
    raise exception 'published billboard media is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_published_billboard() from public, anon, authenticated;
create trigger protect_published_billboard before update on public.billboards
for each row execute function app_private.protect_published_billboard();

alter table public.billboards enable row level security;
alter table public.billboards force row level security;

create policy billboards_public_select on public.billboards for select to anon, authenticated
using (publish_state = 'published');
create policy billboards_admin_select on public.billboards for select to authenticated
using ((select app_private.is_admin()));
create policy billboards_admin_insert on public.billboards for insert to authenticated
with check ((select app_private.is_admin()) and created_by = (select auth.uid()));
create policy billboards_admin_update on public.billboards for update to authenticated
using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy billboards_admin_delete on public.billboards for delete to authenticated
using ((select app_private.is_admin()));

revoke all on public.billboards from public, anon, authenticated;
grant select on public.billboards to anon, authenticated;
grant insert, update, delete on public.billboards to authenticated;
revoke all on app_private.billboard_upload_sessions from public, anon, authenticated;

create or replace function public.planaria_move_billboard(
  subject uuid,
  target_billboard uuid,
  move_direction integer,
  expected_revision integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_row public.billboards%rowtype;
declare adjacent_row public.billboards%rowtype;
declare temporary_order integer;
begin
  if not public.planaria_authorize_admin(subject) or move_direction not in (-1, 1) then
    raise exception 'admin authorization required or invalid direction' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('lyor-billboard-order'));
  select * into current_row from public.billboards
  where id = target_billboard and revision = expected_revision and publish_state <> 'disabled' for update;
  if current_row.id is null then return false; end if;
  if move_direction = -1 then
    select * into adjacent_row from public.billboards
    where publish_state <> 'disabled' and display_order < current_row.display_order
    order by display_order desc limit 1 for update;
  else
    select * into adjacent_row from public.billboards
    where publish_state <> 'disabled' and display_order > current_row.display_order
    order by display_order asc limit 1 for update;
  end if;
  if adjacent_row.id is null then return true; end if;
  select coalesce(max(display_order), 0) + 1 into temporary_order from public.billboards;
  update public.billboards set display_order = temporary_order, revision = revision + 1, updated_at = now() where id = current_row.id;
  update public.billboards set display_order = current_row.display_order, revision = revision + 1, updated_at = now() where id = adjacent_row.id;
  update public.billboards set display_order = adjacent_row.display_order, updated_at = now() where id = current_row.id;
  return true;
end;
$$;

revoke all on function public.planaria_move_billboard(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.planaria_move_billboard(uuid, uuid, integer, integer) to service_role;

create or replace function public.planaria_publish_billboard(subject uuid, target_billboard uuid, expected_revision integer)
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
  update public.billboards set publish_state = 'published', published_at = now(),
    revision = revision + 1, updated_at = now()
  where id = target_billboard and publish_state = 'draft' and revision = expected_revision;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_publish_billboard(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.planaria_publish_billboard(uuid, uuid, integer) to service_role;

create or replace function public.planaria_disable_billboard(subject uuid, target_billboard uuid, expected_revision integer)
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
  update public.billboards set publish_state = 'disabled', revision = revision + 1, updated_at = now()
  where id = target_billboard and publish_state = 'published' and revision = expected_revision;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.planaria_disable_billboard(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.planaria_disable_billboard(uuid, uuid, integer) to service_role;

create or replace function public.planaria_delete_billboard(subject uuid, target_billboard uuid, expected_object_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_key text;
begin
  if not public.planaria_authorize_admin(subject) then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  delete from public.billboards
  where id = target_billboard and object_key = expected_object_key and publish_state in ('draft', 'disabled')
  returning object_key into deleted_key;
  return deleted_key;
end;
$$;

revoke all on function public.planaria_delete_billboard(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.planaria_delete_billboard(uuid, uuid, text) to service_role;
