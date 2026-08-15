import { createFileRoute } from "@tanstack/react-router";

import { requireAdministrator } from "../../../../lib/admin";
import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import {
  parseSuspensionDuration,
  suspensionExpiryFrom,
} from "../../../../lib/feedback/duration";
import {
  createFeedbackIssue,
  githubIssueRepository,
  GithubIssueError,
} from "../../../../lib/feedback/github";
import {
  FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH,
  FEEDBACK_SUSPENSION_REASON_MAX_LENGTH,
} from "../../../../lib/feedback/options";
import {
  clearFeedbackSuspension,
  FeedbackActionError,
  listFeedbackAppeals,
  listFeedbackSuspensions,
  loadFeedbackQueue,
  readPendingFeedbackReport,
  resolveFeedbackAppeal,
  resolveFeedbackReport,
  setFeedbackSuspension,
} from "../../../../lib/feedback/reports";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };
const FEEDBACK_ADMIN_BODY_MAX_BYTES = 8 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The dashboard polls this every 30 seconds, so the read budget has to clear that comfortably. */
const QUEUE_READ_LIMIT = 240;
const QUEUE_READ_WINDOW_SECONDS = 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function invalidRequest(message: string): Response {
  return Response.json({ message }, { status: 400, headers: noStoreHeaders });
}

async function administratorUserId(request: Request): Promise<string | Response> {
  const session = readStartSession(request);
  if (!session.loggedIn || !session.userId) {
    return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
  }
  await requireAdministrator(session.userId);
  return session.userId;
}

function actionErrorResponse(error: unknown): Response | null {
  if (error instanceof FeedbackActionError || error instanceof GithubIssueError) {
    return Response.json({ message: error.message }, { status: error.status, headers: noStoreHeaders });
  }
  // `requireAdministrator` raises the administrator error type from lib/admin.
  const status = (error as { status?: unknown })?.status;
  if ((error as { name?: unknown })?.name === "AdministratorActionError" && typeof status === "number") {
    return Response.json(
      { message: String((error as { message?: unknown }).message || "Administrator access required.") },
      { status, headers: noStoreHeaders },
    );
  }
  return null;
}

