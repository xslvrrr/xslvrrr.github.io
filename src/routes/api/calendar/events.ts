import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/calendar/events')({
  server: {
    handlers: {
      GET: async () => Response.json({ message: 'Google Calendar OAuth has not been ported to TanStack Start yet.' }, { status: 501 }),
    },
  },
});
