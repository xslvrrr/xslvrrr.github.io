import { createFileRoute } from '@tanstack/react-router';

function googleCalendarUnavailable() {
  return Response.json(
    { message: 'Google Calendar OAuth has not been ported to TanStack Start yet.' },
    { status: 501 },
  );
}

export const Route = createFileRoute('/api/calendar/event')({
  server: {
    handlers: {
      PATCH: async () => googleCalendarUnavailable(),
      DELETE: async () => googleCalendarUnavailable(),
    },
  },
});
