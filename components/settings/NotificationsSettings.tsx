"use client"

import * as React from "react"
import { Switch } from "../ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select"
import type { HomeSettings } from "../../types/home"
import {
    IconArchive,
    IconBell,
    IconCalendarEvent,
    IconCalendarOff,
    IconCheck,
    IconChevronDown,
    IconFolder,
    IconFolderOff,
    IconMail,
    IconPin,
    IconSearch,
    IconX,
    IconPlus,
    IconRoute,
    IconTrash,
} from "@tabler/icons-react"
import { cn } from "../../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { IconExplorerIcon } from "../ui/icon-explorer"
import type { NotificationFolder } from "../dashboard/notifications/types"
import type { NotificationRule } from "../../lib/notification-rules"
import { ROUTABLE_CATEGORIES, decodeRuleTarget, encodeRuleTarget } from "../../lib/notification-rules"
import { NOTIFICATION_CATEGORY_LABELS as CATEGORY_LABELS } from "../dashboard/notifications/notificationLayout"

// ============================================
// TYPES
// ============================================

// ============================================
// COMPONENTS
// ============================================

interface SettingRowProps {
    label: string
    description?: string
    icon?: React.ReactNode
    /** Settings search target; see lib/settings-focus.ts. */
    anchor?: string
    children: React.ReactNode
    disabled?: boolean
}

