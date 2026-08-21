# Lyor V1.2 Baseline and Architecture Contract

Status: normative V1.2 milestone memory  
Current milestone: Milestone 10 — audited local release candidate; production blocked
Application version: `1.2.0`  
Release family: **Lyor Setup V1.2**

## Post-audit Planaria administration implementation

An explicit user request after the Milestone 10 audit replaces Planaria's
placeholder/local-preview renderer with a real protected dashboard and its
version-controlled backend boundary. Overview/audit, catalog/version lifecycle,
mod package and image upload, billboard lifecycle, authorized admin-account
creation, and updater status are now connected through narrow typed IPC to the
main-process Supabase client. The main process owns native file selection,
SHA-256 calculation, bounded multipart upload, retry, and the persistent resume
journal. File paths, provider object keys, presigned part URLs, sessions, and
credentials never cross preload.

All content mutations are authenticated Edge actions backed by service-only
SQL functions. Desktop `authenticated` access has no direct catalog or
billboard write grants. Admin authorization comes only from
`app_private.user_roles` and `app_private.admin_permissions`; user metadata is
not an authorization source. Admin creation uses server-side Auth Admin APIs
and assigns only `admin`. The first `super_admin` can be created exactly once
through the backend-only bootstrap token plus an advisory-locked zero-admin
database gate. Package/image/video bytes live in provider-neutral object
storage; Postgres stores verified metadata only. Home consumes only Published
billboard rows through a deliberately public read function with short-lived
signed media URLs.

This implementation does not change the production gate below. Production
Supabase/function deployment, storage signer/R2, custom SMTP, trusted Windows
signing, clean target-machine evidence, and a real old-build-to-new-release
updater test remain required. No deploy, tag, push, publish, or production
storage mutation is implied by local verification.

## Milestone 10 audit and production gate

Milestone 10 adds no product capability. The integrated Milestone 0–9 source,
local database, security tests, Windows package, updater metadata, and packaged
application smoke test pass at commit `cd52335`. The reproducible evidence and
artifact hashes are recorded in `docs/LYOR_V1_2_RC_AUDIT.md`.

Version `1.2.0` is an **unsigned local release candidate**, not a production
release. No tag, push, GitHub Release, Supabase/Edge migration deployment,
object-storage mutation, SMTP change, or updater publication was performed.
Production remains blocked until trusted Authenticode signing, clean Windows 10
22H2 and Windows 11 x64 verification, production Supabase/R2/SMTP deployment
and recovery checks, an authorized real game/mod adapter test, and a real
published `1.2.0 -> 1.2.1` updater test all succeed. Fixture and local-emulator
results must not be relabelled as production evidence.

The explicitly authorized friends-and-family pilot may use public, unsigned
`1.2.x` GitHub Releases solely to prove the updater end to end. Such releases
must be manually triggered, visibly labelled unsigned test builds, and remain
outside the production gate. Normal tag-triggered publishing still requires
trusted Authenticode signing.

## Milestone 9 release and updater contract

Milestone 9 completes the version/tag/build/package/release policy for the V1.2
patch line. `package.json` is the version source; tag `v<version>`, installer,
blockmap, `latest.yml`, packaged `app-update.yml`, and generated SHA-256 manifest
must agree. `npm run dist:win` is local/non-publishing and
`npm run publish:win` is the only explicit publishing script.

CI runs lint, typecheck, unit/integration tests, security scan, build, and local
Supabase security tests. The tag workflow has read-only permissions during
validation and grants `contents: write` only to the protected `production`
publish job. Production publishing refuses to run without trusted Windows
signing secrets. The artifact verifier requires the current version's
installer, blockmap, `latest.yml`, and packaged updater target to agree,
excludes stale local builds from its manifest, and writes
`release/artifact-sha256.json`.

Updater remains main-process-only, checks once per packaged session when
enabled, never auto-downloads, never auto-installs on ordinary app quit, and
uses `quitAndInstall()` only after explicit user action. Version policy rejects
same-version, downgrade, prerelease, invalid metadata, and integrity/signature
errors. Overlay supports found/downloading/downloaded/error, Retry, Later, and
Restart & Install while retaining reduced-motion/theme behavior.

Actual old-build -> new GitHub Release updating and Authenticode trust cannot be
verified without a second version, published artifacts, credentials, and
signing certificate; they remain Milestone 10 production blockers.

