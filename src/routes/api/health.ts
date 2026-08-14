import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => Response.json({
        status: 'ok',
        service: 'millennium-web',
        revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local',
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Cache-Control': 'no-store' },
      }),
    },
  },
});
