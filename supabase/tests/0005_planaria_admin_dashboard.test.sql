begin;

create extension if not exists pgtap with schema extensions;
select plan(49);

select has_table('app_private', 'admin_permissions', 'admin permissions are private');
select has_table('app_private', 'planaria_audit_events', 'Planaria audit events are private');
select has_table('public', 'catalog_mod_media', 'mod image metadata exists');
select has_table('app_private', 'mod_media_upload_sessions', 'mod media upload sessions are private');
select has_function('public', 'planaria_my_access', array[]::text[], 'caller can request its server role summary');
select has_function('public', 'planaria_bootstrap_first_admin', array['uuid', 'text'], 'one-time bootstrap function exists');
select has_function('public', 'planaria_mark_version_ready', array['uuid', 'uuid', 'timestamp with time zone'], 'Ready transition function exists');
select has_function('public', 'planaria_save_mod_draft', array['uuid', 'text', 'text', 'text', 'text', 'uuid', 'text', 'text', 'text', 'smallint', 'jsonb', 'text', 'timestamp with time zone'], 'atomic draft save function exists');
select has_function('public', 'planaria_get_access', array['uuid'], 'Edge access lookup exists');
select has_function('public', 'planaria_list_admin_accounts', array['uuid'], 'authorized account listing exists');
select hasnt_column('public', 'catalog_mod_media', 'binary', 'mod media table stores metadata, never binary');
select isnt(has_table_privilege('authenticated', 'public.catalog_mods', 'INSERT'), true, 'desktop admin cannot directly insert mods');
select isnt(has_table_privilege('authenticated', 'public.catalog_mods', 'UPDATE'), true, 'desktop admin cannot directly update mods');
select isnt(has_table_privilege('authenticated', 'public.billboards', 'INSERT'), true, 'desktop admin cannot directly insert billboards');
select isnt(has_table_privilege('authenticated', 'app_private.admin_permissions', 'SELECT'), true, 'private permissions are not exposed');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dashboard-user@lyor.test', extensions.crypt('Test-pass-11', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"super_admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'first-admin@lyor.test', extensions.crypt('Test-pass-12', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'manager-admin@lyor.test', extensions.crypt('Test-pass-13', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'created-admin@lyor.test', extensions.crypt('Test-pass-14', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select is((select role from app_private.user_roles where user_id = '90000000-0000-0000-0000-000000000001'), 'user', 'user metadata cannot assign an admin role');

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';
select is((select role from public.planaria_my_access()), 'user', 'access summary reads the server-owned normal role');
select throws_ok($$select public.planaria_bootstrap_first_admin('90000000-0000-0000-0000-000000000001', 'forbidden')$$, '42501', null, 'authenticated desktop cannot execute bootstrap RPC');

