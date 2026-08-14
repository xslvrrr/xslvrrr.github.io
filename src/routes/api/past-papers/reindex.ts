import { createFileRoute } from "@tanstack/react-router";

import { requireAdministrator } from "../../../../lib/admin";
import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
  PastPapersError,
} from "../../../../lib/past-papers/http";
import { createIndexerFetch, indexThsc } from "../../../../lib/past-papers/indexer";
import {
  isSourceEnabled,
  pruneIndexedPapers,
  recordIndexRun,
  upsertIndexedPapers,
} from "../../../../lib/past-papers/repository";
import { THSC_SOURCE_SLUG } from "../../../../lib/past-papers/sources/thsc";
import { PAPER_YEAR_LEVELS, type PaperYearLevel } from "../../../../lib/past-papers/domain";

/**
 * Rebuilds the catalogue from a source.
 *
 * Administrator-only and deliberately manual. A run walks another project's repository for a few
 * minutes; it is not something to trigger from a page load, and it is not something a student
 * should be able to trigger at all.
 *
 * Two gates, and both matter. `requireAdministrator` checks the server-side role, never a cookie
 * or a request field. `isSourceEnabled` checks the source's own row, which is how a source whose
 * licence terms have not been settled stays off even for an administrator — see
 * docs/past-papers-sources.md.
 */
export const Route = createFileRoute("/api/past-papers/reindex")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-reindex",
          limit: 4,
          windowSeconds: 60 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          await requireAdministrator(guard.userId);

          const body = await readJsonBody<{ source?: unknown; yearLevels?: unknown }>(request, 4 * 1024);
          const source = typeof body.source === "string" ? body.source : THSC_SOURCE_SLUG;
          if (source !== THSC_SOURCE_SLUG) {
            throw new PastPapersError("PAST_PAPERS_UNKNOWN_SOURCE", "No indexer for that source.", 400);
          }

          if (!await isSourceEnabled(source)) {
            throw new PastPapersError(
              "PAST_PAPERS_SOURCE_DISABLED",
              "That source is disabled. See docs/past-papers-sources.md before enabling it.",
              409,
            );
          }

          const yearLevels = parseYearLevels(body.yearLevels);

          try {
            const result = await indexThsc({ fetchText: createIndexerFetch(), yearLevels });
            const written = await upsertIndexedPapers(result.papers);
            // Scoped to the year levels this run actually walked, so a partial re-index cannot
            // delete the rest of the catalogue.
            const removed = await pruneIndexedPapers(
              source,
              new Set(result.papers.map((paper) => paper.externalKey)),
              { yearLevels },
            );
            await recordIndexRun(source, result.warnings.length > 0 ? result.warnings.slice(0, 20).join("; ") : null);
            return pastPapersSuccessResponse({
              source,
              indexed: written,
              removed,
              warnings: result.warnings,
            });
          } catch (error: unknown) {
            // Recorded on the source row so a failing run is visible in the admin panel rather
            // than only in the response of whoever happened to trigger it.
            await recordIndexRun(source, error instanceof Error ? error.message.slice(0, 500) : "Unknown failure");
            throw error;
          }
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers reindex failed", "Could not rebuild the index");
        }
      },
    },
  },
});

function parseYearLevels(value: unknown): readonly PaperYearLevel[] {
  if (!Array.isArray(value)) return PAPER_YEAR_LEVELS;
  const requested = value.filter((entry): entry is PaperYearLevel =>
    typeof entry === "string" && (PAPER_YEAR_LEVELS as readonly string[]).includes(entry));
  return requested.length > 0 ? requested : PAPER_YEAR_LEVELS;
}
