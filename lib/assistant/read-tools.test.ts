import { describe, expect, test } from "vitest";

import { executeAssistantReadTool, getAssistantReadTools } from "./read-tools.ts";
import { normalizeAssistantPreferences } from "./actions.ts";
import type { AssistantDashboardState } from "./actions.ts";

const NOW = new Date(2026, 1, 16, 9, 0);

function buildState(overrides: Partial<AssistantDashboardState> = {}): AssistantDashboardState {
  return {
    user: { name: "Test Student" },
    portalData: {
      timetable: {
        weekA: [
          { day: "Monday", period: "1", course: "Physics", classCode: "PHY11", room: "B204" },
        ],
        weekB: [],
      },
      calendar: [],
      grades: [
        { subject: "Physics", task: "Practical Skills", result: "18/20", date: "2026-06-28" },
        { subject: "Chemistry", task: "Module 2 Quiz", result: "21/25", date: "2026-06-19" },
      ],
      reports: [{ title: "Year 11 Semester 1 Report", yearLevel: "Year 11", semester: 1, calendarYear: 2026 }],
      attendance: {
        yearly: [{ year: "2026", schoolDays: 94, totalPercentage: 96.8 }],
        subjects: [{ classCode: "PHY11", rollsMarked: 38, absent: 1, percentage: 97 }],
        absences: [],
      },
    },
    preferences: normalizeAssistantPreferences(null),
    localCalendar: { events: [], calendars: [] },
    themeBuilder: { state: null, customThemes: [] },
    notificationStates: {},
    skills: [
      { id: "s1", name: "Essay voice", description: "How I write essays", instructions: "Use short sentences.", icon: "IconPencil", enabled: false },
      { id: "s2", name: "Revision", description: "How I revise", instructions: "Interleave subjects.", icon: "IconBook", enabled: true },
    ] as AssistantDashboardState["skills"],
    flashcardSets: [],
    ...overrides,
  };
}

describe("getAssistantReadTools", () => {
  test("every tool declares an object parameter schema", () => {
    for (const tool of getAssistantReadTools()) {
      expect(tool.function.parameters.type).toBe("object");
      expect(tool.function.description.length).toBeGreaterThan(20);
    }
  });
});

describe("inspect_schedule", () => {
  test("returns the resolved day rather than the raw grid", async () => {
    const result = await executeAssistantReadTool("inspect_schedule", {}, buildState(), NOW);

    expect(result.ok).toBe(true);
    expect((result.data as any).days[0].periods[0].course).toBe("Physics");
    expect((result.data as any).days[0].weekLabel).toBe("Week A");
  });

  test("reads a weekday name as the next such day", async () => {
    const result = await executeAssistantReadTool("inspect_schedule", { date: "tuesday" }, buildState(), NOW);

    expect((result.data as any).days[0].weekday).toBe("Tuesday");
  });

  test("refuses a date it cannot read instead of answering for the wrong day", async () => {
    const result = await executeAssistantReadTool("inspect_schedule", { date: "sometime soon" }, buildState(), NOW);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Could not read");
  });

  test("answers what is on right now", async () => {
    const result = await executeAssistantReadTool("inspect_schedule", { mode: "now" }, buildState(), NOW);

    expect((result.data as any).current.course).toBe("Physics");
  });
});

describe("inspect_attendance", () => {
  test("returns yearly and per-subject figures with the bands they are read against", async () => {
    const result = await executeAssistantReadTool("inspect_attendance", {}, buildState(), NOW);

    expect(result.ok).toBe(true);
    expect((result.data as any).yearly).toHaveLength(1);
    expect((result.data as any).bands.excellent).toBeGreaterThan(0);
  });

  test("says plainly when nothing has been synced", async () => {
    const state = buildState({ portalData: {} });
    const result = await executeAssistantReadTool("inspect_attendance", {}, state, NOW);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("No attendance data");
  });
});

describe("inspect_academics", () => {
  test("filters marked work by subject", async () => {
    const result = await executeAssistantReadTool("inspect_academics", { subject: "physics", kind: "grades" }, buildState(), NOW);

    expect((result.data as any).grades).toHaveLength(1);
    expect((result.data as any).grades[0].task).toBe("Practical Skills");
  });

  test("never returns report document URLs", async () => {
    const result = await executeAssistantReadTool("inspect_academics", { kind: "reports" }, buildState(), NOW);

    expect(JSON.stringify(result.data)).not.toContain("url");
  });
});

describe("inspect_skills", () => {
  test("lists built-in and user skills without their instructions", async () => {
    const result = await executeAssistantReadTool("inspect_skills", {}, buildState(), NOW);

    const skills = (result.data as any).skills as Array<Record<string, unknown>>;
    expect(skills.some((skill) => skill.origin === "built-in")).toBe(true);
    expect(skills.some((skill) => skill.name === "Essay voice" && skill.active === false)).toBe(true);
    expect(skills.every((skill) => !("instructions" in skill))).toBe(true);
  });

  test("reads a switched-off skill in full when asked for by name", async () => {
    const result = await executeAssistantReadTool("inspect_skills", { name: "Essay voice" }, buildState(), NOW);

    expect(result.ok).toBe(true);
    expect((result.data as any).instructions).toBe("Use short sentences.");
    expect((result.data as any).note).toContain("never authorizes");
  });

  test("fails on a skill that does not exist", async () => {
    const result = await executeAssistantReadTool("inspect_skills", { name: "Nonexistent" }, buildState(), NOW);

    expect(result.ok).toBe(false);
  });
});

