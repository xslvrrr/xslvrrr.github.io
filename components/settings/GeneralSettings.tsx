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
import { ClassroomSettings, defaultClassroomSettings } from "../../types/classroom"
import { HomeSettings, defaultHomeSettings, HOME_SETTINGS_KEY } from "../../types/home"
import { signOut } from "next-auth/react"

interface SettingRowProps {
    label: string
    description?: string
    children: React.ReactNode
}

function SettingRow({ label, description, children }: SettingRowProps) {
    return (
        <div className="last:border-b-0" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
        }}>
            <div style={{ flex: 1 }}>
                <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    marginBottom: description ? '4px' : 0,
                }}>
                    {label}
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
            <div style={{ flexShrink: 0, marginLeft: '24px' }}>
                {children}
            </div>
        </div>
    )
}

interface SettingSectionProps {
    title: string
    children: React.ReactNode
}

function SettingSection({ title, children }: SettingSectionProps) {
    return (
        <div style={{ marginBottom: '24px' }}>
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

export function GeneralSettings() {
    const [showUnlinkConfirm, setShowUnlinkConfirm] = React.useState(false)
    const [showSidebarCustomizer, setShowSidebarCustomizer] = React.useState(false)

    // Home settings - load from localStorage
    const [homeSettings, setHomeSettings] = React.useState<HomeSettings>(defaultHomeSettings)

    const normalizeHomeSettings = React.useCallback((raw: any): HomeSettings => {
        const merged = { ...defaultHomeSettings, ...(raw || {}) } as HomeSettings & { dateFormat?: string }
        const legacyDateFormat = String(merged.dateFormat || defaultHomeSettings.dateFormat).toUpperCase()
        const dateFormat = (legacyDateFormat === 'DMY' || legacyDateFormat === 'MDY' || legacyDateFormat === 'YMD')
            ? legacyDateFormat
            : defaultHomeSettings.dateFormat

        return {
            ...merged,
            dateFormat,
            startPage: ['home', 'calendar', 'timetable', 'notifications'].includes(merged.startPage)
                ? merged.startPage
                : defaultHomeSettings.startPage,
            sidebarItemVisibility: {
                ...Object.fromEntries(
                    Object.entries({
                        ...defaultHomeSettings.sidebarItemVisibility,
                        ...(merged.sidebarItemVisibility || {}),
                    }).map(([key, value]) => {
                        const normalized = String(value).toLowerCase()
                        return [key, normalized === 'hidden' || normalized === 'hide' ? 'hide' : 'show']
                    })
                ) as HomeSettings['sidebarItemVisibility'],
            },
            sidebarItemOrder: Array.isArray(merged.sidebarItemOrder) && merged.sidebarItemOrder.length > 0
                ? merged.sidebarItemOrder
                : defaultHomeSettings.sidebarItemOrder,
        }
    }, [])

    React.useEffect(() => {
        let cancelled = false

        const loadFromStorage = () => {
            if (typeof window === 'undefined') return
            const saved = localStorage.getItem(HOME_SETTINGS_KEY)
            if (saved) {
                try {
                    setHomeSettings(normalizeHomeSettings(JSON.parse(saved)))
                    return
                } catch {
                    setHomeSettings(defaultHomeSettings)
                }
            } else {
                setHomeSettings(defaultHomeSettings)
            }
        }

        const loadFromApi = async () => {
            try {
                const response = await fetch('/api/user/preferences')
                if (response.ok) {
                    const data = await response.json()
                    if (!cancelled) {
                        setHomeSettings(normalizeHomeSettings(data.homeSettings || {}))
                    }
                    return
                }
            } catch (e) {
                console.error('Failed to load preferences from server', e)
            }
            loadFromStorage()
        }

        loadFromApi()

        return () => {
            cancelled = true
        }
    }, [normalizeHomeSettings])

    const savePreferences = async (nextHomeSettings: HomeSettings) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(nextHomeSettings))
        }
        try {
            const response = await fetch('/api/user/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeSettings: nextHomeSettings })
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
        } catch (e) {
            console.error('Failed to save preferences to server', e)
            if (typeof window !== 'undefined') {
                localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(nextHomeSettings))
            }
        }
    }

    const updateHomeSetting = <K extends keyof HomeSettings>(
        key: K,
        value: HomeSettings[K]
    ) => {
        setHomeSettings(prev => {
            const updated = { ...prev, [key]: value }
            savePreferences(updated)
            if (typeof window !== 'undefined') {
                localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(updated))
                window.dispatchEvent(new Event('home-settings-updated'))
            }
            return updated
        })
    }

    const sidebarSections: Array<{ title: string; items: Array<{ id: string; label: string }> }> = [
        {
            title: 'Essentials',
            items: [
                { id: 'home', label: 'Home' },
                { id: 'notifications', label: 'Notifications' },
                { id: 'account', label: 'Account' },
                { id: 'calendar', label: 'Calendar' },
            ],
        },
        {
            title: 'Register',
            items: [
                { id: 'classes', label: 'Classes' },
                { id: 'timetable', label: 'Timetable' },
                { id: 'reports', label: 'Reports' },
                { id: 'attendance', label: 'Attendance' },
            ],
        },
        {
            title: 'Classroom',
            items: [
                { id: 'classroom-stream', label: 'Stream' },
                { id: 'classroom-assignments', label: 'Assignments' },
                { id: 'classroom-missing', label: 'Missing' },
                { id: 'classroom-materials', label: 'Materials' },
                { id: 'classroom-activity', label: 'Activity' },
            ],
        },
    ]

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

    const moveSidebarItemInSection = (sectionIndex: number, itemId: string, direction: -1 | 1) => {
        const sectionItemIds = sidebarSections[sectionIndex].items.map(item => item.id)
        const ordered = getOrderedSectionItemIds(sectionItemIds)
        const index = ordered.indexOf(itemId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= ordered.length) return

        const next = [...ordered]
        ;[next[index], next[target]] = [next[target], next[index]]

        const rebuilt = sidebarSections.flatMap((section, indexOfSection) => {
            if (indexOfSection === sectionIndex) {
                return next
            }
            return getOrderedSectionItemIds(section.items.map(item => item.id))
        })

        updateHomeSetting('sidebarItemOrder', rebuilt)
    }

    // Classroom settings - load from localStorage
    const [classroomSettings, setClassroomSettings] = React.useState<ClassroomSettings>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('classroomSettings')
            if (saved) {
                try {
                    return { ...defaultClassroomSettings, ...JSON.parse(saved) }
                } catch {
                    return defaultClassroomSettings
                }
            }
        }
        return defaultClassroomSettings
    })

    // Save classroom settings when they change
    const updateClassroomSetting = <K extends keyof ClassroomSettings>(
        key: K,
        value: ClassroomSettings[K]
    ) => {
        setClassroomSettings(prev => {
            const updated = { ...prev, [key]: value }
            if (typeof window !== 'undefined') {
                localStorage.setItem('classroomSettings', JSON.stringify(updated))
            }
            return updated
        })
    }

    const handleUnlinkGoogleCalendar = async () => {
        try {
            await fetch('/api/calendar/unlink', { method: 'POST' })
        } finally {
            await signOut({ redirect: false })
            if (typeof window !== 'undefined') {
                window.location.reload()
            }
        }
    }

    return (
        <div>
            <SettingSection title="General">
                <SettingRow
                    label="Date Format"
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
                    description="Show pointer cursors for clickable UI elements"
                >
                    <Switch
                        checked={homeSettings.usePointerCursors}
                        onCheckedChange={(checked) => updateHomeSetting('usePointerCursors', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Convert emoticons to emojis"
                    description="Convert emoticons like :) into emojis in editable text fields"
                >
                    <Switch
                        checked={homeSettings.convertEmoticonsToEmojis}
                        onCheckedChange={(checked) => updateHomeSetting('convertEmoticonsToEmojis', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Customize sidebar"
                    description="Control sidebar badges and which items are visible"
                >
                    <Button
                        variant="outline"
                        onClick={() => setShowSidebarCustomizer(true)}
                        style={{ height: '34px', padding: '0 12px' }}
                    >
                        Customize
                    </Button>
                </SettingRow>
            </SettingSection>

            <SettingSection title="Home">
                <SettingRow
                    label="Home Columns"
                    description="Choose how many columns appear on the Home page"
                >
                    <Select
                        value={String(homeSettings.columns)}
                        onValueChange={(value) => updateHomeSetting('columns', value === '1' ? 1 : 2)}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 column</SelectItem>
                            <SelectItem value="2">2 columns</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Notifications fallback"
                    description="Show the most recent day with notifications if today is empty"
                >
                    <Switch
                        checked={homeSettings.notificationsFallback}
                        onCheckedChange={(checked) => updateHomeSetting('notificationsFallback', checked)}
                    />
                </SettingRow>
                <SettingRow
                    label="Home wiggle"
                    description="Animate home items while editing"
                >
                    <Switch
                        checked={homeSettings.homeWiggleEnabled}
                        onCheckedChange={(checked) => updateHomeSetting('homeWiggleEnabled', checked)}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Calendar">
                <SettingRow
                    label="First Day Of Week"
                    description="Choose which day starts your calendar week"
                >
                    <Select
                        value={String(homeSettings.calendarFirstDayOfWeek)}
                        onValueChange={(value) => updateHomeSetting('calendarFirstDayOfWeek', Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
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
                    label="Event Color Mode"
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
                            <SelectItem value="independent">Independent event colors</SelectItem>
                            <SelectItem value="calendar">Match calendar color</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Merge Consecutive Periods"
                    description="Show back-to-back periods of the same class as one longer event"
                >
                    <Switch
                        checked={homeSettings.calendarMergeConsecutivePeriods}
                        onCheckedChange={(checked) => updateHomeSetting('calendarMergeConsecutivePeriods', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Month Day Click Action"
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
                    label="Google Sync Mode"
                    description="Choose which local event sources are mirrored to Google Calendar"
                >
                    <Select
                        value={homeSettings.calendarSyncMode}
                        onValueChange={(value) => updateHomeSetting('calendarSyncMode', value as 'none' | 'local' | 'local_and_classes')}
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
                </SettingRow>

                <SettingRow
                    label="Unlink Google Calendar"
                    description="Disconnect Google Calendar from this dashboard"
                >
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={(event) => {
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

            <SettingSection title="Google Classroom">
                <SettingRow
                    label="Due Date Format"
                    description="How assignment due dates are displayed"
                >
                    <Select
                        value={classroomSettings.dueDateFormat}
                        onValueChange={(v) => updateClassroomSetting('dueDateFormat', v as 'relative' | 'absolute')}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="relative">Relative (in 2 hours)</SelectItem>
                            <SelectItem value="absolute">Absolute (Mon, 15 Jan)</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Due Date Detail"
                    description="The precision level for relative due dates"
                >
                    <Select
                        value={classroomSettings.dueDateDetail}
                        onValueChange={(v) => updateClassroomSetting('dueDateDetail', v as 'seconds' | 'minutes' | 'hours' | 'days')}
                    >
                        <SelectTrigger style={{ width: '160px' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="days">Days only</SelectItem>
                            <SelectItem value="hours">Hours & Days</SelectItem>
                            <SelectItem value="minutes">Minutes, Hours & Days</SelectItem>
                            <SelectItem value="seconds">Full precision</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Show Course Colors"
                    description="Display colored indicators for each class"
                >
                    <Switch
                        checked={classroomSettings.showCourseColors}
                        onCheckedChange={(v) => updateClassroomSetting('showCourseColors', v)}
                    />
                </SettingRow>

                <SettingRow
                    label="Timetable Integration"
                    description="Link Classroom courses with your timetable (coming soon)"
                >
                    <Switch
                        checked={classroomSettings.enableTimetableIntegration}
                        onCheckedChange={(v) => updateClassroomSetting('enableTimetableIntegration', v)}
                        disabled
                    />
                </SettingRow>
            </SettingSection>

            <Dialog open={showSidebarCustomizer} onOpenChange={setShowSidebarCustomizer}>
                <DialogContent
                    className="border-[var(--border-default)] bg-[var(--bg-elevated)]"
                    style={{ maxWidth: '760px', width: '92vw', maxHeight: '80vh', padding: '18px', overflowY: 'auto' }}
                >
                    <DialogHeader>
                        <DialogTitle style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                            Customize sidebar
                        </DialogTitle>
                        <DialogDescription>
                            Reorder items and choose whether each one is shown or hidden.
                        </DialogDescription>
                    </DialogHeader>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {sidebarSections.map((section, sectionIndex) => (
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
                                    {getOrderedSectionItemIds(section.items.map(item => item.id)).map((itemId) => {
                                        const item = section.items.find(candidate => candidate.id === itemId)
                                        if (!item) return null
                                        const orderedIds = getOrderedSectionItemIds(section.items.map(candidate => candidate.id))
                                        const rowIndex = orderedIds.indexOf(itemId)
                                        return (
                                        <div
                                            key={item.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                                padding: '12px 16px',
                                                borderBottom: '1px solid var(--border-subtle)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => moveSidebarItemInSection(sectionIndex, item.id, -1)}
                                                    disabled={rowIndex <= 0}
                                                    style={{ width: '28px', height: '28px', padding: 0 }}
                                                >
                                                    ↑
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => moveSidebarItemInSection(sectionIndex, item.id, 1)}
                                                    disabled={rowIndex >= orderedIds.length - 1}
                                                    style={{ width: '28px', height: '28px', padding: 0 }}
                                                >
                                                    ↓
                                                </Button>
                                                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                                    {item.label}
                                                </div>
                                            </div>
                                            <Select
                                                value={homeSettings.sidebarItemVisibility[item.id] || 'show'}
                                                onValueChange={(value) => updateSidebarVisibility(item.id, value as 'show' | 'hide')}
                                            >
                                                <SelectTrigger style={{ width: '130px' }}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="show">Show</SelectItem>
                                                    <SelectItem value="hide">Hide</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

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