function SettingRow({ label, description, icon, anchor, children, disabled }: SettingRowProps) {
    return (
        <div data-settings-anchor={anchor} className={`flex flex-col items-stretch gap-3 border-b border-[var(--border-subtle)] px-3 py-3 transition-opacity duration-[var(--anim-duration-fast,150ms)] last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                {icon && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-bg)] mt-0.5">
                        {icon}
                    </div>
                )}
                <div>
                    <div className={`text-sm font-medium text-[var(--text-primary)] ${description ? 'mb-1' : ''}`}>
                        {label}
                    </div>
                    {description && (
                        <div className="text-xs text-[var(--text-tertiary)] leading-snug">
                            {description}
                        </div>
                    )}
                </div>
            </div>
            <div className="min-w-0 pl-11 sm:ml-4 sm:shrink-0 sm:pl-0">
                {children}
            </div>
        </div>
    )
}

interface SettingSectionProps {
    title: string
    anchor?: string
    children: React.ReactNode
}

function SettingSection({ title, anchor, children }: SettingSectionProps) {
    return (
        <div data-settings-anchor={anchor} className="mb-5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2.5">
                {title}
            </h3>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                {children}
            </div>
        </div>
    )
}

// Multi-select Combobox for folders
interface FolderComboboxProps {
    folders: NotificationFolder[]
    selectedKeys: string[]
    onToggle: (key: string) => void
}

function FolderCombobox({ folders, selectedKeys, onToggle }: FolderComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")

    const selectedKeySet = React.useMemo(() => new Set(selectedKeys), [selectedKeys])
    const normalizedSearchQuery = searchQuery.toLowerCase().trim()
    const filteredFolders = React.useMemo(() => {
        if (!normalizedSearchQuery) return folders
        return folders.filter(f => f.title.toLowerCase().includes(normalizedSearchQuery))
    }, [folders, normalizedSearchQuery])

    const selectedFolders = React.useMemo(() => (
        folders.filter(f => selectedKeySet.has(`folder:${f.id}`))
    ), [folders, selectedKeySet])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        aria-label="Choose notification folders to hide"
                        className="h-10 w-full justify-between rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[14px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus-visible:ring-offset-0 sm:w-[260px]"
                    />
                }
            >
                    <span className="truncate">
                        {selectedFolders.length === 0
                            ? "Select folders..."
                            : selectedFolders.length === 1
                                ? selectedFolders[0].title
                                : `${selectedFolders.length} folders hidden`}
                    </span>
                    <IconChevronDown size={16} className="shrink-0 text-[var(--text-tertiary)]" />
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(calc(var(--anchor-width)+16px),calc(100vw-32px))] max-w-[calc(100vw-32px)] p-0 bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-lg overflow-hidden flex flex-col gap-0 outline-none ring-0"
                align="start"
            >
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)]/30 text-[14px]">
                        <IconSearch size={14} className="text-[var(--text-tertiary)] shrink-0" />
                        <Input
                            type="search"
                            aria-label="Search notification folders"
                            placeholder="Search folders..."
                            className="h-8 flex-1 border-0 bg-transparent px-0 text-[14px] leading-5 text-[var(--text-primary)] shadow-none focus-visible:ring-0 placeholder:text-[var(--text-tertiary)]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        {searchQuery && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Clear folder search"
                                onClick={() => setSearchQuery("")}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                            >
                                <IconX size={12} className="text-[var(--text-tertiary)]" />
                            </Button>
                        )}
                    </div>
                    <div className="max-h-[260px] overflow-y-auto p-1.5 text-[14px]">
                        {filteredFolders.length === 0 ? (
                            <div className="p-4 text-center text-[12px] text-[var(--text-tertiary)]">
                                No folders found.
                            </div>
                        ) : (
                            filteredFolders.map(folder => {
                                const key = `folder:${folder.id}`
                                const isSelected = selectedKeySet.has(key)

                                return (
                                    <Button
                                        key={folder.id}
                                        type="button"
                                        variant="ghost"
                                        aria-pressed={isSelected}
                                        aria-label={`${isSelected ? "Show" : "Hide"} ${folder.title} on home`}
                                        className={cn(
                                            "w-full justify-start gap-2 px-2 text-[14px] font-normal transition-all duration-150",
                                            "hover:bg-[var(--hover-bg)] text-[var(--text-primary)] group",
                                            isSelected && "accent-soft"
                                        )}
                                        onClick={() => onToggle(key)}
                                    >
                                        <div className="flex size-4 items-center justify-center shrink-0">
                                            {isSelected ? (
                                                <IconCheck size={14} className="accent-text" />
                                            ) : (
                                                <div className="size-3.5 rounded-sm border border-[var(--border-default)] group-hover:border-[var(--border-strong)] transition-colors" />
                                            )}
                                        </div>
                                        <IconExplorerIcon name={folder.icon} size={14} className={cn("shrink-0", isSelected ? "accent-text" : "text-[var(--text-tertiary)]")} />
                                        <span className="flex-1 text-left truncate">{folder.title}</span>
                                    </Button>
                                )
                            })
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

const RULE_FIELD_LABELS: Record<NotificationRule['field'], string> = {
    title: 'Title',
    content: 'Body',
    any: 'Anywhere',
}

const RULE_MATCH_LABELS: Record<NotificationRule['match'], string> = {
    contains: 'contains',
    'starts-with': 'starts with',
    equals: 'is exactly',
}

interface NotificationRuleRowProps {
    rule: NotificationRule
    folders: NotificationFolder[]
    onChange: (next: NotificationRule) => void
    onRemove: () => void
}

function NotificationRuleRow({ rule, folders, onChange, onRemove }: NotificationRuleRowProps) {
    const targetMissing = rule.target.kind === 'folder' && !folders.some(folder => folder.id === rule.target.id)

    return (
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-3 py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={rule.field}
                    onValueChange={(field) => onChange({ ...rule, field: field as NotificationRule['field'] })}
                >
                    <SelectTrigger aria-label="Field to match" className="w-[130px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(RULE_FIELD_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={rule.match}
                    onValueChange={(match) => onChange({ ...rule, match: match as NotificationRule['match'] })}
                >
                    <SelectTrigger aria-label="How to match" className="w-[140px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(RULE_MATCH_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Input
                    aria-label="Text to match"
                    value={rule.value}
                    placeholder="e.g. Year 11"
                    onChange={(event) => onChange({ ...rule, value: event.target.value })}
                    className="h-9 min-w-[140px] flex-1"
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-tertiary)]">File into</span>
                <Select
                    value={targetMissing ? '' : encodeRuleTarget(rule.target)}
                    onValueChange={(value) => {
                        const target = value ? decodeRuleTarget(value) : null
                        if (target) onChange({ ...rule, target })
                    }}
                >
                    <SelectTrigger aria-label="Destination" className="w-[190px]">
                        <SelectValue placeholder="Choose a destination" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>Tabs</SelectLabel>
                            {ROUTABLE_CATEGORIES.map(category => (
                                <SelectItem key={category} value={encodeRuleTarget({ kind: 'category', id: category })}>
                                    {CATEGORY_LABELS[category]}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                        {folders.length > 0 && (
                            <SelectGroup>
                                <SelectLabel>Folders</SelectLabel>
                                {folders.map(folder => (
                                    <SelectItem key={folder.id} value={encodeRuleTarget({ kind: 'folder', id: folder.id })}>
                                        {folder.title}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        )}
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                    <Switch
                        aria-label="Enable rule"
                        checked={rule.enabled}
                        onCheckedChange={(enabled) => onChange({ ...rule, enabled })}
                    />
                    <Button variant="ghost" size="icon-sm" aria-label="Delete rule" onClick={onRemove}>
                        <IconTrash size={16} />
                    </Button>
                </div>
            </div>

            {targetMissing && (
                <p className="text-xs text-[var(--text-tertiary)]">
                    This rule points at a folder that no longer exists, so it is skipped.
                </p>
            )}
        </div>
    )
}

// ============================================
// MAIN COMPONENT
// ============================================

interface NotificationsSettingsProps {
    homeSettings: HomeSettings
    notificationFolders: NotificationFolder[]
    updateHomeSettings: (updates: Partial<HomeSettings>) => void
    relativeNotificationDates: boolean
    setRelativeNotificationDates: React.Dispatch<React.SetStateAction<boolean>>
}

export function NotificationsSettings({
    homeSettings,
    notificationFolders,
    updateHomeSettings,
    relativeNotificationDates,
    setRelativeNotificationDates,
}: NotificationsSettingsProps) {
    const updateHomeSetting = <K extends keyof HomeSettings>(
        key: K,
        value: HomeSettings[K]
    ) => {
        updateHomeSettings({ [key]: value } as Partial<HomeSettings>)
    }

    const toggleHiddenCategory = (category: string) => {
        const current = homeSettings.hiddenNotificationCategories
        const exists = current.includes(category)
        const next = exists
            ? current.filter(c => c !== category)
            : [...current, category]

        updateHomeSetting('hiddenNotificationCategories', next)
    }

    const notificationRules = homeSettings.notificationRules || []

    const addNotificationRule = () => {
        // Defaults to a built-in tab so rules are usable before any folder exists.
        const rule: NotificationRule = {
            id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            target: { kind: 'category', id: 'alerts' },
            field: 'title',
            match: 'contains',
            value: '',
            enabled: true,
        }
        updateHomeSetting('notificationRules', [...notificationRules, rule])
    }

    const replaceNotificationRule = (next: NotificationRule) => {
        updateHomeSetting(
            'notificationRules',
            notificationRules.map(rule => (rule.id === next.id ? next : rule))
        )
    }

    const removeNotificationRule = (ruleId: string) => {
        updateHomeSetting('notificationRules', notificationRules.filter(rule => rule.id !== ruleId))
    }

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--hover-bg)]">
                    <IconBell size={20} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)] mb-0.5">
                        Notifications
                    </h2>
                    <p className="text-[13px] text-[var(--text-tertiary)]">
                        Manage how notifications are displayed and hidden
                    </p>
                </div>
            </div>

            <SettingSection title="Routing Rules" anchor="notifications-routing-rules">
                <SettingRow
                    label="Automatic filing"
                    anchor="notifications-automatic-filing"
                    description="Rules run in order and the first match wins. Notices you file by hand are never reassigned."
                    icon={<IconRoute size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Button
                        variant="outline"
                        onClick={addNotificationRule}
                        disabled={notificationFolders.length === 0}
                    >
                        <IconPlus size={16} /> Add rule
                    </Button>
                </SettingRow>

                {notificationFolders.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-[var(--text-tertiary)]">
                        Create a notification folder first — rules need somewhere to file notices into.
                    </p>
                ) : notificationRules.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-[var(--text-tertiary)]">
                        No rules yet. New notices stay in the inbox until a rule files them.
                    </p>
                ) : (
                    notificationRules.map(rule => (
                        <NotificationRuleRow
                            key={rule.id}
                            rule={rule}
                            folders={notificationFolders}
                            onChange={replaceNotificationRule}
                            onRemove={() => removeNotificationRule(rule.id)}
                        />
                    ))
                )}
            </SettingSection>

            <SettingSection title="Display Settings" anchor="notifications-display">
                <SettingRow
                    label="Auto-archive"
                    anchor="notifications-auto-archive"
                    description="Automatically archive older notifications to keep your inbox tidy"
                    icon={<IconArchive size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Select
                        value={homeSettings.notificationAutoArchiveAfter}
                        onValueChange={(value) => updateHomeSetting(
                            'notificationAutoArchiveAfter',
                            value as HomeSettings['notificationAutoArchiveAfter']
                        )}
                    >
                        <SelectTrigger aria-label="Auto-archive notifications after" className="w-full sm:w-[150px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1w">1 week</SelectItem>
                            <SelectItem value="1m">1 month</SelectItem>
                            <SelectItem value="3m">3 months</SelectItem>
                            <SelectItem value="6m">6 months</SelectItem>
                            <SelectItem value="12m">12 months</SelectItem>
                            <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Unread Section"
                    anchor="notifications-unread-section"
                    description="Group unread notifications at the top of the notification list"
                    icon={<IconMail size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Group unread notifications"
                        checked={homeSettings.notificationsUnreadSection}
                        onCheckedChange={(checked) => updateHomeSetting('notificationsUnreadSection', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Relative Dates"
                    anchor="notifications-relative-dates"
                    description="Use labels like Today and Yesterday in notification date groups"
                    icon={<IconCalendarEvent size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Use relative notification dates"
                        checked={relativeNotificationDates}
                        onCheckedChange={setRelativeNotificationDates}
                    />
                </SettingRow>

                <SettingRow
                    label="Disable Future Notifications"
                    anchor="notifications-disable-future"
                    description="Hide notifications until their start date is reached"
                    icon={<IconCalendarOff size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Disable future notifications"
                        checked={homeSettings.disableFutureNotifications}
                        onCheckedChange={(checked) => updateHomeSetting('disableFutureNotifications', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Hide Archived"
                    anchor="notifications-hide-archived"
                    description="Hide archived notifications from the home card and calendar"
                    icon={<IconArchive size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Hide archived notifications"
                        checked={homeSettings.hiddenNotificationCategories.includes('archive')}
                        onCheckedChange={() => toggleHiddenCategory('archive')}
                    />
                </SettingRow>

                <SettingRow
                    label="Hide Pinned"
                    anchor="notifications-hide-pinned"
                    description="Hide pinned notifications from the home card and calendar"
                    icon={<IconPin size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Hide pinned notifications"
                        checked={homeSettings.hiddenNotificationCategories.includes('pinned')}
                        onCheckedChange={() => toggleHiddenCategory('pinned')}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Home Filtering" anchor="notifications-home-filtering">
                <SettingRow
                    label="Folders to Hide"
                    anchor="notifications-folders-to-hide"
                    description="Select which folders to hide from the home card"
                    icon={<IconFolder size={16} className="text-[var(--text-tertiary)]" />}
                >
                    {notificationFolders.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] bg-[var(--hover-bg)] px-3 py-1.5 rounded-md border border-[var(--border-default)]">
                            <IconFolderOff size={14} />
                            <span>No folders created</span>
                        </div>
                    ) : (
                        <FolderCombobox
                            folders={notificationFolders}
                            selectedKeys={homeSettings.hiddenNotificationCategories}
                            onToggle={toggleHiddenCategory}
                        />
                    )}
                </SettingRow>
            </SettingSection>
        </div>
    )
}