set local role service_role;
select ok(public.planaria_bootstrap_first_admin('90000000-0000-0000-0000-000000000002', 'first.admin'), 'first bootstrap claim succeeds once');
reset role;
select is((select role from app_private.user_roles where user_id = '90000000-0000-0000-0000-000000000002'), 'super_admin', 'bootstrap creates a server-owned super admin');
set local role service_role;
select isnt(public.planaria_bootstrap_first_admin('90000000-0000-0000-0000-000000000001', 'second.admin'), true, 'second bootstrap claim is rejected');
select ok(public.planaria_can_manage_admins('90000000-0000-0000-0000-000000000002'), 'super admin can manage admin accounts');
select ok(public.planaria_register_admin_account('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000003', 'manager.admin'), 'super admin can create an admin');
reset role;
select is((select role from app_private.user_roles where user_id = '90000000-0000-0000-0000-000000000003'), 'admin', 'new account receives server-owned admin role');
set local role service_role;
select isnt(public.planaria_can_manage_admins('90000000-0000-0000-0000-000000000003'), true, 'ordinary admin cannot create more admins by default');
reset role;
insert into app_private.admin_permissions (user_id, can_manage_admins)
values ('90000000-0000-0000-0000-000000000003', true)
on conflict (user_id) do update set can_manage_admins = true;
set local role service_role;
select ok(public.planaria_can_manage_admins('90000000-0000-0000-0000-000000000003'), 'explicit server permission enables admin management');
select ok(public.planaria_register_admin_account('90000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000004', 'created.admin'), 'permitted admin can create an admin');
reset role;
select is((select role from app_private.user_roles where user_id = '90000000-0000-0000-0000-000000000004'), 'admin', 'permitted creation assigns only admin, never super admin');

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000002';
select is((select role from public.planaria_my_access()), 'super_admin', 'access summary exposes the verified super-admin role');
select throws_ok($$insert into public.catalog_mods (id, name, game_id, created_by) values ('direct-write', 'Direct', 'game-synthetic-fixture', '90000000-0000-0000-0000-000000000002')$$, '42501', null, 'even an admin cannot bypass the Edge mutation boundary');
select throws_ok($$select public.planaria_register_admin_account('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'forbidden.admin')$$, '42501', null, 'desktop cannot execute service-only admin creation RPC');
select throws_ok($$select * from public.planaria_save_mod_draft('90000000-0000-0000-0000-000000000002'::uuid, 'blocked', 'Blocked', '', 'game-synthetic-fixture', null::uuid, '1.0.0', 'standard', null, 2::smallint, '{"schemaVersion":2}'::jsonb, 'generic-files', null::timestamptz)$$, '42501', null, 'desktop cannot execute service-only draft mutation RPC');

reset role;
insert into public.catalog_games (id, edition, display_name)
values ('game-dashboard-fixture', 'standard', 'Dashboard Fixture');
set local role service_role;
select is((select role from public.planaria_get_access('90000000-0000-0000-0000-000000000002')), 'super_admin', 'Edge resolves server-owned access for the authenticated subject');
select ok((select count(*) >= 3 from public.planaria_list_admin_accounts('90000000-0000-0000-0000-000000000002')), 'authorized manager can list only admin accounts');
select version_id as saved_version_id from public.planaria_save_mod_draft(
  '90000000-0000-0000-0000-000000000002'::uuid, 'saved-dashboard-fixture', 'Saved Dashboard Mod',
  'Atomic draft fixture', 'game-dashboard-fixture', null::uuid, '1.0.0', 'standard', '>=1.0.0',
  2::smallint, '{"schemaVersion":2,"operations":[]}'::jsonb, 'generic-files', null::timestamptz
) \gset
select ok(:'saved_version_id'::uuid is not null, 'service-only draft save creates a version atomically');
reset role;
select is((select publish_state from public.catalog_mods where id = 'saved-dashboard-fixture'), 'draft', 'saved catalog mod remains Draft until explicit lifecycle transitions');
insert into public.catalog_mods (id, name, summary, game_id, created_by)
values ('dashboard-fixture', 'Dashboard Mod', 'Fixture', 'game-dashboard-fixture', '90000000-0000-0000-0000-000000000002');
insert into public.catalog_mod_versions (
  id, mod_id, version, game_edition, game_version_range,
  manifest_schema_version, manifest, adapter_id, created_by
) values (
  '90000000-0000-4000-8000-000000000010', 'dashboard-fixture', '1.0.0', 'standard', '>=1.0.0',
  2, '{"schemaVersion":2}', 'synthetic-container-fixture', '90000000-0000-0000-0000-000000000002'
);
insert into public.mod_package_objects (version_id, provider, object_key, byte_size, sha256, verified_at)
values ('90000000-0000-4000-8000-000000000010', 'fixture', 'mods/dashboard/package.zip', 8, repeat('a', 64), now());

set local role service_role;
select public.planaria_create_mod_media_upload(
  '90000000-0000-0000-0000-000000000002', 'dashboard-fixture', 'fixture',
  'mods/dashboard/media.png', 'media-upload', 10, repeat('b', 64), 'image/png', now() + interval '1 hour'
) as media_session_id \gset
select ok(:'media_session_id'::uuid is not null, 'mod media upload session is created server-side');
select ok(public.planaria_finalize_mod_media_upload(
  '90000000-0000-0000-0000-000000000002', :'media_session_id'::uuid,
  10, repeat('b', 64), 'image/png', 1050, 460
) is not null, 'verified mod image metadata finalizes');
reset role;
select updated_at as draft_updated_at from public.catalog_mod_versions
where id = '90000000-0000-4000-8000-000000000010' \gset

set local role service_role;
select ok(public.planaria_mark_version_ready(
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-4000-8000-000000000010',
  :'draft_updated_at'::timestamptz
), 'verified Draft transitions to Ready');
reset role;
select is((select publish_state from public.catalog_mod_versions where id = '90000000-0000-4000-8000-000000000010'), 'ready', 'version state is Ready');
select updated_at as ready_updated_at from public.catalog_mod_versions
where id = '90000000-0000-4000-8000-000000000010' \gset
set local role service_role;
select ok(public.planaria_publish_version(
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-4000-8000-000000000010',
  :'ready_updated_at'::timestamptz
), 'Ready version publishes atomically');
reset role;
select is((select publish_state from public.catalog_mods where id = 'dashboard-fixture'), 'published', 'publishing a version publishes its catalog mod');
select ok((select count(*) >= 4 from app_private.planaria_audit_events), 'privileged transitions are audited');

set local role service_role;
select public.planaria_create_billboard_upload_session(
  '90000000-0000-0000-0000-000000000002', 'fixture', 'billboards/dashboard.png',
  'billboard-upload', 12, repeat('c', 64), 'image/png', now() + interval '1 hour'
) as billboard_session_id \gset
select ok(:'billboard_session_id'::uuid is not null, 'billboard upload session is created server-side');
select public.planaria_finalize_billboard_upload(
  '90000000-0000-0000-0000-000000000002', :'billboard_session_id'::uuid,
  12, repeat('c', 64), 'image/png', 1050, 460, null, 'Dashboard billboard'
) as billboard_id \gset
select ok(:'billboard_id'::uuid is not null, 'verified billboard metadata finalizes as Draft');

set local role anon;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.billboards where id = :'billboard_id'::uuid), 0, 'Draft billboard is absent from public Home feed');
select is((select count(*)::integer from public.catalog_mod_media where mod_id = 'dashboard-fixture'), 1, 'published mod exposes only its verified image metadata');

reset role;
select revision as billboard_revision from public.billboards where id = :'billboard_id'::uuid \gset
set local role service_role;
select ok(public.planaria_publish_billboard(
  '90000000-0000-0000-0000-000000000002', :'billboard_id'::uuid,
  :'billboard_revision'::integer
), 'validated billboard publishes');
set local role anon;
select is((select count(*)::integer from public.billboards where id = :'billboard_id'::uuid), 1, 'Home feed sees the Published billboard');

reset role;
select * from finish();
rollback;
