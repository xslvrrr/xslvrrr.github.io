import { createFileRoute } from '@tanstack/react-router';
import { getUserRole } from '../../../../lib/admin';
import { createStartSessionCookie, readStartSession } from '../../../../lib/start-session';
import { internalErrorResponse } from '../../../../lib/api-response';

export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);

          if (!session.loggedIn || !session.userId) {
            return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
          }
          const role = await getUserRole(session.userId);

          return Response.json({
            user: {
              name: session.username || 'Student',
              school: session.school || '',
              id: session.userId,
              role: role || 'user',
            },
          }, {
            headers: {
              'Cache-Control': 'no-store',
              'Set-Cookie': createStartSessionCookie(session),
            },
          });
        } catch (error) {
          return internalErrorResponse('Auth session check failed', 'Internal server error', error);
        }
      },
    },
  },
});
