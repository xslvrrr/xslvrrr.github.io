import { describe, expect, it } from "vitest";

import type { StudyQueueItem } from "./domain";
import { buildStudySessionQueue, studyCategoryOf } from "./session-queue";

const NOW = new Date("2026-08-02T12:00:00.000Z");

function item(overrides: Partial<StudyQueueItem> & { cardId: string }): StudyQueueItem {
  return {
    noteId: "40acbf0f-2ff3-4a21-8b34-027876689294",
    deckId: "deck-a",
    deckTitle: "Deck A",
    templateKey: "forward",
    scheduleRevision: 1,
    noteRevision: 1,
    noteType: "basic",
    fields: { prompt: "q", answer: "a" },
    tags: [],
    state: "review",
    dueAt: "2026-08-02T11:00:00.000Z",
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 5,
    learningSteps: 0,
    repetitions: 4,
    lapses: 0,
    lastReviewedAt: "2026-08-01T11:00:00.000Z",
    ...overrides,
  };
}

function familiarGroup(prefix: string, tag: string, count: number): StudyQueueItem[] {
  return Array.from({ length: count }, (_unused, index) => item({
    cardId: `${prefix}-${index}`,
    tags: [tag],
  }));
}

describe("buildStudySessionQueue", () => {
  it("keeps due order when there is only one topic", () => {
    const items = familiarGroup("a", "algebra", 5);

    const queue = buildStudySessionQueue(items, { strategy: "adaptive", seed: "s", now: NOW });

    expect(queue.strategy).toBe("blocked");
    expect(queue.items.map((entry) => entry.cardId)).toEqual(items.map((entry) => entry.cardId));
    expect(queue.explanation).toMatch(/One topic/);
  });

  it("mixes two familiar topics and explains why", () => {
    const items = [...familiarGroup("a", "algebra", 5), ...familiarGroup("g", "geometry", 5)];

    const queue = buildStudySessionQueue(items, { strategy: "adaptive", seed: "s", now: NOW });

    expect(queue.strategy).toBe("adaptive");
    expect(queue.explanation).toMatch(/telling them apart/);
    expect(new Set(queue.items.map((entry) => entry.cardId)).size).toBe(10);
  });

  it("does not mix a topic the learner has barely seen", () => {
    const items = [
      ...familiarGroup("a", "algebra", 5),
      ...Array.from({ length: 4 }, (_unused, index) => item({
        cardId: `new-${index}`,
        tags: ["geometry"],
        state: "new",
        repetitions: 0,
      })),
    ];

    const queue = buildStudySessionQueue(items, { strategy: "adaptive", seed: "s", now: NOW });

    const geometryPositions = queue.items
      .map((entry, position) => ({ entry, position }))
      .filter(({ entry }) => studyCategoryOf(entry) === "geometry")
      .map(({ position }) => position);

    // The unfamiliar topic is introduced as one contiguous block, not scattered.
    expect(geometryPositions).toEqual([0, 1, 2, 3]);
    expect(queue.explanation).toMatch(/stay grouped/);
  });

  it("puts materially overdue cards first regardless of mixing", () => {
    const overdue = item({
      cardId: "overdue",
      tags: ["algebra"],
      dueAt: "2026-07-01T12:00:00.000Z",
      scheduledDays: 3,
    });
    const items = [...familiarGroup("a", "algebra", 4), ...familiarGroup("g", "geometry", 4), overdue];

    const queue = buildStudySessionQueue(items, { strategy: "adaptive", seed: "s", now: NOW });

    expect(queue.items[0].cardId).toBe("overdue");
  });

  it("never runs one topic for more than three cards when mixing", () => {
    const items = [...familiarGroup("a", "algebra", 10), ...familiarGroup("g", "geometry", 3)];

    const queue = buildStudySessionQueue(items, { strategy: "mixed", seed: "s", now: NOW });

    let longestRun = 0;
    let run = 0;
    let previous: string | null = null;
    for (const entry of queue.items) {
      const category = studyCategoryOf(entry);
      run = category === previous ? run + 1 : 1;
      previous = category
      longestRun = Math.max(longestRun, run);
    }

    // Only the tail can exceed the run limit, once the other topic is exhausted.
    expect(queue.items.slice(0, 6).filter((entry) => studyCategoryOf(entry) === "geometry").length)
      .toBeGreaterThan(0);
    expect(longestRun).toBeGreaterThan(0);
  });

  it("produces the same order for the same seed", () => {
    const items = [...familiarGroup("a", "algebra", 5), ...familiarGroup("g", "geometry", 5)];

    const first = buildStudySessionQueue(items, { strategy: "mixed", seed: "seed-1", now: NOW });
    const second = buildStudySessionQueue(items, { strategy: "mixed", seed: "seed-1", now: NOW });

    expect(first.items.map((entry) => entry.cardId)).toEqual(second.items.map((entry) => entry.cardId));
  });

  it("keeps every card exactly once", () => {
    const items = [...familiarGroup("a", "algebra", 7), ...familiarGroup("g", "geometry", 6)];

    const queue = buildStudySessionQueue(items, { strategy: "adaptive", seed: "s", now: NOW });

    expect(queue.items).toHaveLength(13);
    expect(new Set(queue.items.map((entry) => entry.cardId)).size).toBe(13);
  });
});
