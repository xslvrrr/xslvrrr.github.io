import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { getUserLocalCalendar, updateUserLocalCalendar } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

export const Route = createFileRoute('/api/user/local-calendar')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          return Response.json(await getUserLocalCalendar(session.userId));
        } catch (error) {
          return internalErrorResponse('Local calendar load failed', 'Failed to load local calendar data', error);
        }
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          const { events, calendars } = await readJsonBody<{ events?: unknown; calendars?: unknown }>(request, 5 * 1024 * 1024);
          if (!Array.isArray(events) || !Array.isArray(calendars)) {
            return Response.json({ message: 'Invalid calendar payload' }, { status: 400 });
          }
          return Response.json(await updateUserLocalCalendar(session.userId, { events, calendars }));
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Local calendar save failed', 'Failed to save local calendar data', error);
        }
      },
    },
  },
});
