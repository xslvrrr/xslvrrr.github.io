"use client"

import * as React from "react"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
    IconAbacus, IconActivity, IconAdjustments, IconAlertCircle, IconAlertTriangle, IconArchive,
    IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconBallBasketball,
    IconBell, IconBook, IconBox, IconBrandGoogle, IconBrush, IconBulb, IconCalendar,
    IconCalendarEvent, IconCalendarPlus, IconCalendarStats, IconCalendarTime,
    IconCalendarWeek, IconCar, IconCheck, IconChecklist, IconChevronDown,
    IconChevronLeft, IconChevronRight, IconChevronUp, IconCircleCheck, IconClock,
    IconCopy, IconCube, IconDownload, IconEdit, IconEye, IconFilePlus,
    IconFileText, IconFilter, IconFlag, IconFolder, IconFolderPlus, IconFolders,
    IconHeart, IconHome, IconInbox, IconInfoCircle, IconKeyboard,
    IconLayoutDashboard, IconLayoutGrid, IconLayoutSidebar, IconLeaf, IconList,
    IconLoader2, IconLogout, IconMail, IconMapPin, IconMessageCircle, IconMinus,
    IconMoodSmile, IconMoon, IconNews, IconPalette, IconPaperclip, IconPencil,
    IconPin, IconPizza, IconPlus, IconRefresh, IconSchool, IconSearch, IconSend,
    IconSettings, IconShieldLock, IconSparkles, IconSun, IconTarget, IconTool,
    IconTrash, IconUser, IconX,
} from "@tabler/icons-react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
    PROVIDERS,
    componentEntries,
    makeProviderIcon,
    sortIcons,
    toLabel,
    type CatalogIcon,
    type IconComponent,
    type IconProviderId,
    type ProviderIcon,
} from "./iconCatalogShared"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Button } from "./button"
import { ComboboxSearchField } from "./combobox-search-field"
import { Toggle } from "./toggle"
import { ToggleGroup, ToggleGroupItem } from "./toggle-group"
import { cn } from "@/lib/utils"


const RECENTS_KEY = "millennium-icon-recents"
export const DEFAULT_ICON_EXPLORER_VALUE = "IconFolder"
const GRID_COLUMNS = 10
const GRID_ICON_SIZE = 36
const GRID_ROW_HEIGHT = 38
const GRID_BASE_OVERSCAN_ROWS = 2
const GRID_SCROLL_LOOKAHEAD_MS = 180
const GRID_HEIGHT = 236

const providerLabels = new Map(PROVIDERS.map(provider => [provider.id, provider.label]))

const canonicalIconValue = (provider: IconProviderId, key: string) => (
    provider === "tabler" ? key : `${provider}:${key}`
)

const parseIconValue = (value: string): { provider: IconProviderId; key: string } => {
    const [maybeProvider, ...rest] = value.split(":")
    if (rest.length > 0 && PROVIDERS.some(provider => provider.id === maybeProvider)) {
        return { provider: maybeProvider as IconProviderId, key: rest.join(":") }
    }

    return { provider: "tabler", key: value || "IconFolder" }
}

export const getIconExplorerLabel = (value: string): string => {
    if (!value) return "Choose Icon"

    const { provider, key } = parseIconValue(value)
    return getCachedProviderIcon(provider, key)?.label || toLabel(key)
}

type HugeIconLoader = () => Promise<{ default: unknown }>

const HUGEICON_LOADERS: Record<string, HugeIconLoader> = {
    Folder01Icon: () => import("@hugeicons/core-free-icons/Folder01Icon"),
    Folder02Icon: () => import("@hugeicons/core-free-icons/Folder02Icon"),
    Calendar03Icon: () => import("@hugeicons/core-free-icons/Calendar03Icon"),
    Notification01Icon: () => import("@hugeicons/core-free-icons/Notification01Icon"),
    UserIcon: () => import("@hugeicons/core-free-icons/UserIcon"),
    Settings01Icon: () => import("@hugeicons/core-free-icons/Settings01Icon"),
    BookOpen01Icon: () => import("@hugeicons/core-free-icons/BookOpen01Icon"),
    Clock01Icon: () => import("@hugeicons/core-free-icons/Clock01Icon"),
    File01Icon: () => import("@hugeicons/core-free-icons/File01Icon"),
    Task01Icon: () => import("@hugeicons/core-free-icons/Task01Icon"),
    Home01Icon: () => import("@hugeicons/core-free-icons/Home01Icon"),
    DashboardSquare01Icon: () => import("@hugeicons/core-free-icons/DashboardSquare01Icon"),
}

