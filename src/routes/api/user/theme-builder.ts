import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { getUserThemeBuilder, updateUserThemeBuilder } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

export const Route = createFileRoute('/api/user/theme-builder')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          return Response.json(await getUserThemeBuilder(session.userId));
        } catch (error) {
          return internalErrorResponse('Theme builder load failed', 'Failed to load theme builder data', error);
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
          const { state, customThemes } = await readJsonBody<any>(request, 5 * 1024 * 1024);
          return Response.json(await updateUserThemeBuilder(session.userId, { state, customThemes }));
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Theme builder save failed', 'Failed to save theme builder data', error);
        }
      },
    },
  },
});
