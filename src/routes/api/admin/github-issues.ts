import { createFileRoute } from "@tanstack/react-router";

import { requireAdministrator } from "../../../../lib/admin";
import { internalErrorResponse } from "../../../../lib/api-response";
import { githubIssueRepository, GithubIssueError, listRepositoryIssues } from "../../../../lib/feedback/github";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };

/** Read-only and hand-triggered, so a modest hourly budget covers refreshing while triaging. */
const ISSUE_READ_LIMIT = 120;
const ISSUE_READ_WINDOW_SECONDS = 60 * 60;

/**
 * The repository's issues, so administrators can read them without leaving the site.
 *
 * The GitHub token stays on the server; the browser only ever sees the summarised list this returns.
 */
export const Route = createFileRoute("/api/admin/github-issues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json(
              { message: "Not authenticated" },
              { status: 401, headers: noStoreHeaders },
            );
          }
          await requireAdministrator(session.userId);
          const limit = await consumeRateLimit(
            "github-issues-read",
            session.userId,
            ISSUE_READ_LIMIT,
            ISSUE_READ_WINDOW_SECONDS,
          );
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const requested = new URL(request.url).searchParams.get("state");
          const state = requested === "closed" || requested === "all" ? requested : "open";
          return Response.json(
            { issues: await listRepositoryIssues(state), repository: githubIssueRepository(), state },
            { headers: noStoreHeaders },
          );
        } catch (error) {
          if (error instanceof GithubIssueError) {
            return Response.json(
              { message: error.message },
              { status: error.status, headers: noStoreHeaders },
            );
          }
          const status = (error as { status?: unknown })?.status;
          if (
            (error as { name?: unknown })?.name === "AdministratorActionError"
            && typeof status === "number"
          ) {
            return Response.json(
              { message: String((error as { message?: unknown }).message || "Administrator access required.") },
              { status, headers: noStoreHeaders },
            );
          }
          return internalErrorResponse(
            "GitHub issue list failed",
            "The issue list could not be loaded.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