const makeHugeIcon = (loader: HugeIconLoader): IconComponent => (
    function HugeIcon({ size = 18, className }) {
        const [icon, setIcon] = useState<unknown | null>(null)

        useEffect(() => {
            let cancelled = false
            loader()
                .then((module) => {
                    if (!cancelled) setIcon(module.default)
                })
                .catch(() => {
                    if (!cancelled) setIcon(null)
                })

            return () => {
                cancelled = true
            }
        }, [])

        if (!icon) return <IconFolder size={size} className={className} />
        return <HugeiconsIcon icon={icon as never} size={size} className={className} strokeWidth={1.8} />
    }
)

const TABLER_COMPONENTS: Record<string, IconComponent> = {
    IconAbacus, IconActivity, IconAdjustments, IconAlertCircle, IconAlertTriangle, IconArchive,
    IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconBallBasketball,
    IconBell, IconBook, IconBox, IconBrandGoogle, IconBrush, IconBulb, IconCalendar,
    IconCalendarEvent, IconCalendarPlus, IconCalendarStats, IconCalendarTime,
    IconCalendarWeek, IconCar, IconCheck, IconChecklist, IconChevronDown,
    IconChevronLeft, IconChevronRight, IconChevronUp, IconCircleCheck, IconClock,
    IconCopy, IconCube, IconDownload, IconEdit, IconEye, IconFilePlus,
    IconFileText, IconFilter, IconFlag, IconFolder, IconFolderPlus, IconFolders,
    IconHeart, IconHome, IconInbox, IconInfoCircle, IconKeyboard,
    IconLayoutDashboard, IconLayoutGrid, IconLayoutSidebar, IconLeaf, IconList,
    IconLoader2, IconLogout, IconMail, IconMapPin, IconMessageCircle, IconMinus,
    IconMoodSmile, IconMoon, IconNews, IconPalette, IconPaperclip, IconPencil,
    IconPin, IconPizza, IconPlus, IconRefresh, IconSchool, IconSearch, IconSend,
    IconSettings, IconShieldLock, IconSparkles, IconSun, IconTarget, IconTool,
    IconTrash, IconUser, IconX,
}

const CURATED_TABLER_ICONS: ProviderIcon[] = sortIcons(
    Object.entries(TABLER_COMPONENTS).map(([key, Component]) => makeProviderIcon(key, Component))
)

const HUGE_ICONS: ProviderIcon[] = sortIcons(
    Object.entries(HUGEICON_LOADERS).map(([key, loader]) => makeProviderIcon(key, makeHugeIcon(loader)))
)

/**
 * What can be resolved without loading the full libraries.
 *
 * Seeded with a curated Tabler set and the HugeIcons loaders, which is what the application itself
 * uses and therefore what almost every stored icon value is. `ensureIconCatalogs` swaps in the
 * complete set the first time the picker opens, or the first time a stored value is not found here.
 */
const providerIconCache: Record<IconProviderId, ProviderIcon[]> = {
    tabler: CURATED_TABLER_ICONS,
    lucide: [],
    hugeicons: HUGE_ICONS,
    phosphor: [],
    remix: [],
}

let allProviderIconsCache: CatalogIcon[] | null = null
const providerIconMapCache = new Map<IconProviderId, Map<string, ProviderIcon>>()

type CatalogListener = () => void

let catalogsLoaded = false
let catalogLoad: Promise<void> | null = null
const catalogListeners = new Set<CatalogListener>()

const resetCatalogCaches = () => {
    providerIconMapCache.clear()
    allProviderIconsCache = null
}

