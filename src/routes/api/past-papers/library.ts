import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
  PastPapersError,
} from "../../../../lib/past-papers/http";
import {
  deleteFolder,
  deleteLadder,
  listFolders,
  listLadders,
  saveFolder,
  saveLadder,
} from "../../../../lib/past-papers/repository-library";
import {
  folderCommandSchema,
  folderDeleteCommandSchema,
  ladderCommandSchema,
  ladderDeleteCommandSchema,
} from "../../../../lib/past-papers/schemas";

/**
 * Folders and ladders on one route.
 *
 * They are the same kind of thing from the client's point of view — the student's own arrangement
 * of the catalogue — and the page loads both together on every visit. Splitting them would double
 * the round trips needed to render one sidebar.
 */
export const Route = createFileRoute("/api/past-papers/library")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-library-read",
          limit: 180,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const [folders, ladders] = await Promise.all([
            listFolders(guard.userId),
            listLadders(guard.userId),
          ]);
          return pastPapersSuccessResponse({ folders, ladders });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers library read failed", "Could not load your folders");
        }
      },
      POST: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-library-write",
          limit: 120,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<{ kind?: unknown }>(request, 64 * 1024);
          if (body.kind === "folder") {
            return pastPapersSuccessResponse({
              folder: await saveFolder(guard.userId, folderCommandSchema.parse(body)),
            });
          }
          if (body.kind === "ladder") {
            return pastPapersSuccessResponse({
              ladder: await saveLadder(guard.userId, ladderCommandSchema.parse(body)),
            });
          }
          throw new PastPapersError("PAST_PAPERS_INVALID_INPUT", "Unknown library item.", 400);
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers library write failed", "Could not save that");
        }
      },
      DELETE: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-library-delete",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<{ kind?: unknown }>(request, 4 * 1024);
          if (body.kind === "folder") {
            const command = folderDeleteCommandSchema.parse(body);
            await deleteFolder(guard.userId, command.id, command.deleteContents);
            return pastPapersSuccessResponse({ deleted: true });
          }
          if (body.kind === "ladder") {
            await deleteLadder(guard.userId, ladderDeleteCommandSchema.parse(body).id);
            return pastPapersSuccessResponse({ deleted: true });
          }
          throw new PastPapersError("PAST_PAPERS_INVALID_INPUT", "Unknown library item.", 400);
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers library delete failed", "Could not delete that");
        }
      },
    },
  },
});
