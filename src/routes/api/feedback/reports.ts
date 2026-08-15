import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import {
  FeedbackActionError,
  loadUserFeedbackOverview,
  markFeedbackNoticesSeen,
  submitFeedbackReport,
} from "../../../../lib/feedback/reports";
import {
  buildFeedbackSubmission,
  EMPTY_FEEDBACK_DRAFT,
  isBugCategory,
  isFeedbackKind,
  isSuggestionType,
  type FeedbackDraft,
} from "../../../../lib/feedback/options";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };
const FEEDBACK_BODY_MAX_BYTES = 16 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reports are typed by hand, so a handful an hour is generous and still caps a scripted flood. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_SECONDS = 60 * 60;

/** The dashboard re-reads the overview every 60 seconds; this clears that with room to spare. */
const OVERVIEW_READ_LIMIT = 180;
const OVERVIEW_READ_WINDOW_SECONDS = 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Rebuilds the dialog's draft from the request body and runs it through the same completeness rules
 * the send button uses, so a hand-crafted request cannot store a shape the review dialog cannot show.
 */
function draftFromBody(body: Record<string, unknown>): FeedbackDraft {
  return {
    ...EMPTY_FEEDBACK_DRAFT,
    kind: isFeedbackKind(body.kind) ? body.kind : null,
    area: text(body.area),
    bugCategory: isBugCategory(body.bugCategory) ? body.bugCategory : null,
    bugCategoryOther: text(body.bugCategoryOther),
    suggestionType: isSuggestionType(body.suggestionType) ? body.suggestionType : null,
    details: text(body.details),
  };
}

function sessionUserId(request: Request): string | Response {
  const session = readStartSession(request);
  if (!session.loggedIn || !session.userId) {
    return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
  }
  return session.userId;
}

function feedbackErrorResponse(error: unknown): Response | null {
  if (!(error instanceof FeedbackActionError)) return null;
  return Response.json({ message: error.message }, { status: error.status, headers: noStoreHeaders });
}

export const Route = createFileRoute("/api/feedback/reports")({
  server: {
    handlers: {
      /** The reporter's own history, suspension state, and anything an administrator wrote back. */
      GET: async ({ request }) => {
        try {
          const userId = sessionUserId(request);
          if (userId instanceof Response) return userId;
          const limit = await consumeRateLimit(
            "feedback-overview-read",
            userId,
            OVERVIEW_READ_LIMIT,
            OVERVIEW_READ_WINDOW_SECONDS,
          );
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          return Response.json(await loadUserFeedbackOverview(userId), { headers: noStoreHeaders });
        } catch (error) {
          const feedbackError = feedbackErrorResponse(error);
          if (feedbackError) return feedbackError;
          return internalErrorResponse(
            "Feedback overview read failed",
            "Your reports could not be loaded.",
            error,
            noStoreHeaders,
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = sessionUserId(request);
          if (userId instanceof Response) return userId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit(
            "feedback-submit",
            userId,
            SUBMIT_LIMIT,
            SUBMIT_WINDOW_SECONDS,
          );
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, FEEDBACK_BODY_MAX_BYTES);
          if (!isRecord(body)) {
            return Response.json(
              { message: "Report request is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }

          const submission = buildFeedbackSubmission(draftFromBody(body));
          if (!submission) {
            return Response.json(
              { message: "Every question needs an answer before a report can be sent." },
              { status: 400, headers: noStoreHeaders },
            );
          }

          const result = await submitFeedbackReport({ userId, submission });
          return Response.json({ report: result }, { status: 201, headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const feedbackError = feedbackErrorResponse(error);
          if (feedbackError) return feedbackError;
          return internalErrorResponse(
            "Feedback report submission failed",
            "Your report could not be sent.",
            error,
            noStoreHeaders,
          );
        }
      },

      /** Records that outcomes have been shown, so their toasts are not raised again. */
      PATCH: async ({ request }) => {
        try {
          const userId = sessionUserId(request);
          if (userId instanceof Response) return userId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;

          const body = await readJsonBody<unknown>(request, FEEDBACK_BODY_MAX_BYTES);
          if (!isRecord(body)) {
            return Response.json(
              { message: "Request is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }

          const reportIds = Array.isArray(body.reportIds)
            ? body.reportIds.filter((id): id is string => typeof id === "string" && uuidPattern.test(id))
            : [];
          await markFeedbackNoticesSeen({
            userId,
            reportIds,
            markSuspension: body.markSuspension === true,
            markAppeal: body.markAppeal === true,
          });
          return Response.json({ ok: true }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const feedbackError = feedbackErrorResponse(error);
          if (feedbackError) return feedbackError;
          return internalErrorResponse(
            "Feedback notice acknowledgement failed",
            "That could not be saved.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
