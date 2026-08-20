begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_settings', 'user_settings exists');
select has_table('public', 'user_favorites', 'user_favorites exists');
select has_table('public', 'user_library', 'user_library exists');
select has_table('public', 'devices', 'devices exists');
select has_table('app_private', 'user_roles', 'private role table exists');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  4,
  'profiles has separate CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'user_settings'),
  4,
  'settings has separate CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'user_favorites'),
  4,
  'favorites has separate CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'user_library'),
  4,
  'library has separate CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'devices'),
  4,
  'devices has separate CRUD policies'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'one@lyor.test', extensions.crypt('Test-pass-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"super_admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'two@lyor.test', extensions.crypt('Test-pass-2', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select is(
  (select role from app_private.user_roles where user_id = '10000000-0000-0000-0000-000000000001'),
  'user',
  'public signup metadata cannot create an admin'
);

insert into public.admin_security_events (event_type) values ('security-test');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('10000000-0000-0000-0000-000000000001', 'own-mod')$$,
  'user can insert own favorite'
);
select throws_ok(
  $$insert into public.user_favorites (user_id, mod_id) values ('20000000-0000-0000-0000-000000000002', 'foreign-mod')$$,
  '42501', null, 'user cannot insert another user favorite'
);
select is((select count(*)::integer from public.profiles), 1, 'user sees only own profile');
select is((select count(*)::integer from public.user_favorites), 1, 'user sees only own favorites');
select is((select count(*)::integer from public.admin_security_events), 0, 'normal user cannot read admin-only rows');
select throws_ok(
  $$update app_private.user_roles set role = 'admin' where user_id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'normal user cannot promote their role'
);

reset role;
update app_private.user_roles set role = 'admin' where user_id = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.admin_security_events), 1, 'server-assigned admin can read admin-only rows');
select is((select count(*)::integer from public.user_favorites), 0, 'second user cannot read first user favorites');

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501', null, 'unauthenticated profile read is denied'
);
select throws_ok(
  $$insert into public.devices (user_id, device_label) values ('10000000-0000-0000-0000-000000000001', 'unauthorized')$$,
  '42501', null, 'unauthenticated device insert is denied'
);

reset role;
select * from finish();
rollback;
