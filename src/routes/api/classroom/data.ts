import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readStartSession } from '../../../../lib/start-session';
import { deleteUserClassroomData, getUserClassroomData } from '../../../../lib/users';

const noStoreHeaders = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

export const Route = createFileRoute('/api/classroom/data')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const limit = await consumeRateLimit('classroom-data-read', session.userId, 60, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const classroomData = await getUserClassroomData(session.userId);
          if (!classroomData) {
            return Response.json(
              { message: 'No synchronized Classroom data is available yet.' },
              { status: 404, headers: noStoreHeaders },
            );
          }
          return Response.json({ classroomData }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse(
            'Classroom data read failed',
            'Failed to load Classroom data.',
            error,
            noStoreHeaders,
          );
        }
      },
      DELETE: async ({ request }) => {
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
          const limit = await consumeRateLimit('classroom-data-delete', session.userId, 10, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          await deleteUserClassroomData(session.userId);
          return Response.json({ success: true }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse(
            'Classroom data delete failed',
            'Failed to delete Classroom data.',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
