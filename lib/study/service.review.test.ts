import { describe, expect, it, vi } from "vitest";

import type { StudyCard, StudyReviewResult } from "./domain";
import { createStudyRepositoryStub } from "./repository.fixture";
import type { StudyRepository } from "./repository";
import { defaultStudySchedulerParameters } from "./scheduler";
import { StudyService } from "./service";

const USER_ID = "6ec8637f-7d81-4f61-a665-f51788d0c35a";
const CARD_ID = "b4a7ef83-bdb0-483b-91a8-8d6a1641c3a2";
const OPERATION_ID = "d84f5b6d-930f-4cb8-b23a-7ee31ff0246d";

function createCard(): StudyCard {
  return {
    id: CARD_ID,
    userId: USER_ID,
    deckId: "a7f51bdf-8ba3-41f0-ac1f-33f014ac0a36",
    noteId: "40acbf0f-2ff3-4a21-8b34-027876689294",
    templateKey: "forward",
    ordinal: 0,
    isSuspended: false,
    isBuried: false,
    state: "new",
    dueAt: "2026-08-02T10:00:00.000Z",
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
    schedulerName: "fsrs",
    schedulerVersion: "6",
    parametersVersion: "default",
    schedulerMetadata: {},
    scheduleRevision: 0,
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
    deletedAt: null,
  };
}

function createRepository(card = createCard()): StudyRepository {
  const profile = {
    id: "25c6b024-7f21-4f6a-87a4-04868e728508",
    parametersVersion: "default",
    parameters: defaultStudySchedulerParameters(),
  };

  return createStudyRepositoryStub({
    getCard: vi.fn().mockResolvedValue(card),
    getSchedulerProfile: vi.fn().mockResolvedValue(profile),
    getDeckSchedulerProfile: vi.fn().mockResolvedValue(profile),
    commitReview: vi.fn(async (commit) => ({
      operationId: commit.command.clientOperationId,
      status: "accepted" as const,
      card: commit.afterCard,
      eventId: commit.eventId,
      preview: new (await import("./scheduler")).FsrsStudyScheduler().preview(
        commit.transition.before,
        new Date(commit.command.reviewedAt),
      ),
    })),
  });
}

const command = {
  cardId: CARD_ID,
  clientOperationId: OPERATION_ID,
  expectedScheduleRevision: 0,
  rating: "good",
  reviewedAt: "2026-08-02T10:00:00.000Z",
} as const;

describe("StudyService.reviewCard", () => {
  it("commits one authoritative scheduling transition", async () => {
    const repository = createRepository();
    const result = await new StudyService(repository).reviewCard(USER_ID, command);

    expect(result.status).toBe("accepted");
    expect(result.card.scheduleRevision).toBe(1);
    expect(repository.commitReview).toHaveBeenCalledOnce();
  });

  it("returns duplicate result without loading or scheduling card again", async () => {
    const repository = createRepository();
    const duplicate = {
      operationId: OPERATION_ID,
      status: "accepted",
      card: createCard(),
      eventId: "dd096e5d-7580-45fd-a003-a5014c74494c",
      preview: {},
    } as unknown as StudyReviewResult;
    vi.mocked(repository.findReviewResult).mockResolvedValue({ result: duplicate, request: command });

    const result = await new StudyService(repository).reviewCard(USER_ID, command);

    expect(result.status).toBe("duplicate");
    expect(repository.getCard).not.toHaveBeenCalled();
    expect(repository.commitReview).not.toHaveBeenCalled();
  });

  it("rejects stale schedule revisions without committing", async () => {
    const repository = createRepository({ ...createCard(), scheduleRevision: 2 });

    await expect(new StudyService(repository).reviewCard(USER_ID, command)).rejects.toMatchObject({
      code: "STUDY_CONFLICT",
      status: 409,
    });
    expect(repository.commitReview).not.toHaveBeenCalled();
  });
});
