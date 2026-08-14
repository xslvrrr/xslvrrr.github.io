import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import {
  ClassroomSyncSessionConflictError,
  createClassroomSyncSession,
} from '../../../../lib/classroom-sync-sessions';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readStartSession } from '../../../../lib/start-session';

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};

export const Route = createFileRoute('/api/classroom/sync-sessions')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) {
          crossOrigin.headers.set('Cache-Control', 'no-store');
          return crossOrigin;
        }

        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const limit = await consumeRateLimit('classroom-sync-session-create', session.userId, 10, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const created = await createClassroomSyncSession(session.userId);
          return Response.json(created, { status: 201, headers: noStoreHeaders });
        } catch (error: unknown) {
          if (error instanceof ClassroomSyncSessionConflictError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, retryable: true },
            }, { status: 409, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            'Classroom sync session creation failed',
            'Failed to create Classroom sync session.',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