/**
 * Loads the full catalogues once, then tells every mounted icon to re-resolve.
 *
 * Never called during server rendering: the server has no picker to open, and an icon it cannot
 * resolve renders the same fallback the client renders before the load resolves, so the two agree
 * and hydration stays quiet.
 */
export const ensureIconCatalogs = (): Promise<void> => {
    if (catalogsLoaded) return Promise.resolve()
    if (catalogLoad) return catalogLoad

    catalogLoad = import("./iconCatalogs")
        .then(({ loadIconCatalogs }) => {
            const catalogs = loadIconCatalogs()
            providerIconCache.tabler = catalogs.tabler.length ? catalogs.tabler : CURATED_TABLER_ICONS
            providerIconCache.lucide = catalogs.lucide
            providerIconCache.phosphor = catalogs.phosphor
            providerIconCache.remix = catalogs.remix
            catalogsLoaded = true
            resetCatalogCaches()
            catalogListeners.forEach(listener => listener())
        })
        .catch(() => {
            // The curated set stays in place; the picker simply offers less than usual.
            catalogLoad = null
        })

    return catalogLoad
}

const subscribeToCatalogs = (listener: CatalogListener) => {
    catalogListeners.add(listener)
    return () => {
        catalogListeners.delete(listener)
    }
}

const getAllProviderIcons = (): CatalogIcon[] => {
    if (allProviderIconsCache) return allProviderIconsCache
    allProviderIconsCache = sortIcons(PROVIDERS.flatMap(provider => (
        providerIconCache[provider.id].map(icon => ({ ...icon, provider: provider.id }))
    )))
    return allProviderIconsCache
}

const getCachedProviderIcon = (provider: IconProviderId, key: string) => {
    let iconMap = providerIconMapCache.get(provider)
    if (!iconMap) {
        iconMap = new Map(providerIconCache[provider].map(icon => [icon.key, icon]))
        providerIconMapCache.set(provider, iconMap)
    }
    return iconMap.get(key)
}

export interface IconExplorerResolution {
    requestedValue: string
    value: string
    provider: IconProviderId
    key: string
    supported: boolean
    migrated: boolean
    fallbackReason?: "empty" | "unsupported"
}

export const resolveIconExplorerValue = (name: string): IconExplorerResolution => {
    const requestedValue = name.trim()
    const parsed = parseIconValue(requestedValue)
    const icon = requestedValue ? getCachedProviderIcon(parsed.provider, parsed.key) : undefined

    if (icon) {
        const value = canonicalIconValue(parsed.provider, parsed.key)
        return {
            requestedValue,
            value,
            provider: parsed.provider,
            key: parsed.key,
            supported: true,
            migrated: requestedValue !== value,
        }
    }

    return {
        requestedValue,
        value: DEFAULT_ICON_EXPLORER_VALUE,
        provider: "tabler",
        key: DEFAULT_ICON_EXPLORER_VALUE,
        supported: false,
        migrated: requestedValue !== DEFAULT_ICON_EXPLORER_VALUE,
        fallbackReason: requestedValue ? "unsupported" : "empty",
    }
}

export const normalizeIconExplorerValue = (name: string): string => resolveIconExplorerValue(name).value

export const resolveIconExplorerComponent = (name: string): IconComponent => {
    const resolution = resolveIconExplorerValue(name)
    return getCachedProviderIcon(resolution.provider, resolution.key)?.Component || IconFolder
}

interface UniversalIconProps {
    name: string
    size?: number
    className?: string
}

export const IconExplorerIcon = React.memo(function IconExplorerIcon({ name, size = 16, className }: UniversalIconProps) {
    // Bumped when the full catalogues finish loading, so an icon that fell back to the placeholder
    // re-resolves to the real thing.
    const [catalogVersion, setCatalogVersion] = useState(0)
    const resolution = useMemo(() => resolveIconExplorerValue(name), [name, catalogVersion])

    // A value the curated set cannot resolve is the signal that this account uses an icon from one
    // of the full libraries. Loading is skipped on the server, where there is nothing to re-render.
    useEffect(() => {
        if (resolution.supported || typeof window === "undefined") return
        const unsubscribe = subscribeToCatalogs(() => setCatalogVersion(version => version + 1))
        void ensureIconCatalogs()
        return unsubscribe
    }, [resolution.supported])

    const Component = useMemo(
        () => getCachedProviderIcon(resolution.provider, resolution.key)?.Component || IconFolder,
        [resolution.provider, resolution.key, catalogVersion]
    )

    return <Component size={size} className={className} />
})

