import { useMemo, useState } from "react"
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconHistory,
  IconLayoutColumns,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import styles from "@/styles/Dashboard.module.css"
import type { AttendanceData, AttendancePeriodDay, AttendancePeriodMark, SubjectAttendance } from "@/types/portal"
import { getAttendanceBand, resolveAttendanceThresholds } from "@/types/portal"
import { findTermForDate, parsePortalDate, type SchoolTerm } from "@/lib/school-terms"

type AttendanceThresholds = ReturnType<typeof resolveAttendanceThresholds>

interface AttendancePageProps {
  attendance: AttendanceData | undefined
  enrolledClassCodes?: string[]
  perfectEffectEnabled?: boolean
  attendanceFillingEnabled?: boolean
  attendanceThresholds?: AttendanceThresholds
  /** Terms inferred from the portal calendar, newest year first. Empty when the calendar is too thin. */
  schoolTerms?: readonly SchoolTerm[]
}

interface TermAttendanceSummary {
  term: SchoolTerm
  present: number
  absent: number
  approved: number
  sick: number
  absences: number
  /** Share of marked periods recorded as present. */
  percentage: number | null
}

/**
 * Buckets the dated attendance records — period marks and absence entries — into terms.
 * Yearly totals and per-class percentages carry no dates, so they stay out of this view.
 */
function summariseTermAttendance(
  terms: readonly SchoolTerm[],
  days: readonly AttendancePeriodDay[],
  absences: readonly { start: string }[],
): TermAttendanceSummary[] {
  const summaries = new Map<number, TermAttendanceSummary>(
    terms.map((term) => [term.number, {
      term,
      present: 0,
      absent: 0,
      approved: 0,
      sick: 0,
      absences: 0,
      percentage: null,
    }])
  )

  days.forEach((day) => {
    const date = parsePortalDate(day.date)
    if (!date) return
    const term = findTermForDate(terms, date)
    const summary = term ? summaries.get(term.number) : undefined
    if (!summary) return

    day.periods.forEach((period) => {
      if (period.status === "unmarked") return
      summary[period.status] += 1
    })
  })

  absences.forEach((absence) => {
    const date = parsePortalDate(absence.start)
    if (!date) return
    const term = findTermForDate(terms, date)
    const summary = term ? summaries.get(term.number) : undefined
    if (summary) summary.absences += 1
  })

  return [...summaries.values()].map((summary) => {
    const marked = summary.present + summary.absent + summary.approved + summary.sick
    return {
      ...summary,
      percentage: marked > 0 ? Math.round((summary.present / marked) * 1000) / 10 : null,
    }
  })
}

function getAttendanceColorClass(percentage: number | null, thresholds: AttendanceThresholds): string {
  return getAttendanceBand(percentage, thresholds) ?? ""
}

function formatTermRange(term: SchoolTerm): string {
  const format = (value: Date) => value.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return `${format(term.start)} – ${format(term.end)}`
}

function perfectClass(value: number | null, enabled: boolean): string {
  return enabled && value === 100 ? styles.perfectAttendance : ""
}

function normalizePeriodLabel(label: string): string {
  return label.trim().toLowerCase().replace(/^p/, "")
}

function periodNumber(label: string): number {
  return Number.parseInt(normalizePeriodLabel(label), 10)
}

function hasPeriodClass(period: AttendancePeriodMark | undefined): boolean {
  return Boolean(period?.classCode?.trim())
}

function getVisiblePeriodLabels(days: AttendancePeriodDay[]): string[] {
  const labels = new Set<string>()
  days.forEach((day) => day.periods.forEach((period) => {
    const label = normalizePeriodLabel(period.label)
    if (label && hasPeriodClass(period)) labels.add(label)
  }))

  return [...labels].sort((left, right) => {
    const numberDifference = periodNumber(left) - periodNumber(right)
    return numberDifference || left.localeCompare(right)
  })
}

