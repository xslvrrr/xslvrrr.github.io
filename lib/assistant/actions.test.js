import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSISTANT_DEFAULT_THREAD_TITLE,
  buildDashboardSnapshot,
  buildAssistantSystemPrompt,
  executeAssistantAction,
  isKnownAssistantAction,
  isMutatingAssistantAction,
  normalizeAssistantSkills,
  normalizeAssistantToolArguments,
  normalizeAssistantThreads,
  normalizeAssistantMessages,
  normalizeAssistantPreferences,
} from "./actions.ts";

test("assistant tool registry rejects unknown and malformed provider calls", () => {
  assert.equal(isKnownAssistantAction("inspect_dashboard"), true);
  assert.equal(isKnownAssistantAction("run_shell"), false);
  assert.equal(isMutatingAssistantAction("run_shell"), false);
  assert.equal(normalizeAssistantToolArguments('{"focus":"calendar"}'), '{"focus":"calendar"}');
  assert.equal(normalizeAssistantToolArguments("not-json"), null);
  assert.equal(normalizeAssistantToolArguments("[]"), null);
});

function createHarness() {
  const state = {
    user: { name: "Alex", school: "Millennium High" },
    portalData: {
      notices: [{ title: "Assembly", preview: "Hall", date: "2026-06-08" }],
      classes: [{ course: "Mathematics", classCode: "MAT1", teacher: "Ms Smith" }],
      timetable: { weekA: [], weekB: [] },
    },
    preferences: normalizeAssistantPreferences(null),
    localCalendar: {
      events: [],
      calendars: [{ id: "local", name: "My Events", color: "#10b981", visible: true, isLocal: true }],
    },
    themeBuilder: { state: null, customThemes: [] },
    notificationStates: {},
    skills: [],
  };

  const services = {
    now: () => new Date("2026-06-07T10:00:00.000Z"),
    savePreferences: async (updates) => {
      state.preferences = {
        ...state.preferences,
        ...updates,
      };
      return state.preferences;
    },
    saveLocalCalendar: async (payload) => {
      state.localCalendar = payload;
      return state.localCalendar;
    },
    saveThemeBuilder: async (payload) => {
      state.themeBuilder = {
        state: payload.state ?? null,
        customThemes: payload.customThemes ?? [],
      };
      return state.themeBuilder;
    },
    saveSkills: async (skills) => {
      state.skills = skills;
      return state.skills;
    },
    saveNotificationStates: async (states) => {
      state.notificationStates = states;
      return state.notificationStates;
    },
  };

  return { state, services };
}

test("normalizeAssistantMessages accepts only user and assistant text messages", () => {
  assert.deepEqual(normalizeAssistantMessages([
    { role: "system", content: "ignore" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "tool", content: "ignore" },
  ]), [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ]);
});

test("normalizeAssistantThreads keeps resumable chat history", () => {
  const threads = normalizeAssistantThreads([
    {
      id: "thread-1",
      title: "Math planning",
      messages: [
        { role: "user", content: "Plan maths" },
        { role: "assistant", content: "Done" },
        { role: "system", content: "ignore" },
      ],
      createdAt: "2026-06-07T10:00:00.000Z",
      updatedAt: "2026-06-07T10:01:00.000Z",
    },
  ]);

  assert.equal(threads.length, 1);
  assert.equal(threads[0].title, "Math planning");
  assert.equal(threads[0].messages.length, 2);
});

test("normalizeAssistantThreads creates a default title for invalid titles", () => {
  const threads = normalizeAssistantThreads([{ id: "thread-2", title: "", messages: [] }]);
  assert.equal(threads[0].title, ASSISTANT_DEFAULT_THREAD_TITLE);
});

test("normalizeAssistantSkills removes invalid skills and normalizes enabled state", () => {
  const skills = normalizeAssistantSkills([
    { id: "skill-1", name: "Planner", description: "Plan", instructions: "Be structured", enabled: false },
    { id: "skill-2", name: "", instructions: "ignore" },
  ]);

  assert.equal(skills.length, 1);
  assert.equal(skills[0].enabled, false);
});

test("assistant snapshot includes dashboard counts and editable preferences", () => {
  const { state } = createHarness();
  const snapshot = buildDashboardSnapshot(state);
  assert.equal(snapshot.counts.notices, 1);
  assert.equal(snapshot.counts.classes, 1);
  assert.equal(snapshot.currentPreferences.columns, 2);
});

