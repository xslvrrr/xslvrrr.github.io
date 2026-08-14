import { createFileRoute } from "@tanstack/react-router";

import {
  guardStudyRequest,
  studyFailureResponse,
  studyNoStoreHeaders,
} from "../../../../lib/study/http";
import { StudyImportService } from "../../../../lib/study/import-service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

export const Route = createFileRoute("/api/study/export")({
  server: {
    handlers: {
      // Downloads the account's own Study content, and its review history when asked for.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-export-read",
          limit: 10,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const service = new StudyImportService(new SupabaseStudyRepository());
          const payload = await service.exportLibrary(
            guard.userId,
            url.searchParams.get("history") !== "0",
          );
          const date = payload.exportedAt.slice(0, 10);

          return new Response(JSON.stringify(payload, null, 2), {
            headers: {
              ...studyNoStoreHeaders,
              "Content-Disposition": `attachment; filename="millennium-study-${date}.json"`,
              "Content-Type": "application/json; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study export failed", "Failed to export flashcards");
        }
      },
    },
  },
});
