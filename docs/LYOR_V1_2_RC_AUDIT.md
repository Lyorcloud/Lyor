# Lyor 1.2.0 local release-candidate audit

Audit date: 2026-08-20

Branch: `codex/v1.2-milestones-4-10`

Integrated source checkpoint: `cd52335`

Decision: **LOCAL RC PASS / PRODUCTION RELEASE BLOCKED**

No tag, push, GitHub Release, production database/function deployment, object
storage mutation, SMTP change, or updater publication was performed.

## Milestone evidence

| Milestone | Commit | Local gate |
| --- | --- | --- |
| 4 — Installation Engine Core | `2a8b4f3` | Passed with isolated filesystem fixtures |
| 5 — Download / Transaction / Recovery | `1f6c6dd` | Passed with deterministic HTTP and failure-injection fixtures |
| 6 — Advanced Adapter Architecture | `19f5db5` | Passed with the legal synthetic container only; no production game claim |
| 7 — Planaria / Distribution Cloud | `f1ce096` | Local Supabase and S3-compatible fixture passed; production services not deployed |
| 8 — Billboard Management | `04c5fa7` | Local UI/server/database contracts passed; production media delivery not deployed |
| 9 — GitHub Releases / Updater | `cd52335` | Local package, policy, metadata, and smoke tests passed; signed published update not tested |

Milestones 0–3 remain present in history at `4dc2331`, `9ce93cd`, `04df056`,
and `0c7a541`. The Figma-aligned switcher correction is `a094f3a`.

## Final commands and actual results

The final audit used Node.js `v24.19.0` and npm `10.8.2` on one x64 Windows
host reporting product `Windows 10 Pro`, version `2009`, build `26200`. This is
not evidence for both required clean Windows target environments.

| Command/check | Result |
| --- | --- |
| `npm run lint` | PASS, zero warnings |
| `npm run typecheck` | PASS for renderer, Electron, and Node configs |
| `npm test` | PASS: 15 files / 50 tests; the one skipped file is the credentialed local Auth suite run by the next command |
| `npm run test:supabase` | PASS: fresh local reset/migrations, 4 pgTAP files / 105 assertions, plus 1 real local Auth API integration test |
| `npx supabase db lint --local --level warning` | PASS: no schema errors |
| `npx supabase migration list --local` | PASS: four migrations applied to the local stack (`20260820075502`, `20260820082907`, `20260820093518`, `20260820094815`) |
| `npm run security:scan` | PASS: 114 source/config files and 103 renderer files scanned |
| `npm run build` | PASS |
| `npm run dist:win` | PASS: x64 NSIS installer and unpacked app produced |
| `npm run verify:release` | PASS: version, installer, blockmap, `latest.yml`, updater target, and hashes agree |
| Packaged `Lyor.exe` smoke test | PASS: process remained alive for 8 seconds and was then stopped by the audit |
| Installer and unpacked EXE Authenticode | **FAIL production gate:** `NotSigned` |
| Local/remote `v1.2.0` tag | Absent |
| GitHub `v1.2.0` Release | Absent (read-only API returned HTTP 404) |

The unit/database matrix covers Auth lifecycle and isolation; two-user RLS;
device/cloud reconciliation and offline queue; carousel timing/fallback,
switcher, theme bootstrap, sorting, install/Library states; generic engine
ownership/backup/restore/path/link/tamper behavior; download/resume/journal/
rollback/dependency/conflict/log redaction; synthetic adapter; Planaria
authorization/lifecycle/multipart/analytics; billboard validation/order/
visibility; and updater version/error/log policy. Passing these automated
contracts is not presented as a clean-machine visual/manual production E2E.

## Local RC artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `C:\Lyor\release\Lyor-Setup-1.2.0-x64.exe` | 121238154 | `36a7783b99d6c29b12abca45ed81c31d6c38d74741073817c2910c1a1a4e5554` |
| `C:\Lyor\release\Lyor-Setup-1.2.0-x64.exe.blockmap` | 126048 | `0ba190d8eb3f9b6004a2af842927f62d546bb579ac4b845a846b5cc6d4178ff2` |
| `C:\Lyor\release\latest.yml` | 345 | `d0eb4a0ef92fc1e536bbbf539348c8ad27798714681c01c55cc2f1bd2d6b7c53` |
| `C:\Lyor\release\win-unpacked\Lyor.exe` | 225572864 | `e1facfbb25d30d36fd5a0b248ffbdc0525f47e1d86f1083d17fb80e1a7806b20` |
| `C:\Lyor\release\win-unpacked\resources\app-update.yml` | 140 | `acc74aa672bfd47784d911868df70164680fcfe183421afdb8a361db153439ca` |
| `C:\Lyor\release\artifact-sha256.json` | 1079 | `fd565a8dc1db2e1b11afdcca3791a87dd255add88eb21b3f37f82157478e14db` |

The release verifier excluded eight pre-existing `0.1.0`–`0.1.3` installer/
blockmap files from the `1.2.0` manifest without deleting or modifying them.

## Exact production blockers

1. No trusted Windows code-signing certificate/password is configured;
   installer and unpacked EXE are unsigned.
2. No production Supabase project/access, migration backup/recovery evidence,
   deployed Edge Functions, Cloudflare R2 credentials/bucket/CDN, custom SMTP,
   or sender-domain delivery verification is available. Only local services
   and fixtures passed.
3. No authorized real game/mod/proprietary tooling fixture exists. The adapter
   result is synthetic and cannot prove GTA V/RPF production compatibility.
4. Clean install and full manual/accessibility E2E were not executed on both
   Windows 10 22H2 x64 and Windows 11 x64 clean machines.
5. A real `1.2.0 -> 1.2.1` path cannot be tested until signed, public,
   version-distinct artifacts exist. Offline/corrupt/downgrade/same-version
   behavior is covered only at the policy/fixture level.
6. GitHub publish credentials are absent. Production service and signing
   environment variables were checked by presence only and were all unset.

## Required next release step

Resolve the six blockers in controlled staging first. Configure protected
production secrets outside the repository, deploy and verify migrations/
functions/storage/SMTP with backup and recovery ready, add an authorized real
adapter fixture, run the two clean-Windows matrices, sign and validate both
artifacts, then publish a distinct signed `1.2.1` candidate to exercise the
installed `1.2.0 -> 1.2.1` updater path. Rerun the complete gate before any
`v1.2.0` tag, push, release, or production mutation.
