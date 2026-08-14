import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import { destroyStartSessionCookie, readStartSession } from '../../../../lib/start-session';
import { deleteUser } from '../../../../lib/users';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

const DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';

export const Route = createFileRoute('/api/user/account')({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }
        if (request.headers.get('x-millennium-confirm') !== DELETE_CONFIRMATION) {
          return Response.json({ message: 'Account deletion confirmation is required' }, { status: 400 });
        }

        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        try {
          await deleteUser(session.userId);
          return Response.json({ success: true }, {
            headers: {
              'Cache-Control': 'no-store',
              'Set-Cookie': destroyStartSessionCookie(),
            },
          });
        } catch (error) {
          return internalErrorResponse('Account deletion failed', 'Failed to delete account', error);
        }
      },
    },
  },
});
