"use client"

import * as React from "react"
import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import * as TablerIcons from "@tabler/icons-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { IconSearch, IconFolder, IconX } from "@tabler/icons-react"

// Get all icon names from Tabler Icons (those starting with "Icon")
const ALL_ICON_NAMES: string[] = Object.keys(TablerIcons).filter(
    (key) => key.startsWith("Icon") && key !== "IconContext"
)

interface IconExplorerProps {
    value: string
    onSelect: (iconName: string) => void
    trigger?: React.ReactNode
    className?: string
}

export function IconExplorer({ value, onSelect, trigger, className }: IconExplorerProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [visibleCount, setVisibleCount] = useState(60)
    const [recentIcons, setRecentIcons] = useState<string[]>([])
    const gridRef = useRef<HTMLDivElement>(null)
    const RECENTS_KEY = "millennium-icon-recents"

    // Filter icons based on search query
    const filteredIcons = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()
        if (!query) return ALL_ICON_NAMES
        return ALL_ICON_NAMES.filter((name) =>
            name.toLowerCase().includes(query)
        )
    }, [searchQuery])

    // Only show visible icons (lazy loading)
    const visibleIcons = useMemo(() =>
        filteredIcons.slice(0, visibleCount),
        [filteredIcons, visibleCount]
    )

    // Reset visible count when search changes
    useEffect(() => {
        setVisibleCount(60)
    }, [searchQuery])

    // Load recent icons once on mount
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const saved = window.localStorage.getItem(RECENTS_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    setRecentIcons(parsed.filter((value) => typeof value === "string"))
                }
            }
        } catch {
            // Ignore bad local storage
        }
    }, [])

    // Reset state when popover opens
    useEffect(() => {
        if (open) {
            setSearchQuery("")
            setVisibleCount(60)
        }
    }, [open])

    const handleSelect = useCallback((iconName: string) => {
        onSelect(iconName)
        setRecentIcons((prev) => {
            const next = [iconName, ...prev.filter((value) => value !== iconName)].slice(0, 18)
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
                } catch {
                    // Ignore storage errors
                }
            }
            return next
        })
        setOpen(false)
    }, [onSelect])

    const handleGridScroll = useCallback(() => {
        const target = gridRef.current
        if (!target) return
        const isNearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 40
        if (isNearBottom && visibleCount < filteredIcons.length) {
            setVisibleCount((prev) => Math.min(prev + 60, filteredIcons.length))
        }
    }, [filteredIcons.length, visibleCount])

    // Get current selected icon component
    const SelectedIcon = useMemo(() => {
        const IconComponent = (TablerIcons as Record<string, React.ComponentType<{ size?: number }>>)[value]
        return IconComponent || IconFolder
    }, [value])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger || (
                    <button
                        type="button"
                        className={className}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            padding: "8px 12px",
                            backgroundColor: "var(--bg-secondary)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "var(--text-primary)",
                            fontSize: "13px",
                        }}
                    >
                        <SelectedIcon size={16} />
                        <span style={{ opacity: 0.7 }}>Choose Icon</span>
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent
                style={{
                    width: "340px",
                    maxHeight: "380px",
                    padding: "0",
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
                    overflow: "hidden",
                }}
                align="start"
                sideOffset={4}
            >
                {/* Search Input */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-default)",
                    }}
                >
                    <IconSearch size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Search icons..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: "13px",
                            color: "var(--text-primary)",
                        }}
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "2px",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-tertiary)",
                            }}
                        >
                            <IconX size={12} />
                        </button>
                    )}
                </div>

                {/* Results Info */}
                <div
                    style={{
                        padding: "6px 12px",
                        fontSize: "11px",
                        color: "var(--text-tertiary)",
                        borderBottom: "1px solid var(--border-default)",
                    }}
                >
                    Showing {visibleIcons.length} of {filteredIcons.length} icons
                </div>

                {recentIcons.length > 0 && (
                    <div
                        style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--border-default)",
                            background: "var(--bg-surface, transparent)",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "11px",
                                color: "var(--text-tertiary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "6px",
                            }}
                        >
                            Recently used
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(8, 1fr)",
                                gap: "4px",
                            }}
                        >
                            {recentIcons.map((iconName) => {
                                const IconComponent = (TablerIcons as Record<string, React.ComponentType<{ size?: number }>>)[iconName]
                                if (!IconComponent) return null
                                const isSelected = value === iconName
                                return (
                                    <button
                                        key={`recent-${iconName}`}
                                        type="button"
                                        onClick={() => handleSelect(iconName)}
                                        title={iconName.replace("Icon", "")}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: "6px",
                                            background: isSelected ? "var(--accent-gradient)" : "transparent",
                                            border: "1px solid var(--border-subtle, transparent)",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            color: isSelected ? "white" : "var(--text-secondary)",
                                            transition: "background-color 0.1s, color 0.1s, border-color 0.1s",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.backgroundColor = "var(--bg-hover)"
                                                e.currentTarget.style.color = "var(--text-primary)"
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.backgroundColor = "transparent"
                                                e.currentTarget.style.color = "var(--text-secondary)"
                                            }
                                        }}
                                    >
                                        <IconComponent size={16} />
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Icon Grid */}
                <div
                    ref={gridRef}
                    onScroll={handleGridScroll}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(6, 1fr)",
                        gap: "2px",
                        padding: "8px",
                        maxHeight: "280px",
                        overflowY: "auto",
                    }}
                >
                    {visibleIcons.map((iconName) => {
                        const IconComponent = (TablerIcons as Record<string, React.ComponentType<{ size?: number }>>)[iconName]
                        if (!IconComponent) return null
                        const isSelected = value === iconName

                        return (
                            <button
                                key={iconName}
                                type="button"
                                onClick={() => handleSelect(iconName)}
                                title={iconName.replace("Icon", "")}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "10px",
                                    background: isSelected ? "var(--accent-gradient)" : "transparent",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    color: isSelected ? "white" : "var(--text-secondary)",
                                    transition: "background-color 0.1s, color 0.1s",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = "var(--bg-hover)"
                                        e.currentTarget.style.color = "var(--text-primary)"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = "transparent"
                                        e.currentTarget.style.color = "var(--text-secondary)"
                                    }
                                }}
                            >
                                <IconComponent size={18} />
                            </button>
                        )
                    })}

                    {/* Loading indicator for lazy loading */}
                    {visibleCount < filteredIcons.length && (
                        <div
                            style={{
                                gridColumn: "1 / -1",
                                textAlign: "center",
                                padding: "12px",
                                color: "var(--text-tertiary)",
                                fontSize: "12px",
                            }}
                        >
                            Scroll to load more...
                        </div>
                    )}

                    {/* Empty state */}
                    {filteredIcons.length === 0 && (
                        <div
                            style={{
                                gridColumn: "1 / -1",
                                textAlign: "center",
                                padding: "24px",
                                color: "var(--text-tertiary)",
                                fontSize: "13px",
                            }}
                        >
                            No icons found for "{searchQuery}"
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
