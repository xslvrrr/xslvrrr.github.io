import { createFileRoute } from '@tanstack/react-router';
import { fetchWithTimeout } from '../../../../lib/http';
import { logger } from '../../../../lib/logger';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse, requestNetworkDiscriminator } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';

type ForgotPasswordRequest = {
  email: string;
  school: string;
};

const successMessage = 'Password reset request submitted. If your details are correct, you will receive an email shortly.';

export const Route = createFileRoute('/api/auth/forgot-password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        let body: ForgotPasswordRequest;
        try {
          body = await readJsonBody<ForgotPasswordRequest>(request, 8 * 1024);
        } catch (error) {
          return requestBodyErrorResponse(error) || Response.json({ success: false, message: 'Invalid request' }, { status: 400 });
        }
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const school = typeof body.school === 'string' ? body.school.trim() : '';

        if (!email || email.length > 254 || !school || !/^[a-z0-9_-]{1,64}$/i.test(school)) {
          return Response.json({ success: false, message: 'Email and school are required' }, { status: 400 });
        }

        const networkLimit = await consumeRateLimit('forgot-password-network', requestNetworkDiscriminator(request), 10, 15 * 60);
        if (!networkLimit.allowed) return rateLimitResponse(networkLimit, undefined, { success: false });
        const accountLimit = await consumeRateLimit('forgot-password-account', email.toLowerCase(), 3, 15 * 60);
        if (!accountLimit.allowed) return rateLimitResponse(accountLimit, undefined, { success: false });

        try {
          logger.info('Forgot password request accepted');
          const resetUrl = new URL('https://millennium.education/forgot.asp');
          resetUrl.search = new URLSearchParams({
            email,
            sitename: school,
            send: ' SEND EMAIL ',
          }).toString();

          const response = await fetchWithTimeout(resetUrl.toString(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            timeout: 10000,
          });

          if (response.status >= 500) {
            throw new Error(`Millennium forgot password returned ${response.status}`);
          }

          logger.debug(`Forgot password response status: ${response.status}`);

          return Response.json({
            success: true,
            message: response.status === 200
              ? 'If an account exists with that email and school, you will receive an email with your login details shortly.'
              : successMessage,
          });
        } catch (error) {
          logger.error('Forgot password error:', error);
          return Response.json({ success: true, message: successMessage });
        }
      },
    },
  },
});
