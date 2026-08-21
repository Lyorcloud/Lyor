drop policy if exists mod_content_objects_admin_select on public.mod_content_objects;
revoke all on public.mod_content_objects from authenticated;

comment on table public.mod_content_objects is
  'Backend-only metadata for loose mod files. Desktop admins use narrow Edge Functions; no client role receives direct table access.';
