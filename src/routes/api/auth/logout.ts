import { createFileRoute } from '@tanstack/react-router';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { destroyStartSessionCookie } from '../../../../lib/start-session';

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        return Response.json(
          { success: true, message: 'Logged out successfully' },
          { headers: { 'Set-Cookie': destroyStartSessionCookie() } },
        );
      },
    },
  },
});
