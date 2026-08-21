create schema if not exists legacy_backup;

revoke all on schema legacy_backup from public, anon, authenticated;

do $$
begin
  if to_regclass('public.users') is not null
    and to_regclass('legacy_backup.users') is null then
    alter table public.users set schema legacy_backup;
  end if;

  if to_regclass('public."Messages"') is not null
    and to_regclass('legacy_backup."Messages"') is null then
    alter table public."Messages" set schema legacy_backup;
  end if;

  if to_regclass('public."Friends"') is not null
    and to_regclass('legacy_backup."Friends"') is null then
    alter table public."Friends" set schema legacy_backup;
  end if;
end;
$$;

revoke all on all tables in schema legacy_backup from public, anon, authenticated;
revoke all on all sequences in schema legacy_backup from public, anon, authenticated;
alter default privileges in schema legacy_backup
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema legacy_backup
  revoke all on sequences from public, anon, authenticated;

comment on schema legacy_backup is
  'Quarantined pre-V1.2 social prototype data. Not exposed to Lyor clients.';

insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into app_private.user_roles (user_id, role)
select id, 'user' from auth.users
on conflict (user_id) do nothing;
