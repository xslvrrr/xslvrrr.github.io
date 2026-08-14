import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

/** One review command plus its envelope stays well under 4 KB; the batch cap bounds the rest. */
const MAX_PUSH_BODY_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/study/sync")({
  server: {
    handlers: {
      // Cursor pull. `reset=1` returns a bounded full snapshot instead of incremental changes.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-sync-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const service = new StudyService(new SupabaseStudyRepository());
          if (url.searchParams.get("reset") === "1") {
            return studySuccessResponse({ snapshot: await service.getSyncSnapshot(guard.userId) });
          }
          const page = await service.pullSyncChanges(guard.userId, {
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
          });
          return studySuccessResponse({ page });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study sync pull failed", "Failed to sync Study data");
        }
      },

      // Outbox push. Each operation reports its own outcome so one conflict cannot block the batch.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-sync-write",
          limit: 120,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, MAX_PUSH_BODY_BYTES);
          const service = new StudyService(new SupabaseStudyRepository());
          const result = await service.pushSyncBatch(guard.userId, body);
          return studySuccessResponse(result);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study sync push failed", "Failed to upload offline reviews");
        }
      },
    },
  },
});
