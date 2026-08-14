import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
} from "../../../../lib/past-papers/http";
import { loadAnnotations, saveAnnotations } from "../../../../lib/past-papers/repository";
import { annotationsCommandSchema } from "../../../../lib/past-papers/schemas";

export const Route = createFileRoute("/api/past-papers/annotations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-annotation-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const paperId = new URL(request.url).searchParams.get("paperId");
          if (!paperId) return Response.json({ success: false, message: "Missing paper" }, { status: 400 });
          return pastPapersSuccessResponse({ annotations: await loadAnnotations(guard.userId, paperId) });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper annotation read failed", "Could not load annotations");
        }
      },
      // Debounced by the viewer, so the limit allows sustained drawing without allowing a loop.
      PUT: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-annotation-write",
          limit: 240,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 4 * 1024 * 1024);
          const command = annotationsCommandSchema.parse(body);
          await saveAnnotations(guard.userId, command.paperId, command.annotations);
          return pastPapersSuccessResponse({ saved: true });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper annotation write failed", "Could not save annotations");
        }
      },
    },
  },
});