function getPeriodsForDay(day: AttendancePeriodDay): Map<string, AttendancePeriodMark> {
  const periods = new Map<string, AttendancePeriodMark>()
  day.periods.forEach((period) => {
    const label = normalizePeriodLabel(period.label)
    if (!label) return
    const existing = periods.get(label)
    if (!existing || (!hasPeriodClass(existing) && hasPeriodClass(period))) periods.set(label, period)
  })
  return periods
}

type DisplayPeriod = AttendancePeriodMark & { inferred?: boolean }

function fillUnmarkedPeriods(
  periods: Map<string, AttendancePeriodMark>,
  visibleLabels: string[],
  enabled: boolean,
): Map<string, DisplayPeriod> {
  const filled = new Map<string, DisplayPeriod>(periods)
  if (!enabled) return filled

  const labelsByClass = new Map<string, string[]>()
  visibleLabels.forEach((label) => {
    const classCode = periods.get(label)?.classCode?.trim()
    if (!classCode) return
    labelsByClass.set(classCode, [...(labelsByClass.get(classCode) || []), label])
  })

  labelsByClass.forEach((labels) => {
    const marked: Array<{ label: string; index: number; period: AttendancePeriodMark }> = []
    labels.forEach((label, index) => {
      const period = periods.get(label)
      if (period && period.status !== "unmarked") marked.push({ label, index, period })
    })
    if (marked.length === 0) return

    labels.forEach((label, index) => {
      const period = periods.get(label)
      if (!period || period.status !== "unmarked") return

      const previous = [...marked].reverse().find((entry) => entry.index < index)
      const next = marked.find((entry) => entry.index > index)
      let source = previous?.period || next?.period

      // Present followed by an exception usually means teacher skipped middle roll.
      if (previous?.period.status === "present" && next && next.period.status !== "present") {
        source = previous.period
      } else if (previous && next && previous.period.status === next.period.status) {
        source = previous.period
      } else if (previous && !next) {
        // Trailing gaps inherit latest roll, including changed second-period status.
        source = previous.period
      } else if (!previous && next) {
        source = next.period
      }

      if (source) filled.set(label, { ...period, status: source.status, inferred: true })
    })
  })

  return filled
}

