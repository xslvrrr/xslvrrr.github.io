import { createFileRoute } from '@tanstack/react-router';

import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession } from '../../../../lib/start-session';
import { createLoginToken } from '../../../../lib/tokens';

const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const noStoreHeaders = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

export const Route = createFileRoute('/api/desktop/login-token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401, headers: noStoreHeaders });
          }
          const limit = await consumeRateLimit('desktop-login-token', session.userId, 10, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<{ codeChallenge?: unknown }>(request, 2 * 1024);
          if (typeof body.codeChallenge !== 'string' || !CODE_CHALLENGE_PATTERN.test(body.codeChallenge)) {
            return Response.json({ message: 'Valid desktop challenge required' }, { status: 400, headers: noStoreHeaders });
          }
          const token = await createLoginToken(session.userId, body.codeChallenge);
          return Response.json({ token }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          return Response.json({ message: 'Failed to create login token' }, { status: 500, headers: noStoreHeaders });
        }
      },
    },
  },
});