describe("inspect_calendar", () => {
  function calendarState() {
    return buildState({
      portalData: {
        ...buildState().portalData,
        calendar: [
          { title: "Athletics Carnival", type: "event", date: "2026-02-18" },
          { title: "Autumn Break", type: "holiday", date: "2026-04-10" },
        ],
      },
      localCalendar: {
        calendars: [{ id: "c1", name: "Study", visible: true }],
        events: [{ id: "e1", title: "Physics tutoring", start: "2026-02-17T16:00", calendarName: "Study" }],
      },
    });
  }

  test("merges school and personal events inside the window, sorted by date", async () => {
    const result = await executeAssistantReadTool("inspect_calendar", { days: 7 }, calendarState(), NOW);
    const events = (result.data as any).events;

    expect(result.ok).toBe(true);
    expect(events.map((event: any) => event.title)).toEqual(["Physics tutoring", "Athletics Carnival"]);
    expect(events[0].source).toBe("personal");
  });

  test("excludes events outside the window", async () => {
    const result = await executeAssistantReadTool("inspect_calendar", { days: 7 }, calendarState(), NOW);

    expect((result.data as any).events.some((event: any) => event.title === "Autumn Break")).toBe(false);
  });

  test("accepts a day count sent as a string, which the free models do", async () => {
    const result = await executeAssistantReadTool("inspect_calendar", { days: "60" }, calendarState(), NOW);

    expect((result.data as any).events.some((event: any) => event.title === "Autumn Break")).toBe(true);
  });

  test("filters by query", async () => {
    const result = await executeAssistantReadTool("inspect_calendar", { days: 90, query: "athletics" }, calendarState(), NOW);

    expect((result.data as any).events).toHaveLength(1);
  });

  test("rejects a date it cannot read rather than guessing", async () => {
    const result = await executeAssistantReadTool("inspect_calendar", { from: "sometime" }, calendarState(), NOW);

    expect(result.ok).toBe(false);
  });
});

describe("inspect_notices", () => {
  function noticeState() {
    return buildState({
      portalData: {
        ...buildState().portalData,
        notices: [
          { title: "Library closed", content: "The library is closed on Friday for stocktake.", date: "2026-02-16" },
          { title: "Debating trials", content: "Trials are in the hall at lunch.", date: "2026-02-17" },
        ],
      },
    });
  }

  test("returns the full body, which the snapshot does not carry", async () => {
    const result = await executeAssistantReadTool("inspect_notices", { query: "library" }, noticeState(), NOW);
    const notices = (result.data as any).notices;

    expect(result.ok).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0].content).toContain("stocktake");
  });

  test("filters by date", async () => {
    const result = await executeAssistantReadTool("inspect_notices", { date: "2026-02-17" }, noticeState(), NOW);

    expect((result.data as any).notices).toHaveLength(1);
  });

  test("reports no match rather than returning everything", async () => {
    const result = await executeAssistantReadTool("inspect_notices", { query: "swimming" }, noticeState(), NOW);

    expect(result.ok).toBe(false);
  });
});

describe("inspect_teacher_changes", () => {
  const changes = [
    {
      key: "a", week: "weekA" as const, day: "Monday", period: "1", course: "Physics", classCode: "PHY11",
      room: "B204", previousTeacher: "Mrs J Smith", currentTeacher: "Mr K Patel", kind: "permanent" as const,
      lookaheadDate: "2026-03-02", detectedAt: "2026-02-16T00:00:00.000Z",
    },
    {
      key: "b", week: "weekB" as const, day: "Friday", period: "3", course: "Chemistry", classCode: "CHE11",
      room: "S1", previousTeacher: "Mr L Wu", currentTeacher: "Ms R Nguyen", kind: "substitute" as const,
      lookaheadDate: "2026-03-02", detectedAt: "2026-02-16T00:00:00.000Z",
    },
  ];

  test("states the verdict in the message, not only the data", async () => {
    const result = await executeAssistantReadTool(
      "inspect_teacher_changes",
      {},
      buildState({ teacherChanges: changes }),
      NOW,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("taken over");
    expect(result.message).toContain("covering");
  });

  test("filters to one kind", async () => {
    const result = await executeAssistantReadTool(
      "inspect_teacher_changes",
      { kind: "substitute" },
      buildState({ teacherChanges: changes }),
      NOW,
    );

    expect((result.data as any).changes).toHaveLength(1);
    expect((result.data as any).changes[0].course).toBe("Chemistry");
  });

  test("says nothing was found rather than implying nothing changed", async () => {
    const result = await executeAssistantReadTool("inspect_teacher_changes", {}, buildState(), NOW);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("synced once");
  });
});
