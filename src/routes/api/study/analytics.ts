import { createFileRoute } from "@tanstack/react-router";

import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

export const Route = createFileRoute("/api/study/analytics")({
  server: {
    handlers: {
      // Counts, timings, and scheduling state only. No card text ever leaves through this route.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-analytics-read",
          limit: 60,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const service = new StudyService(new SupabaseStudyRepository());
          const analytics = await service.getAnalytics(guard.userId, {
            historyDays: url.searchParams.get("historyDays") ?? undefined,
            forecastDays: url.searchParams.get("forecastDays") ?? undefined,
          });
          return studySuccessResponse(analytics);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study analytics read failed", "Failed to load Study statistics");
        }
      },
    },
  },
});
