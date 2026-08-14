import { sanitizeClassEntries } from "@/lib/portal-classes"
import type {
  AttendanceData,
  ClassEntry,
  FullTimetable,
  FullTimetableEntry,
  PortalData,
} from "@/types/portal"

export type TimetableWeekKey = "weekA" | "weekB"

/** Where a class's roll and absence counts came from, so the UI can explain empty values. */
export type ClassAttendanceSource = "classes" | "attendance-subjects" | "attendance-periods" | "none"

/** Why a class counts as no longer current, so the UI can word it correctly. */
export type ClassEnrolmentStatus = "enrolled" | "not-in-timetable" | "hidden-locally"

export type ClassInsight = ClassEntry & {
  timetablePeriods: number
  timetableDays: string[]
  rooms: string[]
  attendanceRate: number | null
  absenceLabel: string
  attendanceSource: ClassAttendanceSource
  hasTimetableMatch: boolean
  enrolmentStatus: ClassEnrolmentStatus
  isEnrolled: boolean
}

export interface BuildClassInsightsOptions {
  /** Classes the user hid manually; they stay visible but are treated as not current. */
  locallyUnenrolledKeys?: readonly string[]
}

export type RoomChangeReviewItem = {
  classCode: string
  course: string
  teacher: string
  week: TimetableWeekKey
  day: string
  period: string
  fromRoom: string
  toRoom: string
}