## Milestone 8 billboard management contract

Milestone 8 adds admin-only Manage Billboard list/upload-preview/reorder/publish/
disable/delete behavior and version-controlled billboard schema/functions.
Metadata records image/video type, provider object reference, size/SHA-256,
dimensions, verified video duration, `display_order`, lifecycle, revision, and
timestamps. Public/Home RLS returns only Published rows; Draft and Disabled are
invisible and ordering is deterministic.

Server media validation recognizes PNG/JPEG/WebP/MP4 magic structure, enforces
MIME/type, size, dimensions, and MP4 duration limits, and rejects malformed
content. Ordering uses an advisory transaction lock plus expected revision.
Published media identity is immutable; safe delete requires matching ID/object
ownership and only accepts Draft/Disabled state. Preview reuses the exact Home
carousel component, ratio, object-fit, image timer, video-ended behavior, and
broken-media fallback.

Without deployed storage/backend credentials the dashboard explicitly runs in
local preview mode and updates the current session's typed Home feed only. This
does not claim production upload/publish/delete. The local Supabase and media
fixture gates are complete; external deployment remains blocked.

## Milestone 7 Planaria and distribution contract

Milestone 7 activates Planaria's admin-only route, version-controlled catalog,
package metadata, entitlement, upload-session, and verified analytics schema,
plus authenticated Edge Function boundaries. Supabase Auth remains the identity
source. `app_private.user_roles` and server-only RPC grants decide admin access;
public signup and `user_metadata` cannot grant it. Normal users cannot enter
Planaria or mutate Draft/Ready/Published content.

Package bytes never enter Postgres or transit through an Edge Function. The
provider-neutral `ModStorageProvider` owns multipart create/part/finalize/abort,
existence, metadata, deletion, and short-lived signed downloads. The production
adapter contract is S3-compatible (including Cloudflare R2); deterministic
local tests use `LocalS3CompatibleStorageProvider`. Object keys are generated
server-side, finalized size/SHA-256/parts are verified, and Published version
metadata is immutable. Signed downloads require a Published version and current
entitlement (or server-owned admin).

Lifecycle is Draft -> Ready -> Published -> Disabled with optimistic revision
checks. Ready requires verified package, valid manifest, and adapter
compatibility. Analytics is idempotent; `download_completed` contributes to
Most Downloaded only when the backend verifies it. Verification/reset SMTP,
service-role, storage-signer, and analytics secrets are backend-only.

The local Supabase/S3-compatible fixture gate is complete. Production Supabase,
R2, SMTP delivery, and Edge deployment are not configured or claimed verified;
they remain production blockers.

## Milestone 6 advanced adapter contract

Milestone 6 adds capability-based game adapter and archive-handler contracts,
manifest schema v2, `ARCHIVE_ADD`, `ARCHIVE_REPLACE`, `ARCHIVE_DELETE`, and
format-aware `CONFIG_MERGE`. Adapters declare file/archive/mod-layer/config,
version detection, and validation capabilities; a manifest cannot invoke a
capability the selected adapter does not own. Manifest v1 remains valid and is
not silently reinterpreted as an advanced manifest.

The implemented reference is `synthetic-container-fixture`, a repository-owned
legal test format for `game-synthetic-fixture`. It proves entry containment,
case-collision/corruption/resource checks, exact source hashes, atomic container
replacement, deterministic conflict-rejecting JSON merge, verified backup,
rollback, and byte-for-byte uninstall. It is not a GTA V, RPF, or other
proprietary production adapter and must never be described as one. A real
authorized game/tooling fixture remains a production blocker.

## Milestone 5 transaction and recovery contract

Milestone 5 adds a cache-only HTTP(S) download manager with bounded retry,
partial Range resume, safe restart when a server ignores Range, exact size, and
SHA-256 verification before staging. Signed URLs are inputs to the privileged
download boundary only and never enter journals or logs. Downloads never write
directly into an approved game root.

The durable local journal uses `pending`, `downloading`, `validating`, `staging`,
`backing_up`, `installing`, `verifying`, `rolling_back`, `installed`, and
`failed`. Pre-mutation interruption resumes from trusted cached input;
post-mutation interruption deterministically enters rollback. A partial or
failed transaction is never reported installed. Preflight owns auth/entitlement
and Published contracts, compatibility, running-process, disk/writability,
required dependency, dependency-cycle, and conflict gates. Known target
collisions fail closed; unknown merges are prohibited.

