begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public', 'mod_content_objects', 'loose content metadata table exists');
select col_is_pk('public', 'mod_content_objects', 'id', 'content rows have an id primary key');
select col_is_fk('public', 'mod_content_objects', 'version_id', 'content belongs to a version');
select has_function('public', 'planaria_create_content_upload_session', array['uuid','uuid','text','text','text','bigint','text','text','timestamp with time zone'], 'content session RPC exists');
select has_function('public', 'planaria_finalize_content_upload', array['uuid','uuid','bigint','text'], 'content finalize RPC exists');
select policies_are('public', 'mod_content_objects', array[]::text[], 'content metadata is deny-by-default');
select throws_ok(
  $$insert into public.mod_content_objects (version_id, relative_path, provider, object_key, byte_size, sha256, verified_at)
    values (gen_random_uuid(), '../escape.dll', 'r2', 'content/test/escape', 1, repeat('a',64), now())$$,
  null, null, 'unsafe relative paths are rejected'
);
select function_privs_are('public', 'planaria_finalize_content_upload', array['uuid','uuid','bigint','text'], 'service_role', array['EXECUTE'], 'only backend role receives finalize execution');

select * from finish();
rollback;
