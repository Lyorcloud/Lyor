# Lyor Repository Instructions

This file applies to the entire repository. It is project memory for humans and coding agents. Read it before changing code.

## Sources of truth

1. The user's current request has highest priority.
2. [`docs/LYOR_V1_2_BASELINE.md`](docs/LYOR_V1_2_BASELINE.md) is the V1.2 milestone gate and architecture contract.
3. [`docs/LYOR_V1_SPEC.md`](docs/LYOR_V1_SPEC.md) remains the implemented foundation specification until a later V1.2 milestone explicitly supersedes one of its restrictions.
4. This file defines repository-wide implementation guardrails.
5. Figma is the visual reference only; it is not an architecture, navigation, scrolling, or layout specification.

Do not invent product features. If a behavior is not specified, choose the smallest conventional implementation that preserves the documented scope. Do not ask the user to decide routine technical defaults.

## V1.2 milestone gate

Versions `0.1.0` through `0.1.3` are development/prototype builds. The V1.2
production version line starts at `1.2.0`; later patches are `1.2.1`, `1.2.2`,
and so on. The canonical user-facing installer family name is **Lyor Setup
V1.2**; generated files remain uniquely versioned.

Milestone 0 is repository-safety work only. It does not authorize Supabase,
authentication, cloud sync, object storage, a real installation engine, game
discovery, game-file access, or RPF access. Those capabilities remain blocked
by the foundation rules below until the specific later milestone that owns the
capability is explicitly requested. A later prompt opens only its named scope;
it does not remove unrelated safety gates.

Future backend/schema changes must be reproducible from version control. Do
not use dashboard-only production configuration as the source of truth.
Canonical migrations and RLS policies, Edge/backend functions, seed/test
fixtures, storage integration, secret-free environment templates, GitHub
workflows/application configuration, the Installation Manifest schema, and
installation adapter interfaces must live in the repository at the paths and
boundaries defined by `docs/LYOR_V1_2_BASELINE.md` when their owning milestone
authorizes them.

## Product identity

Lyor is an installable Windows desktop application that lets a player install mods without a separate tool, engine, or mod manager, and later remove Lyor-installed mods from Library. The eventual V1 happy path is:

`Home / Mods -> ModCard -> Install -> Library -> same ModCard -> Uninstall -> game restored to its original state`

Lyor is a bilingual Turkish/English product. It has no account or profile system in V1.

## Scope boundaries

V1 contains Home, Library, Mods, Search, Favorites, and a complete Settings view. Settings contains Appearance, Language, Games, Updates, and About. Reuse the same fixed-size `ModCard` on Home, Mods, Library, Search results, and Favorites. Library lists mods that Lyor installed on this computer, and its cards show `Uninstall` instead of `Install`.

V1 explicitly excludes:

- user accounts, profiles, login, and authentication;
- backend services, Supabase, cloud sync, and admin panels;
- community uploads, ratings, reviews, and comments;
- mod detail and game detail pages;
- filter and sort controls;
- general product notifications and Premium (the narrowly scoped update-available banner is allowed);
- mod updates;
- user-facing features named Restore or Rollback;
- a Lyor-built trainer system.

### V1.2 Milestone 1 narrow supersession

Milestone 1 explicitly authorizes only the renderer/UI additions recorded in
`docs/LYOR_V1_2_BASELINE.md`: Home/Library/Favorites sorting, billboard media
carousel, product switcher placeholder, richer mock install progress, and the
typed cloud-library-versus-local-device card states. These do not authorize a
backend, authentication, cloud sync, real mod updates, storage integration, or
a physical Installation Engine. The older V1 exclusions remain active outside
this named UI-only exception.

### V1.2 Milestone 2 narrow supersession

Milestone 2 authorizes Supabase email/password authentication, the private
main-process session boundary, profiles and server-owned role foundations, and
version-controlled migrations/seed/security tests for Profiles, Settings,
Favorites, logical Library membership, and Devices. It does not authorize full
cloud synchronization, Planaria content management, object storage/R2, a
service-role capability in the desktop app, or the Installation Engine.
Supabase sessions stay out of renderer storage and renderer bundles. Database
authorization is deny-by-default RLS plus explicit grants; user-editable
metadata is never an authorization source.

### V1.2 Milestone 3 narrow supersession

Milestone 3 authorizes authenticated account CRUD/sync for theme, language,
safe account preferences, Favorites, logical Cloud Library membership, random
installation-scoped Devices, and non-authoritative device installation
summaries. Sync must use a persistent local cache and idempotent pending queue.
Absolute paths, cache/staging/backups, transaction journals, file ownership,
and physical installation truth remain local-only. A cloud summary can never
authorize filesystem work or make another PC appear physically installed.
Logout clears the session but must retain device-local installation data and
cached account/queue data. Installation Engine, Planaria, R2, and updater work
remain blocked.

### V1.2 Milestone 4 narrow supersession