/** Trims an optional free-text field written by an administrator, or null when it was left blank. */
function optionalMessage(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** Resolves a typed duration into an expiry instant, or a 400 explaining the shorthand. */
function suspensionExpiry(value: unknown): Date | null | Response {
  if (typeof value !== "string") {
    return invalidRequest("A suspension length is required.");
  }
  const duration = parseSuspensionDuration(value);
  if (!duration) {
    return invalidRequest(
      "Enter a length like 12h, 3d, 2w, 6m, 1y, or perm for a permanent suspension.",
    );
  }
  return suspensionExpiryFrom(duration, new Date());
}

export const Route = createFileRoute("/api/admin/feedback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const limit = await consumeRateLimit(
            "feedback-admin-read",
            actorUserId,
            QUEUE_READ_LIMIT,
            QUEUE_READ_WINDOW_SECONDS,
          );
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const [queue, suspensions, appeals] = await Promise.all([
            loadFeedbackQueue(actorUserId),
            listFeedbackSuspensions(actorUserId),
            listFeedbackAppeals(actorUserId),
          ]);
          return Response.json(
            { queue, suspensions, appeals, github: { repository: githubIssueRepository() } },
            { headers: noStoreHeaders },
          );
        } catch (error) {
          const actionError = actionErrorResponse(error);
          if (actionError) return actionError;
          return internalErrorResponse(
            "Feedback queue read failed",
            "The report queue could not be loaded.",
            error,
            noStoreHeaders,
          );
        }
      },

      /** Accepts or dismisses one report, with the follow-up the review dialog asked about. */
      POST: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("feedback-admin-write", actorUserId, 120, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, FEEDBACK_ADMIN_BODY_MAX_BYTES);
          if (
            !isRecord(body)
            || typeof body.reportId !== "string"
            || !uuidPattern.test(body.reportId)
            || (body.status !== "accepted" && body.status !== "dismissed")
          ) {
            return invalidRequest("Review request is invalid.");
          }
          const status = body.status;
          const report = await readPendingFeedbackReport(body.reportId);

          // Suspending is only offered alongside a dismissal, and only when the reporter still
          // exists — a deleted account leaves the report but nothing to suspend.
          let expiresAt: Date | null = null;
          const suspending = status === "dismissed" && body.suspensionDuration !== undefined;
          if (suspending) {
            if (!report.reporter.id) {
              return invalidRequest("This report has no account left to suspend.");
            }
            const expiry = suspensionExpiry(body.suspensionDuration);
            if (expiry instanceof Response) return expiry;
            expiresAt = expiry;
          }

          // The issue is created before the report is resolved so a GitHub failure leaves the report
          // in the queue instead of accepting it with no issue behind it.
          let issue: { number: number; url: string } | null = null;
          if (status === "accepted" && body.createGithubIssue === true) {
            issue = await createFeedbackIssue(report);
          }

          const result = await resolveFeedbackReport({
            actorUserId,
            reportId: report.id,
            status,
            githubIssueNumber: issue?.number ?? null,
            githubIssueUrl: issue?.url ?? null,
            adminMessage: optionalMessage(body.adminMessage, FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH),
          });

          if (suspending && report.reporter.id) {
            await setFeedbackSuspension({
              actorUserId,
              targetUserId: report.reporter.id,
              expiresAt,
              reason: optionalMessage(body.suspensionReason, FEEDBACK_SUSPENSION_REASON_MAX_LENGTH),
            });
          }

          return Response.json({ result, issue }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const actionError = actionErrorResponse(error);
          if (actionError) return actionError;
          return internalErrorResponse(
            "Feedback review failed",
            "The report could not be reviewed.",
            error,
            noStoreHeaders,
          );
        }
      },

      /** Suspension management from the administrator page: extend, re-suspend, or revoke. */
      PATCH: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("feedback-admin-write", actorUserId, 120, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, FEEDBACK_ADMIN_BODY_MAX_BYTES);
          if (!isRecord(body) || typeof body.userId !== "string" || !uuidPattern.test(body.userId)) {
            return invalidRequest("Suspension request is invalid.");
          }

          if (body.action === "revoke") {
            await clearFeedbackSuspension({ actorUserId, targetUserId: body.userId });
            return Response.json({ revoked: body.userId }, { headers: noStoreHeaders });
          }

          const expiry = suspensionExpiry(body.duration);
          if (expiry instanceof Response) return expiry;
          const suspension = await setFeedbackSuspension({
            actorUserId,
            targetUserId: body.userId,
            expiresAt: expiry,
            reason: optionalMessage(body.reason, FEEDBACK_SUSPENSION_REASON_MAX_LENGTH),
          });
          return Response.json({ suspension }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const actionError = actionErrorResponse(error);
          if (actionError) return actionError;
          return internalErrorResponse(
            "Feedback suspension update failed",
            "The suspension could not be updated.",
            error,
            noStoreHeaders,
          );
        }
      },

      /** Answers a suspension appeal. Accepting lifts the suspension immediately. */
      PUT: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("feedback-admin-write", actorUserId, 120, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, FEEDBACK_ADMIN_BODY_MAX_BYTES);
          if (
            !isRecord(body)
            || typeof body.userId !== "string"
            || !uuidPattern.test(body.userId)
            || (body.status !== "accepted" && body.status !== "declined")
          ) {
            return invalidRequest("Appeal decision is invalid.");
          }

          const appeal = await resolveFeedbackAppeal({
            actorUserId,
            targetUserId: body.userId,
            status: body.status,
            response: optionalMessage(body.response, FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH),
          });
          return Response.json({ appeal }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const actionError = actionErrorResponse(error);
          if (actionError) return actionError;
          return internalErrorResponse(
            "Feedback appeal review failed",
            "The appeal could not be answered.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
