# Windows release and updater guide

Lyor uses an x64 NSIS installer, `electron-updater`, and GitHub Releases. The
single publish configuration point is `electron-builder.config.cjs`, which is
bound to the verified public release repository `Lyorcloud/Lyor`. No credential
is embedded in source.

## Prepare a version

Versions `0.1.0` through `0.1.3` are development/prototype builds. The V1.2
production line starts at `1.2.0` and continues with `1.2.1`, `1.2.2`, and
later `1.2.x` patches. **Lyor Setup V1.2** is the stable user-facing installer
family name; the generated artifact retains the exact semantic version.

Every published build must have a new semantic version. Update both
`package.json` and `package-lock.json` without creating a tag:

```powershell
npm version 1.2.1 --no-git-tag-version
```

Never replace a published update with another build carrying the same version.
The updater-capable baseline (`1.2.0`) must be installed manually. A subsequent
`1.2.1` release is what that installed copy can discover.

## Validate and build locally

Use Node.js 22.12.0 or newer, install from the lockfile, and run the checks:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run test:supabase
npm run security:scan
npm run build:prod
npm run dist:win
npm run verify:release
```

`npm run dist:win` remains the canonical unsigned local Windows packaging
command. It never publishes and creates updater metadata bound to
`Lyorcloud/Lyor`.

With those values configured, it emits these three matching files in
`release/`:

- `Lyor-Setup-<version>-x64.exe`
- `Lyor-Setup-<version>-x64.exe.blockmap`
- `latest.yml`
- `artifact-sha256.json` (local integrity manifest)

The packaged application also contains
`release/win-unpacked/resources/app-update.yml`. The three public artifacts and
the packaged metadata must come from the same build and version.

The canonical `npm run dist:win` command always packages the ignored
`build/runtime-config.production.json`; it fails closed instead of silently
shipping a loopback/local Supabase endpoint. `build/runtime-config.local.json`
is reserved for explicit development-only builder invocations. The protected
GitHub `production` environment must provide `LYOR_SUPABASE_URL` and
`LYOR_SUPABASE_PUBLISHABLE_KEY`; the workflow validates them and creates the
ignored `build/runtime-config.production.json` immediately before packaging.
Loopback, non-HTTPS, missing, or credential-bearing URLs fail closed.

## Publish to GitHub Releases

Set a publish token in the current process or CI secret store; do not commit a
filled `.env` or token:

```powershell
$env:GH_TOKEN = "<fine-grained-token-with-contents-write>"
npm run publish:win
```

`publish:win` explicitly runs electron-builder with `--publish always` and
fails before packaging if owner, repository, or token is absent. It creates a
non-draft GitHub Release (`releaseType: release`) using the `v<version>` tag.
The release must be public and non-draft: `electron-updater` does not treat a
draft as the normal stable `latest` channel.

## CI release on a version tag

`.github/workflows/release.yml` runs when a `v1.2.*` tag is pushed. It rejects a
tag that does not exactly match the `package.json` version, validates the
source, then publishes a stable GitHub Release to `Lyorcloud/Lyor`.

```powershell
npm version 1.2.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v1.2.1"
git tag v1.2.1
git push origin HEAD --tags
```

The workflow validates with `contents: read`; only the protected `production`
job receives built-in `GITHUB_TOKEN` `contents: write`. Configure required
reviewers and `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets on that
environment. Also configure `LYOR_SUPABASE_URL` and
`LYOR_SUPABASE_PUBLISHABLE_KEY` on the same environment. The publish job fails
closed when trusted signing or production runtime configuration is absent, and
verifies both the installed executable and Setup Authenticode signatures after
packaging.
End-user installations never receive or require a GitHub token.

### Explicit unsigned test releases

For the temporary friends-and-family updater pilot only, Actions may be run
manually from the release commit with `unsigned_test_release` enabled.
That explicit manual input bypasses only Authenticode signing for that one run;
automatic tag-triggered releases still fail closed without trusted signing.
The release stays public and non-draft so installed test builds can discover
it, but its title and notes identify it as an unsigned test build. Windows may
show Unknown publisher or SmartScreen warnings. This path is never a signed or
production-ready release.

Upload/publish all three generated artifacts together. Do not mix an installer
or blockmap from one version with another version's `latest.yml`.

## End-to-end update test

1. Build `1.2.0`, verify its three artifacts, and install its Setup manually.
2. Confirm its Settings, theme, language, game paths, and Library data.
3. Run `npm version 1.2.1 --no-git-tag-version`.
4. Validate, then run `npm run publish:win` for `1.2.1`.
5. Confirm GitHub shows public, non-draft `v1.2.1` with all three artifacts.
6. Open the installed `1.2.0`; verify it finds `1.2.1` and reports download
   progress.
7. Choose **Restart and install**, then verify the reopened application is
   `1.2.1` and the previously recorded user data is unchanged.

This test cannot be replaced by testing `1.2.0` against another build also
labelled `1.2.0`. Same-version, downgrade, prerelease, invalid metadata, and
checksum/signature failures must remain rejected. Closing the app after choosing
**Later** must not install the update; only **Restart and install** may call the
main-process installer.

## Troubleshooting

- No `latest.yml` or `app-update.yml`: confirm the NSIS target and the
  `Lyorcloud/Lyor` publish configuration are present.
- Publish fails immediately: confirm `GH_TOKEN` is present in the same shell.
- GitHub rejects the upload: give the fine-grained token Contents write access
  to the binary repository and verify the version/tag has not already been
  published.
- Installed app finds no update: confirm the newer semantic version, public
  non-draft release, exact `v<version>` tag, and that the EXE, blockmap, and
  `latest.yml` are from one build.
- Differential download fails: verify the blockmap filename and the file hashes
  referenced by `latest.yml`; rebuild and republish as a new version rather
  than editing metadata manually.
- Network errors must not block application startup; inspect updater logs
  without recording tokens or request headers.

## Windows code signing

Unsigned local builds remain supported for early testing. Before public
distribution, configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` as local/CI
environment secrets. Never commit a certificate or password. Authenticode
signing is important for Windows SmartScreen reputation, a stable publisher
identity, and trustworthy update distribution. Verify the signature before
publishing; do not weaken updater verification to accommodate an unsigned
build.
