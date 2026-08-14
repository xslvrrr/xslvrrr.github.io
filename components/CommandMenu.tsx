"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    IconArchive,
    IconAlertCircle,
    IconArrowLeft,
    IconArrowRight,
    IconCalendarEvent,
    IconCalendarPlus,
    IconCalendarStats,
    IconCalendarTime,
    IconCalendarWeek,
    IconChecklist,
    IconInbox,
    IconLetterA,
    IconLayoutGrid,
    IconLetterB,
    IconLogout,
    IconPin,
    IconPlus,
    IconSettings,
    IconX,
} from "@tabler/icons-react"
import { IconExplorerIcon } from "./ui/icon-explorer"
import {
    RELEASED_DASHBOARD_SECTIONS,
    RELEASED_SETTINGS_SECTIONS,
    type DashboardSectionId,
} from "./dashboard/navigation/dashboardRegistry"
import { formatShortcutKey } from "../hooks/useShortcuts"
import type { ShortcutBinding } from "../hooks/useShortcuts"

// ============================================
// TYPES
// ============================================

export interface CommandItem {
    id: string
    label: string
    description?: string
    icon: React.ReactNode
    shortcut?: string[]
    shortcutIsSequence?: boolean
    category: string
    keywords?: string[]
    action: () => void
}

interface CommandMenuProps {
    open: boolean
    onClose: () => void
    onNavigate: (page: DashboardSectionId | "settings") => void
    onAction?: (action: string, payload?: unknown) => void
    currentSection?: string
    currentView?: string
    shortcutBindings?: Map<string, ShortcutBinding>
    notificationFolders?: { id: string; title: string; subtitle?: string; icon: string }[]
    /** Open dashboard tabs, so any of them can be jumped to straight from the menu. */
    openTabs?: { id: string; label: string; active: boolean }[]
}

// ============================================
// COMMAND MENU COMPONENT
// ============================================

