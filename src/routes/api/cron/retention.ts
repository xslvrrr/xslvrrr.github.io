import { createHash, timingSafeEqual } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { logger } from '../../../../lib/logger';
import { isSupabaseConfigured, supabaseAdmin } from '../../../../lib/supabase';

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

type RetentionResult = {
  api_rate_limits_deleted?: unknown;
  login_tokens_deleted?: unknown;
  assistant_action_approvals_deleted?: unknown;
  portal_sync_leases_deleted?: unknown;
  classroom_data_deleted?: unknown;
  classroom_sync_sessions_deleted?: unknown;
};

function secretDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function isAuthorizedCronRequest(request: Request, expectedSecret: string): boolean {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const providedSecret = authorization.slice('Bearer '.length);
  if (!providedSecret) return false;
  return timingSafeEqual(secretDigest(providedSecret), secretDigest(expectedSecret));
}

function deletedCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export const Route = createFileRoute('/api/cron/retention')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim();
        if (!cronSecret) {
          logger.error('Retention cron is missing CRON_SECRET');
          return Response.json({ success: false, message: 'Retention job is unavailable' }, {
            status: 503,
            headers: { ...noStoreHeaders, 'Retry-After': '300' },
          });
        }

        if (!isAuthorizedCronRequest(request, cronSecret)) {
          return Response.json({ success: false, message: 'Unauthorized' }, {
            status: 401,
            headers: { ...noStoreHeaders, 'WWW-Authenticate': 'Bearer' },
          });
        }

        if (!isSupabaseConfigured) {
          return Response.json({ success: false, message: 'Retention job is unavailable' }, {
            status: 503,
            headers: { ...noStoreHeaders, 'Retry-After': '300' },
          });
        }

        try {
          const { data, error } = await supabaseAdmin.rpc('prune_expired_operational_data');
          if (error) throw error;
          const result = (Array.isArray(data) ? data[0] : data) as RetentionResult | null;
          if (!result || typeof result !== 'object') throw new Error('Retention RPC returned no result');

          return Response.json({
            success: true,
            deleted: {
              apiRateLimits: deletedCount(result.api_rate_limits_deleted),
              loginTokens: deletedCount(result.login_tokens_deleted),
              assistantApprovals: deletedCount(result.assistant_action_approvals_deleted),
              portalSyncLeases: deletedCount(result.portal_sync_leases_deleted),
              classroomData: deletedCount(result.classroom_data_deleted),
              classroomSyncSessions: deletedCount(result.classroom_sync_sessions_deleted),
            },
            completedAt: new Date().toISOString(),
          }, { headers: noStoreHeaders });
        } catch (error) {
          logger.error('Retention cron failed', error);
          return Response.json({ success: false, message: 'Retention job failed' }, {
            status: 503,
            headers: { ...noStoreHeaders, 'Retry-After': '300' },
          });
        }
      },
    },
  },
});
