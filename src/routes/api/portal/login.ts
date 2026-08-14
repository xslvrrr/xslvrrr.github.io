import { createFileRoute } from '@tanstack/react-router';
import { createHash } from 'node:crypto';
import { logger } from '../../../../lib/logger';
import { toPortalSyncOptions } from '../../../../lib/data-settings';
import { PortalDataIntegrityError } from '../../../../lib/portal-data-integrity';
import { encryptPortalCredentials } from '../../../../lib/portal-credentials';
import { portalSyncSignature } from '../../../../lib/portal-sync-coordinator';
import {
  GLOBAL_ULTRA_RUN_LOCK_KEY,
  acquireUltraRunLock,
  isUltraRunLockActive,
  releaseUltraRunLocks,
} from '../../../../lib/portal-ultra-run-lock';
import { loginAndScrapePortal, PortalAuthError, PortalSyncError } from '../../../../lib/portal-sync';
import { createStartSessionCookie } from '../../../../lib/start-session';
import {
  clearUserPortalCredentialEnvelope,
  findUserPortalDataById,
  persistPortalSyncSnapshot,
  updateUserPortalCredentialEnvelope,
} from '../../../../lib/users';
import { consumeRateLimit, rateLimitResponse, requestNetworkDiscriminator } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

export const Route = createFileRoute('/api/portal/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        if (process.env.PORTAL_DIRECT_SYNC_ENABLED === 'false') {
          return Response.json({
            success: false,
            message: 'Direct Millennium sign-in is temporarily unavailable.'
          }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' } });
        }
        try {
          const body = await readJsonBody<any>(request, 16 * 1024);
          const { username, password } = body;
          const rememberCredentials = body?.rememberCredentials !== false;
          const syncOptions = toPortalSyncOptions(body?.syncOptions);

          if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
            return Response.json({ success: false, message: 'Username and password are required' }, { status: 400 });
          }
          if (username.length > 254 || password.length > 512) {
            return Response.json({ success: false, message: 'Login details exceed supported length' }, { status: 400 });
          }

          const normalizedUsername = username.trim().toLowerCase();
          const networkDiscriminator = requestNetworkDiscriminator(request);
          const networkLimit = await consumeRateLimit(
            'portal-login-network',
            networkDiscriminator,
            40,
            15 * 60,
          );
          if (!networkLimit.allowed) return rateLimitResponse(networkLimit);
          const accountLimit = await consumeRateLimit(
            'portal-login-account',
            normalizedUsername,
            8,
            15 * 60,
          );
          if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

          const loginLockKey = `login:${createHash('sha256').update(normalizedUsername).digest('base64url').slice(0, 20)}`;
          const lockKeys = [GLOBAL_ULTRA_RUN_LOCK_KEY, loginLockKey];
          const isUltraRun = !!syncOptions.ultraRun;
          if (!isUltraRun && lockKeys.some(isUltraRunLockActive)) {
            return Response.json({
              success: false,
              message: 'Portal login sync is paused while an ultra run is active.',
              ultraRunActive: true,
            }, { status: 423 });
          }

          const acquiredLocks: string[] = [];
          if (isUltraRun) {
            for (const key of lockKeys) {
              if (!acquireUltraRunLock(key, `Ultra run ${syncOptions.ultraRun?.startYear}-${syncOptions.ultraRun?.endYear}`)) {
                releaseUltraRunLocks(acquiredLocks);
                return Response.json({
                  success: false,
                  message: 'An ultra run is already active.',
                  ultraRunActive: true,
                }, { status: 423 });
              }
              acquiredLocks.push(key);
            }
          }

          try {
            const result = await loginAndScrapePortal(username.trim(), password, syncOptions);
            const portalData = result.data;
            if (portalData.account) {
              portalData.account.username = username.trim();
            }
            const signature = portalSyncSignature(syncOptions);
            const user = await persistPortalSyncSnapshot({
              user: {
                name: portalData.user?.name || username.trim(),
                school: portalData.user?.school || 'rhhs',
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
            }, { syncSignature: signature });
            const syncWarnings: string[] = [];
            if (rememberCredentials) {
              try {
                await updateUserPortalCredentialEnvelope(
                  user.id,
                  encryptPortalCredentials(user.id, {
                    username: username.trim(),
                    password,
                    cookies: result.cookies,
                    portalUrl: result.portalUrl,
                    cookiesUpdatedAt: new Date().toISOString(),
                  }),
                );
              } catch (error) {
                logger.error('[Portal Login] Data synced but encrypted session persistence failed:', error);
                syncWarnings.push('Automatic refresh could not be enabled. Your synced data is safe.');
              }
            } else {
              await clearUserPortalCredentialEnvelope(user.id).catch((error) => {
                logger.error('[Portal Login] Failed to clear saved credentials:', error);
                syncWarnings.push('Saved login cleanup could not be confirmed.');
              });
            }
            // Login may occur on a new device. Return complete durable history once;
            // recurring background sync uses compact incremental responses.
            const durableUser = await findUserPortalDataById(user.id);

            return Response.json(
              {
                success: true,
                message: 'Login successful',
                sync: {
                  transport: result.transport,
                  durationMs: result.durationMs,
                  degraded: portalData.syncMeta?.degraded === true,
                },
                ...(syncWarnings.length ? { syncWarnings } : {}),
                userId: user.id,
                ...(durableUser?.portalData || user.portalData || {}),
                user: { name: user.name, school: user.school, uid: user.millenniumUid },
                lastUpdated: user.lastSync || portalData.lastUpdated,
              },
              {
                headers: {
                  'Cache-Control': 'no-store',
                  'Server-Timing': `portal;dur=${Math.max(0, Math.round(result.durationMs))}`,
                  'Set-Cookie': createStartSessionCookie({
                    loggedIn: true,
                    username: username.trim(),
                    school: user.school,
                    userId: user.id,
                    portalUid: user.millenniumUid,
                    timestamp: new Date().toISOString(),
                  }),
                },
              },
            );
          } finally {
            releaseUltraRunLocks(acquiredLocks);
          }
        } catch (error: any) {
          const bodyError = requestBodyErrorResponse(error, undefined, { success: false });
          if (bodyError) return bodyError;
          if (error instanceof PortalAuthError) {
            return Response.json({
              success: false,
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
              message: error.message,
            }, { status: error.status });
          }
          if (error instanceof PortalSyncError) {
            logger.warn('Portal login sync failed', {
              code: error.code,
              stage: error.stage,
              retryable: error.retryable,
              cause: error.cause,
            });
            return Response.json({
              success: false,
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
              message: error.message,
            }, { status: error.status });
          }
          if (error instanceof PortalDataIntegrityError) {
            return Response.json({
              success: false,
              message: error.message,
              rejectedEmptyData: true,
              counts: error.counts,
            }, { status: error.status });
          }

          logger.error('[Portal Login] Error:', error);
          return Response.json({ success: false, message: 'Failed to log in to Millennium' }, { status: 500 });
        }
      },
    },
  },
});
