import { describe, expect, it } from "vitest";

import {
  MAX_TEACHER_CHANGES_PER_SYNC,
  TEACHER_LOOKAHEAD_DAYS,
  detectTeacherChanges,
  teacherLookaheadDate,
} from "./portal-teacher-changes.ts";

function entry(overrides: Record<string, string> = {}) {
  return {
    day: "Monday",
    period: "P1",
    course: "Mathematics Advanced",
    classCode: "11MAA1",
    teacher: "Mrs J Smith",
    room: "B12",
    ...overrides,
  };
}

function grid(teacher: string, overrides: Record<string, string> = {}) {
  return { weekA: [entry({ teacher, ...overrides })], weekB: [] };
}

describe("detectTeacherChanges", () => {
  it("reports nothing when the teacher is unchanged", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mrs J Smith"),
    });

    expect(changes).toEqual([]);
  });

  it("ignores a difference that is only casing or punctuation", () => {
    const changes = detectTeacherChanges({
      previous: grid("MRS J SMITH"),
      current: grid("Mrs J. Smith"),
    });

    expect(changes).toEqual([]);
  });

  it("reports nothing on the first sync, when there is no previous grid", () => {
    const changes = detectTeacherChanges({
      previous: null,
      current: grid("Mr K Patel"),
    });

    expect(changes).toEqual([]);
  });

  it("ignores a slot whose teacher went missing from the scrape", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid(""),
    });

    expect(changes).toEqual([]);
  });

  it("calls the change permanent when the new teacher is still there a fortnight out", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
      lookahead: grid("Mr K Patel"),
      lookaheadDate: "2026-09-04",
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "permanent",
      previousTeacher: "Mrs J Smith",
      currentTeacher: "Mr K Patel",
      period: "P1",
      day: "Monday",
      week: "weekA",
      lookaheadDate: "2026-09-04",
    });
  });

  it("calls the change a substitute when the original teacher is back a fortnight out", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
      lookahead: grid("Mrs J Smith"),
      lookaheadDate: "2026-09-04",
    });

    expect(changes[0].kind).toBe("substitute");
  });

  it("leaves the change unconfirmed when no lookahead was taken", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
    });

    expect(changes[0].kind).toBe("unconfirmed");
    expect(changes[0].lookaheadDate).toBeNull();
  });

  it("leaves the change unconfirmed when a third name appears a fortnight out", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
      lookahead: grid("Ms R Nguyen"),
    });

    expect(changes[0].kind).toBe("unconfirmed");
  });

  it("leaves the change unconfirmed when the slot is missing from the lookahead", () => {
    const changes = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
      lookahead: { weekA: [], weekB: [] },
    });

    expect(changes[0].kind).toBe("unconfirmed");
  });

  it("does not match a slot in the other rotation week", () => {
    const changes = detectTeacherChanges({
      previous: { weekA: [entry({ teacher: "Mrs J Smith" })], weekB: [] },
      current: { weekA: [], weekB: [entry({ teacher: "Mr K Patel" })] },
    });

    expect(changes).toEqual([]);
  });

  it("keys each change by both teachers, so a second handover is separate news", () => {
    const first = detectTeacherChanges({
      previous: grid("Mrs J Smith"),
      current: grid("Mr K Patel"),
    });
    const second = detectTeacherChanges({
      previous: grid("Mr K Patel"),
      current: grid("Ms R Nguyen"),
    });

    expect(first[0].key).not.toBe(second[0].key);
  });

  it("caps how many changes one sync can report", () => {
    const many = (teacher: string) => ({
      weekA: Array.from({ length: MAX_TEACHER_CHANGES_PER_SYNC + 10 }, (_, index) => (
        entry({ teacher, period: `P${index}`, classCode: `11MAA${index}` })
      )),
      weekB: [],
    });

    const changes = detectTeacherChanges({
      previous: many("Mrs J Smith"),
      current: many("Mr K Patel"),
    });

    expect(changes).toHaveLength(MAX_TEACHER_CHANGES_PER_SYNC);
  });
});

describe("teacherLookaheadDate", () => {
  it("lands on the same weekday a full rotation later", () => {
    const now = new Date(2026, 7, 21);
    const ahead = teacherLookaheadDate(now);

    expect(ahead.getDay()).toBe(now.getDay());
    expect(Math.round((ahead.getTime() - now.getTime()) / 86_400_000)).toBe(TEACHER_LOOKAHEAD_DAYS);
  });
});
