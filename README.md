# Lyor

Lyor is a bilingual English/Turkish Windows desktop application for discovering, installing, and removing game mods without requiring the player to operate a separate mod tool, engine, or manager.

The repository is on the V1.2 baseline at version `1.2.0`. Builds `0.1.0`
through `0.1.3` are development/prototype builds. The production patch line is
`1.2.0`, `1.2.1`, `1.2.2`, and so on. **Lyor Setup V1.2** is the canonical
user-facing installer family name; each generated installer filename also
contains its exact application version and architecture.

This repository contains the secure Electron foundation, Figma-aligned UI shell, complete local Settings view, Supabase email/password authentication boundary, the real Windows application-updater boundary, and a main-process-only generic-file Installation Engine core. The visible Mod Install/Uninstall and game discovery UI remain intentionally mock-only: no production GTA V or RPF path is registered, read, or changed.

Milestone 3 adds account-level sync for theme, language, safe preferences,
Favorites, Cloud Library membership, random Devices, and non-authoritative
installation summaries. It deliberately does not sync absolute paths, backups,
journals, cache/staging, file ownership, or physical installation truth.

Milestone 4 adds the versioned Installation Manifest, verified edition-aware
detection contract, ordinary file copy/replace/delete operations, atomic local
ownership metadata, verified backups, and safe uninstall. Renderer calls carry
only main-approved IDs; arbitrary paths and filesystem capabilities never cross
preload. The end-to-end engine tests use temporary synthetic fixtures only.

Milestone 5 adds cache-only resumable downloads, exact SHA-256/size validation,
preflight dependency/conflict/resource gates, a durable transaction journal,
deterministic crash recovery decisions, rollback hooks, and structured redacted
engine logs. No download writes directly to a game folder, and failed or partial
transactions cannot become installed state.

Milestone 6 adds manifest v2 and capability-based archive/config adapter APIs.
Its executable reference adapter uses only Lyor's synthetic test container and
temporary fixtures; it is deliberately not a production GTA V/RPF adapter.

The V1.2 milestone and architecture contract is in
[`docs/LYOR_V1_2_BASELINE.md`](docs/LYOR_V1_2_BASELINE.md). The implemented
foundation scope remains in [`docs/LYOR_V1_SPEC.md`](docs/LYOR_V1_SPEC.md), and
repository implementation rules are in [`AGENTS.md`](AGENTS.md).

## Product flow

`Home / Mods -> ModCard -> Install -> Library -> same ModCard -> Uninstall -> game restored to its original state`

The generic-file engine proves restoration against synthetic fixtures. The current UI still uses an explicitly named mock service until verified package and game inputs are connected by their owning milestones.

## Stack and target

- Electron + React + TypeScript + Vite
- npm
- Windows 10 22H2 x64 and Windows 11 x64
- Sandboxed renderer, context isolation enabled, Node integration disabled
- Installable Windows application/EXE (not a browser website)

## Getting started

Prerequisites:

- Node.js `22.12.0` or newer (required by the Electron development dependency)
- npm
- Windows for native packaging and final application validation

Install dependencies:

```powershell
npm install
```

Run the desktop application in development mode:

```powershell
npm run dev
```

## Validation and builds

Run each quality gate independently:

```powershell
npm run lint
npm run typecheck
npm run build
npm test
npm run test:supabase
npm run security:scan
```

Create the Windows distributable:

```powershell
npm run dist:win
```

Packaging always writes the versioned NSIS installer, blockmap, and
`latest.yml` for the verified `Lyorcloud/Lyor` GitHub Release target; it also
packages `app-update.yml`. The unpacked application is written to
`release/win-unpacked/Lyor.exe`. GitHub release publishing is intentionally a
separate, explicit command:

```powershell
npm run publish:win
```

Publishing requires `GH_TOKEN` in the environment. See
[`docs/RELEASE_GUIDE.md`](docs/RELEASE_GUIDE.md) for version bumps, the
`1.2.0 -> 1.2.1` update test, GitHub Release requirements, troubleshooting,
and Windows code signing required before public distribution. Local builds remain
unsigned until a trusted certificate is configured, so Windows may show a
SmartScreen warning during testing.

