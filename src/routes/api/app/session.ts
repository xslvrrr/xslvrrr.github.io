import { createFileRoute } from '@tanstack/react-router';
import { createStartSessionCookie, destroyStartSessionCookie, readStartSession } from '../../../../lib/start-session';
import { getUserRole } from '../../../../lib/admin';
import { internalErrorResponse } from '../../../../lib/api-response';
import { getUserCreatedAt } from '../../../../lib/users';

export const Route = createFileRoute('/api/app/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);

          if (session.loggedIn && session.userId) {
            const [createdAt, role] = await Promise.all([
              getUserCreatedAt(session.userId),
              getUserRole(session.userId),
            ]);
            return Response.json({
              loggedIn: true,
              username: session.username || 'Student',
              school: session.school || '',
              userId: session.userId,
              portalUid: session.portalUid || '',
              timestamp: session.timestamp,
              createdAt,
              role: role || 'user',
            }, {
              headers: {
                'Cache-Control': 'no-store',
                'Set-Cookie': createStartSessionCookie(session),
              },
            });
          }

          return Response.json({
            loggedIn: false,
            username: null,
            school: null,
            timestamp: null,
          }, { headers: {
            'Cache-Control': 'no-store',
            'Set-Cookie': destroyStartSessionCookie(),
          } });
        } catch (error) {
          return internalErrorResponse('App session check failed', 'Internal server error', error);
        }
      },
    },
  },
});
