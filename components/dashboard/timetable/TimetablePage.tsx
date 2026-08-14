"use client"

import { IconCalendar } from "@tabler/icons-react"

import { TopbarToggleGroup } from "@/components/ContentTopbar"
import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from "@/components/dashboard/DashboardPage"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ColorPicker, ColorPickerContent, ColorPickerTrigger } from "@/components/ui/color-picker"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getTimetableEntryKey,
  normalizeFullTimetable,
  type TimetableWeekKey,
} from "@/components/dashboard/classes/classTimetableInsights"
import { cn } from "@/lib/utils"
import styles from "@/styles/Dashboard.module.css"
import type { FullTimetable, FullTimetableEntry } from "@/types/portal"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const
const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6366f1", "#06b6d4", "#84cc16", "#f43f5e",
]

type DisplayTimetableEntry = FullTimetableEntry & {
  periodStart?: string
  periodEnd?: string
}

interface TimetablePageProps {
  timetable: unknown
  dataLoading: boolean
  selectedWeek: TimetableWeekKey
  currentWeek: TimetableWeekKey
  onSelectedWeekChange: (week: TimetableWeekKey) => void
  mergeConsecutivePeriods: boolean
  showBothWeeks: boolean
  getSubjectColor: (course: string, classCode?: string) => string
  onColorChange: (classCode: string, color: string) => void
}

function periodNumber(period: string | undefined): number {
  return Number.parseInt(period?.replace(/\D/g, "") || "0", 10)
}

function getEntriesForDay(
  timetable: FullTimetable,
  week: TimetableWeekKey,
  day: string,
): FullTimetableEntry[] {
  return timetable[week]
    .filter((entry) => entry.day?.toLowerCase() === day.toLowerCase())
    .sort((a, b) => periodNumber(a.period) - periodNumber(b.period))
}

function mergePeriods(
  entries: FullTimetableEntry[],
  enabled: boolean,
): DisplayTimetableEntry[] {
  if (entries.length === 0 || !enabled) return entries

  const merged: DisplayTimetableEntry[] = []
  let current: DisplayTimetableEntry | null = null

  for (const entry of entries) {
    if (!current) {
      current = { ...entry, periodStart: entry.period, periodEnd: entry.period }
      continue
    }

    const sameClass = current.course === entry.course
      && current.classCode === entry.classCode
      && current.teacher === entry.teacher
      && current.room === entry.room
    const currentPeriod = periodNumber(current.periodEnd)
    const entryPeriod = periodNumber(entry.period)
    const consecutive = entryPeriod === currentPeriod + 1 || entryPeriod === currentPeriod

    if (sameClass && consecutive) {
      current.periodEnd = entry.period
    } else {
      merged.push(current)
      current = { ...entry, periodStart: entry.period, periodEnd: entry.period }
    }
  }

  if (current) merged.push(current)
  return merged
}

function formatPeriodRange(entry: DisplayTimetableEntry): string {
  if (!entry.periodStart || entry.periodStart === entry.periodEnd) {
    return entry.period || entry.periodStart || ""
  }
  return `${entry.periodStart}-${entry.periodEnd}`
}

