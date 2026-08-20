# Lyor V1 Product and Foundation Specification

Status: normative project memory  
Audience: product, design, and engineering  
Product languages: English and Turkish  
Target platform: Windows 10 22H2 x64 and Windows 11 x64

## V1.2 transition notice

This document records the implemented V1 foundation and remains enforceable
during the V1.2 transition. Versions `0.1.0` through `0.1.3` are classified as
development/prototype builds. The new production version line begins at
`1.2.0` and advances through patch releases such as `1.2.1` and `1.2.2`.

[`LYOR_V1_2_BASELINE.md`](LYOR_V1_2_BASELINE.md) defines the V1.2 architecture
and milestone gates. Milestone 0 changes documentation, versioning, and
repository safety only. It does not activate backend, authentication, cloud
storage/sync, or real installation-engine behavior. Every prohibition in this
foundation specification remains active until a later milestone explicitly
authorizes and defines the relevant capability.

## 1. Product definition

Lyor is an installable Windows PC application for players who want to install mods without separately using a tool, engine, or mod manager. Mods installed through Lyor appear in Library and can be removed there.

The eventual V1 core journey is:

`Home / Mods -> ModCard -> Install -> Library -> same ModCard -> Uninstall -> game returns to its original state`

The final product is a packaged Windows application and EXE, not a browser-delivered website.

## 2. Two scopes that must not be confused

### 2.1 Eventual product V1

Product V1 includes the discovery/library experience and, in a later implementation phase, a real, safe installation/uninstallation engine capable of returning affected game content to its original state. It is intended to support:

- regular mods; and
- third-party trainer packages prepared by an administrator.

It does not include a trainer system built by Lyor.

### 2.2 Current foundation turn

The initial development work establishes the project foundation and the Figma-aligned UI shell. The current explicit scope additionally includes a complete Settings view, persistent theme/language preferences, and a real Windows application-update infrastructure. It includes Electron scaffolding, secure process boundaries, reusable renderer components, local navigation, typed mock content, local mock state, lint/typecheck/build configuration, and Windows packaging/release configuration.

It explicitly does **not** implement the GTA V/RPF installation engine. Install and Uninstall must not touch game files. They exist only to exercise UI state through a separate service whose name clearly contains `mock`.

No code in this scope may discover, read, modify, copy, patch, or delete GTA V or RPF files. Games scanning and path selection remain explicitly named mock behavior. This restriction does not prohibit the separately authorized main-process application updater, which updates Lyor itself through `electron-updater` and electron-builder metadata/hash verification; Authenticode signing remains a public-release gate.

## 3. V1 information architecture

V1 has these destinations/capabilities:

| Area | Required V1 behavior |
| --- | --- |
| Home | Figma-aligned discovery view using the shared ModCard and ModGrid. |
| Mods | Local catalog view using the shared ModCard and ModGrid. |
| Library | Shows mods installed on this computer **through Lyor**. Uses the same ModCard; its primary action is `Uninstall`. |
| Search | Searches typed mock mods by mod name, game name, and aliases. Results use the shared ModCard and ModGrid. |
| Favorites | Local favorite state; displays the same full-size ModCard and ModGrid. No compact/list variant. |
| Settings | Complete in-content view with Appearance, Language, Games, Updates, and About while the existing sidebar/headbar remain fixed. |

Local navigation among Home, Library, Mods, and Favorites must work in the foundation UI. Search must work on the local mock catalog. English/Turkish message infrastructure must be established; English copy may be the default.

## 4. Explicit non-goals

The following are outside V1 unless the user explicitly changes this specification:

- user accounts, user profiles, login, and authentication;
- backend services, Supabase, cloud storage, and cloud sync;
- an admin panel;
- community mod uploads;
- ratings, reviews, and comments;
- a mod detail page;
- filters and sorting;
- a game detail page;
- general product notifications (excluding the narrowly scoped update-available banner);
- Premium features;
- mod updates;
- user-facing features named Restore or Rollback;
- a native Lyor trainer system.

The requirement that uninstall eventually returns the game to its original state is an outcome of the future uninstall engine. It must not be surfaced as separate `Restore` or `Rollback` product features.

Do not infer new features from familiar mod managers, the Figma canvas, placeholder content, or unused visual controls. In particular, the Sort control visible in Figma is not part of V1 and must be omitted.

V1.2 Milestone 1 narrowly supersedes the final sentence above for Home,
Library, and Favorites only. Their documented local typed sort choices and
Library UI states are authorized; filters, backend-driven sorting, accounts,
cloud sync, real mod updates, and engine behavior remain excluded.