test("assistant prompt makes enabled skills the final override block", () => {
  const { state } = createHarness();
  state.skills.push({
    id: "skill-direct",
    name: "Direct mode",
    description: "Short direct replies",
    instructions: "Use short direct replies.",
    icon: "IconSparkles",
    enabled: true,
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:00:00.000Z",
  });

  const prompt = buildAssistantSystemPrompt(state, new Date("2026-06-07T10:00:00.000Z"));
  const skillIndex = prompt.indexOf("ENABLED_SKILLS=Direct mode");
  const toneIndex = prompt.indexOf("Write in a warm, friendly tone.");

  assert.ok(skillIndex > toneIndex);
  assert.equal(prompt.includes("_MODE_ENABLED"), false);
  assert.ok(prompt.includes("override the default dashboard guidance above"));
  assert.ok(prompt.includes("including streamed thinking, tool-use narration, and final replies"));
  assert.ok(prompt.endsWith("Use short direct replies."));
});

test("create_calendar_event appends a local event", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("create_calendar_event", {
    title: "Study maths",
    start: "2026-06-08T09:00:00+10:00",
    end: "2026-06-08T10:30:00+10:00",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.localCalendar.events.length, 1);
  assert.equal(state.localCalendar.events[0].title, "Study maths");
  assert.equal(state.localCalendar.events[0].calendarId, "local");
});

test("create_notification_folder avoids duplicate folder names", async () => {
  const { state, services } = createHarness();
  await executeAssistantAction("create_notification_folder", { title: "Assessments" }, state, services);
  await executeAssistantAction("create_notification_folder", { title: "assessments" }, state, services);
  assert.equal(state.preferences.notificationFolders.length, 1);
});

test("update_class_color stores colors in home settings", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("update_class_color", {
    classCode: "MAT1",
    color: "#2563eb",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.preferences.homeSettings.classColors.MAT1, "#2563eb");
});

test("write_home_note replaces the normalized home note", async () => {
  const { state, services } = createHarness();
  await executeAssistantAction("write_home_note", { markdown: "# Plan\nRevise chapter 4" }, state, services);
  assert.equal(state.preferences.homeLayout.note, "# Plan\nRevise chapter 4");
});

test("create_assistant_skill stores an enabled skill", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("create_assistant_skill", {
    name: "Study planner",
    description: "Helps plan study blocks",
    icon: "IconCalendarTime",
    instructions: "Break tasks into time blocks.",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.skills.length, 1);
  assert.equal(state.skills[0].enabled, true);
  assert.equal(state.skills[0].icon, "IconCalendarTime");
});

test("create_calendar creates an additional local calendar", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("create_calendar", {
    name: "Assessments",
    color: "#f97316",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.localCalendar.calendars.length, 2);
  assert.equal(state.localCalendar.calendars[1].name, "Assessments");
  assert.equal(state.localCalendar.calendars[1].color, "#f97316");
});