interface IconButtonProps {
    icon: ProviderIcon
    provider: IconProviderId
    isSelected: boolean
    style?: React.CSSProperties
    onSelect: (provider: IconProviderId, key: string) => void
}

const IconButton = React.memo(function IconButton({ icon, provider, isSelected, style, onSelect }: IconButtonProps) {
    const Component = icon.Component

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onSelect(provider, icon.key)}
            title={icon.label}
            aria-label={`Use ${icon.label} icon`}
            aria-pressed={isSelected}
            style={style}
            className={cn(
                "absolute size-9 border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                isSelected && "accent-fill border-transparent hover:text-primary-foreground"
            )}
        >
            <Component size={18} />
        </Button>
    )
})

interface RecentIconButtonProps {
    value: string
    isSelected: boolean
    onSelect: (provider: IconProviderId, key: string) => void
}

const RecentIconButton = React.memo(function RecentIconButton({ value, isSelected, onSelect }: RecentIconButtonProps) {
    const parsed = useMemo(() => parseIconValue(value), [value])
    const label = getCachedProviderIcon(parsed.provider, parsed.key)?.label || toLabel(parsed.key)

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onSelect(parsed.provider, parsed.key)}
            title={label}
            aria-label={`Use ${label} icon`}
            aria-pressed={isSelected}
            className={cn(
                "size-9 border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                isSelected && "accent-fill border-transparent hover:text-primary-foreground"
            )}
        >
            <IconExplorerIcon name={value} size={18} />
        </Button>
    )
})

interface IconExplorerProps {
    value: string
    onSelect: (iconName: string) => void
    trigger?: React.ReactNode
    className?: string
}

