import { describe, expect, it } from "vitest";

import type { StudyOfflineLibrary } from "./desktop-sync";
import type { StudyCard } from "./domain";
import {
  buildStudyOfflineBootstrap,
  buildStudyOfflineDecks,
  buildStudyOfflineQueue,
} from "./offline-queue";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const DECK_ID = "a7f51bdf-8ba3-41f0-ac1f-33f014ac0a36";
const ARCHIVED_DECK_ID = "9d2f6f4e-5b1c-4d3a-8e7f-1a2b3c4d5e6f";

function card(overrides: Partial<StudyCard> & { id: string }): StudyCard {
  return {
    userId: "6ec8637f-7d81-4f61-a665-f51788d0c35a",
    deckId: DECK_ID,
    noteId: "40acbf0f-2ff3-4a21-8b34-027876689294",
    templateKey: "forward",
    ordinal: 0,
    isSuspended: false,
    isBuried: false,
    state: "review",
    dueAt: "2026-08-02T09:00:00.000Z",
    stability: 3,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    repetitions: 2,
    lapses: 0,
    lastReviewedAt: "2026-08-01T09:00:00.000Z",
    schedulerName: "fsrs",
    schedulerVersion: "6",
    parametersVersion: "default",
    schedulerMetadata: {},
    scheduleRevision: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function library(overrides: Partial<StudyOfflineLibrary> = {}): StudyOfflineLibrary {
  return {
    cursor: 12,
    deviceId: "0f6c2f1a-1f9d-4a3e-9f0a-8f5b1d2c3e4f",
    decks: [
      {
        id: DECK_ID,
        title: "Biology",
        description: "",
        pinned: true,
        sortOrder: 0,
        revision: 3,
        archivedAt: null,
        createdAt: "2026-08-01T09:00:00.000Z",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
    notes: [
      {
        id: "40acbf0f-2ff3-4a21-8b34-027876689294",
        deckId: DECK_ID,
        noteType: "basic",
        schemaVersion: 1,
        fields: { prompt: "Question", answer: "Answer" },
        tags: ["unit-1"],
        revision: 2,
        createdAt: "2026-08-01T09:00:00.000Z",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
    cards: [card({ id: "11111111-1111-4111-8111-111111111111" })],
    preferences: null,
    ...overrides,
  };
}

describe("buildStudyOfflineQueue", () => {
  it("orders due cards by due time then id, matching the server queue", () => {
    const local = library({
      cards: [
        card({ id: "33333333-3333-4333-8333-333333333333", dueAt: "2026-08-02T09:00:00.000Z" }),
        card({ id: "22222222-2222-4222-8222-222222222222", dueAt: "2026-08-02T09:00:00.000Z" }),
        card({ id: "11111111-1111-4111-8111-111111111111", dueAt: "2026-08-02T08:00:00.000Z" }),
      ],
    });

    const queue = buildStudyOfflineQueue(local, { limit: 10, includeNew: true, now: NOW });

    expect(queue.map((item) => item.cardId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("excludes suspended, buried, deleted, not-yet-due, and archived-deck cards", () => {
    const local = library({
      decks: [
        ...library().decks,
        {
          id: ARCHIVED_DECK_ID,
          title: "Archived",
          description: "",
          pinned: false,
          sortOrder: 1,
          revision: 1,
          archivedAt: "2026-08-01T09:00:00.000Z",
          createdAt: "2026-08-01T09:00:00.000Z",
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
      cards: [
        card({ id: "11111111-1111-4111-8111-111111111111", isSuspended: true }),
        card({ id: "22222222-2222-4222-8222-222222222222", isBuried: true }),
        card({ id: "33333333-3333-4333-8333-333333333333", deletedAt: "2026-08-01T10:00:00.000Z" }),
        card({ id: "44444444-4444-4444-8444-444444444444", dueAt: "2026-08-03T09:00:00.000Z" }),
        card({ id: "55555555-5555-4555-8555-555555555555", deckId: ARCHIVED_DECK_ID }),
        card({ id: "66666666-6666-4666-8666-666666666666" }),
      ],
    });

    const queue = buildStudyOfflineQueue(local, { limit: 10, includeNew: true, now: NOW });

    expect(queue.map((item) => item.cardId)).toEqual(["66666666-6666-4666-8666-666666666666"]);
  });

  it("omits new cards when new cards are excluded", () => {
    const local = library({
      cards: [
        card({ id: "11111111-1111-4111-8111-111111111111", state: "new" }),
        card({ id: "22222222-2222-4222-8222-222222222222" }),
      ],
    });

    const queue = buildStudyOfflineQueue(local, { limit: 10, includeNew: false, now: NOW });

    expect(queue.map((item) => item.cardId)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("carries the note content and revisions the review request needs", () => {
    const [item] = buildStudyOfflineQueue(library(), { limit: 10, includeNew: true, now: NOW });

    expect(item).toMatchObject({
      deckTitle: "Biology",
      noteRevision: 2,
      scheduleRevision: 1,
      fields: { prompt: "Question", answer: "Answer" },
      tags: ["unit-1"],
    });
  });
});

describe("buildStudyOfflineDecks", () => {
  it("counts stored cards without counting suspended cards as due", () => {
    const local = library({
      cards: [
        card({ id: "11111111-1111-4111-8111-111111111111" }),
        card({ id: "22222222-2222-4222-8222-222222222222", isSuspended: true }),
        card({ id: "33333333-3333-4333-8333-333333333333", state: "new" }),
      ],
    });

    const [deck] = buildStudyOfflineDecks(local, NOW);

    expect(deck).toMatchObject({ cardCount: 3, dueCount: 2, newCount: 1 });
  });
});

describe("buildStudyOfflineBootstrap", () => {
  it("reports the stored cursor and offline capability", () => {
    const bootstrap = buildStudyOfflineBootstrap(library(), NOW);

    expect(bootstrap.syncCursor).toBe(12);
    expect(bootstrap.dueCount).toBe(1);
    expect(bootstrap.capabilities).toMatchObject({ normalizedStorage: true, offlineSync: true });
  });

  it("falls back to default preferences when none were stored locally", () => {
    const bootstrap = buildStudyOfflineBootstrap(library(), NOW);

    expect(bootstrap.preferences.experienceMode).toBe("beginner");
  });
});
