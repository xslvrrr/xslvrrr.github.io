import { createFileRoute } from "@tanstack/react-router";

import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
} from "../../../../lib/past-papers/http";
import { browseQuerySchema } from "../../../../lib/past-papers/schemas";
import { browse } from "../../../../lib/past-papers/service";
import { loadStudentContext } from "../../../../lib/past-papers/student-context";

export const Route = createFileRoute("/api/past-papers/browse")({
  server: {
    handlers: {
      // Read-only, but rate limited all the same: each call fans out into several catalogue reads
      // plus the student's saves and attempts.
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-browse",
          limit: 180,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const query = browseQuerySchema.parse(Object.fromEntries(url.searchParams));
          const student = await loadStudentContext(guard.userId);
          return pastPapersSuccessResponse(await browse(guard.userId, query, student));
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers browse failed", "Could not load past papers");
        }
      },
    },
  },
});
