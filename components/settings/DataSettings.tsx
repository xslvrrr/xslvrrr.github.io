"use client"

import * as React from "react"
import {
  IconCalendarTime,
  IconAlertTriangle,
  IconChevronDown,
  IconDatabaseCog,
  IconInfoCircle,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react"
import DateSelector from "@/components/Calendar/DateSelector"
import {
  DATA_SETTINGS_STORAGE_KEY,
  formatFetchInterval,
  formatPortalDateLabel,
  getDefaultDataSettings,
  normalizeDataSettings,
  readDataSettings,
  resetDataSettings,
  type DataFetchIntervalUnit,
  type PortalDataSettings,
  writeDataSettings,
} from "@/lib/data-settings"
import { clearPortalDataCache } from "@/lib/desktop/storage"
import { notifyPortalSyncError } from "@/components/PortalSyncStatusToasts"
import type { PortalData } from "@/types/portal"
import {
  PORTAL_DATA_UPDATED_EVENT,
  getUltraRunStatus,
  startUltraRun,
  subscribeUltraRunStatus,
  type UltraRunStatus,
} from "@/lib/portal-sync-status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SimpleTooltip } from "@/components/SimpleTooltip"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

type NumericKey = {
  [K in keyof PortalDataSettings]: PortalDataSettings[K] extends number ? K : never
}[keyof PortalDataSettings]

type BooleanKey = {
  [K in keyof PortalDataSettings]: PortalDataSettings[K] extends boolean ? K : never
}[keyof PortalDataSettings]

interface RangeControlProps {
  label: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  /** Settings search target; see lib/settings-focus.ts. */
  anchor?: string
  onChange: (value: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function RangeControl({ label, description, value, min, max, step = 1, suffix, anchor, onChange }: RangeControlProps) {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(clamp(Number(event.target.value), min, max))
  }

  return (
    <Field data-settings-anchor={anchor}>
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <div className="flex flex-col gap-3">
        <Slider
          className="py-1 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:border [&_[data-slot=slider-track]]:border-[var(--border-subtle)] [&_[data-slot=slider-track]]:bg-[var(--bg-elevated)] [&_[data-slot=slider-range]]:[background:var(--accent-gradient)] [&_[data-slot=slider-thumb]]:border-[var(--accent-color)] [&_[data-slot=slider-thumb]]:bg-white"
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(nextValue) => {
            const rawValue = Array.isArray(nextValue) ? nextValue[0] : nextValue
            onChange(clamp(Number(rawValue ?? value), min, max))
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(clamp(value - step, min, max))}
            disabled={value <= min}
            aria-label={`Decrease ${label}`}
          >
            <IconMinus data-icon="inline-start" />
          </Button>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={handleInputChange}
            className="max-w-28"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(clamp(value + step, min, max))}
            disabled={value >= max}
            aria-label={`Increase ${label}`}
          >
            <IconPlus data-icon="inline-start" />
          </Button>
          <Badge variant="secondary">{suffix}</Badge>
        </div>
      </div>
    </Field>
  )
}

interface SyncToggleProps {
  id: string
  label: string
  description: string
  checked: boolean
  /** Settings search target; see lib/settings-focus.ts. */
  anchor?: string
  onCheckedChange: (checked: boolean) => void
}

function SyncToggle({ id, label, description, checked, anchor, onCheckedChange }: SyncToggleProps) {
  return (
    <Field orientation="horizontal" data-settings-anchor={anchor}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  )
}

interface DataSettingsProps {
  portalData?: PortalData | null
  onPortalDataUpdated?: (data: PortalData | null) => void
  isSyncRunning?: boolean
  onSyncNow?: () => Promise<void>
}

function countInclusiveDays(startYear: number, endYear: number) {
  const start = new Date(startYear, 0, 1).getTime()
  const end = new Date(endYear, 11, 31).getTime()
  return Math.round((end - start) / 86_400_000) + 1
}

function getEarliestAttendanceYear(portalData?: PortalData | null): number | null {
  const yearly = portalData?.attendance?.yearly
  if (!Array.isArray(yearly)) return null
  const years = yearly
    .map((entry) => Number(entry?.year))
    .filter((year) => Number.isInteger(year) && year >= 2000)
  return years.length ? Math.min(...years) : null
}

export function DataSettings({
  portalData,
  onPortalDataUpdated,
  isSyncRunning = false,
  onSyncNow,
}: DataSettingsProps) {
  const [settings, setSettings] = React.useState<PortalDataSettings>(() => readDataSettings())
  const [syncConfirmOpen, setSyncConfirmOpen] = React.useState(false)
  const currentYear = React.useMemo(() => new Date().getFullYear(), [])
  const earliestAttendanceYear = React.useMemo(() => getEarliestAttendanceYear(portalData), [portalData])
  const [ultraEndYear, setUltraEndYear] = React.useState(currentYear)
  const [ultraStartYear, setUltraStartYear] = React.useState(() => currentYear - 5)
  const [ultraDialogStep, setUltraDialogStep] = React.useState<"first" | "second" | null>(null)
  const [wipeDialogStep, setWipeDialogStep] = React.useState<"first" | "second" | "type" | null>(null)
  const [wipeConfirmText, setWipeConfirmText] = React.useState("")
  const [wipeRunning, setWipeRunning] = React.useState(false)
  const [wipeError, setWipeError] = React.useState<string | null>(null)
  const [dangerOpen, setDangerOpen] = React.useState(false)
  const [ultraStatus, setUltraStatus] = React.useState<UltraRunStatus | null>(() => getUltraRunStatus())

  React.useEffect(() => {
    writeDataSettings(settings)
  }, [settings])

  React.useEffect(() => subscribeUltraRunStatus(setUltraStatus), [])

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DATA_SETTINGS_STORAGE_KEY) {
        setSettings(readDataSettings())
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const updateSettings = React.useCallback((patch: Partial<PortalDataSettings>) => {
    setSettings((current) => normalizeDataSettings({ ...current, ...patch }))
  }, [])

  const updateNumber = React.useCallback((key: NumericKey, value: number) => {
    updateSettings({ [key]: value } as Partial<PortalDataSettings>)
  }, [updateSettings])

  const updateBoolean = React.useCallback((key: BooleanKey, value: boolean) => {
    updateSettings({ [key]: value } as Partial<PortalDataSettings>)
  }, [updateSettings])

  const setIntervalUnit = React.useCallback((unit: DataFetchIntervalUnit) => {
    updateSettings({
      fetchIntervalUnit: unit,
      fetchIntervalValue: unit === "hours" ? 1 : 15,
    })
  }, [updateSettings])

  const resetToDefaults = React.useCallback(() => {
    setSettings(resetDataSettings())
  }, [])

  const handleWipeData = React.useCallback(async () => {
    setWipeRunning(true)
    setWipeError(null)
    try {
      const targets = [
        { label: "Millennium portal data", url: "/api/portal/data" },
      ]
      const results = await Promise.allSettled(targets.map(async ({ label, url }) => {
        const response = await fetch(url, { method: "DELETE" })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(`${label}: ${data?.message || "deletion failed"}`)
        }
        return label
      }))

      const deleted = new Set<string>()
      const failures: string[] = []
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          deleted.add(result.value)
        } else {
          failures.push(result.reason instanceof Error ? result.reason.message : "Unknown deletion failure")
        }
      })

      if (deleted.has("Millennium portal data")) {
        onPortalDataUpdated?.(null)
        window.dispatchEvent(new CustomEvent(PORTAL_DATA_UPDATED_EVENT, { detail: null }))
        try {
          await clearPortalDataCache()
          deleted.add("Local web cache")
        } catch {
          failures.push("Local web cache: deletion failed")
        }
      }

      if (failures.length > 0) {
        const completed = Array.from(deleted)
        setWipeError([
          `Partial wipe: ${failures.join("; ")}.`,
          completed.length > 0 ? `Deleted successfully: ${completed.join(", ")}.` : "No server data was deleted.",
          "Retry to remove remaining data.",
        ].join(" "))
        return
      }

      setWipeDialogStep(null)
      setWipeConfirmText("")
    } catch (error) {
      setWipeError(error instanceof Error ? error.message : "Wipe failed before completion. Retry to remove remaining data.")
    } finally {
      setWipeRunning(false)
    }
  }, [onPortalDataUpdated])

  const defaults = React.useMemo(() => getDefaultDataSettings(), [])
  const ultraEndMinYear = earliestAttendanceYear ?? currentYear - 5
  const ultraStartFloor = Math.max(ultraEndYear - 5, earliestAttendanceYear ?? ultraEndYear - 5)
  const ultraStartMin = Math.min(ultraStartFloor, ultraEndYear)
  const ultraDayCount = countInclusiveDays(ultraStartYear, ultraEndYear)
  const ultraMonthCount = (ultraEndYear - ultraStartYear + 1) * 12
  const ultraPageEstimate = ultraDayCount + ultraMonthCount + 7

  React.useEffect(() => {
    setUltraEndYear((current) => clamp(current, ultraEndMinYear, currentYear))
  }, [currentYear, ultraEndMinYear])

  React.useEffect(() => {
    setUltraStartYear((current) => clamp(current, ultraStartMin, ultraEndYear))
  }, [ultraEndYear, ultraStartMin])

  const handleUltraEndYearChange = React.useCallback((value: number) => {
    const nextEndYear = clamp(value, ultraEndMinYear, currentYear)
    setUltraEndYear(nextEndYear)
    setUltraStartYear((current) => clamp(current, Math.max(nextEndYear - 5, earliestAttendanceYear ?? nextEndYear - 5), nextEndYear))
  }, [currentYear, earliestAttendanceYear, ultraEndMinYear])

  const handleUltraStartYearChange = React.useCallback((value: number) => {
    setUltraStartYear(clamp(value, ultraStartMin, ultraEndYear))
  }, [ultraEndYear, ultraStartMin])

  const runSyncNow = React.useCallback(async () => {
    if (isSyncRunning || ultraStatus?.status === "running" || ultraStatus?.status === "cancelling") return
    setSyncConfirmOpen(false)
    await onSyncNow?.()
  }, [isSyncRunning, onSyncNow, ultraStatus?.status])

  const runUltraRun = React.useCallback(async () => {
    setUltraDialogStep(null)
    void startUltraRun({
      settings,
      startYear: ultraStartYear,
      endYear: ultraEndYear,
      baselineData: portalData ?? null,
      onPortalDataUpdated,
    }).catch((error: unknown) => {
      // Pre-flight failures (such as an unreadable durable baseline) happen
      // before any run status exists, so report them here.
      notifyPortalSyncError(error instanceof Error ? error.message : "Ultra run could not be started.")
    })
  }, [onPortalDataUpdated, portalData, settings, ultraEndYear, ultraStartYear])

  const intervalMin = settings.fetchIntervalUnit === "hours" ? 1 : 5
  const intervalMax = settings.fetchIntervalUnit === "hours" ? 24 : 55
  const intervalStep = settings.fetchIntervalUnit === "hours" ? 1 : 5
  const intervalSuffix = settings.fetchIntervalUnit === "hours"
    ? `hour${settings.fetchIntervalValue === 1 ? "" : "s"}`
    : "minutes"
  const ultraRunning = ultraStatus?.status === "running" || ultraStatus?.status === "cancelling"
  const syncRunning = isSyncRunning || ultraRunning
  const wipeConfirmMatches = wipeConfirmText.trim() === "WIPE MY DATA"

  return (
    <div className="flex flex-col gap-4" data-tour-id="settings-sync">
      <Alert>
        <IconInfoCircle />
        <AlertTitle>These settings apply to Puppeteer background sync</AlertTitle>
        <AlertDescription>
          Changes are saved on this device and used the next time Millennium data is fetched.
        </AlertDescription>
      </Alert>

      <Card data-settings-anchor="sync-now" data-tour-id="settings-sync-now">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconRefresh />
            Sync
          </CardTitle>
          <CardDescription>
            Fetch fresh Millennium data without waiting for the next scheduled interval.
          </CardDescription>
          <CardAction>
            {syncRunning ? (
              <SimpleTooltip text="A portal sync is already running." position="left">
                <span className="inline-flex">
                  <Button type="button" variant="secondary" disabled>
                    <IconRefresh className="animate-spin" data-icon="inline-start" />
                    Syncing...
                  </Button>
                </span>
              </SimpleTooltip>
            ) : (
              <Button type="button" onClick={() => setSyncConfirmOpen(true)} disabled={!onSyncNow}>
                <IconRefresh data-icon="inline-start" />
                Sync now
              </Button>
            )}
          </CardAction>
        </CardHeader>
      </Card>

      <Card data-settings-anchor="sync-fetch-interval">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconRefresh />
            Fetch Interval
          </CardTitle>
          <CardDescription>
            Control how often the dashboard refreshes live Millennium data while you are logged in.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{formatFetchInterval(settings)}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-settings-anchor="sync-interval-unit">
              <FieldLabel>Interval unit</FieldLabel>
              <FieldDescription>Select minutes for rapid updates or hours for lighter background usage.</FieldDescription>
              <Select
                value={settings.fetchIntervalUnit}
                onValueChange={(value) => setIntervalUnit(value as DataFetchIntervalUnit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <RangeControl
              label="Fetch every"
              anchor="sync-fetch-every"
              description="Range is every 5 minutes through to daily."
              value={settings.fetchIntervalValue}
              min={intervalMin}
              max={intervalMax}
              step={intervalStep}
              suffix={settings.fetchIntervalValue === 24 && settings.fetchIntervalUnit === "hours" ? "daily" : intervalSuffix}
              onChange={(value) => updateNumber("fetchIntervalValue", value)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card data-settings-anchor="sync-status-updates">
        <CardHeader>
          <CardTitle>Status Updates</CardTitle>
          <CardDescription>
            Control the live bottom-center sync notifications shown while the app is open.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SyncToggle
              id="show-ultra-run-live-status"
              label="Ultra run live status"
              anchor="sync-ultra-live-status"
              description="Show the persistent live status toast, progress bar, cancel action, and completion effect."
              checked={settings.showUltraRunLiveStatus}
              onCheckedChange={(checked) => updateBoolean("showUltraRunLiveStatus", checked)}
            />
            <SyncToggle
              id="show-sync-updates"
              label="Background sync updates"
              anchor="sync-background-updates"
              description="Show green success and red error notifications whenever Puppeteer syncs in the background."
              checked={settings.showSyncUpdates}
              onCheckedChange={(checked) => updateBoolean("showSyncUpdates", checked)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card data-settings-anchor="sync-portal-date">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCalendarTime />
            Portal Date
          </CardTitle>
          <CardDescription>
            Millennium supports changing the active portal date. Use this to sync data around future or past days.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{formatPortalDateLabel(settings.portalDate).toUpperCase()}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SyncToggle
              id="match-current-date"
              label="Match current date"
              anchor="sync-match-current-date"
              description="Always use today's date when a portal sync starts."
              checked={settings.matchCurrentDate}
              onCheckedChange={(matchCurrentDate) => updateSettings({ matchCurrentDate })}
            />
            <Field data-settings-anchor="sync-portal-date-field">
              <FieldLabel htmlFor="portal-date">Date</FieldLabel>
              <FieldDescription>
                {settings.matchCurrentDate
                  ? "Today's date is selected automatically before every sync."
                  : "This mirrors the legacy portal date field and is sent as the portal date during sync."}
              </FieldDescription>
              <div className={settings.matchCurrentDate ? "pointer-events-none opacity-50" : undefined}>
                <DateSelector
                  value={settings.portalDate}
                  onChange={(portalDate) => updateSettings({ portalDate })}
                />
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card data-settings-anchor="sync-data-ranges">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDatabaseCog />
            Data Ranges
          </CardTitle>
          <CardDescription>
            Tune how much data each scrape attempts to collect. Smaller ranges are faster; larger ranges make future planning easier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Notices</FieldLegend>
              <RangeControl
                label="Notice lookbehind"
                anchor="sync-notice-lookbehind"
                description="Days before the selected portal date to fetch notices for."
                value={settings.noticeLookbehindDays}
                min={0}
                max={60}
                suffix="days back"
                onChange={(value) => updateNumber("noticeLookbehindDays", value)}
              />
              <RangeControl
                label="Notice lookahead"
                anchor="sync-notice-lookahead"
                description="Days after the selected portal date to fetch notices for."
                value={settings.noticeLookaheadDays}
                min={0}
                max={60}
                suffix="days ahead"
                onChange={(value) => updateNumber("noticeLookaheadDays", value)}
              />
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>Calendar</FieldLegend>
              <RangeControl
                label="Calendar past range"
                anchor="sync-calendar-past"
                description="Months before the selected portal date to scrape from the portal calendar."
                value={settings.calendarMonthsPast}
                min={0}
                max={24}
                suffix="months back"
                onChange={(value) => updateNumber("calendarMonthsPast", value)}
              />
              <RangeControl
                label="Calendar future range"
                anchor="sync-calendar-future"
                description="Months after the selected portal date to scrape from the portal calendar."
                value={settings.calendarMonthsFuture}
                min={0}
                max={24}
                suffix="months ahead"
                onChange={(value) => updateNumber("calendarMonthsFuture", value)}
              />
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>Records</FieldLegend>
              <RangeControl
                label="Reports lookback"
                anchor="sync-reports-lookback"
                description="Academic report years to retain after scraping."
                value={settings.reportsYearLookback}
                min={1}
                max={12}
                suffix="years"
                onChange={(value) => updateNumber("reportsYearLookback", value)}
              />
              <RangeControl
                label="Attendance lookback"
                anchor="sync-attendance-lookback"
                description="Attendance summary years to retain after scraping."
                value={settings.attendanceYearLookback}
                min={1}
                max={12}
                suffix="years"
                onChange={(value) => updateNumber("attendanceYearLookback", value)}
              />
              <RangeControl
                label="Grade item limit"
                anchor="sync-grade-item-limit"
                description="Maximum grade rows to keep. Set to 0 to keep everything returned by Millennium."
                value={settings.gradeItemLimit}
                min={0}
                max={250}
                step={5}
                suffix={settings.gradeItemLimit === 0 ? "all items" : "items"}
                onChange={(value) => updateNumber("gradeItemLimit", value)}
              />
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card data-settings-anchor="sync-data-types">
        <CardHeader>
          <CardTitle>Synced Data Types</CardTitle>
          <CardDescription>
            Disable data categories you do not need. Disabled categories are skipped during the scrape.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SyncToggle
              id="include-timetable"
              label="Timetable"
              description="Week A and Week B timetable data."
              checked={settings.includeTimetable}
              onCheckedChange={(checked) => updateBoolean("includeTimetable", checked)}
            />
            <SyncToggle
              id="include-notices"
              label="Notices"
              description="Daily notices across the selected lookbehind and lookahead range."
              checked={settings.includeNotices}
              onCheckedChange={(checked) => updateBoolean("includeNotices", checked)}
            />
            <SyncToggle
              id="include-grades"
              label="Grades"
              description="Assessment activity and grade rows."
              checked={settings.includeGrades}
              onCheckedChange={(checked) => updateBoolean("includeGrades", checked)}
            />
            <SyncToggle
              id="include-attendance"
              label="Attendance"
              description="Yearly and subject attendance summaries."
              checked={settings.includeAttendance}
              onCheckedChange={(checked) => updateBoolean("includeAttendance", checked)}
            />
            <SyncToggle
              id="include-reports"
              label="Reports"
              description="Academic report metadata and links."
              checked={settings.includeReports}
              onCheckedChange={(checked) => updateBoolean("includeReports", checked)}
            />
            <SyncToggle
              id="include-classes"
              label="Classes"
              description="Class list data used for class pages and review prompts."
              checked={settings.includeClasses}
              onCheckedChange={(checked) => updateBoolean("includeClasses", checked)}
            />
            <SyncToggle
              id="include-calendar"
              label="Calendar"
              description="Portal calendar events across the selected month range."
              checked={settings.includeCalendar}
              onCheckedChange={(checked) => updateBoolean("includeCalendar", checked)}
            />
            <SyncToggle
              id="include-teacher-lookahead"
              label="Teacher change check"
              description="Fetches your timetable a fortnight ahead as well, so a new teacher can be reported as a permanent change or a substitute rather than just a change."
              checked={settings.includeTeacherLookahead}
              onCheckedChange={(checked) => updateBoolean("includeTeacherLookahead", checked)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
        <Card data-settings-anchor="sync-danger-zone" className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <IconAlertTriangle />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Heavy sync and destructive data actions live here.
            </CardDescription>
            <CardAction>
              <CollapsibleTrigger data-settings-open="sync-danger-zone" render={<Button type="button" variant="destructive" />}>
                <IconChevronDown data-icon="inline-start" />
                {dangerOpen ? "Hide" : "Open"}
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Ultra Run</FieldLegend>
                  <Alert>
                    <IconInfoCircle />
                    <AlertTitle>Attendance controls the lower bound when available</AlertTitle>
                    <AlertDescription>
                      {earliestAttendanceYear
                        ? `Your earliest synced attendance year is ${earliestAttendanceYear}, so the ultra run will not go earlier than that.`
                        : "No attendance year is available yet, so the range is limited to the most recent six years."}
                    </AlertDescription>
                  </Alert>
                  <RangeControl
                    label="Start year"
                    anchor="sync-ultra-start-year"
                    description="The first year to scrape. This is capped by attendance data and the six-year limit."
                    value={ultraStartYear}
                    min={ultraStartMin}
                    max={ultraEndYear}
                    suffix="start"
                    onChange={handleUltraStartYearChange}
                  />
                  <RangeControl
                    label="End year"
                    anchor="sync-ultra-end-year"
                    description="The final year to scrape. The range cannot exceed six years."
                    value={ultraEndYear}
                    min={ultraEndMinYear}
                    max={currentYear}
                    suffix="end"
                    onChange={handleUltraEndYearChange}
                  />
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Estimated work</FieldTitle>
                      <FieldDescription>
                        About {ultraPageEstimate.toLocaleString()} portal pages: {ultraDayCount.toLocaleString()} notice days and {ultraMonthCount} calendar months.
                      </FieldDescription>
                    </FieldContent>
                    <Button
                      variant="destructive"
                      onClick={() => setUltraDialogStep("first")}
                      disabled={ultraRunning}
                    >
                      <IconRefresh data-icon="inline-start" />
                      {ultraRunning ? "Running..." : "Start ultra run"}
                    </Button>
                  </Field>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Reset and wipe</FieldLegend>
                  <Field orientation="horizontal" data-settings-anchor="sync-reset-defaults">
                    <FieldContent>
                      <FieldTitle>Reset data settings</FieldTitle>
                      <FieldDescription>
                        Restore defaults: {defaults.noticeLookbehindDays} days back, {defaults.noticeLookaheadDays} days ahead, and the current school year calendar window.
                      </FieldDescription>
                    </FieldContent>
                    <Button variant="destructive" onClick={resetToDefaults}>
                      <IconRestore data-icon="inline-start" />
                      Reset defaults
                    </Button>
                  </Field>
                  <Field orientation="horizontal" data-settings-anchor="sync-wipe">
                    <FieldContent>
                      <FieldTitle>Wipe synced data</FieldTitle>
                      <FieldDescription>
                        Deletes saved Millennium portal data and encrypted login, then clears local web cache.
                      </FieldDescription>
                    </FieldContent>
                    <Button variant="destructive" onClick={() => {
                      setWipeError(null)
                      setWipeDialogStep("first")
                    }} disabled={wipeRunning}>
                      <IconTrash data-icon="inline-start" />
                      Wipe data
                    </Button>
                  </Field>
                </FieldSet>
              </FieldGroup>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <AlertDialog open={syncConfirmOpen} onOpenChange={setSyncConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync Millennium now?</AlertDialogTitle>
            <AlertDialogDescription>
              This starts a Puppeteer portal sync immediately using your current data settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runSyncNow()} disabled={syncRunning}>
              {syncRunning ? "Syncing..." : "Sync now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ultraDialogStep === "first"} onOpenChange={(open) => setUltraDialogStep(open ? "first" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ultra run is intentionally heavy</AlertDialogTitle>
            <AlertDialogDescription>
              This will scrape every day and month from {ultraStartYear} to {ultraEndYear}. It may take a long time and will make about {ultraPageEstimate.toLocaleString()} portal requests.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setUltraDialogStep("second")}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ultraDialogStep === "second"} onOpenChange={(open) => setUltraDialogStep(open ? "second" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm archival scrape</AlertDialogTitle>
            <AlertDialogDescription>
              Final warning: leave this tab open until the run finishes. Empty or failed results are protected from overwriting existing data, but the run can still take several minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={runUltraRun}>
              Run ultra scrape
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={wipeDialogStep === "first"} onOpenChange={(open) => setWipeDialogStep(open ? "first" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe all synced data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes saved Millennium portal data and encrypted login, then clears local web cache.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setWipeDialogStep("second")}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={wipeDialogStep === "second"} onOpenChange={(open) => setWipeDialogStep(open ? "second" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This cannot be undone from the app</AlertDialogTitle>
            <AlertDialogDescription>
              Future versions should protect this with 2FA and unfamiliar-device checks. For now, only continue if you intentionally want to delete all synced data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setWipeDialogStep("type")}>
              I understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={wipeDialogStep === "type"} onOpenChange={(open) => {
        setWipeDialogStep(open ? "type" : null)
        if (!open) {
          setWipeConfirmText("")
          setWipeError(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Type WIPE MY DATA to confirm</AlertDialogTitle>
            <AlertDialogDescription>
              This final confirmation prevents accidental deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="wipe-confirm">Confirmation message</FieldLabel>
              <Input
                id="wipe-confirm"
                value={wipeConfirmText}
                onChange={(event) => setWipeConfirmText(event.target.value)}
                placeholder="WIPE MY DATA"
              />
            </Field>
            {wipeError ? (
              <Alert variant="destructive">
                <IconAlertTriangle />
                <AlertTitle>Some data remains</AlertTitle>
                <AlertDescription>{wipeError}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wipeRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!wipeConfirmMatches || wipeRunning}
              onClick={handleWipeData}
            >
              {wipeRunning ? "Wiping..." : "Delete synced data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
