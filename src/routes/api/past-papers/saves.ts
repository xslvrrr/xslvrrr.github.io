import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
} from "../../../../lib/past-papers/http";
import { listSaves } from "../../../../lib/past-papers/repository";
import { paperSaveCommandSchema, paperUnsaveCommandSchema } from "../../../../lib/past-papers/schemas";
import { savePaper, unsavePaper } from "../../../../lib/past-papers/service";

export const Route = createFileRoute("/api/past-papers/saves")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-save-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          return pastPapersSuccessResponse({ saves: await listSaves(guard.userId) });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers save read failed", "Could not load saved papers");
        }
      },
      // A save is the moment a document is fetched from its publisher, so the limit is tighter
      // than the read limits: this is the only path that spends someone else's bandwidth.
      POST: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-save-write",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 8 * 1024);
          const command = paperSaveCommandSchema.parse(body);
          return pastPapersSuccessResponse(await savePaper(guard.userId, command));
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers save failed", "Could not save that paper");
        }
      },
      DELETE: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-save-delete",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 4 * 1024);
          const command = paperUnsaveCommandSchema.parse(body);
          await unsavePaper(guard.userId, command.paperId);
          return pastPapersSuccessResponse({ removed: true });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers unsave failed", "Could not remove that paper");
        }
      },
    },
  },
});