Milestone 4 authorizes only the privileged generic-file Installation Engine
core recorded in `docs/LYOR_V1_2_BASELINE.md`: versioned manifest v1, verified
edition-aware game detection contracts, ordinary copy/replace/delete/create
operations, local ownership metadata, verified backups, and safe uninstall.
Renderer access is limited to main-approved IDs over narrow validated IPC; it
never receives filesystem or arbitrary-path capability. Durable downloads,
full transaction journals/crash recovery, archive/config adapters, Planaria,
object storage, and production game/RPF adapters remain blocked.

### V1.2 Milestone 5 narrow supersession

Milestone 5 authorizes only the engine safety layer recorded in the baseline:
cache-only resumable HTTP(S) download with expected size/SHA-256, preflight,
durable transaction journal, deterministic recovery/rollback contracts,
dependency/conflict checks, integrity/tamper gates, and redacted structured
logs. It does not authorize archive/config adapters, arbitrary commands,
renderer paths/elevation, Planaria, or production object storage.

### V1.2 Milestone 6 narrow supersession

Milestone 6 authorizes the capability-based adapter/archive contracts,
manifest v2 advanced operations, deterministic JSON config merge, and only the
repository-owned synthetic container fixture described in the baseline. It
does not authorize RPF/proprietary tooling or a claim of production game
support. Every adapter operation must remain inside the Milestone 5
transaction/recovery and integrity invariants. Planaria and object distribution
remain blocked.

### V1.2 Milestone 7 narrow supersession

Milestone 7 authorizes Planaria admin access, catalog/version/package metadata,
entitlements, verified analytics, privileged Edge Function sources, and the
provider-neutral multipart object-storage boundary recorded in the baseline.
Admin authorization is server-owned and checked on every privileged action;
service-role/storage/SMTP secrets stay backend-only. Database stores only
object metadata, never package binaries. Production Supabase/R2/SMTP deployment
is not implied by local fixture success. Billboard management remains gated to
Milestone 8.

### V1.2 Milestone 8 narrow supersession

Milestone 8 authorizes the admin-only billboard metadata, upload/validation,
preview, concurrent-safe ordering, lifecycle, safe deletion, and Published Home
feed contract recorded in the baseline. Local preview state must be labelled as
such and cannot be reported as deployed production storage. GitHub release and
updater pipeline changes remain gated to Milestone 9.

### V1.2 Milestone 9 narrow supersession

Milestone 9 authorizes the GitHub CI/tag/release pipeline and updater hardening
recorded in the baseline. Publishing is still conditional on the Milestone 10
production gate, trusted Windows signing, clean version/tag state, credentials,
and real old-build update verification. A local unsigned installer is evidence
for packaging only, never permission to publish.

V1 is intended to support regular mods and third-party trainer packages prepared by an administrator. This does not authorize a community upload flow or a native Lyor trainer.

The current implementation must not access GTA V or RPF files. Milestone 4's real generic-file core may operate only on main-approved paths; tests use isolated fixtures and no production game is auto-registered yet. Visible Install and Uninstall UI state continues through the isolated mock service until verified catalog/package inputs are authorized. Game discovery UI also remains explicitly mock-only; do not disguise it as verified detection. The application updater is an explicit exception: it is real infrastructure implemented with `electron-updater` in the main process and is not part of the mod engine.

## Required technology and platform

- Current stable Electron, React, TypeScript, Vite, and npm.
- Windows 10 22H2 x64 and Windows 11 x64.
- The deliverable is an installable Windows desktop app/EXE, not a browser website.
- Keep dependencies conservative and purpose-specific.
- Keep TypeScript strict and avoid untyped IPC or mock data.

## Architecture and security

Maintain a clear Electron `main` / `preload` / `renderer` separation.

- Enable renderer sandboxing and context isolation.
- Disable `nodeIntegration` in the renderer.
- Never expose Electron, Node.js, or a generic IPC sender to the renderer.
- Expose only narrow, named preload methods through `contextBridge`.
- Validate IPC channels and every argument in the main process before performing an operation.
- Filesystem and native-window operations belong in main and are available only through narrow, validated IPC methods.
- Keep the renderer a browser-like React environment; do not import Node/Electron APIs there.
- Treat navigation and external URLs as untrusted. Do not silently open arbitrary URLs or permit unexpected window creation.
- Keep the mock install service separate from presentation components so a real engine can replace it later without weakening the security boundary.
- Keep `electron-updater` in the main process. Expose only typed, validated update actions/state through preload; never expose tokens, raw updater objects, arbitrary URLs, or downloaded executables to the renderer.
- Never touch game files, GTA V paths, or RPF archives during this foundation turn.

Suggested responsibilities (exact filenames may follow the scaffold in use):

- `src/main`: BrowserWindow lifecycle, secure preferences, native window actions, validated IPC handlers.
- `src/preload`: the minimal typed bridge exposed to the renderer.
- `src/renderer`: React application, reusable UI, local navigation, typed mock data, local favorites/library state, and i18n resources.
- shared type-only modules: explicit contracts that do not import privileged runtime APIs.

## UI implementation rules

