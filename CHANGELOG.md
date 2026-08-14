# Changelog

## 1.0.9 — 2026-08-08

- Fixed Google Classroom sync failing immediately after sign-in. The page extractor ran as soon as the document reported a usable ready state, which on a client-rendered Classroom is before any course card exists, so the first read returned nothing and the host correctly refused it as unverified data. The extractor now waits for the course list to settle, or for an explicit empty state, before reading, and the home page is re-read once before the sync is failed.
- Scrolled the element Classroom actually scrolls instead of the window, so course lists past the first screen are loaded rather than silently truncated.
- Stopped a browser that has not finished registering with macOS from being reported as a missing automation permission on the path that gates reading, which refused the sync before it opened a page.
- Registered `set_window_controls_visible` in the desktop capability policy. Without it the call was rejected at runtime and recorded as applied anyway, so the macOS traffic lights never appeared on hover and every later hover short-circuited.
- Made the sidebar offset transition the property it changes and apply to the whole sidebar surface, so items slide down under the traffic lights on every sidebar rather than jumping in settings and doing nothing elsewhere.
- Served `/desktop-shell/` from the freshly built desktop bundle in development, so an installed package follows the site being served instead of whichever shell was last committed to the public directory.
- Checked for a newer UI shell when the window regains focus or the machine reconnects, instead of only four seconds after launch and every thirty minutes.
- Refreshed macOS Universal, Apple Silicon, and Intel engineering downloads.

## 1.0.8 — 2026-08-08

- Restored the desktop SQLite migrations for the encrypted cache and the offline Study store. They were missing from the repository, so the native host had not compiled since 1.0.6 and no 1.0.7 package was ever produced.
- Moved every encrypted-cache and Study command off the main thread. They ran there synchronously, so opening the database, decrypting a cached snapshot, or vacuuming froze the window until it finished.
- Added a presence check for cached records, so startup no longer decrypts and transfers whole portal and Classroom snapshots only to test them for null.
- Served loopback requests from a worker pool instead of one at a time, so a slow proxied API call no longer blocks page assets and other API calls behind it.
- Reused files a shell update already has on disk after verifying their digests, instead of downloading the whole UI bundle on every web release.
- Retried a failed shell check after five minutes rather than a full thirty, so a check that runs before the network is ready no longer leaves the UI stale.
- Fixed proxied responses reporting the backend's `Content-Length` instead of the bytes actually forwarded, which could truncate or stall a response.
- Refreshed macOS Universal, Apple Silicon, and Intel engineering downloads.

## 1.0.6 — 2026-07-31

- Added native macOS browser permission prompt, status detection, and automatic sync continuation after access is granted.
- Preserved detected Google Classroom `/u/X/` profile numbers across every sync navigation.
- Restored stronger rounded corners on Attendance and Reports card surfaces.
- Refreshed macOS Universal, Apple Silicon, and Intel engineering downloads.

## 1.0.5 — 2026-07-30

- Restored native macOS window decorations, rounding, resizing, and overlay traffic lights.
- Limited traffic-light reveal to top sidebar hotspot and unified sidebar offset animation.
- Added native macOS Automation permission request before Classroom extraction.
- Ignored transient blank browser targets while Classroom page loads.
- Preserved administrator role in encrypted desktop identity and dashboard session.
- Rebuilt desktop bundle from current web Study, administrator, and Kokonut UI feature set.

## 1.0.4 — unreleased

- Added signed in-app update checks at startup, every 30 minutes, and when app returns to foreground.
- Added sidebar install action with download progress, verified installation, and automatic relaunch.
- Added signed updater artifacts and `latest.json` publication to tagged desktop release pipeline.
- Removed native OS titlebar and added hover-revealed window controls.
- Updated Google Classroom classwork routes and added read-only permission disclosure.

## 1.0.3 — unreleased

- Allowed desktop UI to inspect, run, and cancel local Codex and Claude CLI commands through Tauri capability policy.
- Preserved native Tauri command errors so provider inspection failures show their actual cause.

## 1.0.2 — unreleased

- Rebuilt desktop app from current web feature set, including Study, administrator tools, assistant provider connections, dashboard updates, and current settings.
- Reserved localhost port 3000 for web backend and moved desktop shell to ports 3001 through 3010, preventing API self-proxy loops.
- Kept local desktop and CI packages pinned to `http://millennium-five.vercel.app` backend.
- Deduplicated desktop deep-link login callbacks so one-time tokens cannot be consumed twice.
- Added recovery when portal login succeeds remotely but desktop loses or rejects final response.
- Added bounded retries for intermittent false credential rejection from legacy portal.
- Published refreshed macOS Universal, Apple Silicon, and Intel engineering downloads.

## 1.0.1 — unreleased

- Added desktop-only ChatGPT and Claude account usage through authenticated local Codex and Claude CLIs.
- Updated portal authentication for the required CSRF token and the portal's hidden student account mode.
- Fixed packaged desktop API and browser login targeting the legacy IIS portal instead of the local Millennium web server.
- Fixed desktop secure storage being rejected when another application occupies localhost port 3000 and Millennium starts on a fallback port.
- Fixed macOS launch rejection caused by a restricted Associated Domains entitlement on ad-hoc signed builds.
- Stopped desktop packages embedding previously published installers from the web public directory.
- Desktop server now selects an available protected loopback port from 3000 through 3010.

## 1.0.0 — unreleased

### Web release

- Migrated the web application to TanStack Start and Vite.
- Added durable assistant-action approvals, portal-sync leases, Classroom ownership/retention, and API rate-limit migrations.
- Added account data export and coordinated portal/Classroom cache deletion.
- Added structured redacted logging, liveness/readiness endpoints, production environment validation, and CI release verification.
- Changed direct portal sync to ordinary HTTP by default; plain browser automation is an explicit compatibility fallback with no stealth plugin.
- Added Google Classroom desktop browser sync, encrypted local snapshots, cloud reconciliation, dashboard views, home cards, navigation, filtering, and data deletion.
- Kept Google Calendar unavailable behind its approval gate.

Desktop release includes Google Classroom sync and encrypted offline cache support.
