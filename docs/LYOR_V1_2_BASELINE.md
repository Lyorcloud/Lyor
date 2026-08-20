# Lyor V1.2 Baseline and Architecture Contract

Status: normative V1.2 milestone memory  
Current milestone: Milestone 2 — Supabase Authentication + Security Foundation
Application version: `1.2.0`  
Release family: **Lyor Setup V1.2**

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

Current comparison: the Milestone 2 Auth client and user-owned schema/RLS
foundation are implemented. The client exists only in Electron main; renderer
has no Supabase import, token, or privileged key. Full Favorites/Library/Settings
sync remains blocked, so existing renderer `localStorage` values are still
device-local prototype state and must not be relabeled as cloud truth.

Security contract: RLS is mandatory for exposed user data, authorization must
be ownership-based, and service-role/secret keys must never enter the renderer.
Schema and policy changes must arrive through reviewed migrations. Data API
exposure and SQL grants are distinct from RLS and must both be explicit.

### 3.2 Lyor Mod Distribution Cloud

Future responsibility: provider-independent object storage/CDN for published
mod archives and downloadable payloads. A first production provider may later
be Cloudflare R2, but clients and domain contracts must not depend on a provider
brand.

Current comparison: absent and blocked. No upload, signed-download, object-key,
storage credential, CDN, or provider adapter exists.

Binary contract: large binaries never belong in Supabase Database. ZIP, 7Z,
RAR, and multi-gigabyte packages belong in object storage. The database stores
metadata only, including provider, object key, byte size, SHA-256 digest,
publish state, and the minimum additional catalog linkage authorized later.
Object payload integrity must be verified against the committed/published
digest before privileged local installation work can consume it.

### 3.3 Lyor Local Installation Engine

Future responsibility: device game paths, staging, cache, backups, journals,
ownership records, conflict handling, transactional recovery, physical file
changes, and uninstall truth.

Current comparison: absent and blocked. `mockModService` and
`mockGameDiscoveryService` are renderer-only UI simulations. They do not access
the filesystem, discover games, or establish installation ownership. The only
current privileged filesystem write is the unrelated updater preference under
Electron `userData`.

Local/physical truth belongs to the device. Cloud records cannot prove that a
file exists, that a game path is valid, that an install completed, or that a
backup is recoverable. The future local engine journal and ownership model are
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
