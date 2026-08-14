# Millennium web production release runbook

This runbook covers web deployment plus Classroom services consumed by Millennium Desktop. Desktop packaging uses its own signed release process.

## 1. Release gates

A release candidate is eligible for canary deployment only when all of these are true:

- `bun install --frozen-lockfile`, `bun run typecheck`, and `bun run build` pass in CI.
- Required production environment validation passes. Secrets are distinct, server-only, and supplied by the deployment platform.
- Every SQL file in `supabase/migrations` has been applied in filename order and `/api/readiness` returns `200`.
- Vercel lists the daily `/api/cron/retention` schedule and its latest invocation succeeds.
- `/api/health` returns `200` without contacting dependencies.
- Google Classroom synthetic-account smoke checks pass in supported desktop browsers, including local save, cloud upload, web read, partial-snapshot preservation, disconnect, and deletion. Google Calendar remains unavailable until approval and deployed OAuth configuration are complete.
- `PORTAL_SYNC_ALLOW_BROWSER_FALLBACK=false` unless an explicit provider-policy and operational review approves the compatibility fallback.
- Synthetic-account smoke checks cover direct portal login, background refresh, data export, data wipe, logout, and assistant approval consumption. Do not use real student data.

## 2. Environment

Required variables are documented in `.env.example` and enforced by `lib/server-environment.ts`. `CRON_SECRET` must be a distinct, header-safe random value (prefer base64url) with at least 32 characters. Google variables are optional while Calendar is gated.

Operational switches:

- `PORTAL_DIRECT_SYNC_ENABLED=false` stops server-side provider login and refresh during a provider or markup incident.
- `PORTAL_SYNC_ALLOW_BROWSER_FALLBACK=false` is the normal setting. Enabling it adds Chromium cost and provider/supportability risk.
- `PUPPETEER_DISABLE_SANDBOX=false` is required unless equivalent process isolation has been formally reviewed.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, session secrets, portal credential keys, tokens, cookies, or student data to Vite client variables, logs, analytics, screenshots, or support tickets.

## 3. Database migration and backup

Before a production migration:

1. Confirm a recent Supabase backup or point-in-time recovery window and record its restore point outside the repository.
2. Apply migrations to staging in filename order.
3. Verify tables/RPCs through staging `/api/readiness` and exercise one synthetic approval, sync lease, rate-limit rejection, export, and retention-pruning run.
4. Apply to production during a monitored window. Do not deploy application code that depends on a migration until the migration succeeds.

`202607150001_remove_extension_server_storage.sql` is destructive: it permanently drops legacy extension authorization and legacy Classroom storage. `202607190001_classroom_sync_backend.sql` then creates user-owned Classroom snapshot and short-lived upload-session tables. Review affected objects and row counts, verify backup restore point, then apply both in filename order with matching application release.

Database rollback uses the pre-migration restore point when a migration cannot be safely reversed. Do not improvise destructive down migrations against student data.

## 4. Daily retention job

Vercel invokes `GET /api/cron/retention` at `03:17 UTC` each day. Vercel supplies `Authorization: Bearer <CRON_SECRET>`; the route rejects missing or incorrect credentials and never returns retained payloads.

Deployment order:

1. Apply migrations in filename order, including `202607110005_operational_retention_pruning.sql`, `202607150001_remove_extension_server_storage.sql`, and `202607190001_classroom_sync_backend.sql`.
2. Configure a distinct production `CRON_SECRET` with at least 32 characters.
3. Deploy application and `vercel.json` cron configuration.
4. In staging only, create synthetic expired records for each covered table, invoke the job from a secure operations shell, and verify returned deletion counts. A second invocation should return zero for those fixtures.
5. Confirm Vercel cron history records a daily `200`. Alert when an invocation fails or no successful invocation appears within 26 hours.

The RPC removes expired API rate-limit rows, login tokens, assistant approvals, portal sync leases, Classroom snapshots, and Classroom upload sessions. Never paste `CRON_SECRET`, retained records, or response headers into tickets. To stop cleanup during an incident, remove or disable the Vercel schedule while preserving the additive RPC and expiry columns for investigation.

## 5. Canary and rollout

1. Deploy one canary instance with direct portal browser fallback disabled.
2. Check `/api/health` and `/api/readiness`.
3. Use only a synthetic account to check the critical paths listed above.
4. Watch structured error rate, `429` volume, portal sync duration/failure stage, Supabase latency, server memory, and Chromium process count for at least one normal sync interval.
5. Expand traffic gradually. Pause on rising authentication failures, provider selector failures, duplicate events, migration errors, or memory/process growth.

Chromebook acceptance should include narrow viewport, 200% zoom, reduced motion, offline recovery, background-sync pause/resume, and a warm dashboard without loading the assistant bundle until interaction.

## 6. Rollback

Application rollback:

1. Set `PORTAL_DIRECT_SYNC_ENABLED=false` if the incident involves provider access or scraping.
2. Route traffic back to the last known-good immutable deployment.
3. Keep additive migrations in place unless they are the proven cause; older code must tolerate them.
4. Recheck health/readiness and synthetic login/export/wipe.

Data rollback:

- Prefer restoring only affected records from the recorded backup/PITR point.
- Preserve audit evidence without copying student payloads into tickets or chat.
- User-initiated deletion must not be undone casually; obtain privacy/operations review before restoring deleted user data from backup.

## 7. Incident response

- Provider markup/authentication change: stop new affected syncs, keep last-known-good data, communicate degraded status, and validate selectors only with approved synthetic access. Do not add CAPTCHA, bot-detection, or access-control evasion.
- Google Classroom markup change: preserve complete snapshots, reject partial cloud replacement, validate desktop extraction against a synthetic Classroom account, then ship an extractor update.
- Credential/token exposure: rotate the affected key, revoke login tokens and sessions, assess log/backup exposure, and notify the designated privacy/security owner.
- Cross-user data concern: disable affected reads/writes immediately, preserve minimal metadata, verify user scoping, and escalate as a high-severity privacy incident.
- AI/tool concern: disable the assistant deployment path, invalidate pending approvals, retain redacted action metadata, and check for untrusted-content prompt injection or permission bypass.
- Calendar duplication/deletion: stop Calendar rollout, preserve the account-scoped sync journal, and avoid bulk cleanup until remote/local ownership is reconciled.

## 8. Observability and privacy

Production logs are structured and recursively redact common credentials, identifiers, email addresses, prompt/content fields, cookies, and tokens. Do not add raw provider pages, notices, AI prompts, or exported files to logs.

Configure the deployment platform to alert on:

- readiness failures for two consecutive checks;
- elevated `5xx` or authentication failures;
- sustained rate-limit backend failures;
- failed or missing daily retention invocations;
- portal sync timeout/failure spikes;
- database latency/errors;
- memory exhaustion or orphan Chromium processes.

Retention, institutional policy, provider terms, minor/student data handling, backup deletion, and incident-notification obligations require product/privacy/legal review before general availability. This document is operational guidance, not a legal conclusion.
