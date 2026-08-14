import { describe, expect, it, vi } from "vitest";

import type { StudyCard } from "./domain";
import { StudyServiceError } from "./errors";
import { createStudyRepositoryStub } from "./repository.fixture";
import type { StudyRepository } from "./repository";
import { defaultStudySchedulerParameters } from "./scheduler";
import { StudyService } from "./service";

const USER_ID = "6ec8637f-7d81-4f61-a665-f51788d0c35a";
const DEVICE_ID = "0f6c2f1a-1f9d-4a3e-9f0a-8f5b1d2c3e4f";
const CARD_ID = "b4a7ef83-bdb0-483b-91a8-8d6a1641c3a2";
const FIRST_OPERATION = "d84f5b6d-930f-4cb8-b23a-7ee31ff0246d";
const SECOND_OPERATION = "5a8f3c21-4b7e-4c0d-9a1b-2c3d4e5f6a7b";

function createCard(overrides: Partial<StudyCard> = {}): StudyCard {
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
    ...overrides,
  };
}

function createRepository(card = createCard()): StudyRepository {
  const profile = {
    id: "25c6b024-7f21-4f6a-87a4-04868e728508",
    parametersVersion: "default",
    parameters: defaultStudySchedulerParameters(),
  };

  return createStudyRepositoryStub({
    getBootstrap: vi.fn().mockResolvedValue({ syncCursor: 42 }),
    getCard: vi.fn().mockResolvedValue(card),
    getSchedulerProfile: vi.fn().mockResolvedValue(profile),
    getDeckSchedulerProfile: vi.fn().mockResolvedValue(profile),
    commitReview: vi.fn(async (commit) => ({
      operationId: commit.command.clientOperationId,
      status: "accepted" as const,
      card: commit.afterCard,
      eventId: "dd096e5d-7580-45fd-a003-a5014c74494c",
      preview: commit.preview,
    })),
  });
}

function reviewOperation(clientOperationId: string) {
  return {
    kind: "review" as const,
    command: {
      cardId: CARD_ID,
      clientOperationId,
      expectedScheduleRevision: 0,
      rating: "good" as const,
      reviewedAt: new Date().toISOString(),
    },
  };
}

describe("StudyService.pushSyncBatch", () => {
  it("accepts a queued offline review and reports the account cursor", async () => {
    const repository = createRepository();

    const result = await new StudyService(repository).pushSyncBatch(USER_ID, {
      deviceId: DEVICE_ID,
      operations: [reviewOperation(FIRST_OPERATION)],
    });

    expect(result.cursor).toBe(42);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({ operationId: FIRST_OPERATION, status: "accepted" });
    expect(result.outcomes[0].card?.scheduleRevision).toBe(1);
  });

  it("reports a redelivered operation as duplicate instead of scheduling it twice", async () => {
    const repository = createRepository();
    const operation = reviewOperation(FIRST_OPERATION);
    vi.mocked(repository.findReviewResult).mockResolvedValue({
      result: {
        operationId: FIRST_OPERATION,
        status: "accepted",
        card: createCard({ scheduleRevision: 1 }),
        eventId: "dd096e5d-7580-45fd-a003-a5014c74494c",
        preview: {},
      } as never,
      request: operation.command,
    });

    const result = await new StudyService(repository).pushSyncBatch(USER_ID, {
      deviceId: DEVICE_ID,
      operations: [operation],
    });

    expect(result.outcomes[0].status).toBe("duplicate");
    expect(repository.commitReview).not.toHaveBeenCalled();
  });

  it("keeps processing the batch when one operation conflicts", async () => {
    const repository = createRepository();
    vi.mocked(repository.commitReview)
      .mockRejectedValueOnce(new StudyServiceError("STUDY_CONFLICT", "Schedule changed.", 409))
      .mockResolvedValueOnce({
        operationId: SECOND_OPERATION,
        status: "accepted",
        card: createCard({ scheduleRevision: 1 }),
        eventId: "dd096e5d-7580-45fd-a003-a5014c74494c",
        preview: {},
      } as never);

    const result = await new StudyService(repository).pushSyncBatch(USER_ID, {
      deviceId: DEVICE_ID,
      operations: [reviewOperation(FIRST_OPERATION), reviewOperation(SECOND_OPERATION)],
    });

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["conflict", "accepted"]);
    expect(result.outcomes[0].errorCode).toBe("STUDY_CONFLICT");
  });

  it("marks an unexpected server failure as retryable so the outbox keeps the review", async () => {
    const repository = createRepository();
    vi.mocked(repository.commitReview).mockRejectedValue(new Error("connection reset"));

    const result = await new StudyService(repository).pushSyncBatch(USER_ID, {
      deviceId: DEVICE_ID,
      operations: [reviewOperation(FIRST_OPERATION)],
    });

    expect(result.outcomes[0].status).toBe("retry");
  });

  it("rejects a batch larger than the push limit without applying any operation", async () => {
    const repository = createRepository();
    const operations = Array.from({ length: 51 }, () => reviewOperation(crypto.randomUUID()));

    await expect(
      new StudyService(repository).pushSyncBatch(USER_ID, { deviceId: DEVICE_ID, operations }),
    ).rejects.toMatchObject({ code: "STUDY_INVALID_INPUT" });
    expect(repository.commitReview).not.toHaveBeenCalled();
  });
});