Inspect the Figma file directly when visual detail is needed. Do not ask the user for measurements, colors, or screenshots. Do not edit the Figma file.

- Figma file: <https://www.figma.com/design/sZtHJ0VLe4VssHIGC49fuA/Lyor?node-id=0-1>
- Home frame: `10:2`
- ModCard component set: `22:118`
- Sidebar component set: `10:78`
- Game Button component set: `10:54`
- Reference window: `1440 x 800`
- Expanded sidebar: `240px`; collapsed sidebar: `40px`; headbar: `40px`.
- ModCard: always `230 x 300px`; image: `230 x 120px`; radius: `15px`.
- Home billboard: `1050 x 460px` at the `1440 x 800` reference window, then scale down proportionally without cropping.
- Main background: `#5E8CFF`.
- ModCard surface: `rgba(48, 48, 48, 0.30)`.
- Fonts: Instrument Sans and Inter.
- Correct Figma's `Libary` typo to `Library` in code.
- V1.2 Milestone 1 restores the Sort control only on Home, Library, and Favorites with the documented typed local options.

Figma's absolute coordinates, Auto Layout setup, CardGrid, scrolling setup, and prototype/navigation links are not authoritative. Preserve the appearance while implementing robust application structure:

- fixed sidebar and headbar;
- independently vertically scrolling main content;
- preserve each route's main-content scroll position for the current app session;
- independently vertically scrolling game list within the sidebar;
- CSS Grid for cards, never one-off absolute card coordinates;
- four columns at the `1440px` reference width with expanded sidebar, then `4 -> 3 -> 2 -> 1` as available width decreases;
- card dimensions must not shrink, stretch, or change when the sidebar toggles;
- content width/grid recalculates when the sidebar toggles;
- approximately `220ms ease-in-out` for the sidebar transition;
- approximately `160ms ease-out` for card hover;
- approximately `190ms ease-out` for main-content-only route entry, with reduced-motion support;
- no hover size change or layout shift;
- card hover border `1px solid rgba(255,255,255,0.33)` and glow `0 0 10px rgba(255,255,255,0.25)`;
- Game Button hover surface `rgba(163,163,163,0.20)`.

Use project-local copies of actual image/icon assets. Do not leave Figma or other temporary remote asset URLs in the product.

## Window chrome

Implement the Figma-style red/yellow/green controls in the upper-right:

- red closes: idle `#FF6969`, hover `#FF1414`;
- yellow minimizes: idle `#FCFF97`, hover `#F7FF00`;
- green maximizes/restores: idle `#9CFF8F`, hover `#1EFF00`.

The title bar is draggable. Double-clicking it maximizes/restores. All interactive controls must be outside the drag region (`no-drag`). Window actions must use the narrow preload bridge; renderer components must not call Electron directly.

## Required reusable UI and behavior

Keep these concepts reusable: `WindowShell`, `TitleBar`, `Headbar`, `Sidebar`, `SidebarNavButton`, `GameButton`, `ModCard`, `ModGrid`, `SearchBar`, and `FavoriteButton`.

- Local navigation must work among Home, Library, Mods, and Favorites.
- Provide Search and Settings route/header infrastructure as specified; do not invent a detailed Settings design that is absent from Figma.
- Typed local mock data represents the games and mods shown by Figma.
- Search matches mod name, game name, and alias fields.
- Favorites is functional local state and displays the same `ModCard`, never a small-card or list variant.
- Library uses the same card and shows `Uninstall`.
- Install/Uninstall affects mock UI state only in the foundation turn.
- Provide persistent Ice Max, Dark, and Light themes through centralized CSS tokens. Ice Max must retain the established Figma-aligned appearance.
- English/Turkish localization applies immediately and persists. On the first launch only, use Turkish when the Windows/browser locale is Turkish; otherwise use English. Do not translate catalog-supplied game/mod content.
- Persist theme, locale, and renderer-only settings locally on the device. Persist the updater auto-check preference in Electron `userData` so startup checks and Settings share one source of truth.
- The Updates section uses the real typed updater bridge. Automatic checks run once per packaged-app session after the main window is ready when enabled; manual checks remain available. Downloads require user action and installation uses main-process `quitAndInstall()` only.

## Verification and script contract

Keep the following npm scripts working and document them in the README:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run dist:win` for Windows packaging
- `npm run publish:win` for an explicit GitHub Releases publish using `--publish always`

If the packaging script is intentionally renamed, update this file, the specification, and README together so there is exactly one documented canonical command.

Before handing off an implementation change, run lint, typecheck, and build. Run Windows packaging when the environment supports it and report the exact installer/EXE path if one is produced. Do not claim a check passed unless it actually ran successfully.

## Change discipline

- Preserve unrelated user changes in a dirty worktree.
- Keep UI data/state logic out of purely visual components.
- Do not add speculative routes, controls, settings panels, server code, or installer-engine code.
- Do not copy Figma's broken structure simply to match pixels.
- Update the project memory when an explicit user decision changes the source of truth.
