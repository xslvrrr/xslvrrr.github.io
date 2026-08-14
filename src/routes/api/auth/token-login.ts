import { createFileRoute } from '@tanstack/react-router';

import { internalErrorResponse } from '../../../../lib/api-response';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse, requestNetworkDiscriminator } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { createStartSessionCookie } from '../../../../lib/start-session';
import { validateAndConsumeToken } from '../../../../lib/tokens';
import { findUserIdentityById } from '../../../../lib/users';

async function consumeLoginToken(token: unknown, verifier: unknown) {
  if (!token || typeof token !== 'string') return null;
  const codeVerifier = verifier === undefined ? undefined : typeof verifier === 'string' ? verifier : null;
  if (codeVerifier === null) return null;
  const userId = await validateAndConsumeToken(token, codeVerifier);
  if (!userId) return null;
  return findUserIdentityById(userId);
}

function sessionCookieFor(user: NonNullable<Awaited<ReturnType<typeof consumeLoginToken>>>) {
  return createStartSessionCookie({
    loggedIn: true,
    username: user.name,
    school: user.school,
    userId: user.id,
    portalUid: user.millenniumUid,
    timestamp: new Date().toISOString(),
  });
}

export const Route = createFileRoute('/api/auth/token-login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        try {
          const limit = await consumeRateLimit('auth-token-login', requestNetworkDiscriminator(request), 30, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, undefined, { success: false });
          const body = await readJsonBody<{ token?: unknown; verifier?: unknown }>(request, 8 * 1024);
          if (!body.token || typeof body.token !== 'string') {
            return Response.json({ success: false, message: 'Token required' }, { status: 400 });
          }

          const user = await consumeLoginToken(body.token, body.verifier);
          if (!user) {
            return Response.json({ success: false, message: 'Invalid or expired token' }, { status: 401 });
          }

          return Response.json({
            success: true,
            message: 'Login successful',
            user: { id: user.id, name: user.name, school: user.school, portalUid: user.millenniumUid },
          }, { headers: { 'Set-Cookie': sessionCookieFor(user), 'Cache-Control': 'no-store' } });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, undefined, { success: false });
          if (bodyError) return bodyError;
          return internalErrorResponse('Token login failed', 'Failed to login', error, undefined, { success: false });
        }
      },
    },
  },
});
