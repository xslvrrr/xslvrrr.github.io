# Millennium Desktop release process

Millennium Desktop uses Tauri 2. Engineering packages embed the desktop UI, select a free loopback port from 3001 through 3010, and proxy `/api/*` to the local Millennium web server on `http://millennium-five.vercel.app`. Port 3000 stays reserved for that backend, preventing desktop proxy requests from looping back into the packaged UI.

## Local builds

Install locked dependencies, typecheck, then build for the current host:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run desktop:build
```

Platform-specific scripts are available for:

```sh
bun run desktop:build:macos-arm64
bun run desktop:build:macos-x64
bun run desktop:build:macos-universal
bun run desktop:build:windows-x64
bun run desktop:build:windows-arm64
bun run desktop:build:linux-x64
bun run desktop:build:linux-arm64
```

Each target requires its native toolchain. Use `.github/workflows/desktop-build.yml` to create every supported package on native GitHub-hosted runners. Trigger it manually for engineering packages or push a tag matching `desktop-v<package.json version>` for a published update. Packages remain available as workflow artifacts for 14 days.

Engineering and CI packages use the local Millennium backend at `http://millennium-five.vercel.app`. Keep port 3000 available for that server before opening desktop app. `MILLENNIUM_DESKTOP_BACKEND_ORIGIN` remains an explicit compile-time override for a reviewed hosted-backend build.

## Package outputs

- macOS: `.app` and `.dmg`
- Windows: NSIS `-setup.exe`
- Linux: `.AppImage` and `.deb`

macOS engineering builds use ad-hoc signing so downloaded Apple Silicon builds retain a valid bundle signature. They are not trusted release builds.

Do not add `com.apple.developer.*` entitlements to ad-hoc signed builds. macOS AMFI rejects ad-hoc signatures containing restricted entitlements before app startup. Millennium uses the `com.apple.security.automation.apple-events` hardened-runtime entitlement solely for its user-approved, read-only Classroom browser access. It uses a custom `millennium://` deep-link scheme, so it does not need the Associated Domains entitlement. The workflow verifies this after every macOS build.

Desktop UI builds remove `/downloads/` from their copied public assets. Release packages must never embed previously published installers; doing so creates recursive, rapidly growing artifacts.

## Live UI shell

`bun run build:web` builds the desktop UI first and publishes it to `public/desktop-shell/`, so every web deployment serves the exact UI its own commit produced, described by `/desktop-shell/shell.json`. The directory is generated, not committed.

During development the web dev server also answers `/desktop-shell/*` from `dist/desktop` directly, so `bun run build:desktop:ui` is enough to hand an installed engineering package the current UI. Without that, the request fell through to `public/desktop-shell/`, which only a full `bun run build:web` regenerates, and an installed app kept rendering whichever shell was last committed there.

Installed packages restore the last verified shell before the window opens, then check the deployment in the background four seconds after launch and every 30 minutes. The window also asks for a check when it regains focus or the machine reconnects, throttled to one check a minute, so a launch that happened before the network was ready does not leave the UI stale for half an hour. A differing build id is downloaded into application data, verified file-by-file against its SHA-256 digest, and activated atomically. The webview keeps rendering the shell it started with until the user accepts the reload prompt, and the replaced shell stays readable for that session so chunks requested by the open page still resolve.

A shell only activates when this binary satisfies its `minimumNativeVersion`, taken from `desktopShell.minimumNativeVersion` in `package.json`. Raise that value in the same change as any UI that depends on a new Tauri command; older installations then keep their bundled UI and prompt for a native update instead of loading a shell they cannot serve.

Every failure path — offline host, bad digest, unusable manifest — falls back to the embedded bundle, so the application still opens without a network. Shell files are only ever fetched from the compile-time backend origin.

## In-app updater

Production desktop packages check GitHub Releases after startup, every 30 minutes, and when returning online or foregrounded after five minutes. A newer signed SemVer release exposes an update action above Search in the sidebar. Downloading and installing are separate steps: the sidebar row shows live download progress in place, then becomes an install action that relaunches Millennium.

When the signed feed cannot be reached — no published release, unreachable release host, or a package installed manually from the website — the updater falls back to `/api/desktop/release`, which serves the version listed on the install page from `public/downloads/desktop/manifest.json`. A newer version there offers the matching platform package, opened in the default browser for manual installation. Keep that manifest accurate: it is now an update source, not only download-page copy.

