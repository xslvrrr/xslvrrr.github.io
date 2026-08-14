import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/calendar/unlink')({
  server: {
    handlers: {
      POST: async () => Response.json(
        { success: false, message: 'Google Calendar OAuth has not been ported to TanStack Start yet.' },
        { status: 501 },
      ),
    },
  },
});
