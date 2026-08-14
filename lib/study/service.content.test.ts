import { describe, expect, it, vi } from "vitest";

import { createStudyRepositoryStub } from "./repository.fixture";
import type { StudyRepository } from "./repository";
import { defaultStudySchedulerParameters } from "./scheduler";
import { StudyService } from "./service";

const USER_ID = "6ec8637f-7d81-4f61-a665-f51788d0c35a";
const DECK_ID = "a7f51bdf-8ba3-41f0-ac1f-33f014ac0a36";
const NOTE_ID = "40acbf0f-2ff3-4a21-8b34-027876689294";
const EVENT_ID = "dd096e5d-7580-45fd-a003-a5014c74494c";
const OPERATION_ID = "d84f5b6d-930f-4cb8-b23a-7ee31ff0246d";

const deckSummary = {
  id: DECK_ID,
  title: "Biology",
  description: "Cells",
  pinned: false,
  revision: 1,
  cardCount: 1,
  dueCount: 1,
  newCount: 1,
  updatedAt: "2026-08-02T10:00:00.000Z",
};

function createRepository(): StudyRepository {
  return createStudyRepositoryStub({
    listDecks: vi.fn().mockResolvedValue([deckSummary]),
    getDeckSchedulerProfile: vi.fn().mockResolvedValue({
      id: "25c6b024-7f21-4f6a-87a4-04868e728508",
      parametersVersion: "fsrs-test",
      parameters: defaultStudySchedulerParameters(),
    }),
    saveDeck: vi.fn().mockResolvedValue(deckSummary),
    deleteDeck: vi.fn().mockResolvedValue(undefined),
    saveNote: vi.fn().mockResolvedValue(deckSummary),
    deleteNote: vi.fn().mockResolvedValue(deckSummary),
    getDeckContents: vi.fn().mockResolvedValue({ notes: [], nextCursor: null }),
    getReviewQueue: vi.fn().mockResolvedValue([]),
    commitUndo: vi.fn(async (_userId, commit) => ({
      status: "accepted" as const,
      operationId: commit.command.clientOperationId,
      eventId: commit.undoEventId,
      targetEventId: commit.command.targetEventId,
      card: {} as never,
    })),
  });
}

describe("StudyService content commands", () => {
  it("derives card templates and server-owned initial scheduling state", async () => {
    const repository = createRepository();

    await new StudyService(repository).saveNote(USER_ID, {
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: "Mitosis?", answer: "Cell division" },
    });

    expect(repository.saveNote).toHaveBeenCalledOnce();
    const commit = vi.mocked(repository.saveNote).mock.calls[0][1];
    expect(commit.templates).toEqual([
      { cardId: expect.any(String), templateKey: "forward", ordinal: 0 },
    ]);
    expect(commit.initialState.state).toBe("new");
    expect(commit.initialState.repetitions).toBe(0);
    expect(commit.schedulerName).toBe("fsrs");
    expect(commit.parametersVersion).toBe("fsrs-test");
  });

  it("rejects client-authored scheduling fields on note commands", async () => {
    const repository = createRepository();

    await expect(new StudyService(repository).saveNote(USER_ID, {
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: "Mitosis?", answer: "Cell division" },
      dueAt: "2099-01-01T00:00:00.000Z",
    })).rejects.toMatchObject({ code: "STUDY_INVALID_INPUT", status: 400 });
    expect(repository.saveNote).not.toHaveBeenCalled();
  });

  it("requires exactly one delete target", async () => {
    const repository = createRepository();
    const service = new StudyService(repository);

    await expect(service.deleteContent(USER_ID, { deckId: DECK_ID, noteId: NOTE_ID }))
      .rejects.toMatchObject({ code: "STUDY_INVALID_INPUT" });
    await expect(service.deleteContent(USER_ID, {})).rejects.toMatchObject({
      code: "STUDY_INVALID_INPUT",
    });

    await service.deleteContent(USER_ID, { deckId: DECK_ID });
    expect(repository.deleteDeck).toHaveBeenCalledWith(USER_ID, DECK_ID);
  });

  it("commits undo with a server-generated compensating event ID", async () => {
    const repository = createRepository();

    const result = await new StudyService(repository).undoReview(USER_ID, {
      targetEventId: EVENT_ID,
      clientOperationId: OPERATION_ID,
    });

    expect(result.targetEventId).toBe(EVENT_ID);
    const commit = vi.mocked(repository.commitUndo).mock.calls[0][1];
    expect(commit.undoEventId).not.toBe(EVENT_ID);
    expect(commit.undoEventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects undo requests without a resolvable target event", async () => {
    const repository = createRepository();

    await expect(new StudyService(repository).undoReview(USER_ID, {
      targetEventId: "latest",
      clientOperationId: OPERATION_ID,
    })).rejects.toMatchObject({ code: "STUDY_INVALID_INPUT" });
    expect(repository.commitUndo).not.toHaveBeenCalled();
  });
});