export function TimetablePage({
  timetable,
  dataLoading,
  selectedWeek,
  currentWeek,
  onSelectedWeekChange,
  mergeConsecutivePeriods,
  showBothWeeks,
  getSubjectColor,
  onColorChange,
}: TimetablePageProps) {
  const fullTimetable = normalizeFullTimetable(timetable)
  const currentDayName = DAYS[new Date().getDay() - 1] || ""
  const displayedWeeks: TimetableWeekKey[] = showBothWeeks ? ["weekA", "weekB"] : [selectedWeek]
  const displayedEntries = displayedWeeks.flatMap((week) => fullTimetable[week])
  const displayedRooms = new Set(displayedEntries.map((entry) => entry.room).filter(Boolean))
  const displayedClassCodes = new Set(displayedEntries.map((entry) => entry.classCode || entry.course).filter(Boolean))
  const todayEntries = currentDayName
    ? displayedWeeks.flatMap((week) => getEntriesForDay(fullTimetable, week, currentDayName))
    : []
  const hasTimetableData = fullTimetable.weekA.length > 0 || fullTimetable.weekB.length > 0

  return (
    <div className={styles.contentWrapper} data-tour-id="page-timetable" style={{ padding: 0 }}>
      <DashboardPage>
        <DashboardPageHeader
          title="Timetable"
          actions={
            <div className={styles.timetableHeaderControls}>
              <div className={styles.timetableSummary} aria-label="Selected week summary">
                <span><strong>{displayedEntries.length}</strong> periods</span>
                <span><strong>{displayedClassCodes.size}</strong> classes</span>
                <span><strong>{displayedRooms.size}</strong> rooms</span>
                <span><strong>{todayEntries.length || 0}</strong> today</span>
              </div>
              {!showBothWeeks && (
                <TopbarToggleGroup
                  options={[
                    { value: "weekA", label: "Week A" },
                    { value: "weekB", label: "Week B" },
                  ]}
                  value={selectedWeek}
                  onChange={(value) => onSelectedWeekChange(value as TimetableWeekKey)}
                />
              )}
            </div>
          }
        />
        <DashboardPageBody>
          {dataLoading && !hasTimetableData ? (
            <div className="p-10 text-center">
              <Skeleton className="mx-auto mb-4 h-4 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : fullTimetable.weekA.length === 0 && fullTimetable.weekB.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-16 text-center">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconCalendar size={24} />
                    </EmptyMedia>
                    <EmptyTitle>No Timetable Data</EmptyTitle>
                  </EmptyHeader>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sync your portal data to view your full timetable.
                  </p>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-8">
              {displayedWeeks.map((week) => (
                <section key={week} aria-labelledby={showBothWeeks ? `${week}-heading` : undefined}>
                  {showBothWeeks && (
                    <h2 id={`${week}-heading`} className="mb-3 text-lg font-semibold">
                      {week === "weekA" ? "Week A" : "Week B"}
                    </h2>
                  )}
                  <div className={styles.timetableWeekList}>
                    {DAYS.map((day) => {
                      const dayEntries = getEntriesForDay(fullTimetable, week, day)
                      const isToday = week === currentWeek && day === currentDayName
                      const mergedDayEntries = mergePeriods(dayEntries, mergeConsecutivePeriods)

                      return (
                        <Card
                          key={`${week}-${day}`}
                          className={cn(styles.timetableDaySection, isToday && styles.timetableDayToday)}
                        >
                          <CardHeader className={styles.timetableDayHeader}>
                            <div className={styles.timetableDayTitleRow}>
                              <CardTitle className={styles.timetableDayTitle}>{day}</CardTitle>
                              {isToday && (
                                <Badge variant="default" className={styles.timetableTodayBadge}>Today</Badge>
                              )}
                              <span className={styles.timetableDayCount}>
                                {dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className={styles.timetableDayContent}>
                            {mergedDayEntries.length === 0 ? (
                              <div className={styles.timetableEmptyDay}>
                                <IconCalendar size={18} />
                                <span>No classes scheduled</span>
                              </div>
                            ) : (
                              <div className={styles.timetableRows}>
                                {mergedDayEntries.map((entry) => {
                                  const subjectColor = getSubjectColor(entry.course, entry.classCode)
                                  const period = formatPeriodRange(entry)
                                  return (
                                    <div
                                      key={getTimetableEntryKey(week, day, { ...entry, period })}
                                      className={styles.timetableRow}
                                    >
                                      <span className={styles.timetablePeriodPill}>{period}</span>
                                      <ColorPicker
                                        value={subjectColor}
                                        onChange={(color) => onColorChange(entry.classCode, color)}
                                      >
                                        <ColorPickerTrigger
                                          showIcon={false}
                                          className="h-auto w-auto rounded-none border-0 bg-transparent p-0 hover:scale-100"
                                          style={{ background: "transparent" }}
                                        >
                                          <div
                                            className={styles.timetableColorBar}
                                            style={{ backgroundColor: subjectColor }}
                                            title="Click to customise colour"
                                          />
                                        </ColorPickerTrigger>
                                        <ColorPickerContent presetColors={COLOR_PRESETS} />
                                      </ColorPicker>
                                      <div className={styles.timetableClassMain}>
                                        <span>{entry.course}</span>
                                        <small>{entry.classCode}</small>
                                      </div>
                                      <span className={styles.timetableTeacherName}>{entry.teacher}</span>
                                      <span className={styles.timetableRoomPill}>{entry.room}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </DashboardPageBody>
      </DashboardPage>
    </div>
  )
}
