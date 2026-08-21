begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('public', 'billboards', 'billboard metadata exists');
select has_table('app_private', 'billboard_upload_sessions', 'billboard upload sessions are private');
select has_column('public', 'billboards', 'duration_ms', 'verified video duration is stored');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'billboards'), 5, 'billboards have public/admin select and separate writes');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'billboard-user@lyor.test', extensions.crypt('Test-pass-9', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'billboard-admin@lyor.test', extensions.crypt('Test-pass-10', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
select is((select role from app_private.user_roles where user_id = '80000000-0000-0000-0000-000000000001'), 'user', 'signup metadata cannot create billboard admin');
update app_private.user_roles set role = 'admin' where user_id = '80000000-0000-0000-0000-000000000002';

insert into public.billboards (id, media_type, provider, object_key, mime_type, byte_size, sha256, width, height, duration_ms, alt_text, display_order, publish_state, created_by)
values
  ('80000000-0000-4000-8000-000000000011', 'image', 'fixture', 'billboards/draft.png', 'image/png', 10, repeat('a',64), 1050, 460, null, 'Draft', 1, 'draft', '80000000-0000-0000-0000-000000000002'),
  ('80000000-0000-4000-8000-000000000012', 'video', 'fixture', 'billboards/public.mp4', 'video/mp4', 20, repeat('b',64), 1920, 1080, 5000, 'Published', 2, 'published', '80000000-0000-0000-0000-000000000002'),
  ('80000000-0000-4000-8000-000000000013', 'image', 'fixture', 'billboards/disabled.png', 'image/png', 10, repeat('c',64), 1050, 460, null, 'Disabled', 3, 'disabled', '80000000-0000-0000-0000-000000000002'),
  ('80000000-0000-4000-8000-000000000014', 'image', 'fixture', 'billboards/delete.png', 'image/png', 10, repeat('d',64), 1050, 460, null, 'Delete', 4, 'draft', '80000000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '80000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.billboards), 1, 'normal user sees only Published billboard');
select throws_ok($$insert into public.billboards (media_type, provider, object_key, mime_type, byte_size, sha256, width, height, alt_text, display_order, created_by) values ('image','fixture','evil','image/png',1,repeat('0',64),320,180,'evil',9,'80000000-0000-0000-0000-000000000001')$$, '42501', null, 'normal user cannot create billboard');
select throws_ok($$select public.planaria_move_billboard('80000000-0000-0000-0000-000000000001','80000000-0000-4000-8000-000000000012',-1,1)$$, '42501', null, 'desktop user cannot call billboard backend RPC');

set local request.jwt.claim.sub = '80000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.billboards), 4, 'admin sees all billboard states');
select throws_ok($$update public.billboards set alt_text = 'Updated Draft' where id = '80000000-0000-4000-8000-000000000011'$$, '42501', null, 'admin mutations must use the Edge backend boundary');

reset role;
update public.billboards set alt_text = 'Updated Draft' where id = '80000000-0000-4000-8000-000000000011';
select throws_ok($$update public.billboards set object_key = 'billboards/mutated.mp4' where id = '80000000-0000-4000-8000-000000000012'$$, '23514', null, 'Published media identity is immutable');
set local role service_role;
select ok(public.planaria_authorize_admin('80000000-0000-0000-0000-000000000002'), 'backend recognizes billboard admin');
select ok(public.planaria_move_billboard('80000000-0000-0000-0000-000000000002','80000000-0000-4000-8000-000000000012',-1,1), 'backend atomically moves billboard');
reset role;
select is((select display_order from public.billboards where id = '80000000-0000-4000-8000-000000000012'), 1, 'move swaps deterministic display order');

set local role service_role;
select isnt(public.planaria_move_billboard('80000000-0000-0000-0000-000000000002','80000000-0000-4000-8000-000000000012',1,1), true, 'stale ordering revision is rejected');
select ok(public.planaria_publish_billboard('80000000-0000-0000-0000-000000000002','80000000-0000-4000-8000-000000000011',2), 'validated Draft publishes with expected revision');
select is(public.planaria_delete_billboard('80000000-0000-0000-0000-000000000002','80000000-0000-4000-8000-000000000014','wrong-key'), null, 'safe delete rejects wrong object ownership');
select is(public.planaria_delete_billboard('80000000-0000-0000-0000-000000000002','80000000-0000-4000-8000-000000000014','billboards/delete.png'), 'billboards/delete.png', 'safe delete returns only verified owned object key');
reset role;
select is((select count(*)::integer from public.billboards where id = '80000000-0000-4000-8000-000000000014'), 0, 'safe delete removes only the selected metadata row');

set local role anon;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.billboards), 2, 'Home feed exposes only Published billboard rows');
select is((select string_agg(alt_text, ',' order by display_order) from public.billboards), 'Published,Updated Draft', 'Home feed ordering is deterministic');

reset role;
select * from finish();
rollback;
