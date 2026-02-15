"use client"

import * as React from "react"
import { Switch } from "../ui/switch"
import { HomeSettings, defaultHomeSettings, HOME_SETTINGS_KEY } from "../../types/home"
import * as TablerIcons from "@tabler/icons-react"
import { IconBell, IconFolder, IconFolderOff, IconChevronDown, IconCheck, IconSearch, IconX } from "@tabler/icons-react"
import { cn } from "../../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Button } from "../ui/button"

// ============================================
// TYPES
// ============================================

interface NotificationFolder {
    id: string
    title: string
    subtitle?: string
    icon: string
}

const FOLDER_STORAGE_KEY = 'millennium-notification-folders'

// ============================================
// COMPONENTS
// ============================================

interface SettingRowProps {
    label: string
    description?: string
    icon?: React.ReactNode
    children: React.ReactNode
    disabled?: boolean
}

function SettingRow({ label, description, icon, children, disabled }: SettingRowProps) {
    return (
        <div className={`flex items-center justify-between px-4 py-4 border-b border-[var(--border-subtle)] transition-opacity duration-[var(--anim-duration-fast,150ms)] last:border-b-0 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-1 items-start gap-3">
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
            <div className="shrink-0 ml-6">
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
        <div className="mb-7">
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

    const filteredFolders = folders.filter(f =>
        f.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const selectedFolders = folders.filter(f => selectedKeys.includes(`folder:${f.id}`))

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-[260px] h-10 justify-between rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[14px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus-visible:ring-offset-0"
                >
                    <span className="truncate">
                        {selectedFolders.length === 0
                            ? "Select folders..."
                            : selectedFolders.length === 1
                                ? selectedFolders[0].title
                                : `${selectedFolders.length} folders hidden`}
                    </span>
                    <IconChevronDown size={16} className="shrink-0 text-[var(--text-tertiary)]" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[260px] p-0 bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-lg overflow-hidden flex flex-col gap-0 outline-none ring-0"
                align="end"
            >
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)]/30 text-[14px]">
                        <IconSearch size={14} className="text-[var(--text-tertiary)] shrink-0" />
                        <input
                            placeholder="Search folders..."
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:ring-offset-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none text-[14px] leading-5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="hover:text-[var(--text-primary)] transition-colors">
                                <IconX size={12} className="text-[var(--text-tertiary)]" />
                            </button>
                        )}
                    </div>
                    <div className="max-h-[260px] overflow-y-auto p-1.5 custom-scrollbar text-[14px]">
                        {filteredFolders.length === 0 ? (
                            <div className="p-6 text-center text-[12px] text-[var(--text-tertiary)]">
                                No folders found.
                            </div>
                        ) : (
                            filteredFolders.map(folder => {
                                const key = `folder:${folder.id}`
                                const isSelected = selectedKeys.includes(key)
                                const FolderIcon = (TablerIcons as any)[folder.icon] || IconFolder

                                return (
                                    <button
                                        key={folder.id}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] transition-all duration-150",
                                            "hover:bg-[var(--hover-bg)] text-[var(--text-primary)] group",
                                            isSelected && "bg-[var(--accent-color)]/10"
                                        )}
                                        onClick={() => onToggle(key)}
                                    >
                                        <div className="flex size-4 items-center justify-center shrink-0">
                                            {isSelected ? (
                                                <IconCheck size={14} className="text-[var(--accent-color)]" />
                                            ) : (
                                                <div className="size-3.5 rounded-sm border border-[var(--border-default)] group-hover:border-[var(--border-strong)] transition-colors" />
                                            )}
                                        </div>
                                        <FolderIcon size={14} className={cn("shrink-0", isSelected ? "text-[var(--accent-color)]" : "text-[var(--text-tertiary)]")} />
                                        <span className="flex-1 text-left truncate">{folder.title}</span>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function NotificationsSettings() {
    // Home settings - load from API (fallback to localStorage)
    const [homeSettings, setHomeSettings] = React.useState<HomeSettings>(defaultHomeSettings)

    const [notificationFolders, setNotificationFolders] = React.useState<NotificationFolder[]>([])

    const preferencesLoadedRef = React.useRef(false)

    // Load from API (fallback to localStorage)
    React.useEffect(() => {
        let cancelled = false

        const loadFromStorage = () => {
            if (typeof window === 'undefined') return
            const savedSettings = localStorage.getItem(HOME_SETTINGS_KEY)
            if (savedSettings) {
                try {
                    setHomeSettings({ ...defaultHomeSettings, ...JSON.parse(savedSettings) })
                } catch {
                    setHomeSettings(defaultHomeSettings)
                }
            } else {
                setHomeSettings(defaultHomeSettings)
            }

            const savedFolders = localStorage.getItem(FOLDER_STORAGE_KEY)
            if (savedFolders) {
                try {
                    const parsed = JSON.parse(savedFolders)
                    if (Array.isArray(parsed)) setNotificationFolders(parsed)
                } catch (e) {
                    console.error("Failed to load folders", e)
                }
            }
            preferencesLoadedRef.current = true
        }

        const loadFromApi = async () => {
            try {
                const response = await fetch('/api/user/preferences')
                if (response.ok) {
                    const data = await response.json()
                    if (cancelled) return
                    if (data.homeSettings) {
                        setHomeSettings({ ...defaultHomeSettings, ...data.homeSettings })
                    } else {
                        setHomeSettings(defaultHomeSettings)
                    }
                    if (Array.isArray(data.notificationFolders)) {
                        setNotificationFolders(data.notificationFolders)
                    }
                    preferencesLoadedRef.current = true
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
    }, [])

    const savePreferences = async (nextHomeSettings: HomeSettings, nextFolders: NotificationFolder[]) => {
        try {
            const response = await fetch('/api/user/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeSettings: nextHomeSettings, notificationFolders: nextFolders })
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
        } catch (e) {
            console.error('Failed to save preferences to server', e)
            if (typeof window !== 'undefined') {
                localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(nextHomeSettings))
                localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(nextFolders))
            }
        }
    }

    const updateHomeSetting = <K extends keyof HomeSettings>(
        key: K,
        value: HomeSettings[K]
    ) => {
        setHomeSettings(prev => {
            const updated = { ...prev, [key]: value }
            savePreferences(updated, notificationFolders)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('home-settings-updated'))
            }
            return updated
        })
    }

    // Persist folders when they change (skip initial load)
    React.useEffect(() => {
        if (!preferencesLoadedRef.current) return
        savePreferences(homeSettings, notificationFolders)
    }, [notificationFolders])

    const toggleHiddenCategory = (category: string) => {
        const current = homeSettings.hiddenNotificationCategories
        const exists = current.includes(category)
        const next = exists
            ? current.filter(c => c !== category)
            : [...current, category]

        updateHomeSetting('hiddenNotificationCategories', next)
    }

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
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

            <SettingSection title="Display Settings">
                <SettingRow
                    label="Hide Archived"
                    description="Hide archived notifications from the home card and calendar"
                    icon={<TablerIcons.IconArchive size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        checked={homeSettings.hiddenNotificationCategories.includes('archive')}
                        onCheckedChange={() => toggleHiddenCategory('archive')}
                    />
                </SettingRow>

                <SettingRow
                    label="Hide Pinned"
                    description="Hide pinned notifications from the home card and calendar"
                    icon={<TablerIcons.IconPin size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        checked={homeSettings.hiddenNotificationCategories.includes('pinned')}
                        onCheckedChange={() => toggleHiddenCategory('pinned')}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Home Filtering">
                <SettingRow
                    label="Folders to Hide"
                    description="Select which folders to hide from the home card"
                    icon={<TablerIcons.IconFolder size={16} className="text-[var(--text-tertiary)]" />}
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
