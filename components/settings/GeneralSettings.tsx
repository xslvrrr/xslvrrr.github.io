"use client"

import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog"
import { Slider } from "../ui/slider"
import type { HomeSettings } from "../../types/home"
import type { AttendanceDisplaySettings } from "../../types/portal"
import {
    applyAttendanceThreshold,
    ATTENDANCE_THRESHOLD_GAP,
    DEFAULT_ATTENDANCE_THRESHOLDS,
    resolveAttendanceThresholds,
} from "../../types/portal"
import { getDashboardSectionsForSidebar } from "../dashboard/navigation/dashboardRegistry"
import { signOut, useSession } from "@/start/session"
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconDeviceDesktop, IconGripVertical } from "@tabler/icons-react"

const GOOGLE_CALENDAR_AVAILABLE = false
const CALENDAR_NOT_LINKED_TOOLTIP = "Google Calendar isn't linked."
const CALENDAR_UNAVAILABLE_TOOLTIP = "Google Calendar is awaiting approval and isn't available in this build."
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

interface SettingRowProps {
    label: string
    description?: string
    desktopOnly?: boolean
    /** Settings search target; see lib/settings-focus.ts. */
    anchor?: string
    children: React.ReactNode
}

function SettingRow({ label, description, desktopOnly = false, anchor, children }: SettingRowProps) {
    return (
        <div
            aria-disabled={desktopOnly || undefined}
            data-settings-anchor={anchor}
            className="flex flex-col items-stretch gap-3 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-[18px]"
        >
            <div className="min-w-0 flex-1">
                <div
                    className="flex flex-wrap items-center gap-2"
                    style={{ marginBottom: description ? '4px' : 0 }}
                >
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                    }}>
                        {label}
                    </div>
                    {desktopOnly ? (
                        <Badge variant="outline">
                            <IconDeviceDesktop aria-hidden="true" />
                            Desktop only
                        </Badge>
                    ) : null}
                </div>
                {description && (
                    <div style={{
                        fontSize: '12px',
                        color: 'var(--text-tertiary)',
                    }}>
                        {description}
                    </div>
                )}
            </div>
            <div className="min-w-0 sm:ml-6 sm:shrink-0">
                {children}
            </div>
        </div>
    )
}

interface AttendanceThresholdRowProps {
    label: string
    description: string
    value: number
    min: number
    max: number
    anchor?: string
    onChange: (value: number) => void
}

function AttendanceThresholdRow({ label, description, value, min, max, anchor, onChange }: AttendanceThresholdRowProps) {
    return (
        <SettingRow label={label} description={description} anchor={anchor}>
            <div className="flex w-full items-center gap-3 sm:w-[220px]">
                <Slider
                    aria-label={label}
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
                    className="flex-1"
                />
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-[var(--text-secondary)]">
                    {value}%
                </span>
            </div>
        </SettingRow>
    )
}

interface SettingSectionProps {
    title: string
    anchor?: string
    children: React.ReactNode
}

function SettingSection({ title, anchor, children }: SettingSectionProps) {
    return (
        <div data-settings-anchor={anchor} style={{ marginBottom: '16px' }}>
            <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '10px',
            }}>
                {title}
            </h3>
            <div style={{
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                background: 'var(--bg-surface)',
                overflow: 'hidden',
            }}>
                {children}
            </div>
        </div>
    )
}

interface SortableSidebarItemProps {
    id: string
    label: string
    visibility: 'show' | 'hide'
    onVisibilityChange: (value: 'show' | 'hide') => void
    isLast: boolean
    portalContainer?: HTMLElement | ShadowRoot | null | React.RefObject<HTMLElement | ShadowRoot | null>
}

