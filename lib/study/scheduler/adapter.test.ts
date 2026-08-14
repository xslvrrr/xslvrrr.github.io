import { describe, expect, it } from "vitest";

import type { StudyReviewRating } from "../domain";
import { FsrsStudyScheduler } from "./fsrs";

const REVIEWED_AT = new Date("2026-08-02T10:00:00.000Z");
const RATINGS: StudyReviewRating[] = ["again", "hard", "good", "easy"];

describe("FsrsStudyScheduler", () => {
  it("creates a serializable Millennium-owned initial state", () => {
    const scheduler = new FsrsStudyScheduler();
    const state = scheduler.createState(REVIEWED_AT);

    expect(state).toEqual({
      state: "new",
      dueAt: REVIEWED_AT.toISOString(),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("keeps preview and apply deterministic without mutating input", () => {
    const scheduler = new FsrsStudyScheduler();
    const state = scheduler.createState(REVIEWED_AT);
    const inputSnapshot = structuredClone(state);
    const firstPreview = scheduler.preview(state, REVIEWED_AT);
    const secondPreview = scheduler.preview(state, REVIEWED_AT);

    expect(secondPreview).toEqual(firstPreview);
    expect(state).toEqual(inputSnapshot);

    for (const rating of RATINGS) {
      expect(scheduler.apply(state, rating, REVIEWED_AT)).toEqual(firstPreview[rating]);
      expect(firstPreview[rating].after.dueAt).toBe(new Date(firstPreview[rating].after.dueAt).toISOString());
      expect(firstPreview[rating].nextIntervalSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not estimate retrievability before first review", () => {
    const scheduler = new FsrsStudyScheduler();
    expect(scheduler.retrievability(scheduler.createState(REVIEWED_AT), REVIEWED_AT)).toBeNull();
  });

  it("records stable scheduler and parameter versions", () => {
    const first = new FsrsStudyScheduler();
    const second = new FsrsStudyScheduler();

    expect(first.name).toBe("fsrs");
    expect(first.version).toBeTruthy();
    expect(first.parametersVersion).toBe(second.parametersVersion);
    expect(first.parametersVersion).toContain(first.version);
  });
});
