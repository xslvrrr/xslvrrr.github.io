import { createFileRoute } from '@tanstack/react-router';
import { toPortalSyncOptions } from '../../../../lib/data-settings';
import { PortalDataIntegrityError } from '../../../../lib/portal-data-integrity';
import {
  decryptPortalCredentials,
  encryptPortalCredentials,
  reusablePortalCookies,
} from '../../../../lib/portal-credentials';
import {
  GLOBAL_ULTRA_RUN_LOCK_KEY,
  acquireUltraRunLock,
  isUltraRunLockActive,
  releaseUltraRunLocks,
} from '../../../../lib/portal-ultra-run-lock';
import { logger } from '../../../../lib/logger';
import {
  portalSyncSignature,
  PortalSyncBusyError,
  runPortalSyncSingleFlight,
} from '../../../../lib/portal-sync-coordinator';
import { loginAndScrapePortal, PortalAuthError, PortalSyncError, scrapePortalSession } from '../../../../lib/portal-sync';
import { readStartSession } from '../../../../lib/start-session';
import { findUserForPortalSync, persistPortalSyncSnapshot } from '../../../../lib/users';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { persistReportPdfs } from '../../../../lib/report-pdfs';

// A spent portal session rarely comes back as an auth failure: the portal
// answers a logged-out request with the login page, a missing section, or a 403.
// Only a transport-level failure makes signing in again pointless, so every
// other reuse failure retries with the saved login rather than surfacing an
// error the saved login could have prevented.
function shouldRetryWithSavedLogin(error: unknown): boolean {
  if (error instanceof PortalAuthError) return true;
  if (error instanceof PortalSyncError) {
    return error.code !== 'PORTAL_SYNC_TIMEOUT' && error.code !== 'PORTAL_TRANSIENT_FAILURE';
  }
  return true;
}

