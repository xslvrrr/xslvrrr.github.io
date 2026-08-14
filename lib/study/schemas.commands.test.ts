import { describe, expect, it } from "vitest";

import {
  studyDeckCommandSchema,
  studyNoteCommandSchema,
  studyReviewCommandSchema,
  studyUndoCommandSchema,
} from "./schemas";

const OPERATION_ID = "d84f5b6d-930f-4cb8-b23a-7ee31ff0246d";
const CARD_ID = "b4a7ef83-bdb0-483b-91a8-8d6a1641c3a2";
const DECK_ID = "a7f51bdf-8ba3-41f0-ac1f-33f014ac0a36";
const NOTE_ID = "40acbf0f-2ff3-4a21-8b34-027876689294";
const EVENT_ID = "dd096e5d-7580-45fd-a003-a5014c74494c";

describe("Study command schemas", () => {
  it("accepts bounded deck and basic note commands", () => {
    expect(studyDeckCommandSchema.parse({
      deckId: DECK_ID,
      title: "  Biology  ",
      description: "Cells",
    })).toEqual({
      deckId: DECK_ID,
      title: "Biology",
      description: "Cells",
    });

    expect(studyNoteCommandSchema.parse({
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: " Mitosis? ", answer: " Cell division " },
      tags: ["biology"],
    })).toMatchObject({
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: "Mitosis?", answer: "Cell division" },
      tags: ["biology"],
    });
  });

  it("rejects unknown fields and scheduling-state injection", () => {
    expect(() => studyNoteCommandSchema.parse({
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: "Question", answer: "Answer" },
      dueAt: "2099-01-01T00:00:00.000Z",
    })).toThrow();

    expect(() => studyNoteCommandSchema.parse({
      noteId: NOTE_ID,
      deckId: DECK_ID,
      fields: { prompt: "Question", answer: "Answer", stability: 12 },
    })).toThrow();
  });

  it("accepts undo commands and rejects unowned identifiers", () => {
    expect(studyUndoCommandSchema.parse({
      targetEventId: EVENT_ID,
      clientOperationId: OPERATION_ID,
    })).toEqual({
      targetEventId: EVENT_ID,
      clientOperationId: OPERATION_ID,
    });

    expect(() => studyUndoCommandSchema.parse({
      targetEventId: "latest",
      clientOperationId: OPERATION_ID,
    })).toThrow();
  });

  it("accepts authoritative review command fields only", () => {
    expect(studyReviewCommandSchema.parse({
      cardId: CARD_ID,
      clientOperationId: OPERATION_ID,
      expectedScheduleRevision: 0,
      rating: "good",
      reviewedAt: "2026-08-02T10:00:00.000Z",
      durationMs: 0,
    })).toEqual({
      cardId: CARD_ID,
      clientOperationId: OPERATION_ID,
      expectedScheduleRevision: 0,
      rating: "good",
      reviewedAt: "2026-08-02T10:00:00.000Z",
      durationMs: 0,
    });
  });

  it("rejects malformed revisions, ratings, dates, and client-authored state", () => {
    const base = {
      cardId: CARD_ID,
      clientOperationId: OPERATION_ID,
      expectedScheduleRevision: 0,
      rating: "good",
      reviewedAt: "2026-08-02T10:00:00.000Z",
    };

    expect(() => studyReviewCommandSchema.parse({ ...base, expectedScheduleRevision: -1 })).toThrow();
    expect(() => studyReviewCommandSchema.parse({ ...base, rating: "remembered" })).toThrow();
    expect(() => studyReviewCommandSchema.parse({ ...base, reviewedAt: "tomorrow" })).toThrow();
    expect(() => studyReviewCommandSchema.parse({ ...base, afterState: {} })).toThrow();
  });
});
