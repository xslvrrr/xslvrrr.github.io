import { createFileRoute } from '@tanstack/react-router';
import { isSupabaseConfigured, supabaseAdmin } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

async function checkDatabaseSchema() {
  const checks = await Promise.all([
    supabaseAdmin.from('users').select('id').limit(1),
    supabaseAdmin.from('assistant_action_approvals').select('id').limit(1),
    supabaseAdmin.from('portal_sync_leases').select('user_id').limit(1),
    supabaseAdmin.from('classroom_data').select('user_id').limit(1),
    supabaseAdmin.from('classroom_sync_sessions').select('id').limit(1),
  ]);
  const failure = checks.find((check) => check.error)?.error;
  if (failure) throw failure;
}

export const Route = createFileRoute('/api/readiness')({
  server: {
    handlers: {
      GET: async () => {
        if (!isSupabaseConfigured) {
          return Response.json({ status: 'not_ready' }, {
            status: 503,
            headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
          });
        }

        try {
          await checkDatabaseSchema();
          return Response.json({
            status: 'ready',
            dependencies: { database: 'ready', migrations: 'ready' },
            timestamp: new Date().toISOString(),
          }, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          logger.error('Readiness database check failed', error);
          return Response.json({ status: 'not_ready' }, {
            status: 503,
            headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
          });
        }
      },
    },
  },
});
