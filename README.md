# Millennium

Millennium is a web student dashboard for user-authorized portal synchronisation, notices, timetables, calendars, customisation, and an approval-gated AI assistant.

## Current release scope

- Web application with direct portal login and background sync.
- Google Classroom sync runs through Millennium Desktop using a visible, dedicated Chrome, Chromium, or Edge profile. Encrypted local snapshots can sync to signed-in web account.
- Google Calendar is approval-gated and its server routes remain unavailable until Google approval and OAuth deployment are complete.
- Desktop application provides Google Classroom sync and encrypted offline cache access.

## Local setup

1. Install [Bun](https://bun.sh/) at the version declared in `package.json`.
2. Copy `.env.example` to `.env.local` and replace every required placeholder.
3. Apply the SQL files in `supabase/migrations` in filename order to a non-production project.
4. Run `bun install --frozen-lockfile`.
5. Run `bun run dev`.

Never use real student accounts or production credentials for development. Use fixtures or a dedicated synthetic account approved for testing.

## Release verification

```sh
bun run typecheck
bun run build
```

Deployment, rollback, privacy, migration, and incident procedures are in [docs/production-release-runbook.md](docs/production-release-runbook.md).
Desktop development, packaging, signing, and artifact publication are in [docs/desktop-release.md](docs/desktop-release.md).
