import { createFileRoute } from '@tanstack/react-router';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession } from '../../../../lib/start-session';
import { getUserAnnotations, getUserReports, updateUserAnnotations } from '../../../../lib/users';

const MAX_ANNOTATIONS = 2_000;

export const Route = createFileRoute('/api/reports/annotations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) return Response.json({ message: 'Unauthorized' }, { status: 401 });
        const reportId = new URL(request.url).searchParams.get('reportId');
        const annotations = await getUserAnnotations(session.userId);
        return Response.json({ annotations: reportId ? annotations.filter((item: any) => item?.reportId === reportId) : annotations });
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) return Response.json({ message: 'Unauthorized' }, { status: 401 });
        try {
          const body = await readJsonBody<{ reportId?: unknown; annotations?: unknown }>(request, 2 * 1024 * 1024);
          if (typeof body.reportId !== 'string' || !Array.isArray(body.annotations) || body.annotations.length > MAX_ANNOTATIONS) {
            return Response.json({ message: 'Invalid annotations' }, { status: 400 });
          }
          const reports = await getUserReports(session.userId);
          if (!reports.some((report: any) => report?.id === body.reportId)) {
            return Response.json({ message: 'Report not found' }, { status: 404 });
          }
          const existing = await getUserAnnotations(session.userId);
          const scoped = body.annotations.map((item: any) => ({ ...item, reportId: body.reportId }));
          const saved = await updateUserAnnotations(session.userId, [
            ...existing.filter((item: any) => item?.reportId !== body.reportId),
            ...scoped,
          ]);
          return Response.json({ annotations: saved.filter((item: any) => item?.reportId === body.reportId) });
        } catch (error) {
          return requestBodyErrorResponse(error) || Response.json({ message: 'Failed to save annotations' }, { status: 500 });
        }
      },
    },
  },
});
