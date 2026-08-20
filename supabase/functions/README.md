# Supabase functions

This directory is the source of truth for the Milestone 7 privileged backend
boundary. Every function verifies the Supabase access token server-side,
validates bounded JSON input, and uses service-role capability only inside the
Edge runtime. Planaria admin actions additionally call the server-owned role
check; user-editable metadata is never consulted.

- `planaria-upload-session` creates/finalizes/aborts provider-neutral multipart
  sessions. Package bytes go directly to the configured storage signer/provider.
- `planaria-publish` performs optimistic, validated Ready -> Published changes.
- `signed-mod-download` requires a Published version plus entitlement (or admin).
- `planaria-storage-delete` rejects Published object deletion.
- `analytics-event` is idempotent and cannot self-assert a completed download.

`SUPABASE_SERVICE_ROLE_KEY`, storage signer secrets, analytics verification
secrets, and SMTP credentials are backend-only. Production deployment and email
delivery are not considered verified until those external services are
configured and exercised in the intended Supabase project.
