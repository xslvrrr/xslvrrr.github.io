import { describe, expect, it } from "vitest";

import { buildStudyExamOutlook, daysUntilExam, type StudyExamCoverage } from "./exam-plans";

const NOW = new Date("2026-08-02T09:00:00.000Z");

function coverage(overrides: Partial<StudyExamCoverage> = {}): StudyExamCoverage {
  return {
    cardCount: 100,
    newCount: 40,
    dueCount: 10,
    weakCount: 0,
    averageStability: 5,
    ...overrides,
  };
}

describe("daysUntilExam", () => {
  it("counts whole days and ignores the time of day", () => {
    expect(daysUntilExam("2026-08-12", NOW)).toBe(10);
    expect(daysUntilExam("2026-08-02", NOW)).toBe(0);
  });

  it("returns a negative number for a date that has passed", () => {
    expect(daysUntilExam("2026-07-30", NOW)).toBe(-3);
  });
});

describe("buildStudyExamOutlook", () => {
  it("spreads unseen cards across the days remaining", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-08-12", dailyMinutes: 60 },
      coverage(),
      NOW,
    );

    expect(outlook.daysRemaining).toBe(10);
    expect(outlook.newCardsPerDay).toBe(4);
    expect(outlook.detail).toMatch(/estimate/);
  });

  it("says when the plan does not fit the stated time budget", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-08-05", dailyMinutes: 5 },
      coverage({ cardCount: 400, newCount: 300 }),
      NOW,
    );

    expect(outlook.isOverBudget).toBe(true);
    expect(outlook.action).toMatch(/more than your 5-minute budget/);
  });

  it("recommends covering weak cards when the exam is days away", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-08-04", dailyMinutes: 60 },
      coverage({ newCount: 50 }),
      NOW,
    );

    expect(outlook.isShortNotice).toBe(true);
    expect(outlook.action).toMatch(/weakest cards/);
  });

  it("points at leeches when there is time and nothing unseen", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-09-02", dailyMinutes: 60 },
      coverage({ newCount: 0, weakCount: 6 }),
      NOW,
    );

    expect(outlook.headline).toMatch(/seen every card/);
    expect(outlook.action).toMatch(/keep being forgotten/);
  });

  it("reports a date that has passed instead of producing a plan", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-07-30", dailyMinutes: 60 },
      coverage(),
      NOW,
    );

    expect(outlook.headline).toMatch(/has passed/);
    expect(outlook.newCardsPerDay).toBe(0);
  });

  it("does not divide by zero on the day of the exam", () => {
    const outlook = buildStudyExamOutlook(
      { examDate: "2026-08-02", dailyMinutes: 60 },
      coverage(),
      NOW,
    );

    expect(Number.isFinite(outlook.newCardsPerDay)).toBe(true);
    expect(outlook.newCardsPerDay).toBe(40);
  });
});
