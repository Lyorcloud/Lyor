# Supabase Milestone 7 verification

Verified on 2026-08-20 before implementing Milestone 7:

- Supabase changelog Markdown: <https://supabase.com/changelog.md>
- Local development and migration source of truth:
  <https://supabase.com/docs/guides/local-development/database-migrations>
- Auth architecture and protected Auth schema:
  <https://supabase.com/docs/guides/auth/architecture>
- Custom claims/RBAC guidance:
  <https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac>
- Storage protocols and resumable/S3 support:
  <https://supabase.com/docs/guides/storage>
- S3 credentials and server-only access-key warning:
  <https://supabase.com/docs/guides/storage/s3/authentication>

Decisions applied here: reviewed migrations are authoritative; exposed tables
use RLS plus explicit grants; admin roles remain in private server-owned data;
service-role and S3 access keys stay out of the desktop; package binaries live
in object storage; short-lived signed/session-token operations are authorized
server-side; and local CLI limitations are not reported as production proof.

The current changelog was also checked for recent platform changes. The July
2026 notes include Realtime schema lock-down and extension version-pinning
deprecation; this milestone neither mutates the Realtime schema nor pins an
extension version.
