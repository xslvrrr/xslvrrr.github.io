import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { getUserReports } from '../../../../lib/users';
import { reportFileName } from '../../../../lib/report-names';
import { isOwnedReportPath, REPORT_BUCKET } from '../../../../lib/report-pdfs';
import { supabaseAdmin } from '../../../../lib/supabase';

export const Route = createFileRoute('/api/reports/pdf')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) return Response.json({ message: 'Unauthorized' }, { status: 401 });
        const reportId = new URL(request.url).searchParams.get('id');
        if (!reportId) return Response.json({ message: 'Missing report id' }, { status: 400 });

        const reports = await getUserReports(session.userId);
        const report = reports.find((entry: any) => entry?.id === reportId);
        if (!report?.storagePath || !isOwnedReportPath(session.userId, report.storagePath)) {
          return Response.json({ message: 'Stored report not found' }, { status: 404 });
        }

        const { data, error } = await supabaseAdmin.storage.from(REPORT_BUCKET).download(report.storagePath);
        if (error || !data) return Response.json({ message: 'Stored report unavailable' }, { status: 404 });
        return new Response(await data.arrayBuffer(), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${reportFileName(report)}"`,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      },
    },
  },
});