V1.2 Milestone 2 narrowly supersedes the account/authentication and Supabase
non-goals above only for email/password authentication and its security
foundation. It authorizes main-process Supabase Auth, encrypted OS-backed
session persistence, profiles, private server-authoritative roles, and
deny-by-default RLS migrations for the named user-owned tables. Full cloud
sync, remote catalog/content management, object storage, service-role desktop
access, and physical installation behavior remain excluded.

V1.2 Milestone 3 further authorizes user-owned cloud synchronization for safe
settings, Favorites, logical Cloud Library membership, random device records,
and non-authoritative per-device installation summaries. It does not authorize
uploading absolute paths, journals, backups, cache/staging state, file
ownership, or physical installed truth. Those remain device-local and the
future Installation Engine remains authoritative.

## 5. Technology and deliverable

- Current stable Electron
- React
- TypeScript
- Vite
- npm
- Windows 10 22H2 x64
- Windows 11 x64
- Installable Windows package/EXE

The project must provide these commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Electron application in development mode. |
| `npm run build` | Produce the compiled production application artifacts. |
| `npm run lint` | Run static lint checks. |
| `npm run typecheck` | Run TypeScript validation without emitting. |
| `npm run dist:win` | Produce/test the Windows distributable. |
| `npm run publish:win` | Build and explicitly publish the Windows release through GitHub Releases. |

If engineering deliberately renames the packaging script, change the canonical command in `package.json`, `README.md`, `AGENTS.md`, and this document in the same change. Do not leave competing instructions.

## 6. Security architecture

The application uses three intentionally separate trust zones.

### Main process

Owns the BrowserWindow lifecycle, native window controls, filesystem/native capabilities, and IPC handlers. It validates every incoming message and argument. It never accepts arbitrary channel names, filesystem paths, commands, or URLs from the renderer.

### Preload

Uses `contextBridge` to expose a small typed API of named operations. It must not expose raw `ipcRenderer`, Node.js modules, Electron objects, generic `send`/`invoke` methods, or unrestricted filesystem access.

### Renderer

Runs React as a sandboxed, browser-like UI. It does not import Electron or Node.js APIs and cannot directly access the filesystem. Native/window actions call only the narrow preload API.

Required BrowserWindow posture:

- renderer sandbox enabled;
- `contextIsolation: true`;
- `nodeIntegration: false`;
- no permissive generic preload bridge;
- unexpected window creation/navigation blocked or handled explicitly;
- all interactive title-bar elements excluded from the draggable region.

The future real installation engine must remain outside React presentation code. The foundation's mock install service must have the same separation so it can later be replaced without collapsing security boundaries.

## 7. Figma reference and interpretation

Figma file: <https://www.figma.com/design/sZtHJ0VLe4VssHIGC49fuA/Lyor?node-id=0-1>

Required reference nodes:

| Reference | Node |
| --- | --- |
| Main Home frame | `10:2` |
| ModCard component set | `22:118` |
| Sidebar component set | `10:78` |
| Game Button component set | `10:54` |

Engineers must inspect the Figma file with the Figma tooling when visual details are required. Do not ask the user to supply dimensions, colors, or screenshots. Do not modify the Figma file.

Figma is authoritative for visual appearance only. Its prototype links, navigation behavior, absolute positioning, Auto Layout implementation, CardGrid behavior, and scroll settings are not authoritative. Reproduce the appearance with robust responsive code, not by reproducing the canvas's structural defects.

All image and icon assets actually used by the app must be stored locally in the repository. Temporary Figma/CDN/remote image links must not ship in the app.

Correct the Figma typo `Libary` to `Library` in the product. V1.2 Milestone 1 implements Sort only in its explicitly authorized routes.

## 8. Visual facts

| Token/element | Required value |
| --- | --- |
| Reference window | `1440 x 800px` |
| Expanded sidebar visible width | `240px` |
| Collapsed sidebar visible width | `40px` |
| Headbar height | `40px` |
| ModCard size | fixed `230 x 300px` |
| ModCard image | fixed `230 x 120px` |
| Home billboard | `1050 x 460px`, proportional shrink, no crop |
| Main background | `#5E8CFF` |
| ModCard surface | `rgba(48,48,48,0.30)` |
| ModCard corner radius | `15px` |
| Typefaces | Instrument Sans and Inter |
| Sidebar transition | approximately `220ms ease-in-out` |
| Card hover transition | approximately `160ms ease-out` |
| Main route transition | approximately `190ms ease-out`, content only |
| Card hover border | `1px solid rgba(255,255,255,0.33)` |
| Card hover glow | `0 0 10px rgba(255,255,255,0.25)` |
| Game Button hover surface | `rgba(163,163,163,0.20)` |

Hover effects must not change the card's dimensions or cause layout shift.

## 9. Layout and scrolling behavior