export const Route = createFileRoute('/api/portal/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        if (process.env.PORTAL_DIRECT_SYNC_ENABLED === 'false') {
          return Response.json({
            message: 'Direct Millennium refresh is temporarily unavailable.',
            error: { code: 'PORTAL_DIRECT_SYNC_DISABLED', retryable: true },
          }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' } });
        }
        const startedAt = Date.now();
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.userId;
          const syncLimit = await consumeRateLimit('portal-sync', userId, 24, 5 * 60);
          if (!syncLimit.allowed) return rateLimitResponse(syncLimit);

          const body = await readJsonBody<any>(request, 64 * 1024);
          const syncOptions = toPortalSyncOptions(body?.syncOptions);
          const isUltraRun = !!syncOptions.ultraRun;
          const lockKeys = [GLOBAL_ULTRA_RUN_LOCK_KEY, `user:${userId}`];

          if (!isUltraRun && lockKeys.some(isUltraRunLockActive)) {
            return Response.json({
              message: 'Portal sync is paused while an ultra run is active.',
              ultraRunActive: true,
            }, { status: 423 });
          }

          const acquiredLocks: string[] = [];
          if (isUltraRun) {
            for (const key of lockKeys) {
              if (!acquireUltraRunLock(key, `Ultra run ${syncOptions.ultraRun?.startYear}-${syncOptions.ultraRun?.endYear}`)) {
                releaseUltraRunLocks(acquiredLocks);
                return Response.json({
                  message: 'An ultra run is already active for this account.',
                  ultraRunActive: true,
                }, { status: 423 });
              }
              acquiredLocks.push(key);
            }
          }

          try {
            const signature = portalSyncSignature(syncOptions);
            const coordinated = await runPortalSyncSingleFlight(userId, signature, async () => {
              const syncState = await findUserForPortalSync(userId, signature);
              if (!syncState) throw new PortalAuthError('Your Millennium app session is no longer valid.');

              const savedCredentials = decryptPortalCredentials(userId, syncState.portalCredentialEnvelope);
              if (!savedCredentials && syncState.portalCredentialEnvelope) {
                logger.warn('[Portal Sync] Stored portal credentials could not be read; automatic refresh needs a new sign-in.', { userId });
              }
              const legacySessionCookies = session.portalCookies?.length ? session.portalCookies : null;
              // A saved login always outranks the session cookies: stale cookies
              // are skipped so the refresh signs in again instead of scraping a
              // logged-out portal and storing the spent cookies back.
              const reusableCookies = savedCredentials
                ? reusablePortalCookies(savedCredentials)
                : legacySessionCookies;
              let result;

              if (reusableCookies) {
                try {
                  result = await scrapePortalSession(
                    reusableCookies,
                    syncOptions,
                    savedCredentials
                      ? { username: savedCredentials.username, password: savedCredentials.password }
                      : undefined,
                  );
                } catch (error) {
                  if (!savedCredentials || !shouldRetryWithSavedLogin(error)) throw error;
                  logger.warn('[Portal Sync] Saved portal session could not be reused; signing in with the saved login.', {
                    userId,
                    code: error instanceof PortalSyncError ? error.code : 'PORTAL_SESSION_UNUSABLE',
                  });
                  result = await loginAndScrapePortal(savedCredentials.username, savedCredentials.password, syncOptions);
                }
              } else if (savedCredentials) {
                result = await loginAndScrapePortal(savedCredentials.username, savedCredentials.password, syncOptions);
              } else {
                throw new PortalSyncError('No saved Millennium login is available for automatic refresh.', {
                  code: 'PORTAL_LOGIN_NOT_SAVED', stage: 'login', status: 409, retryable: false,
                });
              }

              const portalData = result.data;
              if (portalData.account) {
                portalData.account.username = savedCredentials?.username || session.username || portalData.account.username;
              }
              const persistedReports = await persistReportPdfs(
                userId,
                portalData.reports,
                result.cookies,
                undefined,
                syncState.user.portalData?.reports,
              );
              portalData.reports = persistedReports.reports;
              const rotatedCredentialEnvelope = savedCredentials
                ? encryptPortalCredentials(userId, {
                    username: savedCredentials.username,
                    password: savedCredentials.password,
                    cookies: result.cookies,
                    portalUrl: result.portalUrl,
                    cookiesUpdatedAt: new Date().toISOString(),
                  })
                : undefined;
              const user = await persistPortalSyncSnapshot({
                user: {
                  name: portalData.user?.name || session.username || '',
                  school: portalData.user?.school || session.school || 'rhhs',
                  uid: portalData.user?.uid || '',
                },
                account: portalData.account,
                timetable: portalData.timetable,
                notices: portalData.notices,
                grades: portalData.grades,
                attendance: portalData.attendance,
                calendar: portalData.calendar,
                reports: portalData.reports,
                classes: portalData.classes,
                syncMeta: portalData.syncMeta,
                lastUpdated: portalData.lastUpdated,
              }, {
                existingUser: syncState.user,
                syncSignature: signature,
                previousFingerprint: syncState.portalSyncFingerprint,
                ...(rotatedCredentialEnvelope
                  ? { portalCredentialEnvelope: rotatedCredentialEnvelope }
                  : {}),
              });

              const warnings: string[] = persistedReports.warnings;

              return { result, user, warnings };
            }, 300);

            const { result, user, warnings } = coordinated.value;
            const portalData = result.data;
            const totalDurationMs = Date.now() - startedAt;
            return Response.json(
              {
                ...(user.portalData || {}),
                incremental: true,
                unchanged: !user.portalChanged,
                userId: user.id,
                user: { name: user.name, school: user.school, uid: user.millenniumUid },
                lastUpdated: user.lastSync || portalData.lastUpdated,
                sync: {
                  transport: result.transport,
                  durationMs: result.durationMs,
                  totalDurationMs,
                  shared: coordinated.shared,
                  degraded: portalData.syncMeta?.degraded === true,
                  failedPages: portalData.syncMeta?.failedPages || [],
                },
                ...(warnings.length ? { syncWarnings: warnings } : {}),
              },
              {
                headers: {
                  'Cache-Control': 'no-store',
                  'Server-Timing': `portal;dur=${Math.max(0, Math.round(result.durationMs))}, total;dur=${Math.max(0, totalDurationMs)}`,
                },
              },
            );
          } finally {
            releaseUltraRunLocks(acquiredLocks);
          }
        } catch (error: any) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          if (error instanceof PortalSyncBusyError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, retryable: true },
              retryAfterMs: error.retryAfterMs,
            }, { status: error.status, headers: { 'Retry-After': '2' } });
          }
          if (error instanceof PortalAuthError) {
            return Response.json({
              message: error.message,
              expired: true,
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
            }, { status: error.status });
          }
          if (error instanceof PortalSyncError) {
            logger.warn('Portal refresh failed', {
              code: error.code,
              stage: error.stage,
              retryable: error.retryable,
              cause: error.cause,
            });
            return Response.json({
              message: error.message,
              expired: error.code === 'PORTAL_LOGIN_NOT_SAVED',
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
            }, { status: error.status });
          }
          if (error instanceof PortalDataIntegrityError) {
            return Response.json({
              message: error.message,
              rejectedEmptyData: true,
              counts: error.counts,
              error: { code: 'PORTAL_DATA_REJECTED', retryable: true },
            }, { status: error.status });
          }

          logger.error('[Portal Sync] Error:', error);
          return Response.json({
            message: 'Failed to sync Millennium data',
            error: { code: 'PORTAL_SYNC_INTERNAL', retryable: true },
          }, { status: 500 });
        }
      },
    },
  },
});
