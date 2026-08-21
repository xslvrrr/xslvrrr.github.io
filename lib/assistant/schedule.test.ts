import { describe, expect, test } from "vitest";

import {
  WEEK_A_REFERENCE,
  findCurrentClass,
  findNextClass,
  resolveDaySchedule,
  resolveWeekType,
} from "./schedule.ts";

const portal = {
  timetable: {
    weekA: [
      { day: "Monday", period: "1", course: "Physics", classCode: "PHY11", teacher: "N. OLeary", room: "B204" },
      { day: "Monday", period: "3", course: "Chemistry", classCode: "CHEM11", teacher: "S. Harrison", room: "Lab 3" },
      { day: "Tuesday", period: "2", course: "English Advanced", classCode: "ENGA11", teacher: "M. Nguyen", room: "D17" },
    ],
    weekB: [
      { day: "Monday", period: "2", course: "Mathematics", classCode: "MAT11", teacher: "A. Sharma", room: "C112" },
    ],
  },
  calendar: [
    { title: "Term 3 holidays", type: "holiday", date: "2026-02-24" },
  ],
};

/** The reference Monday itself: Week A by definition. */
const WEEK_A_MONDAY = new Date(2026, 1, 16);
const WEEK_B_MONDAY = new Date(2026, 1, 23);

describe("resolveWeekType", () => {
  test("returns Week A for the reference Monday", () => {
    expect(resolveWeekType(WEEK_A_REFERENCE)).toBe("weekA");
  });

  test("alternates each week forward", () => {
    expect(resolveWeekType(WEEK_B_MONDAY)).toBe("weekB");
    expect(resolveWeekType(new Date(2026, 2, 2))).toBe("weekA");
  });

  test("alternates backwards past the reference without flipping the phase", () => {
    expect(resolveWeekType(new Date(2026, 1, 9))).toBe("weekB");
    expect(resolveWeekType(new Date(2026, 1, 2))).toBe("weekA");
  });
});

describe("resolveDaySchedule", () => {
  test("reads the Week A grid on a Week A Monday, in bell order", () => {
    const schedule = resolveDaySchedule(portal, WEEK_A_MONDAY);

    expect(schedule.isSchoolDay).toBe(true);
    expect(schedule.weekLabel).toBe("Week A");
    expect(schedule.periods.map((entry) => entry.course)).toEqual(["Physics", "Chemistry"]);
    expect(schedule.periods[0].startsAt).toBe("08:45");
  });

  test("reads the Week B grid on a Week B Monday", () => {
    const schedule = resolveDaySchedule(portal, WEEK_B_MONDAY);

    expect(schedule.weekLabel).toBe("Week B");
    expect(schedule.periods.map((entry) => entry.course)).toEqual(["Mathematics"]);
  });

  test("reports a holiday as not a school day, with the reason", () => {
    const schedule = resolveDaySchedule(portal, new Date(2026, 1, 24));

    expect(schedule.isSchoolDay).toBe(false);
    expect(schedule.periods).toEqual([]);
    expect(schedule.notSchoolDayReason).toContain("Term 3 holidays");
  });

  test("reports a weekend as not a school day", () => {
    const schedule = resolveDaySchedule(portal, new Date(2026, 1, 21));

    expect(schedule.isWeekend).toBe(true);
    expect(schedule.isSchoolDay).toBe(false);
  });

  test("drops classes the student is no longer enrolled in", () => {
    const schedule = resolveDaySchedule(portal, WEEK_A_MONDAY, {
      unenrolledClassKeys: ["code:chem11"],
    });

    expect(schedule.periods.map((entry) => entry.course)).toEqual(["Physics"]);
  });

  test("distinguishes an empty day from an unknown one", () => {
    const schedule = resolveDaySchedule({ timetable: { weekA: [], weekB: [] } }, WEEK_A_MONDAY);

    expect(schedule.isSchoolDay).toBe(false);
    expect(schedule.notSchoolDayReason).toContain("No timetable");
  });
});

describe("findNextClass", () => {
  test("finds a later period on the same day", () => {
    const next = findNextClass(portal, new Date(2026, 1, 16, 9, 0));

    expect(next.isToday).toBe(true);
    expect(next.period?.course).toBe("Chemistry");
  });

  test("rolls to the next school day once the day is over, and says what it skipped", () => {
    const next = findNextClass(portal, new Date(2026, 1, 16, 18, 0));

    expect(next.isToday).toBe(false);
    expect(next.period?.course).toBe("English Advanced");
    expect(next.skipped[0].reason).toContain("already finished");
  });

  test("skips a holiday and records why", () => {
    const next = findNextClass(portal, new Date(2026, 1, 23, 18, 0));

    expect(next.date).not.toBe("2026-02-24");
    expect(next.skipped.some((entry) => entry.reason.includes("Term 3 holidays"))).toBe(true);
  });
});

describe("findCurrentClass", () => {
  test("returns the class running at that moment", () => {
    expect(findCurrentClass(portal, new Date(2026, 1, 16, 9, 0))?.course).toBe("Physics");
  });

  test("returns nothing between periods", () => {
    expect(findCurrentClass(portal, new Date(2026, 1, 16, 16, 0))).toBeNull();
  });
});