Engine logs are structured and path/token/signed-URL redacted. Executable or
script payloads and targets (`BAT`, `CMD`, `COM`, `EXE`, `MSI`, `PS1`, `SCR`)
are rejected by manifest validation. Full-app elevation and generic elevated
renderer capabilities are prohibited. Milestone 6 archive/config capabilities
remain blocked.

## Milestone 4 local installation engine contract

Milestone 4 activates a privileged, device-local engine core for ordinary file
packages only. The renderer can submit only main-approved game-detection and
package-input IDs over a narrow validated IPC API; it cannot supply arbitrary
filesystem paths, manifests, commands, or raw filesystem operations. Steam,
Epic, Rockstar, Xbox PC, and Manual are detection-provider contracts. A result
is usable only after provider verification and carries a stable edition-aware
Game ID such as `gta5-legacy` or `gta5-enhanced`.

`contracts/installation-manifest.schema.json` is the versioned manifest source
of truth. Version 1 permits only `COPY_FILE`, `COPY_FOLDER`, `REPLACE_FILE`,
`DELETE_FILE`, and `CREATE_DIRECTORY`, with safe relative paths and the
`generic-files` adapter. It cannot run executables, scripts, setup programs, or
archive/container operations. Canonical containment and link/reparse checks
apply to both package and game roots.

The local atomic metadata record owns the manifest digest, game/edition/version,
installed version, operation history, file hashes, and verified original backup
relationships. Uninstall removes only unchanged Lyor-owned files and restores
only hash-verified originals. Missing/tampered/unowned paths fail closed. Cloud
Library membership and device summaries cannot authorize a physical operation.

Planaria and object distribution remain blocked until their named milestones.

## Milestone 3 user cloud and multi-PC contract

Milestone 3 activates standard authenticated CRUD/sync over the Milestone 2
boundary. Theme, language, safe account preferences, Favorites, logical Cloud
Library membership, random installation-scoped Devices, and per-device summary
metadata are cloud state. Bootstrap is ordered as Authenticate, Profile,
Settings, Favorites, Library, Device, Device Summaries, then Home; each step is
isolated so cached data remains usable after a partial or network failure.

The main process owns Supabase CRUD, a persistent per-account cache, random
Device ID, and an idempotent pending queue with exponential retry. Renderer IPC
remains narrow and token-free. Settings use optimistic local updates and a
cloud revision for conflict detection; on conflict the current cloud revision
wins and is applied back to the local cache.

Cloud Library membership is account ownership, not installation truth.
Another device's `installed` summary never marks the current PC installed.
Reconciliation updates this device's cloud summary from local metadata and
never deletes Cloud Library membership. Absolute game/launcher/executable
paths, cache, staging, backups, journals, file ownership, and physical state
are prohibited from cloud payloads and schemas. Logout clears auth state but
does not delete these local facts, cached account data, or pending operations.

Installation Engine, Planaria, R2/object distribution, and updater changes are
not authorized by this milestone.

## Milestone 2 authentication and security contract

Milestone 2 activates email/password authentication and the minimum cloud
security foundation. Supabase runs behind Electron main; preload exposes only
typed, validated auth actions and sanitized public session summaries. Access
and refresh tokens never enter renderer state or `localStorage`. On Windows,
the persisted Supabase session is encrypted with Electron `safeStorage`
(DPAPI-backed); when OS encryption is unavailable, persistence degrades to
memory rather than plaintext disk storage.

`supabase/migrations/` is authoritative for profiles, settings, favorites,
logical Library membership, devices, private roles, explicit grants, and RLS.
Public signup always provisions `user`, ignoring user-editable metadata. Admin
and future super-admin assignments are server-owned in `app_private`; the
desktop publishable client cannot mutate that table. Exact `lyor://auth/callback`
deep links are accepted for PKCE/verified email flows; arbitrary URLs,
parameters, navigation, and window creation remain denied.

This milestone does not activate full cloud synchronization, Planaria content
management, R2/object distribution, privileged service-role desktop access, or
the Installation Engine. Local UI Library/install state remains distinct from
the new account-level logical tables until Milestone 3 explicitly defines sync.

## Milestone 1 interface contract

