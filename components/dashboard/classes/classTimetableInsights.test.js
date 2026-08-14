import test from "node:test"
import assert from "node:assert/strict"

import {
  buildClassInsights,
  detectSyncReviewItems,
  getTimetableEntryKey,
  normalizeFullTimetable,
  partitionClassInsights,
} from "./classTimetableInsights.ts"

const classes = [
  {
    course: "Mathematics Advanced",
    classCode: "11MAT1",
    teacher: "Ms Smith",
    lessons: 6,
    quickMerits: 2,
    rollsMarked: 18,
    absences: 1,
  },
  {
    course: "English Advanced",
    classCode: "11ENG1",
    teacher: "Mr Jones",
    lessons: 4,
    quickMerits: 0,
    rollsMarked: 12,
    absences: 0,
  },
]

const timetable = {
  weekA: [
    { day: "Monday", period: "P1", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "G4" },
    { day: "Monday", period: "P2", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "G4" },
    { day: "Wednesday", period: "P4", course: "English Advanced", classCode: "11ENG1", teacher: "Mr Jones", room: "H15" },
  ],
  weekB: [
    { day: "Friday", period: "P3", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "G5" },
  ],
}

test("normalizeFullTimetable returns empty weeks for invalid or legacy timetable data", () => {
  assert.deepEqual(normalizeFullTimetable(null), { weekA: [], weekB: [] })
  assert.deepEqual(normalizeFullTimetable([{ period: "P1" }]), { weekA: [], weekB: [] })
})

test("buildClassInsights summarizes timetable coverage and attendance risk", () => {
  const insights = buildClassInsights(classes, timetable)

  assert.equal(insights.length, 2)
  assert.deepEqual(insights[0], {
    ...classes[0],
    timetablePeriods: 3,
    timetableDays: ["Monday", "Friday"],
    rooms: ["G4", "G5"],
    attendanceRate: 94,
    absenceLabel: "1 absence",
    attendanceSource: "classes",
    hasTimetableMatch: true,
    enrolmentStatus: "enrolled",
    isEnrolled: true,
  })
  assert.equal(insights[1].timetablePeriods, 1)
  assert.equal(insights[1].absenceLabel, "No absences")
})

test("buildClassInsights drops scraper junk rows named after numbers", () => {
  const insights = buildClassInsights(
    [...classes, { course: "100", classCode: "100", teacher: "", lessons: 0, quickMerits: 0, rollsMarked: 0, absences: 0 }],
    timetable
  )

  assert.deepEqual(insights.map((insight) => insight.classCode), ["11MAT1", "11ENG1"])
})

test("buildClassInsights marks classes missing from the timetable as unenrolled", () => {
  const insights = buildClassInsights(classes, {
    weekA: [{ day: "Monday", period: "P1", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "G4" }],
    weekB: [],
  })
  const { enrolled, unenrolled } = partitionClassInsights(insights)

  assert.deepEqual(enrolled.map((insight) => insight.classCode), ["11MAT1"])
  assert.deepEqual(unenrolled.map((insight) => insight.enrolmentStatus), ["not-in-timetable"])
})

test("buildClassInsights keeps every class enrolled when the timetable is empty", () => {
  const insights = buildClassInsights(classes, { weekA: [], weekB: [] })

  assert.deepEqual(insights.map((insight) => insight.isEnrolled), [true, true])
})

test("buildClassInsights honours locally hidden classes", () => {
  const insights = buildClassInsights(classes, timetable, null, {
    locallyUnenrolledKeys: ["code:11eng1"],
  })

  assert.equal(insights[1].enrolmentStatus, "hidden-locally")
  assert.equal(insights[1].isEnrolled, false)
})

test("detectSyncReviewItems finds classes no longer present in timetable", () => {
  const next = {
    classes,
    timetable: {
      weekA: [
        { day: "Monday", period: "P1", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "G4" },
      ],
      weekB: [],
    },
  }

  const review = detectSyncReviewItems(null, next)

  assert.equal(review.unenrollCandidates.length, 1)
  assert.equal(review.unenrollCandidates[0].classCode, "11ENG1")
})

test("detectSyncReviewItems reports room changes for the same class slot", () => {
  const previous = { classes, timetable }
  const next = {
    classes,
    timetable: {
      weekA: [
        { day: "Monday", period: "P1", course: "Mathematics Advanced", classCode: "11MAT1", teacher: "Ms Smith", room: "H15" },
        { day: "Wednesday", period: "P4", course: "English Advanced", classCode: "11ENG1", teacher: "Mr Jones", room: "H15" },
      ],
      weekB: [],
    },
  }

  const review = detectSyncReviewItems(previous, next)

  assert.equal(review.roomChanges.length, 1)
  assert.deepEqual(review.roomChanges[0], {
    classCode: "11MAT1",
    course: "Mathematics Advanced",
    teacher: "Ms Smith",
    week: "weekA",
    day: "Monday",
    period: "P1",
    fromRoom: "G4",
    toRoom: "H15",
  })
})

test("getTimetableEntryKey is stable for the same timetable slot", () => {
  assert.equal(
    getTimetableEntryKey("weekA", "Monday", { period: "P1", classCode: "11MAT1", course: "Math", teacher: "Ms Smith", room: "G4" }),
    getTimetableEntryKey("weekA", "Monday", { period: "P1", classCode: "11MAT1", course: "Math", teacher: "Other", room: "H15" })
  )
})
