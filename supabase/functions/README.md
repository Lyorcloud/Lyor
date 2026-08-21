# Supabase functions

This directory is the source of truth for the privileged Planaria backend
boundary. Every privileged function verifies the Supabase access token
server-side, validates bounded JSON input, and uses backend capability only
inside the Edge runtime. The two deliberate public exceptions are documented
below. Planaria admin actions additionally call the server-owned role check;
user-editable metadata is never consulted.

- `planaria-upload-session` creates/finalizes/aborts provider-neutral multipart
  sessions. Package bytes go directly to the configured storage signer/provider.
- `planaria-mod-media` applies the same verified multipart boundary to mod
  images; Postgres receives only object metadata.
- `planaria-billboard` creates/resumes/finalizes billboard uploads and performs
  optimistic reorder/publish/disable plus disabled-only safe deletion.
- `planaria-public-feed` is deliberately public and returns only Published
  billboard metadata with short-lived signed media URLs.
- `planaria-admin-api` returns the protected dashboard snapshot, atomically
  saves drafts, and owns lifecycle transitions.
- `planaria-admin-accounts` uses the server-only Auth Admin API and can be called
  only by `super_admin` or an admin with `can_manage_admins`.
- `planaria-admin-bootstrap` has JWT verification disabled by design, but
  requires `PLANARIA_ADMIN_BOOTSTRAP_TOKEN` and an advisory-locked, one-time
  zero-admin database gate. It must be invoked only from a secure operator
  environment and is never wired to public signup or the renderer.
- `planaria-publish` performs optimistic, validated Ready -> Published changes.
- `signed-mod-download` requires a Published version plus entitlement (or admin).
- `planaria-storage-delete` rejects Published object deletion.
- `analytics-event` is idempotent and cannot self-assert a completed download.

`SUPABASE_SECRET_KEY` (or the legacy local `SUPABASE_SERVICE_ROLE_KEY`), the
bootstrap token, storage signer secrets, analytics verification
secrets, and SMTP credentials are backend-only. Production deployment and email
delivery are not considered verified until those external services are
configured and exercised in the intended Supabase project.