Milestone 1 is a renderer-only scope extension. It authorizes the three themes,
product switcher with an unavailable Planaria placeholder, search/billboard
transition, local image/video carousel, shared local sorting, richer mock
install phases, and Library presentation states. The typed mock model keeps
logical Library membership separate from device-local installation truth;
removing a Library entry cannot itself uninstall or rewrite local state.

Milestone 1 itself added no account, Supabase/R2 integration, production backend,
remote catalog, filesystem access, game-file mutation, manifest adapter, or
real Installation Engine. Every such Milestone 0 gate remains closed.

## 1. Version and milestone policy

Versions `0.1.0` through `0.1.3` are development/prototype builds. The V1.2
production line begins at `1.2.0`; compatible production fixes increment the
patch component (`1.2.1`, `1.2.2`, and so on). `package.json` is the application
version source of truth and `package-lock.json`, installer metadata, updater
metadata, Git tags, and GitHub Releases must agree with it.

Milestone 0 establishes a safe repository baseline. It adds no product feature,
backend, cloud integration, authentication, storage provider, or physical mod
installation behavior. Later milestones are opt-in gates: a milestone may
activate only the capability explicitly named in its prompt. Existing security
restrictions remain in force everywhere else.

## 2. Repository sources of truth

Operational production state must be reproducible from reviewed version-control
content. Manual dashboard changes are not an acceptable sole source of truth.
When the owning milestone authorizes each capability, its canonical material
must be committed in these areas:

| Concern | Version-controlled source of truth |
| --- | --- |
| Database schema, migrations, and RLS policies | `supabase/migrations/` |
| Supabase Edge/backend functions | `supabase/functions/` |
| Deterministic seed data | `supabase/seed.sql` |
| Backend/database tests | `supabase/tests/` |
| Storage-provider integration and provider adapters | privileged application/backend modules introduced by the owning milestone, never renderer secrets |
| Environment variable shape | root `.env.example` and milestone-specific secret-free templates |
| GitHub automation | `.github/workflows/` |
| Desktop packaging and updater configuration | `package.json`, `package-lock.json`, and `electron-builder.config.cjs` |
| Installation Manifest wire/schema contract | `contracts/installation-manifest.schema.json` when authorized |
| Local installation adapter interfaces | a privileged Electron engine contract module when authorized; never a React component |

Secrets, service-role keys, signing certificates, passwords, and real credentials
must not be committed. Dashboard configuration that cannot be exported directly
must be recorded as reviewed configuration or a reproducible command in the
repository before it is relied on in production.

No `supabase/`, `contracts/`, storage adapter, or real engine implementation is
created in Milestone 0. The paths above reserve ownership without pretending
that those systems already exist.

## 3. Four technical layers

### 3.1 Lyor Cloud Platform

Future responsibility: Supabase authentication, catalog/account metadata, and
account-level state. This layer may know a user’s account preferences,
favorites, entitlements, and cloud-visible logical records after their owning
milestones authorize them.

Current comparison: the Milestone 2 Auth boundary and Milestone 3 account sync
are implemented. The client exists only in Electron main; renderer has no
Supabase import, token, or privileged key. Favorites, logical Library, settings,
devices, and safe summaries sync through typed IPC. Physical install state and
all sensitive local paths remain device-local.

Security contract: RLS is mandatory for exposed user data, authorization must
be ownership-based, and service-role/secret keys must never enter the renderer.
Schema and policy changes must arrive through reviewed migrations. Data API
exposure and SQL grants are distinct from RLS and must both be explicit.

### 3.2 Lyor Mod Distribution Cloud

Future responsibility: provider-independent object storage/CDN for published
mod archives and downloadable payloads. A first production provider may later
be Cloudflare R2, but clients and domain contracts must not depend on a provider
brand.

Current comparison: provider-neutral contracts, an S3-compatible adapter
boundary, a deterministic local multipart fixture, server-generated object
keys, and authenticated upload/signed-download/delete Edge Function sources are
implemented. No production R2 account, credential, CDN endpoint, or deployed
function is configured, so external delivery is not verified.

Binary contract: large binaries never belong in Supabase Database. ZIP, 7Z,
RAR, and multi-gigabyte packages belong in object storage. The database stores
metadata only, including provider, object key, byte size, SHA-256 digest,
publish state, and the minimum additional catalog linkage authorized later.
Object payload integrity must be verified against the committed/published
digest before privileged local installation work can consume it.