function SortableSidebarItem({
    id,
    label,
    visibility,
    onVisibilityChange,
    isLast,
    portalContainer,
}: SortableSidebarItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    return (
        <div
            ref={setNodeRef}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                background: isDragging ? 'var(--bg-elevated)' : 'transparent',
                boxShadow: isDragging ? '0 8px 16px rgba(0, 0, 0, 0.08)' : 'none',
                borderRadius: isDragging ? '10px' : '0',
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? 'none' : transition,
                willChange: 'transform',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    aria-label={`Reorder ${label}`}
                    {...attributes}
                    {...listeners}
                    style={{
                        width: '36px',
                        height: '36px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '8px',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        touchAction: 'none',
                    }}
                >
                    <IconGripVertical size={16} />
                </button>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                    {label}
                </div>
            </div>
            <Select
                value={visibility}
                onValueChange={(value) => onVisibilityChange(value as 'show' | 'hide')}
            >
                <SelectTrigger style={{ width: '130px' }}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent portalContainer={portalContainer}>
                    <SelectItem value="show">Show</SelectItem>
                    <SelectItem value="hide">Hide</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

interface GeneralSettingsProps {
    isMobile?: boolean
    homeSettings: HomeSettings
    updateHomeSettings: (updates: Partial<HomeSettings>) => void
    timetableMergeConsecutivePeriods: boolean
    onTimetableMergeConsecutivePeriodsChange: (mergeConsecutivePeriods: boolean) => void
    timetableShowBothWeeks: boolean
    onTimetableShowBothWeeksChange: (showBothWeeks: boolean) => void
    hasPerfectAttendance?: boolean
    attendanceSettings?: AttendanceDisplaySettings
    onAttendanceSettingsChange?: (settings: AttendanceDisplaySettings) => void
    onReplayFullTour?: () => void
    onReplayUpdateTour?: () => void
}

export function GeneralSettings({
    isMobile = false,
    homeSettings,
    updateHomeSettings,
    timetableMergeConsecutivePeriods,
    onTimetableMergeConsecutivePeriodsChange,
    timetableShowBothWeeks,
    onTimetableShowBothWeeksChange,
    hasPerfectAttendance = false,
    attendanceSettings = { perfectEffectEnabled: true, fillingEnabled: true },
    onAttendanceSettingsChange,
    onReplayFullTour,
    onReplayUpdateTour,
}: GeneralSettingsProps) {
    const { data: session } = useSession()
    const [showUnlinkConfirm, setShowUnlinkConfirm] = React.useState(false)
    const [showSidebarCustomizer, setShowSidebarCustomizer] = React.useState(false)
    const sidebarCustomizerContentRef = React.useRef<HTMLDivElement | null>(null)
    const resolvedAttendanceThresholds = React.useMemo(
        () => resolveAttendanceThresholds(attendanceSettings),
        [attendanceSettings]
    )

    const updateHomeSetting = <K extends keyof HomeSettings>(
        key: K,
        value: HomeSettings[K]
    ) => {
        updateHomeSettings({ [key]: value } as Partial<HomeSettings>)
    }

    const sidebarSections = getDashboardSectionsForSidebar()
    const updateSidebarVisibility = (itemId: string, value: 'show' | 'hide') => {
        updateHomeSetting('sidebarItemVisibility', {
            ...homeSettings.sidebarItemVisibility,
            [itemId]: value,
        })
    }

    const getOrderedSectionItemIds = (sectionItemIds: string[]) => {
        const positions = new Map(homeSettings.sidebarItemOrder.map((id, index) => [id, index]))
        return [...sectionItemIds].sort((a, b) => {
            const posA = positions.has(a) ? (positions.get(a) as number) : Number.MAX_SAFE_INTEGER
            const posB = positions.has(b) ? (positions.get(b) as number) : Number.MAX_SAFE_INTEGER
            return posA - posB
        })
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleSidebarDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const activeId = String(active.id)
        const overId = String(over.id)
        const sectionIndex = sidebarSections.findIndex(section => section.items.some(item => item.id === activeId))
        if (sectionIndex < 0) return
        const overSectionIndex = sidebarSections.findIndex(section => section.items.some(item => item.id === overId))
        if (sectionIndex !== overSectionIndex) return

        const sectionItemIds = sidebarSections[sectionIndex].items.map(item => item.id)
        const ordered = getOrderedSectionItemIds(sectionItemIds)
        const oldIndex = ordered.indexOf(activeId)
        const newIndex = ordered.indexOf(overId)
        if (oldIndex < 0 || newIndex < 0) return

        const next = arrayMove(ordered, oldIndex, newIndex)
        const rebuilt = sidebarSections.flatMap((section, indexOfSection) => {
            if (indexOfSection === sectionIndex) {
                return next
            }
            return getOrderedSectionItemIds(section.items.map(item => item.id))
        })

        updateHomeSetting('sidebarItemOrder', rebuilt)
    }

    const handleUnlinkGoogleCalendar = async () => {
        const response = await fetch('/api/calendar/unlink', { method: 'POST' })
        if (!response.ok) return
        await signOut({ redirect: false })
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

    const googleCalendarLinked = GOOGLE_CALENDAR_AVAILABLE
        && !!(session as any)?.accessToken
        && (session as any)?.error !== 'RefreshAccessTokenError'
    const googleCalendarTooltip = GOOGLE_CALENDAR_AVAILABLE
        ? CALENDAR_NOT_LINKED_TOOLTIP
        : CALENDAR_UNAVAILABLE_TOOLTIP

    return (
        <div data-tour-id="settings-general">
            <SettingSection title="General" anchor="general-general">
                <SettingRow
                    label="Date Format"
                    anchor="general-date-format"
                    description="How dates are displayed throughout the app"
                >
                    <Select
                        value={homeSettings.dateFormat}
                        onValueChange={(value) => updateHomeSetting('dateFormat', value as HomeSettings['dateFormat'])}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DMY">DMY (DD/MM/YYYY)</SelectItem>
                            <SelectItem value="MDY">MDY (MM/DD/YYYY)</SelectItem>
                            <SelectItem value="YMD">YMD (YYYY-MM-DD)</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Start Page"
                    anchor="general-start-page"
                    description="The page that loads when you open the app"
                >
                    <Select
                        value={homeSettings.startPage}
                        onValueChange={(value) => updateHomeSetting('startPage', value as HomeSettings['startPage'])}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="home">Home</SelectItem>
                            <SelectItem value="calendar">Calendar</SelectItem>
                            <SelectItem value="timetable">Timetable</SelectItem>
                            <SelectItem value="notifications">Notifications</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Use pointer cursors"
                    anchor="general-pointer-cursors"
                    description="Show pointer cursors for clickable UI elements"
                >
                    <Switch
                        checked={homeSettings.usePointerCursors}
                        onCheckedChange={(checked) => updateHomeSetting('usePointerCursors', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Convert emoticons to emojis"
                    anchor="general-emoticons"
                    description="Convert emoticons like :) into emojis in editable text fields"
                >
                    <Switch
                        checked={homeSettings.convertEmoticonsToEmojis}
                        onCheckedChange={(checked) => updateHomeSetting('convertEmoticonsToEmojis', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Customise sidebar"
                    anchor="general-customise-sidebar"
                    description="Control sidebar badges and which items are visible"
                >
                    <Button
                        variant="outline"
                        data-settings-open="general-sidebar-customizer"
                        onClick={() => setShowSidebarCustomizer(true)}
                        style={{ height: '34px', padding: '0 12px' }}
                    >
                        Customise
                    </Button>
                </SettingRow>
            </SettingSection>

            <div data-tour-id="settings-guides">
                <SettingSection title="Guides & what's new" anchor="general-guides">
                    <SettingRow
                        label="Full dashboard tour"
                        anchor="general-full-tour"
                        description="Replay the detailed guide across every authenticated page."
                    >
                        <Button variant="outline" onClick={onReplayFullTour}>Replay full tour</Button>
                    </SettingRow>
                    <SettingRow
                        label="Latest changes"
                        anchor="general-latest-changes"
                        description="Review new features and UX changes from this update."
                    >
                        <Button variant="outline" onClick={onReplayUpdateTour}>See what's new</Button>
                    </SettingRow>
                </SettingSection>
            </div>

            <SettingSection title="Attendance" anchor="general-attendance">
                <SettingRow
                    label="Attendance filling"
                    anchor="general-attendance-filling"
                    description="Infer unmarked periods from marked periods in the same class. Missing or dropped classes stay empty."
                >
                    <Switch
                        checked={attendanceSettings.fillingEnabled}
                        onCheckedChange={(fillingEnabled) => onAttendanceSettingsChange?.({ ...attendanceSettings, fillingEnabled })}
                    />
                </SettingRow>
                {hasPerfectAttendance && (
                    <SettingRow
                        label="Perfect attendance colour effect"
                    anchor="general-attendance-perfect"
                        description="Slowly cycle colours on 100% attendance values. Reduced motion always disables this effect."
                    >
                        <Switch
                            checked={attendanceSettings.perfectEffectEnabled}
                            onCheckedChange={(perfectEffectEnabled) => onAttendanceSettingsChange?.({ ...attendanceSettings, perfectEffectEnabled })}
                        />
                    </SettingRow>
                )}
                {/* Each slider spans its own absolute limits rather than stopping one point short of
                    its current neighbour. Pinning the ends to the neighbours collapsed a slider's
                    range to nothing whenever two thresholds sat the minimum gap apart — min === max
                    makes the thumb position NaN and the control vanished. Ordering is still enforced:
                    applyAttendanceThreshold pushes the neighbours along instead of allowing a
                    conflict, so a band is never left unreachable. */}
                <AttendanceThresholdRow
                    label="Excellent from"
                    anchor="general-attendance-excellent"
                    description="Attendance at or above this percentage is highlighted as excellent."
                    value={resolvedAttendanceThresholds.excellent}
                    min={ATTENDANCE_THRESHOLD_GAP * 2}
                    max={100}
                    onChange={(excellentThreshold) => onAttendanceSettingsChange?.({
                        ...attendanceSettings,
                        ...applyAttendanceThreshold(resolvedAttendanceThresholds, 'excellent', excellentThreshold),
                    })}
                />
                <AttendanceThresholdRow
                    label="Good from"
                    anchor="general-attendance-good"
                    description="Attendance at or above this percentage is treated as healthy."
                    value={resolvedAttendanceThresholds.good}
                    min={ATTENDANCE_THRESHOLD_GAP}
                    max={100 - ATTENDANCE_THRESHOLD_GAP}
                    onChange={(goodThreshold) => onAttendanceSettingsChange?.({
                        ...attendanceSettings,
                        ...applyAttendanceThreshold(resolvedAttendanceThresholds, 'good', goodThreshold),
                    })}
                />
                <AttendanceThresholdRow
                    label="Concerning below"
                    anchor="general-attendance-concerning"
                    description="Attendance under this percentage is highlighted as a concern."
                    value={resolvedAttendanceThresholds.concern}
                    min={0}
                    max={100 - ATTENDANCE_THRESHOLD_GAP * 2}
                    onChange={(concernThreshold) => onAttendanceSettingsChange?.({
                        ...attendanceSettings,
                        ...applyAttendanceThreshold(resolvedAttendanceThresholds, 'concern', concernThreshold),
                    })}
                />
                <SettingRow
                    label="Reset attendance thresholds"
                    anchor="general-attendance-reset"
                    description={`Restore the defaults (${DEFAULT_ATTENDANCE_THRESHOLDS.excellentThreshold}% / ${DEFAULT_ATTENDANCE_THRESHOLDS.goodThreshold}% / ${DEFAULT_ATTENDANCE_THRESHOLDS.concernThreshold}%).`}
                >
                    <Button
                        variant="outline"
                        onClick={() => onAttendanceSettingsChange?.({
                            ...attendanceSettings,
                            ...DEFAULT_ATTENDANCE_THRESHOLDS,
                        })}
                    >
                        Reset thresholds
                    </Button>
                </SettingRow>
            </SettingSection>

            <SettingSection title="Home" anchor="general-home">
                <SettingRow
                    label="Card style"
                    anchor="general-card-style"
                    description="Minimal shadcn cards or stylised Kokonut UI bento cards"
                >
                    <Select
                        value={homeSettings.homeCardStyle}
                        onValueChange={(value) => updateHomeSetting('homeCardStyle', value as HomeSettings['homeCardStyle'])}
                    >
                        <SelectTrigger style={{ width: 160 }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="minimal">Minimal</SelectItem>
                            <SelectItem value="stylised">Stylised</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow
                    label="Columns"
                    anchor="general-columns"
                    description="Choose one or two columns. Cards can span both from their right-click menu"
                    desktopOnly={isMobile}
                >
                    <Select
                        disabled={isMobile}
                        value={String(homeSettings.columns)}
                        onValueChange={(value) => updateHomeSetting('columns', Number(value) as HomeSettings['columns'])}
                    >
                        <SelectTrigger style={{ width: 160 }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">One column</SelectItem>
                            <SelectItem value="2">Two columns</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow
                    label="Notifications fallback"
                    anchor="general-notifications-fallback"
                    description="Show the most recent day with notifications if today is empty"
                >
                    <Switch
                        checked={homeSettings.notificationsFallback}
                        onCheckedChange={(checked) => updateHomeSetting('notificationsFallback', checked)}
                    />
                </SettingRow>
                <SettingRow
                    label="Home wiggle"
                    anchor="general-home-wiggle"
                    description="Animate home items while editing"
                    desktopOnly={isMobile}
                >
                    <Switch
                        disabled={isMobile}
                        checked={homeSettings.homeWiggleEnabled}
                        onCheckedChange={(checked) => updateHomeSetting('homeWiggleEnabled', checked)}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Timetable" anchor="general-timetable">
                <SettingRow
                    label="Merge consecutive periods"
                    anchor="general-timetable-merge"
                    description="Show consecutive periods for the same class as one row, such as 1-3"
                >
                    <Switch
                        checked={timetableMergeConsecutivePeriods}
                        onCheckedChange={onTimetableMergeConsecutivePeriodsChange}
                    />
                </SettingRow>
                <SettingRow
                    label="Show both weeks"
                    anchor="general-timetable-both-weeks"
                    description="Show Week A and Week B together instead of using the week toggle"
                >
                    <Switch
                        checked={timetableShowBothWeeks}
                        onCheckedChange={onTimetableShowBothWeeksChange}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Calendar" anchor="general-calendar">
                <SettingRow
                    label="First Day Of Week"
                    anchor="general-calendar-first-day"
                    description="Choose which day starts your calendar week"
                >
                    <Select
                        value={String(homeSettings.calendarFirstDayOfWeek)}
                        onValueChange={(value) => updateHomeSetting('calendarFirstDayOfWeek', Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue>{WEEKDAY_NAMES[homeSettings.calendarFirstDayOfWeek]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">Sunday</SelectItem>
                            <SelectItem value="1">Monday</SelectItem>
                            <SelectItem value="2">Tuesday</SelectItem>
                            <SelectItem value="3">Wednesday</SelectItem>
                            <SelectItem value="4">Thursday</SelectItem>
                            <SelectItem value="5">Friday</SelectItem>
                            <SelectItem value="6">Saturday</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Event Colour Mode"
                    anchor="general-calendar-colour-mode"
                    description="Use each event's own color, or always match its calendar color"
                >
                    <Select
                        value={homeSettings.calendarEventColorMode}
                        onValueChange={(value) => updateHomeSetting('calendarEventColorMode', value as 'independent' | 'calendar')}
                    >
                        <SelectTrigger style={{ width: '220px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="independent">Independent event colours</SelectItem>
                            <SelectItem value="calendar">Match calendar colour</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Merge Consecutive Periods"
                    anchor="general-calendar-merge"
                    description="Show back-to-back periods of the same class as one longer event"
                >
                    <Switch
                        checked={homeSettings.calendarMergeConsecutivePeriods}
                        onCheckedChange={(checked) => updateHomeSetting('calendarMergeConsecutivePeriods', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Month Day Click Action"
                    anchor="general-calendar-day-click"
                    description="Default view after clicking a day in month view"
                >
                    <Select
                        value={homeSettings.calendarMonthDayClickView}
                        onValueChange={(value) => updateHomeSetting('calendarMonthDayClickView', value as 'day' | 'week')}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="day">Day view</SelectItem>
                            <SelectItem value="week">Week view</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Show Classes In Home Calendar"
                    anchor="general-calendar-show-classes"
                    description="Include automatically generated class events in the Home page Calendar card"
                >
                    <Switch
                        checked={homeSettings.calendarShowClasses}
                        onCheckedChange={(checked) => updateHomeSetting('calendarShowClasses', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Show Timeline Seconds"
                    anchor="general-calendar-seconds"
                    description="Display seconds on the current-time line"
                >
                    <Switch
                        checked={homeSettings.calendarShowTimelineSeconds}
                        onCheckedChange={(checked) => updateHomeSetting('calendarShowTimelineSeconds', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Smart Cleaner"
                    anchor="general-calendar-smart-cleaner"
                    description="Show duplicate event cleanup controls in Calendar"
                >
                    <Switch
                        checked={homeSettings.calendarSmartCleanerEnabled}
                        onCheckedChange={(checked) => updateHomeSetting('calendarSmartCleanerEnabled', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Google Validation Banner"
                    anchor="general-calendar-google-banner"
                    description="Show the Google Calendar validation notice on the Calendar page"
                >
                    <Switch
                        checked={homeSettings.calendarShowGoogleValidationBanner}
                        onCheckedChange={(checked) => updateHomeSetting('calendarShowGoogleValidationBanner', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Google Sync Mode"
                    anchor="general-calendar-google-sync"
                    description="Choose which local event sources are mirrored to Google Calendar"
                >
                    <div title={!googleCalendarLinked ? googleCalendarTooltip : undefined}>
                        <Select
                            value={homeSettings.calendarSyncMode}
                            onValueChange={(value) => updateHomeSetting('calendarSyncMode', value as 'none' | 'local' | 'local_and_classes')}
                            disabled={!googleCalendarLinked}
                        >
                            <SelectTrigger style={{ width: '220px' }}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No auto sync</SelectItem>
                                <SelectItem value="local">Sync local events</SelectItem>
                                <SelectItem value="local_and_classes">Sync local + classes</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingRow>

                <SettingRow
                    label="Unlink Google Calendar"
                    anchor="general-calendar-google-unlink"
                    description={GOOGLE_CALENDAR_AVAILABLE
                        ? "Disconnect Google Calendar from this dashboard"
                        : "Unavailable while Google Calendar approval and migration are pending"}
                >
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!googleCalendarLinked}
                        title={!googleCalendarLinked ? googleCalendarTooltip : undefined}
                        onClick={(event) => {
                            if (!googleCalendarLinked) return
                            if (event.shiftKey) {
                                void handleUnlinkGoogleCalendar()
                                return
                            }
                            setShowUnlinkConfirm(true)
                        }}
                    >
                        Unlink
                    </Button>
                </SettingRow>
            </SettingSection>

            <Dialog open={showSidebarCustomizer} onOpenChange={setShowSidebarCustomizer}>
                <DialogContent
                    data-settings-anchor="general-sidebar-customizer"
                    className="border-[var(--border-default)] bg-[var(--bg-elevated)]"
                    style={{ maxWidth: '760px', width: '92vw', maxHeight: '80vh', padding: '18px', overflowY: 'auto' }}
                    ref={sidebarCustomizerContentRef}
                >
                    <DialogHeader>
                        <DialogTitle style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                            Customise sidebar
                        </DialogTitle>
                        <DialogDescription>
                            Reorder items and choose whether each one is shown or hidden.
                        </DialogDescription>
                    </DialogHeader>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleSidebarDragEnd}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {sidebarSections.map((section) => {
                                const orderedIds = getOrderedSectionItemIds(section.items.map(item => item.id))
                                return (
                                    <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <h4 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {section.title}
                                        </h4>
                                        <div style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '12px',
                                            background: 'var(--bg-surface)',
                                            overflow: 'hidden',
                                        }}>
                                            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                                                {orderedIds.map((itemId, index) => {
                                                    const item = section.items.find(candidate => candidate.id === itemId)
                                                    if (!item) return null
                                                    return (
                                                        <SortableSidebarItem
                                                            key={item.id}
                                                            id={item.id}
                                                            label={item.label}
                                                            visibility={homeSettings.sidebarItemVisibility[item.id]
                                                                || (item.id === 'flashcards' ? homeSettings.sidebarItemVisibility.study : undefined)
                                                                || 'show'}
                                                            onVisibilityChange={(value) => updateSidebarVisibility(item.id, value)}
                                                            isLast={index === orderedIds.length - 1}
                                                            portalContainer={sidebarCustomizerContentRef}
                                                        />
                                                    )
                                                })}
                                            </SortableContext>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </DndContext>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSidebarCustomizer(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
                <AlertDialogContent style={{ maxWidth: '450px' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unlink Google Calendar?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This disconnects your Google Calendar account from Millennium on this device.
                            Hold Shift while clicking destructive actions to skip future confirmations.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                setShowUnlinkConfirm(false)
                                void handleUnlinkGoogleCalendar()
                            }}
                        >
                            Unlink
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