`dist:win` is the canonical packaging command for project documentation. If the npm script is deliberately renamed during scaffolding, update this README, `AGENTS.md`, and `docs/LYOR_V1_SPEC.md` together rather than documenting competing commands.

The packaging tool's configured output directory is the source of truth for generated artifacts. A completion report must give the exact installer/EXE path when an artifact is successfully produced.

## Foundation UI

The first implementation turn covers:

- secure Electron main/preload/renderer boundaries;
- reusable window shell, title bar, headbar, sidebar, navigation/game buttons, search, shared ModCard/ModGrid, and favorite button;
- the supplied Lyor logo in the sidebar/About/Windows package plus a responsive `1050 x 460px` Home billboard;
- one theme-aware main scrollbar, per-route session scroll restoration, and reduced-motion-aware route transitions;
- working local navigation among Home, Mods, Library, and Favorites;
- Search over typed local mock mod name, game name, and aliases;
- local favorites and mock install/library state;
- persistent English/Turkish localization;
- persistent Ice Max, Dark, and Light themes backed by centralized CSS tokens;
- Settings sections for Appearance, Language, explicitly mock Games discovery, real application Updates, and About;
- a packaged-build-only `electron-updater` service behind validated main/preload IPC, with user-approved downloads and installs;
- local project copies of used visual assets.

Home, Mods, Library, Search results, and Favorites share the fixed `230 x 300px` ModCard. Library uses typed mock logical membership plus a separate device-local state model, supports the five Milestone 1 states, and keeps cards present after uninstall until the explicit Remove from Library action.

## Authentication security foundation

Milestone 2 adds Register, email verification, Login, Forgot/Reset Password,
session restore/refresh/expiration, and Logout. Supabase runs in Electron main,
not the renderer. Windows persists the session only as a `safeStorage`-encrypted
blob under Electron `userData`; no access/refresh token is exposed through
preload or stored in renderer `localStorage`.

Set only `LYOR_SUPABASE_URL` and a client-safe
`LYOR_SUPABASE_PUBLISHABLE_KEY` in the process environment. Never use a
service-role/secret key in the desktop application. `.env.example` documents
the shape without credentials.

The local database, Auth service, Mailpit email capture, migrations, seed, and
pgTAP tests are reproducible through the pinned Supabase CLI. They require a
running Docker-compatible container runtime:

```powershell
npm run test:supabase
```

This resets only the local Supabase database, runs RLS tests, then runs the
real local Auth API flow tests. It does not link, push, deploy, or modify a
remote project.

Cloud bootstrap follows Authenticate → Profile → Settings → Favorites →
Library → Device → Device Summaries → Home. The main process persists a local
cache and idempotent retry queue under Electron `userData`, so offline changes
are retried without making local uninstall/backup behavior cloud-dependent.
Each installation receives a random persistent UUID; no hardware fingerprint
is generated.

## Figma

Visual reference: [Lyor in Figma](https://www.figma.com/design/sZtHJ0VLe4VssHIGC49fuA/Lyor?node-id=10-2)

Figma defines the intended appearance, not the implementation architecture. The application uses responsive CSS Grid and correct independent scroll regions rather than copying absolute card coordinates, prototype navigation, or broken canvas layout. V1.2 Milestone 1 uses the Figma-aligned Sort control on Home, Library, and Favorites with typed local data; the `Libary` typo remains corrected to `Library`.

Reference nodes:

- Home frame: `10:2`
- ModCard component set: `22:118`
- Sidebar component set: `10:78`
- Game Button component set: `10:54`

## Scope guardrails

V1 contains Home, Library, Mods, Search, Favorites, and Settings. V1.2 Milestone 1 adds the named interface behavior, Milestone 2 adds authentication/security, Milestone 3 adds account sync, and Milestone 4 adds only the local generic-file engine core. It does not yet add Planaria content management, R2/object distribution, advanced archive/config adapters, production game/RPF support, community uploads, ratings/reviews/comments, mod or game detail pages, filters, general product notifications, Premium, real mod updates, user-facing Restore/Rollback controls, an admin panel UI, or a Lyor-built trainer system. The narrowly scoped update-available banner belongs only to the existing application updater.

Regular mods and administrator-prepared third-party trainer packages are intended for eventual V1 support. The real game-file engine is not part of the current foundation and must not be added without a new explicit implementation scope.
