# Supabase functions

This directory is the version-controlled source of truth for future Supabase
Edge Functions. Milestone 2 adds no Edge Function or privileged backend
endpoint. Any later function must authenticate the caller, validate input,
enforce authorization server-side, and keep secrets out of renderer bundles.
