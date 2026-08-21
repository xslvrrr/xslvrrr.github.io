import { describe, expect, test } from "vitest";

import {
  ASSISTANT_ACTION_NAMES,
  executeAssistantAction,
  getAssistantTools,
  isKnownAssistantAction,
  isMutatingAssistantAction,
  normalizeAssistantPreferences,
  suggestAssistantAction,
} from "./actions.ts";
import type { AssistantActionServices, AssistantDashboardState } from "./actions.ts";

function buildState(): AssistantDashboardState {
  return {
    user: { name: "Test Student" },
    portalData: {},
    preferences: normalizeAssistantPreferences(null),
    localCalendar: { events: [], calendars: [] },
    themeBuilder: { state: null, customThemes: [] },
    notificationStates: {},
    skills: [],
    flashcardSets: [],
  };
}

const services = {
  savePreferences: async () => normalizeAssistantPreferences(null),
  saveLocalCalendar: async (payload: any) => payload,
  saveThemeBuilder: async () => ({ state: null, customThemes: [] }),
  saveSkills: async (skills: any) => skills,
  saveNotificationStates: async (states: any) => states,
  saveFlashcardSets: async (sets: any) => sets,
} as unknown as AssistantActionServices;

describe("the advertised tool list", () => {
  test("every declared tool is an executable action", () => {
    for (const tool of getAssistantTools()) {
      expect(isKnownAssistantAction(tool.function.name)).toBe(true);
    }
  });

  test("every executable action is advertised, so none is silently unreachable", () => {
    const advertised = new Set(getAssistantTools().map((tool) => tool.function.name));
    for (const name of ASSISTANT_ACTION_NAMES) {
      expect(advertised.has(name)).toBe(true);
    }
  });

  test("no read tool is treated as a mutation", () => {
    for (const name of ASSISTANT_ACTION_NAMES) {
      if (!name.startsWith("inspect_")) continue;
      expect(isMutatingAssistantAction(name)).toBe(false);
    }
  });
});

describe("suggestAssistantAction", () => {
  test.each([
    ["get_timetable", "inspect_schedule"],
    ["read_attendance", "inspect_attendance"],
    ["list_notices", "inspect_notices"],
    ["check_teacher_changes", "inspect_teacher_changes"],
    ["show_calendar", "inspect_calendar"],
  ])("points %s at %s", (invented, expected) => {
    expect(suggestAssistantAction(invented)).toBe(expected);
  });

  test("suggests nothing when the name shares no vocabulary with any tool", () => {
    expect(suggestAssistantAction("frobnicate_widget")).toBeNull();
  });
});

describe("an invented tool name", () => {
  test("comes back as a failed result naming the real tool, not an exception", async () => {
    const result = await executeAssistantAction("get_timetable", {}, buildState(), services);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("inspect_schedule");
  });

  test("still refuses without a suggestion when there is nothing close", async () => {
    const result = await executeAssistantAction("frobnicate_widget", {}, buildState(), services);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no tool called");
  });
});
