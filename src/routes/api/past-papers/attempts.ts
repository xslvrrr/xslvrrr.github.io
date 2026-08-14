import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
} from "../../../../lib/past-papers/http";
import { adjustPaperCounter } from "../../../../lib/past-papers/repository";
import { finishAttempt, listAttempts, startAttempt } from "../../../../lib/past-papers/repository-library";
import { attemptFinishCommandSchema, attemptStartCommandSchema } from "../../../../lib/past-papers/schemas";
import { refreshDifficulty } from "../../../../lib/past-papers/service";

export const Route = createFileRoute("/api/past-papers/attempts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-attempt-read",
          limit: 180,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          return pastPapersSuccessResponse({ attempts: await listAttempts(guard.userId) });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper attempt read failed", "Could not load your attempts");
        }
      },
      POST: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-attempt-start",
          limit: 60,
          windowSeconds: 60 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const command = attemptStartCommandSchema.parse(await readJsonBody<unknown>(request, 4 * 1024));
          const attempt = await startAttempt(guard.userId, command);
          await adjustPaperCounter(command.paperId, "attempt_count", 1);
          return pastPapersSuccessResponse({ attempt });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper attempt start failed", "Could not start that attempt");
        }
      },
      PATCH: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-attempt-finish",
          limit: 120,
          windowSeconds: 60 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const command = attemptFinishCommandSchema.parse(await readJsonBody<unknown>(request, 8 * 1024));
          const attempt = await finishAttempt(guard.userId, command);
          // Finishing an attempt is the only event that moves a paper's cohort signal, so it is
          // also the only point at which recomputing its difficulty can change anything.
          await refreshDifficulty(attempt.paperId).catch(() => undefined);
          return pastPapersSuccessResponse({ attempt });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper attempt finish failed", "Could not save that attempt");
        }
      },
    },
  },
});
