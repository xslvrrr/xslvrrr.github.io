"use client"

import { useMemo } from "react"
import {
  IconBook,
  IconCalendarStats,
  IconChevronDown,
  IconClipboardCheck,
  IconMapPin,
  IconRotate,
  IconSparkles,
} from "@tabler/icons-react"

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
  DashboardStack,
} from "@/components/dashboard/DashboardPage"
import {
  buildClassInsights,
  getClassReviewKey,
  partitionClassInsights,
  type ClassInsight,
} from "@/components/dashboard/classes/classTimetableInsights"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ColorPicker, ColorPickerContent, ColorPickerTrigger } from "@/components/ui/color-picker"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { AttendanceData, ClassEntry } from "@/types/portal"

const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6366f1", "#06b6d4", "#84cc16", "#f43f5e",
]

const ATTENDANCE_RISK_THRESHOLD = 90

interface ClassesPageProps {
  classes: ClassEntry[]
  timetable: unknown
  attendance?: AttendanceData | null
  dataLoading: boolean
  locallyUnenrolledClassKeys: readonly string[]
  getSubjectColor: (course: string, classCode?: string) => string
  onColorChange: (classCode: string, color: string) => void
  onRestoreClass?: (classItem: ClassInsight) => void
}

interface ClassStat {
  icon: typeof IconMapPin
  label: string
  value: string
  hint: string
}

function classStats(classItem: ClassInsight): ClassStat[] {
  return [
    {
      icon: IconCalendarStats,
      label: "Timetable",
      value: `${classItem.timetablePeriods}`,
      hint: classItem.timetableDays.length ? classItem.timetableDays.join(", ") : "Not scheduled",
    },
    {
      icon: IconMapPin,
      label: "Rooms",
      value: classItem.rooms.length ? String(classItem.rooms.length) : "—",
      hint: classItem.rooms.length ? classItem.rooms.join(", ") : "No room data",
    },
    {
      icon: IconClipboardCheck,
      label: "Rolls",
      value: `${classItem.rollsMarked}`,
      hint: classItem.attendanceSource === "none" ? "Not recorded by teachers" : "Marked this year",
    },
    {
      icon: IconSparkles,
      label: "Merits",
      value: `${classItem.quickMerits}`,
      hint: `${classItem.lessons} portal lesson${classItem.lessons === 1 ? "" : "s"}`,
    },
  ]
}

function attendanceTone(rate: number | null): "muted" | "risk" | "healthy" {
  if (rate === null) return "muted"
  return rate < ATTENDANCE_RISK_THRESHOLD ? "risk" : "healthy"
}

/** One-line schedule summary so the card leads with shape of the week, not a stat wall. */
function scheduleSummary(classItem: ClassInsight): string {
  if (!classItem.hasTimetableMatch) return "No timetable periods"
  const periods = `${classItem.timetablePeriods} period${classItem.timetablePeriods === 1 ? "" : "s"}`
  const days = classItem.timetableDays.map((day) => day.slice(0, 3)).join(", ")
  const room = classItem.rooms.length === 1 ? classItem.rooms[0] : classItem.rooms.length > 1 ? `${classItem.rooms.length} rooms` : ""
  return [periods, days, room].filter(Boolean).join(" · ")
}

interface ClassColorSwatchProps {
  color: string
  course: string
  classCode: string
  onColorChange: (classCode: string, color: string) => void
}

/** Bordered pill with a swatch and a chevron so the colour control reads as a control. */
function ClassColorSwatch({ color, course, classCode, onColorChange }: ClassColorSwatchProps) {
  return (
    <ColorPicker onChange={(next) => onColorChange(classCode, next)} value={color}>
      <ColorPickerTrigger
        aria-label={`Change colour for ${course}`}
        className="h-7 w-auto gap-1.5 rounded-md border border-border bg-background px-1.5 hover:scale-100 hover:bg-accent"
        showIcon={false}
        style={{ background: "transparent" }}
        title={`Change colour for ${course}`}
      >
        <span
          aria-hidden="true"
          className="block size-3.5 rounded-[4px] border border-black/10"
          style={{ background: color }}
        />
        <IconChevronDown aria-hidden="true" className="size-3 text-muted-foreground" />
      </ColorPickerTrigger>
      <ColorPickerContent presetColors={COLOR_PRESETS} />
    </ColorPicker>
  )
}

interface ClassCardProps {
  classItem: ClassInsight
  color: string
  onColorChange: (classCode: string, color: string) => void
}