export type SyncReviewItems = {
  unenrollCandidates: ClassInsight[]
  roomChanges: RoomChangeReviewItem[]
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const DAY_INDEX = new Map(DAYS.map((day, index) => [day.toLowerCase(), index]))

function clean(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeText(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}

function classIdentity(course: unknown, classCode: unknown): string {
  const normalizedCode = normalizeText(classCode)
  if (normalizedCode) return `code:${normalizedCode}`
  return `course:${normalizeText(course)}`
}

export function getClassReviewKey(classItem: Pick<ClassEntry, "course" | "classCode">): string {
  return classIdentity(classItem.course, classItem.classCode)
}

function normalizeDay(day: unknown): string {
  const normalized = normalizeText(day)
  const match = DAYS.find((value) => value.toLowerCase() === normalized)
  return match || clean(day)
}

function parsePeriodNumber(period: unknown): number {
  const match = clean(period).match(/\d+/)
  return match ? Number(match[0]) : 0
}

function compareTimetableEntries(a: FullTimetableEntry, b: FullTimetableEntry): number {
  const dayDelta = (DAY_INDEX.get(normalizeText(a.day)) ?? 99) - (DAY_INDEX.get(normalizeText(b.day)) ?? 99)
  if (dayDelta !== 0) return dayDelta
  return parsePeriodNumber(a.period) - parsePeriodNumber(b.period)
}

export function normalizeFullTimetable(timetable: unknown): FullTimetable {
  if (!timetable || typeof timetable !== "object" || Array.isArray(timetable)) {
    return { weekA: [], weekB: [] }
  }

  const source = timetable as Partial<FullTimetable>
  return {
    weekA: Array.isArray(source.weekA) ? [...source.weekA].sort(compareTimetableEntries) : [],
    weekB: Array.isArray(source.weekB) ? [...source.weekB].sort(compareTimetableEntries) : [],
  }
}

function flattenTimetable(timetable: unknown): Array<FullTimetableEntry & { week: TimetableWeekKey }> {
  const normalized = normalizeFullTimetable(timetable)
  return (["weekA", "weekB"] as TimetableWeekKey[]).flatMap((week) =>
    normalized[week].map((entry) => ({ ...entry, week }))
  )
}

export function getTimetableEntryKey(week: TimetableWeekKey, day: string, entry: Pick<FullTimetableEntry, "period" | "course" | "classCode">): string {
  return [
    week,
    normalizeText(day),
    normalizeText(entry.period),
    classIdentity(entry.course, entry.classCode),
  ].join("|")
}

interface ClassAttendanceTotals {
  rollsMarked: number
  absences: number
}

const ABSENT_PERIOD_STATUSES = new Set(["absent", "approved", "sick"])

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

/** Per-class totals reported by the attendance register, keyed by normalized class code. */
function attendanceSubjectTotals(attendance: AttendanceData | null | undefined) {
  const totals = new Map<string, ClassAttendanceTotals>()
  for (const subject of attendance?.subjects ?? []) {
    const key = normalizeText(subject.classCode)
    if (!key) continue
    const current = totals.get(key) ?? { rollsMarked: 0, absences: 0 }
    totals.set(key, {
      rollsMarked: Math.max(current.rollsMarked, nonNegativeInteger(subject.rollsMarked)),
      absences: Math.max(current.absences, nonNegativeInteger(subject.absent)),
    })
  }
  return totals
}

/**
 * Fallback for classes the subject register omits entirely. Counts only the recent period marks
 * Millennium actually holds, so it under-reports rather than inventing history.
 */
function attendancePeriodTotals(attendance: AttendanceData | null | undefined) {
  const totals = new Map<string, ClassAttendanceTotals>()
  for (const day of attendance?.recentPeriods ?? []) {
    for (const mark of day.periods ?? []) {
      const key = normalizeText(mark.classCode)
      if (!key || mark.status === "unmarked") continue
      const current = totals.get(key) ?? { rollsMarked: 0, absences: 0 }
      totals.set(key, {
        rollsMarked: current.rollsMarked + 1,
        absences: current.absences + (ABSENT_PERIOD_STATUSES.has(mark.status) ? 1 : 0),
      })
    }
  }
  return totals
}

function resolveClassAttendance(
  classItem: ClassEntry,
  subjectTotals: ReadonlyMap<string, ClassAttendanceTotals>,
  periodTotals: ReadonlyMap<string, ClassAttendanceTotals>
): ClassAttendanceTotals & { source: ClassAttendanceSource } {
  const portalRolls = nonNegativeInteger(classItem.rollsMarked)
  const portalAbsences = nonNegativeInteger(classItem.absences)
  if (portalRolls > 0 && portalAbsences > 0) {
    return { rollsMarked: portalRolls, absences: portalAbsences, source: "classes" }
  }

  const key = normalizeText(classItem.classCode)
  const subject = key ? subjectTotals.get(key) : undefined
  if (subject && subject.rollsMarked > 0) {
    return {
      rollsMarked: Math.max(portalRolls, subject.rollsMarked),
      absences: Math.max(portalAbsences, subject.absences),
      source: "attendance-subjects",
    }
  }

  const periods = key ? periodTotals.get(key) : undefined
  if (periods && periods.rollsMarked > 0) {
    return {
      rollsMarked: Math.max(portalRolls, periods.rollsMarked),
      absences: Math.max(portalAbsences, periods.absences),
      source: "attendance-periods",
    }
  }

  return {
    rollsMarked: portalRolls,
    absences: portalAbsences,
    source: portalRolls > 0 ? "classes" : "none",
  }
}

export function buildClassInsights(
  classes: ClassEntry[] = [],
  timetable: unknown,
  attendance?: AttendanceData | null,
  options: BuildClassInsightsOptions = {}
): ClassInsight[] {
  const entries = flattenTimetable(timetable)
  const subjectTotals = attendanceSubjectTotals(attendance)
  const periodTotals = attendancePeriodTotals(attendance)
  const locallyUnenrolled = new Set(options.locallyUnenrolledKeys ?? [])
  // With no timetable at all (failed or partial sync) nothing can be judged unenrolled,
  // so every class stays current rather than the page emptying itself.
  const canDeriveEnrolment = entries.length > 0

  return sanitizeClassEntries(classes).map((classItem) => {
    const identity = classIdentity(classItem.course, classItem.classCode)
    const matches = entries.filter((entry) => classIdentity(entry.course, entry.classCode) === identity)
    const daySet = new Set(matches.map((entry) => normalizeDay(entry.day)).filter(Boolean))
    const roomSet = new Set(matches.map((entry) => clean(entry.room)).filter(Boolean))
    const resolved = resolveClassAttendance(classItem, subjectTotals, periodTotals)
    const attendanceRate = resolved.rollsMarked > 0
      ? Math.round(((resolved.rollsMarked - Math.min(resolved.absences, resolved.rollsMarked)) / resolved.rollsMarked) * 100)
      : null

    const hasTimetableMatch = matches.length > 0
    const enrolmentStatus: ClassEnrolmentStatus = locallyUnenrolled.has(identity)
      ? "hidden-locally"
      : canDeriveEnrolment && !hasTimetableMatch
        ? "not-in-timetable"
        : "enrolled"

    return {
      ...classItem,
      lessons: nonNegativeInteger(classItem.lessons),
      quickMerits: nonNegativeInteger(classItem.quickMerits),
      rollsMarked: resolved.rollsMarked,
      absences: resolved.absences,
      timetablePeriods: matches.length,
      timetableDays: DAYS.filter((day) => daySet.has(day)),
      rooms: [...roomSet],
      attendanceRate,
      absenceLabel: resolved.source === "none"
        ? "Not recorded"
        : resolved.absences === 0
          ? "No absences"
          : `${resolved.absences} ${resolved.absences === 1 ? "absence" : "absences"}`,
      attendanceSource: resolved.source,
      hasTimetableMatch,
      enrolmentStatus,
      isEnrolled: enrolmentStatus === "enrolled",
    }
  })
}

/** Splits insights into the classes the student is currently taking and the rest. */
export function partitionClassInsights(insights: readonly ClassInsight[]): {
  enrolled: ClassInsight[]
  unenrolled: ClassInsight[]
} {
  const enrolled: ClassInsight[] = []
  const unenrolled: ClassInsight[] = []
  for (const insight of insights) {
    if (insight.isEnrolled) enrolled.push(insight)
    else unenrolled.push(insight)
  }
  return { enrolled, unenrolled }
}

export function detectSyncReviewItems(
  previous: Pick<PortalData, "classes" | "timetable"> | null | undefined,
  next: Pick<PortalData, "classes" | "timetable"> | null | undefined
): SyncReviewItems {
  if (!next) {
    return { unenrollCandidates: [], roomChanges: [] }
  }

  const classInsights = buildClassInsights(next.classes || [], next.timetable)
  // `not-in-timetable` already accounts for an empty timetable, so a failed sync cannot
  // queue an unenrol prompt for every class.
  const unenrollCandidates = classInsights.filter((classItem) => classItem.enrolmentStatus === "not-in-timetable")
  const roomChanges: RoomChangeReviewItem[] = []

  if (previous) {
    const previousEntries = flattenTimetable(previous.timetable)
    const previousBySlot = new Map<string, FullTimetableEntry & { week: TimetableWeekKey }>()
    for (const entry of previousEntries) {
      previousBySlot.set(getTimetableEntryKey(entry.week, entry.day, entry), entry)
    }

    const seenChanges = new Set<string>()
    for (const entry of flattenTimetable(next.timetable)) {
      const previousEntry = previousBySlot.get(getTimetableEntryKey(entry.week, entry.day, entry))
      if (!previousEntry) continue

      const fromRoom = clean(previousEntry.room)
      const toRoom = clean(entry.room)
      if (!fromRoom || !toRoom || normalizeText(fromRoom) === normalizeText(toRoom)) continue

      const changeKey = [
        classIdentity(entry.course, entry.classCode),
        entry.week,
        normalizeText(entry.day),
        normalizeText(entry.period),
        normalizeText(fromRoom),
        normalizeText(toRoom),
      ].join("|")
      if (seenChanges.has(changeKey)) continue
      seenChanges.add(changeKey)

      roomChanges.push({
        classCode: clean(entry.classCode),
        course: clean(entry.course),
        teacher: clean(entry.teacher),
        week: entry.week,
        day: normalizeDay(entry.day),
        period: clean(entry.period),
        fromRoom,
        toRoom,
      })
    }
  }

  return { unenrollCandidates, roomChanges }
}
