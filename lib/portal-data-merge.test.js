import test from "node:test"
import assert from "node:assert/strict"

import { mergePortalData } from "./portal-data-merge.ts"

test("mergePortalData preserves an existing notice archive when auto sync returns a small window", () => {
  const existing = {
    user: { name: "Student", school: "rhhs" },
    timetable: [],
    notices: Array.from({ length: 2000 }, (_, index) => ({
      title: `Notice ${index}`,
      preview: `Preview ${index}`,
      content: `Content ${index}`,
      date: "2026-07-09",
    })),
    diary: [],
    lastUpdated: "2026-07-01T00:00:00.000Z",
  }
  const incoming = {
    user: { name: "Student", school: "rhhs" },
    timetable: [],
    notices: Array.from({ length: 66 }, (_, index) => ({
      title: `Fresh Notice ${index}`,
      preview: `Fresh Preview ${index}`,
      content: `Fresh Content ${index}`,
      date: "2026-07-09",
    })),
    diary: [],
    lastUpdated: "2026-07-09T00:00:00.000Z",
  }

  const merged = mergePortalData(existing, incoming)

  assert.equal(merged?.notices.length, 2066)
  assert.equal(merged?.lastUpdated, incoming.lastUpdated)
})

test("mergePortalData keeps every subject when a sync only reports the classes that changed", () => {
  const existing = {
    user: { name: "Student", school: "rhhs" },
    timetable: { weekA: [], weekB: [] },
    notices: [],
    diary: [],
    classes: [
      { classCode: "12BIO1", course: "Biology", lessons: 40 },
      { classCode: "12CHE1", course: "Chemistry", lessons: 38 },
      { classCode: "12ENG1", course: "English Advanced", lessons: 44 },
      { classCode: "12MAT1", course: "Mathematics Advanced", lessons: 41 },
    ],
    lastUpdated: "2026-08-13T00:00:00.000Z",
  }
  const incoming = {
    user: { name: "Student", school: "rhhs" },
    classes: [{ classCode: "12BIO1", course: "Biology", lessons: 41 }],
    lastUpdated: "2026-08-14T00:00:00.000Z",
  }

  const merged = mergePortalData(existing, incoming)

  assert.equal(merged?.classes.length, 4)
  assert.equal(merged?.classes.find((entry) => entry.classCode === "12BIO1").lessons, 41)
  assert.equal(merged?.classes.find((entry) => entry.classCode === "12MAT1").lessons, 41)
})

test("mergePortalData keeps the full week when a sync only reports the periods that changed", () => {
  const existing = {
    user: { name: "Student", school: "rhhs" },
    notices: [],
    diary: [],
    timetable: {
      weekA: [
        { day: "monday", period: "1", classCode: "12BIO1", course: "Biology", room: "S1" },
        { day: "monday", period: "2", classCode: "12CHE1", course: "Chemistry", room: "S2" },
      ],
      weekB: [
        { day: "monday", period: "1", classCode: "12ENG1", course: "English Advanced", room: "E4" },
      ],
    },
    lastUpdated: "2026-08-13T00:00:00.000Z",
  }
  const incoming = {
    user: { name: "Student", school: "rhhs" },
    timetable: {
      weekA: [{ day: "monday", period: "2", classCode: "12CHE1", course: "Chemistry", room: "S7" }],
    },
    lastUpdated: "2026-08-14T00:00:00.000Z",
  }

  const merged = mergePortalData(existing, incoming)

  assert.equal(merged?.timetable.weekA.length, 2)
  assert.equal(merged?.timetable.weekB.length, 1)
  assert.equal(merged?.timetable.weekA.find((entry) => entry.period === "2").room, "S7")
})

test("mergePortalData merges duplicate notices instead of double-counting them", () => {
  const existing = {
    user: { name: "Student", school: "rhhs" },
    timetable: [],
    notices: [{ title: "Assembly", preview: "Hall", content: "Bring diary", date: "2026-07-08" }],
    diary: [],
    lastUpdated: "2026-07-08T00:00:00.000Z",
  }
  const incoming = {
    user: { name: "Student", school: "rhhs" },
    timetable: [],
    notices: [{ title: "Assembly", preview: "Hall", content: "Bring diary", date: "2026-07-09" }],
    diary: [],
    lastUpdated: "2026-07-09T00:00:00.000Z",
  }

  const merged = mergePortalData(existing, incoming)

  assert.equal(merged?.notices.length, 1)
  assert.deepEqual(merged?.notices[0].dates, ["2026-07-08", "2026-07-09"])
})
