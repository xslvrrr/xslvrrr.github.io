import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
  PastPapersError,
} from "../../../../lib/past-papers/http";
import { findPapersByIds, listSaves, upsertSave } from "../../../../lib/past-papers/repository";
import {
  findPublicationByCode,
  listLadders,
  listPublications,
  publish,
  revokePublication,
  saveFolder,
} from "../../../../lib/past-papers/repository-library";
import { publishCommandSchema, redeemCommandSchema, revokeCommandSchema } from "../../../../lib/past-papers/schemas";
import { normaliseShareCode, type SharedPayload } from "../../../../lib/past-papers/sharing";

export const Route = createFileRoute("/api/past-papers/share")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-share-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          return pastPapersSuccessResponse({ publications: await listPublications(guard.userId) });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers share read failed", "Could not load share codes");
        }
      },

      /**
       * Publishes a folder or ladder, or redeems someone else's code.
       *
       * Redeeming is the higher-risk verb here — it is the only path that acts on a credential
       * supplied by a stranger — so it gets its own, much tighter bucket below rather than sharing
       * the publish allowance. Guessing a twenty-character code is already impractical; rate
       * limiting removes the option entirely.
       */
      POST: async ({ request }) => {
        const body = await readJsonBody<{ action?: unknown }>(request, 32 * 1024).catch(() => null);
        if (!body) return Response.json({ success: false, message: "Invalid request" }, { status: 400 });

        const redeeming = body.action === "redeem";
        const guard = await guardPastPapersRequest(request, {
          bucket: redeeming ? "past-papers-share-redeem" : "past-papers-share-publish",
          limit: redeeming ? 20 : 40,
          windowSeconds: 60 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          return redeeming
            ? await handleRedeem(guard.userId, body)
            : await handlePublish(guard.userId, body);
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers share failed", "Could not share that");
        }
      },

      DELETE: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-share-revoke",
          limit: 60,
          windowSeconds: 60 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const command = revokeCommandSchema.parse(await readJsonBody<unknown>(request, 4 * 1024));
          await revokePublication(guard.userId, command.publicationId);
          return pastPapersSuccessResponse({ revoked: true });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past papers share revoke failed", "Could not revoke that code");
        }
      },
    },
  },
});

/**
 * Snapshots what is being shared.
 *
 * The papers are captured now rather than resolved at redemption time, so a recipient gets what
 * the sender meant to send. The alternative — a live view of the folder — lets an owner change
 * what a stranger already holds a link to, in either direction.
 */
async function handlePublish(userId: string, body: unknown): Promise<Response> {
  const command = publishCommandSchema.parse(body);

  const payload: SharedPayload = command.kind === "folder"
    ? await snapshotFolder(userId, command.folderId!)
    : await snapshotLadder(userId, command.ladderId!);

  if (payload.papers.length === 0) {
    throw new PastPapersError("PAST_PAPERS_EMPTY_SHARE", "There is nothing in there to share yet.", 400);
  }

  return pastPapersSuccessResponse({
    publication: await publish(userId, {
      kind: command.kind,
      folderId: command.folderId,
      ladderId: command.ladderId,
      title: command.title,
      description: command.description,
      payload,
    }),
  });
}

async function snapshotFolder(userId: string, folderId: string): Promise<SharedPayload> {
  const saves = (await listSaves(userId)).filter((save) => save.folderId === folderId);
  const papers = await findPapersByIds(saves.map((save) => save.paperId));

  return {
    kind: "folder",
    papers: papers.map((paper, index) => ({
      paperId: paper.id,
      title: paper.title,
      subject: paper.subject,
      year: paper.year,
      school: paper.school,
      position: index,
      targetMinutes: null,
      note: "",
    })),
  };
}

async function snapshotLadder(userId: string, ladderId: string): Promise<SharedPayload> {
  const ladder = (await listLadders(userId)).find((entry) => entry.id === ladderId);
  if (!ladder) throw new PastPapersError("PAST_PAPER_LADDER_NOT_FOUND", "That ladder no longer exists.", 404);

  const papers = new Map((await findPapersByIds(ladder.steps.map((step) => step.paperId)))
    .map((paper) => [paper.id, paper]));

  return {
    kind: "ladder",
    papers: ladder.steps.flatMap((step) => {
      const paper = papers.get(step.paperId);
      if (!paper) return [];
      return [{
        paperId: paper.id,
        title: paper.title,
        subject: paper.subject,
        year: paper.year,
        school: paper.school,
        position: step.position,
        targetMinutes: step.targetMinutes,
        note: step.note,
      }];
    }),
  };
}

/**
 * Redeems a code into the recipient's own library.
 *
 * Saves are created without downloading. A code can carry a hundred papers, and fetching all of
 * them because someone pasted a link would spend a publisher's bandwidth on documents nobody has
 * opened — the student downloads each one when they actually reach for it.
 */
async function handleRedeem(userId: string, body: unknown): Promise<Response> {
  const command = redeemCommandSchema.parse(body);
  const publication = await findPublicationByCode(normaliseShareCode(command.shareCode));

  // A revoked or unknown code is reported identically, so a code cannot be probed for existence.
  if (!publication) {
    throw new PastPapersError("PAST_PAPER_SHARE_NOT_FOUND", "That share code is not valid.", 404);
  }

  const folderId = command.folderId ?? (await saveFolder(userId, {
    name: publication.title.slice(0, 80),
    parentId: null,
    color: "",
    position: 0,
  })).id;

  let added = 0;
  for (const shared of publication.payload.papers) {
    await upsertSave(userId, { paperId: shared.paperId, folderId, note: shared.note });
    added += 1;
  }

  return pastPapersSuccessResponse({
    added,
    folderId,
    title: publication.title,
    description: publication.description,
  });
}
