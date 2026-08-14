import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../../lib/api-response';
import {
  cancelClassroomSyncSession,
  getClassroomSyncSession,
  isClassroomSyncSessionId,
} from '../../../../../lib/classroom-sync-sessions';
import { crossOriginMutationResponse } from '../../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse } from '../../../../../lib/rate-limit';
import { readStartSession } from '../../../../../lib/start-session';

const noStoreHeaders = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

export const Route = createFileRoute('/api/classroom/sync-sessions/$sessionId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        if (!isClassroomSyncSessionId(params.sessionId)) {
          return Response.json({ message: 'Classroom sync session ID is invalid.' }, { status: 400, headers: noStoreHeaders });
        }

        try {
          const limit = await consumeRateLimit('classroom-sync-session-read', session.userId, 120, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const syncSession = await getClassroomSyncSession(session.userId, params.sessionId);
          if (!syncSession) {
            return Response.json({ message: 'Classroom sync session was not found.' }, { status: 404, headers: noStoreHeaders });
          }
          return Response.json({ session: syncSession }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse(
            'Classroom sync session read failed',
            'Failed to load Classroom sync session.',
            error,
            noStoreHeaders,
          );
        }
      },
      DELETE: async ({ request, params }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) {
          crossOrigin.headers.set('Cache-Control', 'no-store');
          return crossOrigin;
        }

        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        if (!isClassroomSyncSessionId(params.sessionId)) {
          return Response.json({ message: 'Classroom sync session ID is invalid.' }, { status: 400, headers: noStoreHeaders });
        }

        try {
          const limit = await consumeRateLimit('classroom-sync-session-cancel', session.userId, 20, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const result = await cancelClassroomSyncSession(session.userId, params.sessionId);
          if (result.outcome === 'not-found') {
            return Response.json({ message: 'Classroom sync session was not found.' }, { status: 404, headers: noStoreHeaders });
          }
          if (result.outcome === 'not-cancellable') {
            return Response.json({
              message: 'Classroom sync session can no longer be cancelled.',
              session: result.session,
            }, { status: 409, headers: noStoreHeaders });
          }
          return Response.json({ success: true, session: result.session }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse(
            'Classroom sync session cancellation failed',
            'Failed to cancel Classroom sync session.',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
