begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public', 'catalog_games', 'catalog games exist');
select has_table('public', 'catalog_mods', 'catalog mods exist');
select has_table('public', 'catalog_mod_versions', 'catalog versions exist');
select has_table('public', 'mod_package_objects', 'package metadata exists');
select has_table('public', 'user_entitlements', 'entitlements exist');
select has_table('public', 'mod_metrics', 'verified metrics exist');
select has_table('app_private', 'mod_upload_sessions', 'upload sessions are private');
select has_table('app_private', 'analytics_events', 'raw analytics are private');
select hasnt_column('public', 'mod_package_objects', 'binary', 'database package table stores no binary');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'catalog_mods'), 5, 'mods have public/admin select and separate writes');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'catalog_mod_versions'), 5, 'versions have public/admin select and separate writes');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'mod_package_objects'), 4, 'package metadata has separate admin CRUD policies');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'planaria-user@lyor.test', extensions.crypt('Test-pass-7', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'planaria-admin@lyor.test', extensions.crypt('Test-pass-8', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select is((select role from app_private.user_roles where user_id = '70000000-0000-0000-0000-000000000001'), 'user', 'signup metadata cannot create Planaria admin');
update app_private.user_roles set role = 'admin' where user_id = '70000000-0000-0000-0000-000000000002';

insert into public.catalog_games (id, edition, display_name) values ('game-synthetic-fixture', 'standard', 'Synthetic Fixture');
insert into public.catalog_mods (id, name, game_id, created_by) values ('planaria-fixture', 'Fixture Mod', 'game-synthetic-fixture', '70000000-0000-0000-0000-000000000002');
insert into public.catalog_mod_versions (id, mod_id, version, game_edition, manifest_schema_version, manifest, adapter_id, created_by)
values ('70000000-0000-4000-8000-000000000010', 'planaria-fixture', '1.0.0', 'standard', 2, '{"schemaVersion":2}', 'synthetic-container-fixture', '70000000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.catalog_mods), 0, 'normal user cannot see draft mods');
select throws_ok($$insert into public.catalog_mods (id, name, game_id, created_by) values ('evil', 'Evil', 'game-synthetic-fixture', '70000000-0000-0000-0000-000000000001')$$, '42501', null, 'normal user cannot create catalog content');
select is((select count(*)::integer from public.mod_package_objects), 0, 'normal user cannot read package object keys');
select throws_ok($$select public.planaria_authorize_admin('70000000-0000-0000-0000-000000000001')$$, '42501', null, 'desktop user cannot execute backend admin RPC');

set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.catalog_mods), 1, 'server-assigned admin sees draft content');
select lives_ok($$update public.catalog_mods set summary = 'Admin update' where id = 'planaria-fixture'$$, 'admin can mutate draft metadata');

reset role;
insert into public.user_entitlements (user_id, mod_id) values ('70000000-0000-0000-0000-000000000001', 'planaria-fixture');
set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.user_entitlements), 1, 'user sees own entitlement');
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.user_entitlements), 0, 'other user cannot see entitlement');

reset role;
insert into public.mod_package_objects (version_id, provider, object_key, byte_size, sha256, verified_at)
values ('70000000-0000-4000-8000-000000000010', 'fixture', 'mods/fixture/1.package', 4, repeat('a', 64), now());
update public.catalog_mod_versions set publish_state = 'published', published_at = now() where id = '70000000-0000-4000-8000-000000000010';
update public.catalog_mods set publish_state = 'published' where id = 'planaria-fixture';

set local role anon;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.catalog_mods), 1, 'anonymous catalog sees only Published mods');
select is((select count(*)::integer from public.catalog_mod_versions), 1, 'anonymous catalog sees only Published versions');

set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000002';
select throws_ok($$update public.catalog_mod_versions set manifest = '{"changed":true}' where id = '70000000-0000-4000-8000-000000000010'$$, '23514', null, 'Published version metadata is immutable');

set local role service_role;
select ok(public.planaria_authorize_admin('70000000-0000-0000-0000-000000000002'), 'backend recognizes server-owned admin');
select isnt(public.planaria_authorize_admin('70000000-0000-0000-0000-000000000001'), true, 'backend rejects normal user as admin');
select throws_ok($$select public.planaria_create_upload_session('70000000-0000-0000-0000-000000000001', '70000000-0000-4000-8000-000000000010', 'fixture', 'mods/evil', 1, repeat('0',64), 'upload', now() + interval '1 hour')$$, '42501', null, 'normal user cannot create privileged upload session');
select isnt(public.planaria_record_event('70000000-0000-0000-0000-000000000001', 'planaria-fixture', 'download_completed', '70000000-0000-4000-8000-000000000020', false), true, 'unverified completed download is rejected');
select ok(public.planaria_record_event('70000000-0000-0000-0000-000000000001', 'planaria-fixture', 'download_completed', '70000000-0000-4000-8000-000000000020', true), 'verified completed download is accepted');
select isnt(public.planaria_record_event('70000000-0000-0000-0000-000000000001', 'planaria-fixture', 'download_completed', '70000000-0000-4000-8000-000000000020', true), true, 'duplicate analytics event is idempotent');
reset role;
select is((select completed_downloads from public.mod_metrics where mod_id = 'planaria-fixture'), 1::bigint, 'Most Downloaded metric counts only one verified completion');

select * from finish();
rollback;