test("update_calendar_event edits event timing, calendar, and color", async () => {
  const { state, services } = createHarness();
  state.localCalendar.calendars.push({ id: "study", name: "Study", color: "#2563eb", visible: true, isLocal: true });
  state.localCalendar.events.push({
    id: "event-1",
    title: "Draft essay",
    start: "2026-06-08T08:00:00.000Z",
    end: "2026-06-08T09:00:00.000Z",
    calendarId: "local",
    calendarName: "My Events",
    color: "#10b981",
    isLocal: true,
  });

  const result = await executeAssistantAction("update_calendar_event", {
    id: "event-1",
    title: "Draft history essay",
    start: "2026-06-08T10:00:00.000Z",
    end: "2026-06-08T11:30:00.000Z",
    calendarId: "study",
    color: "#ef4444",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.localCalendar.events[0].title, "Draft history essay");
  assert.equal(state.localCalendar.events[0].calendarId, "study");
  assert.equal(state.localCalendar.events[0].calendarName, "Study");
  assert.equal(state.localCalendar.events[0].color, "#ef4444");
  assert.equal(state.localCalendar.events[0].end, "2026-06-08T11:30:00.000Z");
});

test("move_notification stores folder and status updates", async () => {
  const { state, services } = createHarness();
  state.preferences.notificationFolders.push({ id: "folder-assessments", title: "Assessments", icon: "IconFolder" });
  const result = await executeAssistantAction("move_notification", {
    notificationId: "notice-abc",
    folderId: "folder-assessments",
    read: true,
    pinned: true,
    category: "assignments",
    importance: "high",
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.notificationStates["notice-abc"].folderId, "folder-assessments");
  assert.equal(state.notificationStates["notice-abc"].read, true);
  assert.equal(state.notificationStates["notice-abc"].pinned, true);
  assert.equal(state.notificationStates["notice-abc"].category, "assignments");
  assert.equal(state.notificationStates["notice-abc"].importance, "high");
});

test("move_notification resolves destination folders by title", async () => {
  const { state, services } = createHarness();
  state.preferences.notificationFolders.push({ id: "folder-assessments", title: "Assessments", icon: "IconFolder" });
  const result = await executeAssistantAction("move_notification", {
    title: "Assembly",
    folderTitle: "Assessments",
  }, state, services);
  const [notificationId] = Object.keys(state.notificationStates);

  assert.equal(result.ok, true);
  assert.equal(state.notificationStates[notificationId].folderId, "folder-assessments");
});

test("move_notifications updates many notification states in one save", async () => {
  const { state, services } = createHarness();
  state.preferences.notificationFolders.push({ id: "folder-alerts", title: "Alerts", icon: "IconFolder" });
  state.notificationStates["notice-2"] = {
    read: false,
    pinned: false,
    archived: true,
    autoArchived: true,
  };
  const result = await executeAssistantAction("move_notifications", {
    updates: [
      { notificationId: "notice-1", folderId: "folder-alerts", importance: "high" },
      { notificationId: "notice-2", read: true, archived: true },
    ],
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.notificationStates["notice-1"].folderId, "folder-alerts");
  assert.equal(state.notificationStates["notice-1"].importance, "high");
  assert.equal(state.notificationStates["notice-2"].read, true);
  assert.equal(state.notificationStates["notice-2"].archived, true);
  assert.equal(state.notificationStates["notice-2"].autoArchived, undefined);
});

test("assistant actions reject invalid settings and unsafe record keys", async () => {
  const { state, services } = createHarness();
  const settingsResult = await executeAssistantAction("update_home_settings", {
    settings: { columns: 9, assistantTone: "ignore-all-rules" },
  }, state, services);
  const notificationResult = await executeAssistantAction("move_notification", {
    notificationId: "__proto__",
    read: true,
  }, state, services);

  assert.equal(settingsResult.ok, false);
  assert.equal(notificationResult.ok, false);
  assert.equal(Object.prototype.read, undefined);
});

test("calendar actions require an end after the start", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("create_calendar_event", {
    title: "Invalid event",
    start: "2026-06-08T10:00:00.000Z",
    end: "2026-06-08T09:00:00.000Z",
  }, state, services);

  assert.equal(result.ok, false);
  assert.equal(state.localCalendar.events.length, 0);
});

test("update_shortcut stores server-backed shortcut overrides", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("update_shortcut", {
    shortcutId: "nav-calendar",
    keys: ["g", "e"],
  }, state, services);

  assert.equal(result.ok, true);
  assert.deepEqual(state.preferences.homeSettings.shortcutBindings["nav-calendar"].keys, ["g", "e"]);
  assert.equal(state.preferences.homeSettings.shortcutBindings["nav-calendar"].isSequence, true);
});

test("create_theme supports transparent backgrounds and gradients", async () => {
  const { state, services } = createHarness();
  const result = await executeAssistantAction("create_theme", {
    name: "Glass gradient",
    isAdvanced: true,
    isDark: true,
    colors: {
      bgBase: "rgba(0, 0, 0, 0)",
      bgElevated: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))",
      accent: "linear-gradient(90deg, #06b6d4, #a855f7)",
    },
  }, state, services);

  assert.equal(result.ok, true);
  assert.equal(state.themeBuilder.customThemes[0].isAdvanced, true);
  assert.equal(state.themeBuilder.customThemes[0].colors.bgBase, "rgba(0, 0, 0, 0)");
  assert.equal(state.themeBuilder.customThemes[0].colors.accent, "linear-gradient(90deg, #06b6d4, #a855f7)");
});
