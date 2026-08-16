import { createHash } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { logger } from '../../../../lib/logger';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession } from '../../../../lib/start-session';
import {
  findUserPortalDataById,
  getUserPortalManifest,
  replaceUserPortalData,
  wipeUserPortalData,
} from '../../../../lib/users';

function portalEtag(lastSync: string): string {
  return `"portal-${createHash('sha256').update(lastSync).digest('base64url').slice(0, 16)}"`;
}

export const Route = createFileRoute('/api/portal/data')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({
              message: 'Unauthorized',
              needsSync: false,
              hasSession: false,
            }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
          }

          const manifest = await getUserPortalManifest(session.userId);
          if (manifest?.lastSync) {
            const etag = portalEtag(manifest.lastSync);
            const since = new URL(request.url).searchParams.get('since');
            if (request.headers.get('if-none-match') === etag || since === manifest.lastSync) {
              return new Response(null, {
                status: 304,
                headers: { 'Cache-Control': 'no-store', ETag: etag, Vary: 'Cookie' },
              });
            }

            const user = await findUserPortalDataById(session.userId);
            if (user?.portalData) {
              return Response.json({
                ...user.portalData as object,
                userId: session.userId,
                user: { name: user.name, school: user.school, uid: user.millenniumUid },
                lastUpdated: user.lastSync,
              }, {
                headers: { 'Cache-Control': 'no-store', ETag: etag, Vary: 'Cookie' },
              });
            }
          }

          return Response.json({
            message: 'No synchronized portal data is available yet.',
            needsSync: true,
            hasSession: true,
          }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          return internalErrorResponse('Portal data read failed', 'Failed to get portal data', error);
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

          const body = await readJsonBody<{ portalData?: unknown }>(request, 8 * 1024 * 1024);
          const portalData = body?.portalData;
          if (!portalData || typeof portalData !== 'object' || Array.isArray(portalData)) {
            return Response.json({ message: 'Portal data is required' }, { status: 400 });
          }

          const lastUpdated = 'lastUpdated' in portalData && typeof portalData.lastUpdated === 'string'
            ? portalData.lastUpdated
            : undefined;
          const user = await replaceUserPortalData(session.userId, portalData, lastUpdated);
          if (!user) {
            return Response.json({ message: 'User not found' }, { status: 404 });
          }

          return Response.json({
            success: true,
            user: { name: user.name, school: user.school, uid: user.millenniumUid },
            ...portalData,
            lastUpdated: user.lastSync || lastUpdated,
          });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          logger.error('[Portal Data] Restore error:', error);
          return Response.json({ message: 'Failed to restore portal data' }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }

          // `keepSavedLogin` is the ultra-run rollback: it erases the synced
          // chunks it wrote without forgetting the account's saved login.
          const keepSavedLogin = new URL(request.url).searchParams.get('keepSavedLogin') === 'true';
          const user = await wipeUserPortalData(session.userId, { keepSavedLogin });
          if (!user) {
            return Response.json({ message: 'User not found' }, { status: 404 });
          }

          return Response.json({ success: true });
        } catch (error: unknown) {
          logger.error('[Portal Data] Wipe error:', error);
          return Response.json({ message: 'Failed to wipe portal data' }, { status: 500 });
        }
      },
    },
  },
});