Native packages still change only through installation. A UI-only change reaches installed copies through the live shell; a change touching Rust, capabilities, or `minimumNativeVersion` requires a higher `package.json` and `src-tauri/Cargo.toml` version and a matching `desktop-v<version>` tag. Tauri Action builds platform packages, uploads signed updater archives, and maintains `latest.json`.

Updater archives use a separate Minisign key from operating-system code signing:

- Public key is embedded in `src-tauri/tauri.conf.json`.
- Local private key is stored outside the repository at `~/.tauri/millennium-updater.key`.
- Local key password is stored outside the repository at `~/.tauri/millennium-updater-password`.
- Add private key contents to GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`.
- Add password contents to `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Back up private key and password in approved secret storage. Losing either prevents existing installations from trusting future updates.

## Signing and publication gate

Trusted releases must pass all release requirements:

1. Build from a clean `desktop-v<version>` tag whose version matches `package.json` and `src-tauri/Cargo.toml`.
2. Sign Windows installers with the organization code-signing certificate.
3. Sign macOS packages with a Developer ID Application certificate, notarize them, and staple the ticket.
4. Verify the signature on a clean machine for each operating system.
5. Rename packages to the filenames declared in the desktop manifest.
6. Compute SHA-256 and byte size after signing and notarization.
7. Upload packages under `/downloads/desktop/`.
8. Set matching manifest entries to `available: true`, `signed: true`, and, for macOS, `notarized: true`. Update `version` in the same manifest: the in-app updater treats it as the fallback release when signed updates are unreachable. Steps 5 through 8 must land on the branch *before* the `desktop-v<version>` tag is pushed — the desktop workflow fails the tag when the manifest version does not match `package.json`, or when an artifact marked available does not reference that version.
9. Confirm GitHub release contains signed updater archives, signatures, and a valid `latest.json`.
10. Deploy the web application and verify the download page selects the correct architecture.

Unsigned engineering builds may be listed only when checksums are present and the download page clearly warns that they are untrusted and unnotarized. Never label them as signed, notarized, or production-ready.

## Ad-hoc macOS releases

Notarization requires a paid Apple Developer Program membership. Without one, macOS packages ship ad-hoc signed: `bundle.macOS.signingIdentity` is `"-"`, `Entitlements.plist` carries only `com.apple.security.automation.apple-events`, and `Info.plist` carries `NSAppleEventsUsageDescription`. Do not add `com.apple.developer.*` entitlements — AMFI rejects them without a provisioning profile, and the desktop workflow fails the build if any appear.

An ad-hoc release is functionally identical to a notarized one, with two consequences that must stay covered by the install guidance:

1. `spctl --assess` reports `rejected`, so the first launch needs right-click → **Open**, or **Open Anyway** under Privacy & Security. This is expected, not a packaging defect.
2. Every download keeps `com.apple.quarantine`. Gatekeeper then runs the app from a randomized read-only App Translocation path, and macOS refuses to bind a durable Automation grant to a path that changes on every launch — the browser permission prompt never appears, and no row is ever written to Privacy & Security → Automation. That pane has no control for adding an app by hand, so a user has no way to recover from the outside.

The app handles this itself:

- `classroom::clear_install_quarantine_flag` runs during `setup` and removes the quarantine flag from Millennium's own bundle when it is installed under an Applications folder and is not translocated. Later launches are then not translocated, which is what lets macOS record the Automation grant.
- `get_classroom_automation_diagnostics` reports the specific blocker (unpackaged, translocated, quarantined, invalid signature, missing usage description, browser not running, denied) plus the raw `OSStatus`, and `BrowserPermissionDialog` turns that into the one recovery step that applies.
- `repair_classroom_automation` clears the quarantine flag and runs `tccutil reset AppleEvents education.millennium.desktop`, which is the only supported way to make macOS present the prompt again after a denial.

Ad-hoc signatures have no Team ID, so TCC identifies the app by its code directory hash. That hash changes on every build, so **an update resets the browser automation grant**. Expect users to re-approve after updating; the permission dialog handles it without a reinstall.

Verify each macOS package before publishing:

```bash
codesign --verify --deep --strict --verbose=2 /Volumes/Millennium/Millennium.app
codesign --display --entitlements - /Volumes/Millennium/Millennium.app   # no com.apple.developer.* keys
plutil -extract NSAppleEventsUsageDescription raw -o - \
  /Volumes/Millennium/Millennium.app/Contents/Info.plist
```

See `docs/desktop-macos-permissions.md` for the user-facing procedure.
