import { createFileRoute } from "@tanstack/react-router";

import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
} from "../../../../lib/past-papers/http";
import { readDocument } from "../../../../lib/past-papers/service";

export const Route = createFileRoute("/api/past-papers/pdf")({
  server: {
    handlers: {
      /**
       * Streams a saved paper's cached copy.
       *
       * Only ever the caller's own copy: `readDocument` builds the storage path from the session
       * user id, so a paper id belonging to someone else's save resolves to a path that does not
       * exist rather than to their file.
       */
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-pdf",
          limit: 240,
          windowSeconds: 5 * 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const paperId = new URL(request.url).searchParams.get("id");
          if (!paperId) return Response.json({ success: false, message: "Missing paper" }, { status: 400 });

          const blob = await readDocument(guard.userId, paperId);
          return new Response(blob, {
            headers: {
              "Content-Type": "application/pdf",
              // Private: the bytes are public documents, but the fact that this student saved this
              // paper is not, and a shared cache keyed on the URL alone would leak it.
              "Cache-Control": "private, max-age=3600",
              "Content-Disposition": "inline",
              "X-Content-Type-Options": "nosniff",
              Vary: "Cookie",
            },
          });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper pdf read failed", "Could not open that paper");
        }
      },
    },
  },
});