function SubjectTable({
  subjects,
  perfectEffectEnabled,
  thresholds,
}: {
  subjects: SubjectAttendance[]
  perfectEffectEnabled: boolean
  thresholds: AttendanceThresholds
}) {
  return (
    <div className={styles.attendanceTableShell}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">Marked</TableHead>
            <TableHead className="text-right">Absent</TableHead>
            <TableHead>Attendance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((subject) => {
            const hasData = subject.percentage !== null && subject.rollsMarked > 0
            const colorClass = hasData ? getAttendanceColorClass(subject.percentage, thresholds) : ""
            return (
              <TableRow key={subject.classCode}>
                <TableCell className="font-medium">{subject.classCode}</TableCell>
                <TableCell className="text-right tabular-nums">{subject.rollsMarked}</TableCell>
                <TableCell className="text-right tabular-nums">{subject.absent}</TableCell>
                <TableCell>
                  <div className={styles.attendanceSubjectResult}>
                    <div className={styles.attendanceProgressBar}>
                      {hasData && (
                        <div
                          className={`${styles.attendanceProgressFill} ${styles[colorClass]}`}
                          style={{ width: `${subject.percentage}%` }}
                        />
                      )}
                    </div>
                    <span className={`${styles.attendanceCompactPercentage} ${styles[colorClass]} ${perfectClass(subject.percentage, perfectEffectEnabled)}`}>
                      {hasData ? `${subject.percentage}%` : "–"}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function AttendancePage({
  attendance,
  enrolledClassCodes,
  perfectEffectEnabled = true,
  attendanceFillingEnabled = true,
  attendanceThresholds,
  schoolTerms = [],
}: AttendancePageProps) {
  const thresholds = attendanceThresholds ?? resolveAttendanceThresholds()
  const yearlyAttendance = attendance?.yearly || []
  const subjectAttendance = attendance?.subjects || []
  const absences = attendance?.absences || []
  const recentPeriods = attendance?.recentPeriods || []
  const enrolledCodes = new Set(enrolledClassCodes)
  const hasEnrolmentData = enrolledCodes.size > 0
  const enrolledSubjects = subjectAttendance.filter((subject) => !hasEnrolmentData || enrolledCodes.has(subject.classCode))
  const unenrolledSubjects = subjectAttendance.filter((subject) => hasEnrolmentData && !enrolledCodes.has(subject.classCode))
  const sortedYears = [...yearlyAttendance].sort((a, b) => Number(b.year) - Number(a.year))
  const [selectedYearIndex, setSelectedYearIndex] = useState(0)
  const safeYearIndex = Math.min(selectedYearIndex, Math.max(sortedYears.length - 1, 0))
  const selectedYear = sortedYears[safeYearIndex]
  const totalSchoolDays = yearlyAttendance.reduce((sum, year) => sum + year.schoolDays, 0)
  const totalWholeDays = yearlyAttendance.reduce((sum, year) => sum + year.wholeDayAbsences, 0)
  const totalPartialDays = yearlyAttendance.reduce((sum, year) => sum + year.partialAbsences, 0)
  const collectiveRate = totalSchoolDays > 0
    ? yearlyAttendance.reduce((sum, year) => sum + (year.totalPercentage * year.schoolDays), 0) / totalSchoolDays
    : null
  const visiblePeriodLabels = getVisiblePeriodLabels(recentPeriods)
  const termSummaries = useMemo(
    () => (schoolTerms.length > 0
      ? summariseTermAttendance(schoolTerms, attendance?.recentPeriods || [], attendance?.absences || [])
      : []),
    [attendance?.absences, attendance?.recentPeriods, schoolTerms]
  )
  const hasTermData = termSummaries.some((summary) => summary.percentage !== null || summary.absences > 0)

  if (!attendance || (yearlyAttendance.length === 0 && subjectAttendance.length === 0 && absences.length === 0)) {
    return (
      <div className={styles.contentWrapper} data-tour-id="page-attendance">
        <div className={styles.contentWrapperInner}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia><IconClipboardCheck size={48} stroke={1} /></EmptyMedia>
              <EmptyTitle>No Attendance Data</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.contentWrapper} data-tour-id="page-attendance">
      <div className={styles.contentWrapperInner}>
        {yearlyAttendance.length > 0 && (
          <div className={styles.attendanceSummaryBar}>
            <div className={styles.attendanceSummaryLead}>
              <span className={`${styles.attendanceSummaryValue} ${styles[getAttendanceColorClass(collectiveRate, thresholds)]} ${perfectClass(collectiveRate, perfectEffectEnabled)}`}>
                {collectiveRate !== null ? `${collectiveRate.toFixed(1)}%` : "–"}
              </span>
              <span className={styles.attendanceSummaryLabel}>All-time attendance</span>
            </div>
            <div className={styles.attendanceSummaryItem}>
              <span className={styles.attendanceSummaryValue}>{totalSchoolDays}</span>
              <span className={styles.attendanceSummaryLabel}>School days</span>
            </div>
            <div className={styles.attendanceSummaryItem}>
              <span className={styles.attendanceSummaryValue}>{totalWholeDays}</span>
              <span className={styles.attendanceSummaryLabel}>Whole days</span>
            </div>
            <div className={styles.attendanceSummaryItem}>
              <span className={styles.attendanceSummaryValue}>{Number(totalPartialDays.toFixed(2))}</span>
              <span className={styles.attendanceSummaryLabel}>Partial days</span>
            </div>
            <div className={styles.attendanceSummaryItem}>
              <span className={styles.attendanceSummaryValue}>{yearlyAttendance.length}</span>
              <span className={styles.attendanceSummaryLabel}>Years tracked</span>
            </div>
          </div>
        )}

        <div className={styles.attendanceDashboardGrid}>
          <div className={styles.attendanceMainColumn}>
            <section className={`${styles.attendancePanel} ${styles.attendanceHistoryPanel}`} data-tour-id="attendance-inference">
            <h3 className={styles.attendanceSectionTitle}><IconHistory size={18} />Absence History</h3>
            {absences.length > 0 ? (
              <div className={styles.attendanceHistoryList}>
                {absences.map((absence, index) => (
                  <article className={styles.attendanceHistoryItem} key={`${absence.start}-${absence.type}-${index}`}>
                    <div className={styles.attendanceHistoryTopline}>
                      <span className={styles.attendanceHistoryType}>{absence.type}</span>
                      <time>{absence.start}</time>
                    </div>
                    <strong>{absence.reason || "No reason recorded"}</strong>
                    <div className={styles.attendanceHistoryMeta}>
                      {absence.end && <span>Ended {absence.end}</span>}
                      {absence.detail && <span>{absence.detail}</span>}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className={styles.attendanceEmptyText}>Detailed history arrives after next attendance sync.</p>}
            </section>

            {schoolTerms.length > 0 && (
              <section className={styles.attendancePanel}>
                <h3 className={styles.attendanceSectionTitle}><IconLayoutColumns size={18} />By Term</h3>
                {hasTermData ? (
                  <div className={styles.attendanceTableShell}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead className="text-right">Absences</TableHead>
                          <TableHead className="text-right">Marks</TableHead>
                          <TableHead>Attendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {termSummaries.map((summary) => {
                          const marks = summary.present + summary.absent + summary.approved + summary.sick
                          const colorClass = getAttendanceColorClass(summary.percentage, thresholds)
                          return (
                            <TableRow key={summary.term.number}>
                              <TableCell className="font-medium">{summary.term.label}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatTermRange(summary.term)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{summary.absences}</TableCell>
                              <TableCell className="text-right tabular-nums">{marks}</TableCell>
                              <TableCell>
                                <div className={styles.attendanceSubjectResult}>
                                  <div className={styles.attendanceProgressBar}>
                                    {summary.percentage !== null && (
                                      <div
                                        className={`${styles.attendanceProgressFill} ${styles[colorClass]}`}
                                        style={{ width: `${summary.percentage}%` }}
                                      />
                                    )}
                                  </div>
                                  <span className={`${styles.attendanceCompactPercentage} ${styles[colorClass]} ${perfectClass(summary.percentage, perfectEffectEnabled)}`}>
                                    {summary.percentage !== null ? `${summary.percentage}%` : "–"}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className={styles.attendanceEmptyText}>
                    Terms were inferred from the school calendar, but no dated attendance records fall inside them yet.
                  </p>
                )}
              </section>
            )}

            <section className={`${styles.attendancePanel} ${styles.attendanceClassPanel}`}>
              <h3 className={styles.attendanceSectionTitle}><IconBook size={18} />Class Attendance</h3>
              {enrolledSubjects.length > 0 ? <SubjectTable subjects={enrolledSubjects} perfectEffectEnabled={perfectEffectEnabled} thresholds={thresholds} /> : <p className={styles.attendanceEmptyText}>No enrolled class attendance.</p>}
              {unenrolledSubjects.length > 0 && (
                <Collapsible className={`group mt-3 ${styles.attendanceUnenrolled}`}>
                  <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" />}>
                    Unenrolled classes ({unenrolledSubjects.length})
                    <IconChevronDown className={styles.attendanceUnenrolledChevron} aria-hidden="true" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className={styles.attendanceUnenrolledContent}><SubjectTable subjects={unenrolledSubjects} perfectEffectEnabled={perfectEffectEnabled} thresholds={thresholds} /></CollapsibleContent>
                </Collapsible>
              )}
            </section>
          </div>

          <div className={styles.attendanceSideColumn}>
            <section className={`${styles.attendancePanel} ${styles.attendanceOfficialPanel}`}>
              <h3 className={styles.attendanceSectionTitle}><IconCalendar size={18} />Official Attendance</h3>
              {selectedYear && (
                <div className={styles.attendanceYearCard}>
                  <div className={styles.attendanceYearNavigation}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={safeYearIndex === 0}
                      onClick={() => setSelectedYearIndex((index) => Math.max(0, index - 1))}
                      aria-label="View newer year"
                    ><IconChevronLeft /></Button>
                    <div><strong>{selectedYear.year}</strong><span>{selectedYear.schoolDays} school days</span></div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={safeYearIndex >= sortedYears.length - 1}
                      onClick={() => setSelectedYearIndex((index) => Math.min(sortedYears.length - 1, index + 1))}
                      aria-label="View older year"
                    ><IconChevronRight /></Button>
                  </div>
                  <div className={`${styles.attendanceYearPercentage} ${styles[getAttendanceColorClass(selectedYear.totalPercentage, thresholds)]} ${perfectClass(selectedYear.totalPercentage, perfectEffectEnabled)}`}>
                    {selectedYear.totalPercentage.toFixed(1)}%
                  </div>
                  <div className={styles.attendanceProgressBar}>
                    <div className={`${styles.attendanceProgressFill} ${styles[getAttendanceColorClass(selectedYear.totalPercentage, thresholds)]}`} style={{ width: `${selectedYear.totalPercentage}%` }} />
                  </div>
                  <div className={styles.attendanceYearStats}>
                    <div><span>Whole-day absences</span><strong>{selectedYear.wholeDayAbsences}</strong></div>
                    <div><span>Whole-day rate</span><strong>{selectedYear.wholeDayPercentage.toFixed(1)}%</strong></div>
                    <div><span>Partial absences</span><strong>{selectedYear.partialAbsences}</strong></div>
                  </div>
                </div>
              )}
            </section>

            {recentPeriods.length > 0 && (
              <section className={styles.attendancePanel}>
                <h3 className={styles.attendanceSectionTitle}><IconClock size={18} />Recent Period Attendance</h3>
                <div className={styles.attendancePeriodList}>
                  {recentPeriods.map((day) => {
                    const displayPeriods = fillUnmarkedPeriods(getPeriodsForDay(day), visiblePeriodLabels, attendanceFillingEnabled)
                    return (
                    <div className={styles.attendancePeriodRow} key={`${day.day}-${day.date}`}>
                      <div className={styles.attendancePeriodDate}><strong>{day.day}</strong><span>{day.date}</span></div>
                      <div className={styles.attendancePeriodMarks}>
                        {visiblePeriodLabels.map((label) => {
                          const period = displayPeriods.get(label)
                          const muted = !hasPeriodClass(period)
                          return (
                            <span
                              key={label}
                              className={`${styles.attendancePeriodMark} ${styles[period?.status || "unmarked"]} ${muted ? styles.muted : ""} ${period?.inferred ? styles.inferred : ""}`}
                              title={period ? [period.label, period.classCode, period.reason, period.inferred ? "inferred from this class" : ""].filter(Boolean).join(" · ") : `Period ${label} · no class`}
                              aria-label={period ? [period.label, period.classCode, period.reason, period.status, period.inferred ? "inferred" : ""].filter(Boolean).join(", ") : `Period ${label}, no class`}
                            >{label}</span>
                          )
                        })}
                      </div>
                    </div>
                    )
                  })}
                </div>
                <div className={styles.attendanceLegend}>
                  <span><i className={styles.present} />Present</span><span><i className={styles.absent} />Absent</span><span><i className={styles.sick} />Sick</span><span><i className={styles.approved} />Approved</span>
                </div>
              </section>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