function ClassCard({ classItem, color, onColorChange }: ClassCardProps) {
  const tone = attendanceTone(classItem.attendanceRate)

  return (
    <Card className="gap-4">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{classItem.course}</CardTitle>
            <CardDescription className="truncate">
              {classItem.teacher || "Teacher unavailable"}
            </CardDescription>
          </div>
          <ClassColorSwatch
            classCode={classItem.classCode}
            color={color}
            course={classItem.course}
            onColorChange={onColorChange}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {classItem.classCode ? <Badge variant="outline">{classItem.classCode}</Badge> : null}
          <Badge variant={classItem.absences > 0 ? "destructive" : "secondary"}>
            {classItem.absenceLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Attendance</span>
            <span
              className={
                tone === "risk"
                  ? "font-medium tabular-nums text-destructive"
                  : tone === "healthy"
                    ? "font-medium tabular-nums text-foreground"
                    : "tabular-nums text-muted-foreground"
              }
            >
              {classItem.attendanceRate === null
                ? "No rolls yet"
                : `${classItem.attendanceRate}% of ${classItem.rollsMarked} rolls`}
            </span>
          </div>
          <Progress
            aria-label={`Attendance for ${classItem.course}`}
            className="h-1.5"
            value={classItem.attendanceRate ?? 0}
          />
        </div>

        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <IconCalendarStats aria-hidden="true" className="size-3.5 shrink-0" />
          {scheduleSummary(classItem)}
        </p>

        <Collapsible className="group">
          <CollapsibleTrigger
            render={
              <Button
                className="h-7 w-full justify-between px-2 text-xs text-muted-foreground"
                size="sm"
                variant="ghost"
              />
            }
          >
            Details
            <IconChevronDown
              aria-hidden="true"
              className="size-3.5 transition-transform group-data-[open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="my-3" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {classStats(classItem).map((stat) => (
                <div className="min-w-0" key={stat.label}>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <stat.icon aria-hidden="true" className="size-3.5 shrink-0" />
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {stat.value}
                  </dd>
                  <dd className="truncate text-xs text-muted-foreground">{stat.hint}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

interface UnenrolledClassRowProps {
  classItem: ClassInsight
  onRestoreClass?: (classItem: ClassInsight) => void
}

function UnenrolledClassRow({ classItem, onRestoreClass }: UnenrolledClassRowProps) {
  const reason = classItem.enrolmentStatus === "hidden-locally"
    ? "Hidden by you"
    : "Not in the latest timetable"

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{classItem.course}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[classItem.classCode, classItem.teacher].filter(Boolean).join(" · ") || "No class details"}
        </div>
      </div>
      <Badge className="shrink-0" variant="outline">{reason}</Badge>
      {classItem.enrolmentStatus === "hidden-locally" && onRestoreClass ? (
        <Button onClick={() => onRestoreClass(classItem)} size="sm" variant="ghost">
          <IconRotate aria-hidden="true" />
          Restore
        </Button>
      ) : null}
    </div>
  )
}

export function ClassesPage({
  classes: portalClasses,
  timetable,
  attendance,
  dataLoading,
  locallyUnenrolledClassKeys,
  getSubjectColor,
  onColorChange,
  onRestoreClass,
}: ClassesPageProps) {
  const classInsights = useMemo(
    () => buildClassInsights(portalClasses, timetable, attendance, {
      locallyUnenrolledKeys: locallyUnenrolledClassKeys,
    }),
    [attendance, locallyUnenrolledClassKeys, portalClasses, timetable]
  )
  const { enrolled, unenrolled } = useMemo(
    () => partitionClassInsights(classInsights),
    [classInsights]
  )

  // Every headline number counts current classes only; past classes keep their own section.
  const totalLessons = enrolled.reduce((sum, classItem) => sum + classItem.lessons, 0)
  const totalMerits = enrolled.reduce((sum, classItem) => sum + classItem.quickMerits, 0)
  const totalAbsences = enrolled.reduce((sum, classItem) => sum + classItem.absences, 0)
  const classesWithAttendanceRisk = enrolled.filter((classItem) => (
    classItem.attendanceRate !== null && classItem.attendanceRate < ATTENDANCE_RISK_THRESHOLD
  ))
  const overview = [
    { label: "Lessons", value: totalLessons },
    { label: "Merits", value: totalMerits },
    { label: "Absences", value: totalAbsences },
    { label: "Attendance watch", value: classesWithAttendanceRisk.length },
  ]

  const headerDescription = [
    `${enrolled.length} current ${enrolled.length === 1 ? "class" : "classes"}`,
    unenrolled.length > 0 ? `${unenrolled.length} past` : "",
  ].filter(Boolean).join(" · ")

  return (
    <DashboardPage data-tour-id="page-classes">
      <DashboardPageHeader title="Classes" description={headerDescription} />
      <DashboardPageBody>
        {dataLoading && classInsights.length === 0 ? (
          <DashboardStack>
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3].map((item) => <Skeleton className="h-56 w-full rounded-xl" key={item} />)}
            </div>
          </DashboardStack>
        ) : classInsights.length === 0 ? (
          <Card>
            <CardContent className="py-14">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><IconBook /></EmptyMedia>
                  <EmptyTitle>No classes found</EmptyTitle>
                </EmptyHeader>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sync your portal data to see your classes.
                </p>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <DashboardStack>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overview.map((metric) => (
                <Card key={metric.label}>
                  <CardHeader className="gap-1 pb-4">
                    <CardDescription className="text-xs uppercase tracking-wide">
                      {metric.label}
                    </CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{metric.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {enrolled.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {enrolled.map((classItem) => (
                  <ClassCard
                    classItem={classItem}
                    color={getSubjectColor(classItem.course, classItem.classCode)}
                    key={getClassReviewKey(classItem)}
                    onColorChange={onColorChange}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-10">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><IconBook /></EmptyMedia>
                      <EmptyTitle>No current classes</EmptyTitle>
                    </EmptyHeader>
                    <p className="mt-2 text-sm text-muted-foreground">
                      None of your classes appear in the latest timetable sync. Run a sync to refresh them.
                    </p>
                  </Empty>
                </CardContent>
              </Card>
            )}

            {unenrolled.length > 0 ? (
              <Collapsible className="group">
                <CollapsibleTrigger
                  render={
                    <Button className="w-full justify-between text-muted-foreground" variant="ghost" />
                  }
                >
                  Past classes ({unenrolled.length})
                  <IconChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-data-[open]:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      These classes are no longer in your timetable, so they are left out of the totals above.
                    </p>
                    {unenrolled.map((classItem) => (
                      <UnenrolledClassRow
                        classItem={classItem}
                        key={getClassReviewKey(classItem)}
                        onRestoreClass={onRestoreClass}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </DashboardStack>
        )}
      </DashboardPageBody>
    </DashboardPage>
  )
}