export function IconExplorer({ value, onSelect, trigger, className }: IconExplorerProps) {
    const valueResolution = useMemo(() => resolveIconExplorerValue(value), [value])
    const normalizedValue = valueResolution.value
    const parsedValue = useMemo(() => parseIconValue(normalizedValue), [normalizedValue])
    const [open, setOpen] = useState(false)
    const [activeProvider, setActiveProvider] = useState<IconProviderId>(parsedValue.provider)
    const [searchAllLibraries, setSearchAllLibraries] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const deferredSearchQuery = useDeferredValue(searchQuery)
    const [recentIcons, setRecentIcons] = useState<string[]>([])
    const [scrollTop, setScrollTop] = useState(0)
    const [scrollVelocity, setScrollVelocity] = useState(0)
    const gridRef = useRef<HTMLDivElement>(null)
    const scrollFrameRef = useRef<number | null>(null)
    const lastScrollRef = useRef({ top: 0, time: 0 })
    const migratedValueRef = useRef<string | null>(null)
    const [catalogVersion, setCatalogVersion] = useState(0)

    // The grid is the one place that genuinely needs every icon, so opening it is what pays for
    // loading them.
    useEffect(() => {
        if (!open) return
        const unsubscribe = subscribeToCatalogs(() => setCatalogVersion(version => version + 1))
        void ensureIconCatalogs()
        return unsubscribe
    }, [open])

    const providerIcons = useMemo(
        () => providerIconCache[activeProvider],
        [activeProvider, catalogVersion]
    )

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const saved = window.localStorage.getItem(RECENTS_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    const normalizedRecents = parsed
                        .filter((item): item is string => typeof item === "string")
                        .map(normalizeIconExplorerValue)
                        .filter((item, index, items) => items.indexOf(item) === index)
                        .slice(0, 18)
                    setRecentIcons(normalizedRecents)

                    if (JSON.stringify(normalizedRecents) !== JSON.stringify(parsed.slice(0, 18))) {
                        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(normalizedRecents))
                    }
                }
            }
        } catch {
            // Ignore bad local storage.
        }
    }, [])

    useEffect(() => {
        if (!valueResolution.migrated || migratedValueRef.current === value) return
        migratedValueRef.current = value
        onSelect(normalizedValue)
    }, [normalizedValue, onSelect, value, valueResolution.migrated])

    useEffect(() => {
        if (!open) return
        setActiveProvider(parsedValue.provider)
        setSearchAllLibraries(false)
        setSearchQuery("")
        setScrollTop(0)
        if (gridRef.current) gridRef.current.scrollTop = 0
    }, [open, parsedValue.provider])

    useEffect(() => {
        setScrollTop(0)
        if (gridRef.current) gridRef.current.scrollTop = 0
    }, [activeProvider, deferredSearchQuery, searchAllLibraries])

    const catalogIcons = useMemo<CatalogIcon[]>(() => (
        searchAllLibraries
            ? getAllProviderIcons()
            : providerIcons.map(icon => ({ ...icon, provider: activeProvider }))
    ), [activeProvider, catalogVersion, providerIcons, searchAllLibraries])

    const filteredIcons = useMemo(() => {
        const query = deferredSearchQuery.toLowerCase().trim()
        if (!query) return catalogIcons
        return catalogIcons.filter((icon) => icon.searchText.includes(query))
    }, [catalogIcons, deferredSearchQuery])

    const totalRows = Math.ceil(filteredIcons.length / GRID_COLUMNS)
    const totalHeight = totalRows > 0
        ? ((totalRows - 1) * GRID_ROW_HEIGHT) + GRID_ICON_SIZE
        : 0
    const gridWidth = ((GRID_COLUMNS - 1) * GRID_ROW_HEIGHT) + GRID_ICON_SIZE
    // overscan rows = base buffer + velocity * render lookahead / row height
    const dynamicOverscanRows = GRID_BASE_OVERSCAN_ROWS + Math.min(
        8,
        Math.ceil(scrollVelocity * GRID_SCROLL_LOOKAHEAD_MS / GRID_ROW_HEIGHT),
    )
    const firstRow = Math.max(0, Math.floor(scrollTop / GRID_ROW_HEIGHT) - dynamicOverscanRows)
    const visibleRows = Math.ceil(GRID_HEIGHT / GRID_ROW_HEIGHT) + dynamicOverscanRows * 2
    const lastRow = Math.min(totalRows, firstRow + visibleRows)
    const firstIndex = firstRow * GRID_COLUMNS
    const lastIndex = Math.min(filteredIcons.length, lastRow * GRID_COLUMNS)
    const visibleIcons = filteredIcons.slice(firstIndex, lastIndex)
    const providerLabel = searchAllLibraries ? "all libraries" : (providerLabels.get(activeProvider) || "icons")
    const selectedLabel = getIconExplorerLabel(normalizedValue)

    const handleSelect = useCallback((provider: IconProviderId, key: string) => {
        const nextValue = canonicalIconValue(provider, key)
        onSelect(nextValue)
        setRecentIcons((prev) => {
            const next = [nextValue, ...prev.filter((item) => item !== nextValue)].slice(0, 18)
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
                } catch {
                    // Ignore storage errors.
                }
            }
            return next
        })
        setOpen(false)
    }, [onSelect])

    const handleGridScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget
        if (scrollFrameRef.current !== null) return
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null
            const now = performance.now()
            const previous = lastScrollRef.current
            const elapsed = Math.max(1, now - previous.time)
            const nextTop = target.scrollTop
            setScrollVelocity(previous.time ? Math.abs(nextTop - previous.top) / elapsed : 0)
            setScrollTop(nextTop)
            lastScrollRef.current = { top: nextTop, time: now }
        })
    }, [])

    useEffect(() => () => {
        if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    }, [])

    const triggerElement = React.isValidElement(trigger) ? trigger : (
        <Button
            type="button"
            variant="outline"
            className={cn(
                "h-10 w-full justify-between gap-2 rounded-[var(--radius-sm)] px-3 text-foreground",
                className
            )}
            aria-label={`Choose icon. Current: ${selectedLabel}`}
        >
            <IconExplorerIcon name={normalizedValue} size={16} />
            <span className="text-muted-foreground">{selectedLabel}</span>
        </Button>
    )

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={triggerElement} />
            <PopoverContent
                className="z-[80] w-[min(max(calc(var(--anchor-width)+16px),396px),calc(100vw-32px))] max-w-[calc(100vw-32px)] max-h-[430px] gap-0 overflow-hidden rounded-lg border-border bg-popover p-0 shadow-xl"
                align="start"
                sideOffset={6}
            >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <ComboboxSearchField
                            className="flex-1"
                            aria-label="Search icons"
                            placeholder={`Search ${providerLabel}...`}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            onClear={() => setSearchQuery("")}
                            autoFocus
                    />
                    <Toggle
                        pressed={searchAllLibraries}
                        onPressedChange={setSearchAllLibraries}
                        variant="outline"
                        size="sm"
                        aria-label="Search all icon libraries"
                        className={cn(
                            "h-7 min-w-7 px-2 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground",
                            searchAllLibraries && "accent-fill border-transparent hover:text-primary-foreground"
                        )}
                    >
                        All
                    </Toggle>
                </div>

                {recentIcons.length > 0 && (
                    <div className="border-b border-border bg-muted/30 px-2 py-2">
                        <div className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Recently used</div>
                        <div
                            className="mx-auto grid gap-0.5"
                            style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${GRID_ICON_SIZE}px)`, width: gridWidth }}
                            role="group"
                            aria-label="Recently used icons"
                        >
                            {recentIcons.slice(0, 18).map((item) => {
                                const parsed = parseIconValue(item)
                                const isSelected = parsedValue.provider === parsed.provider && parsedValue.key === parsed.key
                                return (
                                    <RecentIconButton
                                        key={item}
                                        value={item}
                                        isSelected={isSelected}
                                        onSelect={handleSelect}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                    <span>{filteredIcons.length} icons</span>
                    <span>{visibleIcons.length} rendered</span>
                </div>

                <div
                    ref={gridRef}
                    onScroll={handleGridScroll}
                    className="relative overflow-y-auto p-2"
                    style={{ height: GRID_HEIGHT }}
                >
                    {visibleIcons.length > 0 ? (
                        <div className="relative mx-auto" style={{ height: totalHeight, width: gridWidth }}>
                            {visibleIcons.map((icon, offset) => {
                                const absoluteIndex = firstIndex + offset
                                const row = Math.floor(absoluteIndex / GRID_COLUMNS)
                                const column = absoluteIndex % GRID_COLUMNS
                                const isSelected = parsedValue.provider === icon.provider && parsedValue.key === icon.key
                                return (
                                    <IconButton
                                        key={`${icon.provider}-${icon.key}`}
                                        icon={icon}
                                        provider={icon.provider}
                                        isSelected={isSelected}
                                        onSelect={handleSelect}
                                        style={{
                                            top: row * GRID_ROW_HEIGHT,
                                            left: column * GRID_ROW_HEIGHT,
                                        }}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
                            No icons found for "{deferredSearchQuery}"
                        </div>
                    )}
                </div>

                <ToggleGroup
                    value={[activeProvider]}
                    onValueChange={(providers) => {
                        const nextProvider = providers[providers.length - 1]
                        if (nextProvider) {
                            setSearchAllLibraries(false)
                            setActiveProvider(nextProvider as IconProviderId)
                        }
                    }}
                    variant="default"
                    size="sm"
                    spacing={1}
                    aria-label="Icon library"
                    className="grid w-full grid-cols-5 border-t border-border bg-muted/25 p-1.5"
                >
                    {PROVIDERS.map((provider) => (
                        <ToggleGroupItem
                            key={provider.id}
                            value={provider.id}
                            aria-label={`${provider.label} icons`}
                            className={cn(
                                "h-8 min-w-0 rounded-md px-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                                activeProvider === provider.id && "bg-background text-foreground shadow-xs"
                            )}
                        >
                            {provider.shortLabel}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </PopoverContent>
        </Popover>
    )
}