- Sidebar and headbar remain fixed in the window shell.
- Main content has its own vertical scrolling region.
- The main scrollbar is thin and theme-aware; no body-level or nested main scrollbar is introduced.
- Each route keeps its own main scroll position for the current application session.
- The sidebar's game list has its own vertical scrolling region.
- ModCard never shrinks or stretches.
- At the `1440px` reference width with the sidebar expanded, the content displays four card columns.
- As available width decreases, the grid changes `4 -> 3 -> 2 -> 1` columns.
- Use CSS Grid for the card layout.
- Never reproduce cards by individually copying Figma absolute coordinates.
- Opening/closing the sidebar causes content width and the grid to recalculate while cards remain `230 x 300px`.
- Home places the `1050 x 460px` billboard in normal flow before Top Mods and preserves its aspect ratio at narrower widths.
- Home, Mods, Library, Search results, and Favorites all share the exact same card component and dimensions.
- Favorites must not introduce a smaller card or list presentation.

## 10. Native window controls

Use Figma's red/yellow/green traffic-light appearance at the upper-right:

| Control | Behavior | Idle | Hover |
| --- | --- | --- | --- |
| Red | Close | `#FF6969` | `#FF1414` |
| Yellow | Minimize | `#FCFF97` | `#F7FF00` |
| Green | Maximize/restore | `#9CFF8F` | `#1EFF00` |

The title bar must be draggable. Double-clicking the draggable title-bar region toggles maximize/restore. Buttons, links, fields, and other interactive elements must be marked outside the drag region. Native window actions are exposed through narrow, validated preload/IPC methods only.

## 11. Required reusable UI

The foundation implementation provides reusable forms of:

- `WindowShell`
- `TitleBar`
- `Headbar`
- `Sidebar`
- `SidebarNavButton`
- `GameButton`
- `ModCard`
- `ModGrid`
- `SearchBar`
- `FavoriteButton`

The shared ModCard must be capable of presenting the correct local favorite state and the appropriate primary action for its context. It must not own privileged operations or game-filesystem logic.

## 12. Foundation data and state behavior

- Represent Figma's games and mods as local, typed mock data.
- Each searchable mod supplies the data needed to match mod name, game name, and alias values.
- Search matching is local during the foundation turn.
- Favorites state is local and functional.
- Mock install state is local and functional for UI testing.
- Library is derived from the mods marked installed through the explicitly named mock service.
- Library cards say `Uninstall`; catalog cards say `Install` as appropriate.
- Mock Install/Uninstall must never perform real filesystem or game operations.
- Translation/message resources support English and Turkish; English can be initially active.

Persistence beyond the current local mock behavior is not implied. Do not add a backend or account sync to persist it.

## 13. Foundation-turn definition of done

The foundation turn is complete only when all of the following are true:

1. npm project and required dependencies are initialized.
2. Git repository and an appropriate `.gitignore` exist.
3. Secure Electron main/preload/renderer separation is established.
4. Used Figma assets are local project files rather than temporary remote URLs.
5. Required reusable components exist.
6. Home closely matches the Figma reference within sound responsive layout constraints.
7. Home, Library, Mods, and Favorites local navigation works.
8. Figma-represented games/mods exist as typed local mock data.
9. Search matches mod name, game name, and aliases.
10. Favorites interaction works and renders shared cards.
11. Library renders shared cards with `Uninstall`.
12. Install/Uninstall UI state uses an explicitly named mock service and does not access game files.
13. Settings contains the five explicitly specified sections and preserves the existing shell/layout system.
14. Ice Max, Dark, and Light use centralized theme tokens; locale and theme changes apply immediately and persist.
15. English/Turkish text infrastructure covers application-owned UI copy without translating catalog content.
16. The packaged app has a typed, validated, main-process `electron-updater` service with opt-in download/install actions and a persisted automatic-check preference.
17. Lint, typecheck, and build have been run successfully.
18. Windows packaging is configured and a test installer/EXE is produced when the environment permits.
19. README and the release guide document development, validation, build, Windows packaging, versioning, publish, and update-test commands.

## 14. Handoff report requirements

At the end of the foundation turn, report concisely:

- primary files created;
- working screens and interactions;
- results of each test/build command actually run;
- how to launch the application;
- the exact EXE/installer path, if produced;
- concrete blockers that remain before beginning the real installation/uninstallation engine.

Do not stop after producing only a plan. Implement, run the checks, and report evidence. Do not claim Windows packaging succeeded without an artifact.

## 15. Future engine gate

The real mod engine is a later project phase and requires a separate, explicit scope. Before that phase begins, engineering must define and validate at least the game discovery rules, supported package format, manifest and ownership model, conflict handling, backups/transactionality, original-file integrity strategy, privilege requirements, failure recovery, uninstall guarantees, RPF tooling/legal constraints, and test fixtures. None of those unresolved details authorize speculative GTA V/RPF code in the foundation turn.
