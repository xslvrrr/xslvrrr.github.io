import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import {
  FEEDBACK_APPEAL_MAX_LENGTH,
  FEEDBACK_APPEAL_MIN_LENGTH,
} from "../../../../lib/feedback/options";
import {
  acknowledgeFeedbackSuspension,
  FeedbackActionError,
  submitFeedbackAppeal,
} from "../../../../lib/feedback/reports";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };
const SUSPENSION_BODY_MAX_BYTES = 8 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * What a suspended account can do about its suspension: read the notice, and appeal it once.
 *
 * The single-appeal rule is enforced in the database rather than here, so a repeated request races
 * against a row lock instead of a check-then-write.
 */
export const Route = createFileRoute("/api/feedback/suspension")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json(
              { message: "Not authenticated" },
              { status: 401, headers: noStoreHeaders },
            );
          }
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("feedback-appeal", session.userId, 20, 60 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, SUSPENSION_BODY_MAX_BYTES);
          if (!isRecord(body)) {
            return Response.json(
              { message: "Request is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }

          if (body.action === "acknowledge") {
            await acknowledgeFeedbackSuspension(session.userId);
            return Response.json({ acknowledged: true }, { headers: noStoreHeaders });
          }

          if (body.action === "appeal") {
            const message = typeof body.message === "string" ? body.message.trim() : "";
            if (
              message.length < FEEDBACK_APPEAL_MIN_LENGTH
              || message.length > FEEDBACK_APPEAL_MAX_LENGTH
            ) {
              return Response.json(
                {
                  message: `An appeal needs between ${FEEDBACK_APPEAL_MIN_LENGTH} and ${FEEDBACK_APPEAL_MAX_LENGTH} characters.`,
                },
                { status: 400, headers: noStoreHeaders },
              );
            }
            const result = await submitFeedbackAppeal({ userId: session.userId, message });
            return Response.json({ appeal: result }, { status: 201, headers: noStoreHeaders });
          }

          return Response.json(
            { message: "Request is invalid." },
            { status: 400, headers: noStoreHeaders },
          );
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          if (error instanceof FeedbackActionError) {
            return Response.json(
              { message: error.message },
              { status: error.status, headers: noStoreHeaders },
            );
          }
          return internalErrorResponse(
            "Feedback suspension action failed",
            "That could not be saved.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