export function CommandMenu({ open, onClose, onNavigate, onAction, currentSection, currentView, shortcutBindings, notificationFolders = [], openTabs = [] }: CommandMenuProps) {
    const [inputValue, setInputValue] = useState("")
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [usingKeyboard, setUsingKeyboard] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const [shouldRender, setShouldRender] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Helper to get shortcut from bindings
    const getShortcut = useCallback((shortcutId: string): { keys: string[]; isSequence: boolean } | undefined => {
        const binding = shortcutBindings?.get(shortcutId)
        if (!binding) return undefined
        return { keys: binding.keys, isSequence: binding.isSequence || false }
    }, [shortcutBindings])

    // Command registry with all site actions
    const commands: CommandItem[] = useMemo(() => {
        const navSettingsShortcut = getShortcut('nav-settings')

        // Action shortcuts
        const logoutShortcut = getShortcut('action-logout')

        // Calendar shortcuts
        const calCreateEventShortcut = getShortcut('calendar-create-event')
        const calDayViewShortcut = getShortcut('calendar-day-view')
        const calWeekViewShortcut = getShortcut('calendar-week-view')
        const calMonthViewShortcut = getShortcut('calendar-month-view')
        const calTodayShortcut = getShortcut('calendar-today')

        // Timetable shortcuts
        const ttWeekAShortcut = getShortcut('timetable-week-a')
        const ttWeekBShortcut = getShortcut('timetable-week-b')

        // Notification shortcuts
        const notifInboxShortcut = getShortcut('notifications-inbox')
        const notifPinnedShortcut = getShortcut('notifications-pinned')
        const notifAlertsShortcut = getShortcut('notifications-alerts')
        const notifEventsShortcut = getShortcut('notifications-events')
        const notifAssignmentsShortcut = getShortcut('notifications-assignments')
        const notifArchiveShortcut = getShortcut('notifications-archive')

        const navigationItems: CommandItem[] = RELEASED_DASHBOARD_SECTIONS.map((section) => {
            const shortcut = "shortcutId" in section ? getShortcut(section.shortcutId) : undefined
            const SectionIcon = section.icon
            return {
                id: "shortcutId" in section ? section.shortcutId : `nav-${section.id}`,
                label: section.navigationLabel,
                description: section.description,
                icon: <SectionIcon size={18} />,
                category: "Navigation",
                shortcut: shortcut?.keys,
                shortcutIsSequence: shortcut?.isSequence,
                keywords: [...section.keywords],
                action: () => onNavigate(section.id),
            }
        })

        const settingsItems: CommandItem[] = RELEASED_SETTINGS_SECTIONS
            .filter((section) => !("showInCommandMenu" in section) || section.showInCommandMenu)
            .map((section) => {
                const shortcut = "shortcutId" in section ? getShortcut(section.shortcutId) : undefined
                const SectionIcon = section.icon
                return {
                    id: `settings-${section.id}`,
                    label: section.commandLabel,
                    description: section.description,
                    icon: <SectionIcon size={18} />,
                    category: "Settings",
                    shortcut: shortcut?.keys,
                    shortcutIsSequence: shortcut?.isSequence,
                    keywords: ["settings", ...section.keywords],
                    action: () => {
                        onAction?.("settings-section", section.id)
                        onClose()
                    },
                }
            })

        const items: CommandItem[] = [
            ...navigationItems,
            { id: "nav-settings", label: "Settings", description: "Manage app settings and preferences", icon: <IconSettings size={18} />, category: "Navigation", shortcut: navSettingsShortcut?.keys, shortcutIsSequence: navSettingsShortcut?.isSequence, keywords: ["preferences", "config"], action: () => onNavigate("settings") },

            // Actions
            { id: "action-logout", label: "Log out", description: "Sign out of your account", icon: <IconLogout size={18} />, category: "Actions", shortcut: logoutShortcut?.keys, shortcutIsSequence: logoutShortcut?.isSequence, action: () => { onAction?.("logout"); onClose(); } },

            // Calendar
            { id: "calendar-create-event", label: "Create calendar event...", description: "Add a new event to your calendar", icon: <IconCalendarPlus size={18} />, category: "Calendar", shortcut: calCreateEventShortcut?.keys, shortcutIsSequence: calCreateEventShortcut?.isSequence, keywords: ["create", "add", "new"], action: () => { onAction?.("create-event"); onClose(); } },
            { id: "calendar-day-view", label: "Day View", description: "Switch calendar to day view", icon: <IconCalendarTime size={18} />, category: "Calendar", shortcut: calDayViewShortcut?.keys, shortcutIsSequence: calDayViewShortcut?.isSequence, keywords: ["calendar", "view"], action: () => { onAction?.("calendar-view", "day"); onClose(); } },
            { id: "calendar-week-view", label: "Week View", description: "Switch calendar to week view", icon: <IconCalendarWeek size={18} />, category: "Calendar", shortcut: calWeekViewShortcut?.keys, shortcutIsSequence: calWeekViewShortcut?.isSequence, keywords: ["calendar", "view"], action: () => { onAction?.("calendar-view", "week"); onClose(); } },
            { id: "calendar-month-view", label: "Month View", description: "Switch calendar to month view", icon: <IconCalendarStats size={18} />, category: "Calendar", shortcut: calMonthViewShortcut?.keys, shortcutIsSequence: calMonthViewShortcut?.isSequence, keywords: ["calendar", "view"], action: () => { onAction?.("calendar-view", "month"); onClose(); } },
            { id: "calendar-today", label: "Go to Today", description: "Navigate to today in calendar", icon: <IconCalendarEvent size={18} />, category: "Calendar", shortcut: calTodayShortcut?.keys, shortcutIsSequence: calTodayShortcut?.isSequence, keywords: ["calendar", "today", "now"], action: () => { onAction?.("calendar-today"); onClose(); } },

            // Timetable
            { id: "timetable-week-a", label: "Switch to Week A", description: "View Week A timetable", icon: <IconLetterA size={18} />, category: "Timetable", shortcut: ttWeekAShortcut?.keys, shortcutIsSequence: ttWeekAShortcut?.isSequence, keywords: ["week", "timetable"], action: () => { onAction?.("timetable-week", "weekA"); onClose(); } },
            { id: "timetable-week-b", label: "Switch to Week B", description: "View Week B timetable", icon: <IconLetterB size={18} />, category: "Timetable", shortcut: ttWeekBShortcut?.keys, shortcutIsSequence: ttWeekBShortcut?.isSequence, keywords: ["week", "timetable"], action: () => { onAction?.("timetable-week", "weekB"); onClose(); } },

            // Notification Categories
            { id: "notifications-inbox", label: "Inbox", description: "View inbox notifications", icon: <IconInbox size={18} />, category: "Notifications", shortcut: notifInboxShortcut?.keys, shortcutIsSequence: notifInboxShortcut?.isSequence, keywords: ["notifications", "messages"], action: () => { onAction?.("notification-category", "inbox"); onClose(); } },
            { id: "notifications-pinned", label: "Pinned", description: "View pinned notifications", icon: <IconPin size={18} />, category: "Notifications", shortcut: notifPinnedShortcut?.keys, shortcutIsSequence: notifPinnedShortcut?.isSequence, keywords: ["notifications", "pinned", "saved"], action: () => { onAction?.("notification-category", "pinned"); onClose(); } },
            { id: "notifications-alerts", label: "Alerts", description: "View alert notifications", icon: <IconAlertCircle size={18} />, category: "Notifications", shortcut: notifAlertsShortcut?.keys, shortcutIsSequence: notifAlertsShortcut?.isSequence, keywords: ["notifications", "alerts", "urgent"], action: () => { onAction?.("notification-category", "alerts"); onClose(); } },
            { id: "notifications-events", label: "Events", description: "View event notifications", icon: <IconCalendarEvent size={18} />, category: "Notifications", shortcut: notifEventsShortcut?.keys, shortcutIsSequence: notifEventsShortcut?.isSequence, keywords: ["notifications", "events"], action: () => { onAction?.("notification-category", "events"); onClose(); } },
            { id: "notifications-assignments", label: "Assignments", description: "View assignment notifications", icon: <IconChecklist size={18} />, category: "Notifications", shortcut: notifAssignmentsShortcut?.keys, shortcutIsSequence: notifAssignmentsShortcut?.isSequence, keywords: ["notifications", "homework", "assignments"], action: () => { onAction?.("notification-category", "assignments"); onClose(); } },
            { id: "notifications-archive", label: "Archive", description: "View archived notifications", icon: <IconArchive size={18} />, category: "Notifications", shortcut: notifArchiveShortcut?.keys, shortcutIsSequence: notifArchiveShortcut?.isSequence, keywords: ["notifications", "archive", "old"], action: () => { onAction?.("notification-category", "archive"); onClose(); } },

            ...settingsItems,
        ]

        const tabNewShortcut = getShortcut('tab-new')
        const tabCloseShortcut = getShortcut('tab-close')
        const tabNextShortcut = getShortcut('tab-next')
        const tabPreviousShortcut = getShortcut('tab-previous')

        items.push(
            { id: "tab-new", label: "New tab", description: "Open another dashboard tab", icon: <IconPlus size={18} />, category: "Tabs", shortcut: tabNewShortcut?.keys, shortcutIsSequence: tabNewShortcut?.isSequence, keywords: ["tab", "open"], action: () => { onAction?.("tab-new"); onClose(); } },
            { id: "tab-close", label: "Close tab", description: "Close the active dashboard tab", icon: <IconX size={18} />, category: "Tabs", shortcut: tabCloseShortcut?.keys, shortcutIsSequence: tabCloseShortcut?.isSequence, keywords: ["tab", "close"], action: () => { onAction?.("tab-close"); onClose(); } },
            { id: "tab-next", label: "Next tab", description: "Cycle to the next dashboard tab", icon: <IconArrowRight size={18} />, category: "Tabs", shortcut: tabNextShortcut?.keys, shortcutIsSequence: tabNextShortcut?.isSequence, keywords: ["tab", "cycle"], action: () => { onAction?.("tab-cycle", 1); onClose(); } },
            { id: "tab-previous", label: "Previous tab", description: "Cycle to the previous dashboard tab", icon: <IconArrowLeft size={18} />, category: "Tabs", shortcut: tabPreviousShortcut?.keys, shortcutIsSequence: tabPreviousShortcut?.isSequence, keywords: ["tab", "cycle"], action: () => { onAction?.("tab-cycle", -1); onClose(); } },
        )

        openTabs.forEach((tab) => {
            items.push({
                id: `tab-switch-${tab.id}`,
                label: tab.active ? `${tab.label} (current tab)` : tab.label,
                description: "Switch to this tab",
                icon: <IconLayoutGrid size={18} />,
                category: "Tabs",
                keywords: ["tab", "switch", "jump"],
                action: () => { onAction?.("tab-switch", tab.id); onClose(); },
            })
        })

        if (notificationFolders.length > 0) {
            notificationFolders.forEach((folder) => {
                items.push({
                    id: `notifications-folder-${folder.id}`,
                    label: folder.title,
                    description: folder.subtitle || "Open notification folder",
                    icon: <IconExplorerIcon name={folder.icon} size={18} />,
                    category: "Notification Folders",
                    keywords: ["notifications", "folder", folder.title],
                    action: () => {
                        onAction?.("notification-category", `folder:${folder.id}`)
                        onClose()
                    },
                })
            })
        }

        return items
    }, [onNavigate, onAction, onClose, getShortcut, notificationFolders, openTabs])

    // Filter and rank commands based on input with priority system
    const filteredCommands = useMemo(() => {
        if (!inputValue.trim()) return commands

        const query = inputValue.toLowerCase()
        const queryLower = query.toLowerCase()

        // Score and filter commands based on match priority
        const scoredCommands = commands
            .map(cmd => {
                const labelLower = cmd.label.toLowerCase()
                const descLower = cmd.description?.toLowerCase() || ''
                const categoryLower = cmd.category.toLowerCase()

                let score = 0
                let matches = false

                // Priority 1: Exact label match (highest priority)
                if (labelLower === queryLower) {
                    score = 1000
                    matches = true
                }
                // Priority 2: Label starts with query
                else if (labelLower.startsWith(queryLower)) {
                    score = 500
                    matches = true
                }
                // Priority 3: Label contains query
                else if (labelLower.includes(queryLower)) {
                    score = 300
                    matches = true
                }
                // Priority 4: Keywords match
                else if (cmd.keywords?.some(k => k.toLowerCase().includes(queryLower))) {
                    score = 200
                    matches = true
                }
                // Priority 5: Category match
                else if (categoryLower.includes(queryLower)) {
                    score = 100
                    matches = true
                }
                // Priority 6: Description match (lowest priority)
                else if (descLower.includes(queryLower)) {
                    score = 50
                    matches = true
                }

                return { cmd, score, matches }
            })
            .filter(item => item.matches)
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .map(item => item.cmd)

        return scoredCommands
    }, [commands, inputValue])

    // Group commands by category
    const groupedCommands = useMemo(() => {
        const groups: Record<string, CommandItem[]> = {}
        filteredCommands.forEach(cmd => {
            if (!groups[cmd.category]) groups[cmd.category] = []
            groups[cmd.category].push(cmd)
        })
        return groups
    }, [filteredCommands])

    // Flat list for navigation
    const flatCommands = useMemo(() => {
        const items: CommandItem[] = []
        Object.values(groupedCommands).forEach(group => items.push(...group))
        return items
    }, [groupedCommands])

    // Inline suggestion
    const suggestion = useMemo(() => {
        if (!inputValue.trim()) return ""
        const match = filteredCommands.find(cmd =>
            cmd.label.toLowerCase().startsWith(inputValue.toLowerCase())
        )
        if (match) {
            return match.label.slice(inputValue.length)
        }
        return ""
    }, [filteredCommands, inputValue])

    // Handle open/close with animation
    useEffect(() => {
        if (open) {
            setShouldRender(true)
            setIsClosing(false)
            setInputValue("")
            setSelectedIndex(0)
            setUsingKeyboard(false)
            setTimeout(() => inputRef.current?.focus(), 50)
        } else if (shouldRender) {
            setIsClosing(true)
            setTimeout(() => {
                setShouldRender(false)
                setIsClosing(false)
            }, 120)
        }
    }, [open, shouldRender])

    // Reset selected index when filter changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [inputValue])

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && usingKeyboard) {
            const selectedEl = listRef.current.querySelector('[data-selected="true"]')
            selectedEl?.scrollIntoView({ block: "nearest" })
        }
    }, [selectedIndex, usingKeyboard])

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault()
                setUsingKeyboard(true)
                setSelectedIndex(prev => (prev + 1) % flatCommands.length)
                break
            case "ArrowUp":
                e.preventDefault()
                setUsingKeyboard(true)
                setSelectedIndex(prev => (prev - 1 + flatCommands.length) % flatCommands.length)
                break
            case "Enter":
                e.preventDefault()
                if (flatCommands[selectedIndex]) {
                    flatCommands[selectedIndex].action()
                    onClose()
                }
                break
            case "ArrowRight":
                if (suggestion && e.currentTarget === inputRef.current) {
                    e.preventDefault()
                    setInputValue(inputValue + suggestion)
                }
                break
            case "Tab":
                e.preventDefault()
                if (suggestion) {
                    setInputValue(inputValue + suggestion)
                }
                break
            case "Escape":
                e.preventDefault()
                onClose()
                break
        }
    }, [flatCommands, selectedIndex, suggestion, inputValue, onClose])

    // Handle mouse movement - disable keyboard mode
    const handleMouseMove = useCallback(() => {
        if (usingKeyboard) {
            setUsingKeyboard(false)
        }
    }, [usingKeyboard])

    // Handle item hover
    const handleItemHover = useCallback((index: number) => {
        if (!usingKeyboard) {
            setSelectedIndex(index)
        }
    }, [usingKeyboard])

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }, [onClose])

    // Format shortcut - use "then" for multi-key shortcuts
    const formatShortcut = (shortcut: string[], isSequence?: boolean) => {
        if (isSequence && shortcut.length === 2) {
            // Two regular keys = show "key1 then key2"
            return (
                <>
                    <kbd style={kbdStyle}>{formatShortcutKey(shortcut[0])}</kbd>
                    <span style={{ color: "var(--text-muted)", fontSize: "10px", margin: "0 2px" }}>then</span>
                    <kbd style={kbdStyle}>{formatShortcutKey(shortcut[1])}</kbd>
                </>
            )
        } else {
            // Modifier key combos - show side by side
            return shortcut.map((key, i) => (
                <kbd key={i} style={kbdStyle}>{formatShortcutKey(key)}</kbd>
            ))
        }
    }

    const kbdStyle: React.CSSProperties = {
        padding: "3px 6px",
        fontSize: "11px",
        fontWeight: 500,
        color: "var(--text-tertiary)",
        backgroundColor: "var(--bg-surface)",
        borderRadius: "4px",
        fontFamily: "inherit",
    }

    if (!shouldRender) return null

    let globalIndex = 0

    return (
        <div
            className="command-menu-backdrop"
            onClick={handleBackdropClick}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "12vh",
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                animation: isClosing ? "fadeOut 120ms ease-out forwards" : "fadeIn 120ms ease-out",
            }}
        >
            <div
                ref={containerRef}
                data-tour-id="command-menu"
                className="command-menu-container"
                onMouseMove={handleMouseMove}
                style={{
                    width: "100%",
                    maxWidth: "620px",
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    boxShadow: "0 25px 60px -15px rgb(var(--shadow-color) / calc(0.7 * var(--shadow-strength)))",
                    overflow: "hidden",
                    animation: isClosing ? "scaleOut 120ms ease-out forwards" : "scaleIn 120ms ease-out",
                }}
            >
                {/* Input */}
                <div style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--border-subtle)",
                }}>
                    <div style={{ position: "relative" }}>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search commands, pages, and more..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            style={{
                                width: "100%",
                                padding: "2px 0",
                                border: "none",
                                background: "transparent",
                                color: "var(--text-primary)",
                                fontSize: "15px",
                                outline: "none",
                                fontFamily: "inherit",
                            }}
                        />
                        {/* Inline suggestion overlay */}
                        {suggestion && (
                            <span style={{
                                position: "absolute",
                                left: 0,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-muted)",
                                fontSize: "15px",
                                pointerEvents: "none",
                                fontFamily: "inherit",
                            }}>
                                <span style={{ visibility: "hidden" }}>{inputValue}</span>
                                <span>{suggestion}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Results */}
                <div
                    ref={listRef}
                    className="command-menu-list"
                    style={{
                        maxHeight: "400px",
                        overflowY: "auto",
                    }}
                >
                    {Object.entries(groupedCommands).map(([category, items]) => (
                        <div key={category}>
                            {/* Category header with separator line */}
                            <div style={{
                                padding: "10px 20px 6px",
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--text-tertiary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.6px",
                                borderBottom: "1px solid var(--border-subtle)",
                            }}>
                                {category}
                            </div>
                            {/* Items */}
                            <div style={{ padding: "4px 6px" }}>
                                {items.map((item) => {
                                    const itemIndex = globalIndex++
                                    const isSelected = itemIndex === selectedIndex

                                    return (
                                        <div
                                            key={item.id}
                                            data-selected={isSelected}
                                            onClick={() => {
                                                item.action()
                                                onClose()
                                            }}
                                            onMouseEnter={() => handleItemHover(itemIndex)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                                padding: "10px 14px",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                backgroundColor: isSelected ? "var(--hover-bg)" : "transparent",
                                                transition: "background-color 80ms ease",
                                            }}
                                        >
                                            <span style={{
                                                color: isSelected ? "var(--text-secondary)" : "var(--text-muted)",
                                                flexShrink: 0,
                                                transition: "color 80ms ease",
                                            }}>
                                                {item.icon}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: "13px",
                                                    fontWeight: 500,
                                                    color: "var(--text-primary)",
                                                    marginBottom: item.description ? "2px" : 0,
                                                }}>
                                                    {item.label}
                                                </div>
                                                {item.description && (
                                                    <div style={{
                                                        fontSize: "11px",
                                                        color: "var(--text-muted)",
                                                    }}>
                                                        {item.description}
                                                    </div>
                                                )}
                                            </div>
                                            {item.shortcut && (
                                                <div data-shortcut-hint style={{ display: "flex", gap: "3px", flexShrink: 0, alignItems: "center" }}>
                                                    {formatShortcut(item.shortcut, item.shortcutIsSequence)}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                    {flatCommands.length === 0 && (
                        <div style={{
                            padding: "32px 20px",
                            textAlign: "center",
                            color: "var(--text-tertiary)",
                            fontSize: "13px",
                        }}>
                            No results found for "{inputValue}"
                        </div>
                    )}
                </div>

                {/* Footer - compact */}
                <div data-shortcut-hint style={{
                    padding: "8px 16px",
                    borderTop: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "14px",
                    backgroundColor: "var(--bg-surface)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <kbd style={{ ...kbdStyle, padding: "2px 5px", fontSize: "10px" }}>→</kbd>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>autocomplete</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <kbd style={{ ...kbdStyle, padding: "2px 5px", fontSize: "10px" }}>↵</kbd>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>select</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <kbd style={{ ...kbdStyle, padding: "2px 5px", fontSize: "10px" }}>esc</kbd>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>close</span>
                    </div>
                </div>
            </div>

            {/* Global animations */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        opacity: 0;
                        transform: scale(0.96);
                    }
                    to { 
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes scaleOut {
                    from { 
                        opacity: 1;
                        transform: scale(1);
                    }
                    to { 
                        opacity: 0;
                        transform: scale(0.96);
                    }
                }
            `}</style>
        </div>
    )
}
