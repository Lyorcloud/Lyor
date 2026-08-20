begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select has_column('public', 'user_settings', 'account_preferences', 'settings has account preferences');
select has_column('public', 'user_favorites', 'created_at', 'favorites uses created_at');
select hasnt_column('public', 'user_favorites', 'added_at', 'legacy favorite timestamp removed');
select has_column('public', 'user_library', 'first_installed_at', 'library tracks first install');
select has_column('public', 'user_library', 'last_installed_at', 'library tracks last install');
select hasnt_column('public', 'user_library', 'installed', 'cloud library has no physical installed boolean');
select has_table('public', 'device_installation_summaries', 'device summaries exist');
select hasnt_column('public', 'device_installation_summaries', 'absolute_path', 'device summary contains no absolute path');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'device_installation_summaries'), 4, 'summaries have separate CRUD policies');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'user_sync_events'), 3, 'sync events are immutable except delete');
select ok(exists (
  select 1 from pg_constraint where conrelid = 'public.user_favorites'::regclass
  and contype = 'p' and pg_get_constraintdef(oid) like '%user_id, mod_id%'
), 'favorites are unique by user and mod');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sync-one@lyor.test', extensions.crypt('Test-pass-3', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sync-two@lyor.test', extensions.crypt('Test-pass-4', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select is((select role from app_private.user_roles where user_id = '30000000-0000-0000-0000-000000000003'), 'user', 'first sync user has normal role');
select is((select role from app_private.user_roles where user_id = '40000000-0000-0000-0000-000000000004'), 'user', 'second sync user has normal role');

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';

select lives_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('30000000-0000-0000-0000-000000000003', 'mod-a')$$,
  'user inserts own favorite'
);
select throws_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('30000000-0000-0000-0000-000000000003', 'mod-a')$$,
  '23505', null, 'favorite uniqueness rejects duplicates'
);
select lives_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('30000000-0000-0000-0000-000000000003', 'mod-a') on conflict (user_id, mod_id) do nothing$$,
  'favorite add is idempotent with upsert semantics'
);
select throws_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('40000000-0000-0000-0000-000000000004', 'foreign-mod')$$,
  '42501', null, 'user cannot write another user favorite'
);
select lives_ok(
  $$insert into public.user_library (user_id, mod_id, first_installed_at, last_installed_at) values ('30000000-0000-0000-0000-000000000003', 'mod-a', '2026-01-01Z', '2026-01-01Z')$$,
  'user inserts own cloud library row'
);
select lives_ok(
  $$insert into public.user_library (user_id, mod_id, first_installed_at, last_installed_at) values ('30000000-0000-0000-0000-000000000003', 'mod-a', '2026-02-01Z', '2026-02-01Z') on conflict (user_id, mod_id) do update set first_installed_at = excluded.first_installed_at, last_installed_at = excluded.last_installed_at$$,
  'library retry is idempotent'
);
select is((select first_installed_at::date from public.user_library where mod_id = 'mod-a'), '2026-01-01'::date, 'first install timestamp is preserved');
select lives_ok(
  $$insert into public.devices (id, user_id, device_name, os, architecture, app_version) values ('30000000-0000-4000-8000-000000000031', '30000000-0000-0000-0000-000000000003', 'PC A', 'Windows', 'x64', '1.2.0')$$,
  'first device is registered'
);
select lives_ok(
  $$insert into public.devices (id, user_id, device_name, os, architecture, app_version) values ('30000000-0000-4000-8000-000000000032', '30000000-0000-0000-0000-000000000003', 'PC B', 'Windows', 'x64', '1.2.0')$$,
  'second device is registered'
);
select lives_ok(
  $$insert into public.device_installation_summaries (user_id, device_id, mod_id, summary_state, observed_at) values ('30000000-0000-0000-0000-000000000003', '30000000-0000-4000-8000-000000000031', 'mod-a', 'installed', now())$$,
  'first device summary is stored'
);
select is((select count(*)::integer from public.device_installation_summaries where device_id = '30000000-0000-4000-8000-000000000032'), 0, 'new device has no inherited physical install summary');

set local request.jwt.claim.sub = '40000000-0000-0000-0000-000000000004';
select is((select count(*)::integer from public.user_favorites), 0, 'second user cannot read first user favorites');
select is((select count(*)::integer from public.user_library), 0, 'second user cannot read first user library');
select lives_ok(
  $$insert into public.devices (id, user_id, device_name, os, architecture, app_version) values ('30000000-0000-4000-8000-000000000031', '40000000-0000-0000-0000-000000000004', 'Shared PC', 'Windows', 'arm64', '1.2.0')$$,
  'second user can register the same installation-scoped ID under their ownership'
);
select is((select count(*)::integer from public.devices), 1, 'second user sees only own device');
select throws_ok(
  $$insert into public.device_installation_summaries (user_id, device_id, mod_id, summary_state, observed_at) values ('30000000-0000-0000-0000-000000000003', '30000000-0000-4000-8000-000000000031', 'foreign', 'installed', now())$$,
  '42501', null, 'second user cannot write first user summary'
);

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.user_favorites$$, '42501', null, 'anonymous favorite access is denied');
select throws_ok($$select * from public.device_installation_summaries$$, '42501', null, 'anonymous summary access is denied');

reset role;
select * from finish();
rollback;
