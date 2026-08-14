import { createFileRoute } from '@tanstack/react-router';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import {
  decryptPortalCredentials,
  encryptPortalCredentials,
} from '../../../../lib/portal-credentials';
import {
  PortalAuthError,
  PortalSyncError,
  readPortalAccount,
  updatePortalAccount,
  type PortalAccountUpdate,
} from '../../../../lib/portal-sync';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession, type StartSessionData } from '../../../../lib/start-session';
import {
  findUserPortalDataById,
  getUserPortalCredentialEnvelope,
  replaceUserPortalData,
  updateUserPortalCredentialEnvelope,
} from '../../../../lib/users';
import { logger } from '../../../../lib/logger';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import {
  PortalSyncBusyError,
  runPortalSyncSingleFlight,
} from '../../../../lib/portal-sync-coordinator';

const LIMITS = {
  email: 150,
  nesaStudentNumber: 12,
  usi: 12,
  mobile: 12,
} as const;

function accountUpdateFrom(value: unknown): PortalAccountUpdate {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  const readField = (key: keyof typeof LIMITS) => {
    const field = source[key];
    if (typeof field !== 'string') throw new Error(`${key} must be a string`);
    const trimmed = field.trim();
    if (trimmed.length > LIMITS[key]) throw new Error(`${key} is too long`);
    return trimmed;
  };

  const currentYear = typeof source.currentYear === 'string' ? source.currentYear.trim() : '';
  if (!/^20\d{2}$/.test(currentYear)) throw new Error('currentYear must be a four-digit year');

  return {
    email: readField('email'),
    nesaStudentNumber: readField('nesaStudentNumber'),
    usi: readField('usi'),
    mobile: readField('mobile'),
    currentYear,
  };
}

async function runPortalAccountOperation(
  userId: string,
  session: StartSessionData,
  update?: PortalAccountUpdate,
) {
  const envelope = await getUserPortalCredentialEnvelope(userId);
  const savedCredentials = decryptPortalCredentials(userId, envelope);
  const cookies = savedCredentials?.cookies?.length
    ? savedCredentials.cookies
    : session.portalCookies || [];
  if (cookies.length === 0 && !savedCredentials) {
    throw new PortalSyncError('No saved Millennium login is available for account details.', {
      code: 'PORTAL_LOGIN_NOT_SAVED',
      stage: 'login',
      status: 409,
      retryable: false,
    });
  }

  const credentials = savedCredentials
    ? { username: savedCredentials.username, password: savedCredentials.password }
    : undefined;
  const result = update
    ? await updatePortalAccount(cookies, update, credentials)
    : await readPortalAccount(cookies, credentials);
  result.account.username = savedCredentials?.username || session.username || result.account.username;

  const existing = await findUserPortalDataById(userId);
  const existingPortalData = existing?.portalData && typeof existing.portalData === 'object'
    ? existing.portalData as Record<string, unknown>
    : {};
  await replaceUserPortalData(
    userId,
    { ...existingPortalData, account: result.account },
    existing?.lastSync || undefined,
  );

  if (savedCredentials) {
    await updateUserPortalCredentialEnvelope(
      userId,
      encryptPortalCredentials(userId, {
        ...savedCredentials,
        cookies: result.cookies,
        portalUrl: result.portalUrl,
        cookiesUpdatedAt: new Date().toISOString(),
      }),
    );
  }
  return result.account;
}

export const Route = createFileRoute('/api/portal/account')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }
          const readLimit = await consumeRateLimit('portal-account-read', session.userId, 20, 10 * 60);
          if (!readLimit.allowed) return rateLimitResponse(readLimit);

          const coordinated = await runPortalSyncSingleFlight(
            session.userId,
            'account-read',
            () => runPortalAccountOperation(session.userId!, session),
            60,
          );
          return Response.json(
            { account: coordinated.value },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        } catch (error: unknown) {
          if (error instanceof PortalSyncBusyError) {
            return Response.json({
              message: 'A Millennium sync is already running. Account details will load when it finishes.',
              error: { code: error.code, retryable: true },
              retryAfterMs: error.retryAfterMs,
            }, { status: error.status, headers: { 'Retry-After': '2' } });
          }
          if (error instanceof PortalAuthError || error instanceof PortalSyncError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
            }, { status: error.status });
          }
          logger.error('[Portal Account] Read failed:', error);
          return Response.json({ message: 'Failed to load Millennium account details' }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }
          const updateLimit = await consumeRateLimit('portal-account-update', session.userId, 12, 10 * 60);
          if (!updateLimit.allowed) return rateLimitResponse(updateLimit);

          const body = await readJsonBody<unknown>(request, 8 * 1024);
          let update: PortalAccountUpdate;
          try {
            update = accountUpdateFrom(body);
          } catch (error) {
            return Response.json({
              message: error instanceof Error ? error.message : 'Invalid account details',
            }, { status: 400 });
          }

          const coordinated = await runPortalSyncSingleFlight(
            session.userId,
            'account-update',
            () => runPortalAccountOperation(session.userId!, session, update),
            60,
          );

          return Response.json(
            { success: true, account: coordinated.value },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          if (error instanceof PortalSyncBusyError) {
            return Response.json({
              message: 'A Millennium sync is already running. Try saving again in a moment.',
              error: { code: error.code, retryable: true },
              retryAfterMs: error.retryAfterMs,
            }, { status: error.status, headers: { 'Retry-After': '2' } });
          }
          if (error instanceof PortalAuthError || error instanceof PortalSyncError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, stage: error.stage, retryable: error.retryable },
            }, { status: error.status });
          }
          logger.error('[Portal Account] Update failed:', error);
          return Response.json({ message: 'Failed to update Millennium account details' }, { status: 500 });
        }
      },
    },
  },
});