Planaria's canonical new mod-upload input is loose content, not an
administrator-created archive: an admin selects either one regular file or one
folder. Folder files are uploaded individually with safe relative paths and
per-file SHA-256 values; absolute local paths never reach the renderer or
cloud. Legacy archive metadata remains readable for compatibility, but new
Planaria uploads must not require or silently create ZIP, 7Z, or RAR packages.

### 3.3 Lyor Local Installation Engine

Future responsibility: device game paths, staging, cache, backups, journals,
ownership records, conflict handling, transactional recovery, physical file
changes, and uninstall truth.

Current comparison: the Milestone 4 generic-file engine, manifest parser,
verified detection registry, safe path resolver, backup/ownership metadata, and
install/uninstall core are implemented in Electron main. Milestone 5 adds the
durable download/journal/recovery boundary; Milestone 6 adds capability-based
archive/config APIs exercised only by a synthetic adapter. The existing
`mockModService` and `mockGameDiscoveryService` remain renderer-only UI
simulations and are not represented as real detection or installation results.

Local/physical truth belongs to the device. Cloud records cannot prove that a
file exists, that a game path is valid, that an install completed, or that a
backup is recoverable. The local engine journal and ownership model are
authoritative for those facts. Account sync may mirror a safe summary but must
never overwrite physical truth merely because cloud state differs.

### 3.4 Lyor Application Distribution

Responsibility: GitHub source, GitHub Actions, GitHub Releases, the Windows
Setup artifact, blockmaps, `latest.yml`, packaged `app-update.yml`, and the
desktop updater.

Current comparison: implemented. Electron Builder produces an x64 NSIS package
for `Lyorcloud/Lyor`; `electron-updater` runs only in packaged builds, keeps
downloads user-initiated, validates state through narrow IPC, and installs only
through main-process `quitAndInstall()`. The `v1.2.*` workflow verifies that a
tag equals `package.json` before publishing.

The canonical user-facing family name is **Lyor Setup V1.2**. Artifact files
remain exact and machine-readable, currently
`Lyor-Setup-<version>-x64.exe`, its `.blockmap`, and `latest.yml`.

## 4. Cloud state versus device state

These domains must never be conflated:

| Cloud/account state | Device/local physical state |
| --- | --- |
| Identity and account preferences | Discovered or user-approved game path |
| Catalog metadata and publish state | Staged/downloaded bytes and cache |
| Provider/object key, size, SHA-256 | Verified local payload hash |
| Account favorites or logical library intent | Installation journal and transaction state |
| Safe synchronized summaries | Backups, file ownership, conflicts, recovery, actual installed files |

A cloud “installed” flag cannot authorize deletion or prove installation. The
future local engine must reconcile using its own journal, manifest, integrity
checks, and ownership records. Physical mutations must never be initiated by
renderer state alone.

## 5. Existing desktop security audit

The current application preserves the Electron trust zones:

- main owns BrowserWindow lifecycle, native actions, updater operations, and
  the updater preference file;
- preload exposes only named typed window/updater methods and validates updater
  state received from main;
- renderer stays browser-like and has no Node.js/Electron imports;
- BrowserWindow uses sandboxing and context isolation with Node integration
  disabled;
- IPC handlers validate the sender, main frame, trusted renderer URL, channel,
  argument count, and boolean preference input;
- new windows, webviews, permission requests, navigation, and redirects are
  denied;
- development accepts only an uncredentialed loopback Vite URL and enables
  developer tools; production loads the packaged local file, disables developer
  tools, applies a no-network renderer CSP, and enables updater checks only when
  `app.isPackaged` is true.

This audit does not authorize weakening those controls when cloud or engine
features arrive. New privileged operations require narrow typed contracts and
main-process validation.

## 6. Milestone 0 acceptance and remaining gates

Milestone 0 may change versioning, project memory, repository configuration,
and validation evidence only. It must not add runtime backend or engine code.

Before Milestone 1 begins:

- the baseline branch and commit must exist locally;
- lint, typecheck, production build, and supported Windows packaging must pass;
- no real secret may be present in tracked files;
- public production release remains blocked until code signing is configured
  and a later release milestone explicitly authorizes push/tag/release;
- real backend, storage, and installation work remain blocked until their
  respective milestone contracts are explicitly requested.
