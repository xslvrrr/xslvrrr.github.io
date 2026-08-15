"use client"

import * as React from "react"
import { IconAdjustments, IconCheck, IconMoon, IconPalette, IconPlus, IconSparkles, IconSun, IconX } from "@tabler/icons-react"

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
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    AdvancedColorPicker,
    AdvancedColorPickerContent,
    AdvancedColorPickerTrigger,
    generateGradientCSS,
} from "@/components/ui/advanced-color-picker"
import { cn } from "@/lib/utils"
import {
    DARK_BG,
    DEFAULT_ACCENT,
    LIGHT_BG,
    applyThemeColors,
    deriveFullColors,
    loadAndApplySavedTheme,
    type ThemeColors,
} from "@/lib/theme"
import { isAdvancedMode, type ThemeCreateMode } from "./themeBuilderState"

type SavedCustomTheme = {
    id: string
    name: string
    colors: ThemeColors
    isDark: boolean
    isAdvanced: boolean
    createdAt: number
    updatedAt?: number
}

type ThemeCreationSidebarProps = {
    mode: ThemeCreateMode
    initialTheme?: SavedCustomTheme | null
    onClose: () => void
}

const colorRows: Array<{ key: keyof ThemeColors; label: string }> = [
    { key: "bgBase", label: "Background" },
    { key: "bgElevated", label: "Elevated" },
    { key: "textPrimary", label: "Primary text" },
    { key: "textSecondary", label: "Secondary text" },
    { key: "accent", label: "Accent" },
    { key: "borderDefault", label: "Border" },
    { key: "hoverBg", label: "Hover" },
    { key: "activeBg", label: "Active" },
]

function readSavedThemes(key: string): SavedCustomTheme[] {
    try {
        return JSON.parse(localStorage.getItem(key) || "[]")
    } catch {
        return []
    }
}

function modeLabel(mode: ThemeCreateMode) {
    return mode === "advanced" ? "Advanced" : "Simple"
}

type ThemeColorPickerFieldProps = {
    label: string
    value: string
    onChange: (value: string) => void
    allowGradient?: boolean
    compact?: boolean
    description?: string
}

function ThemeColorPickerField({
    label,
    value,
    onChange,
    allowGradient = false,
    compact = false,
    description,
}: ThemeColorPickerFieldProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 rounded-md border border-sidebar-border/70 bg-sidebar-accent/75 shadow-sm",
                compact ? "px-3 py-2" : "px-4 py-3"
            )}
        >
            <div className="min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground">{label}</div>
                {description ? (
                    <div className="mt-0.5 truncate text-xs text-sidebar-foreground/55">{description}</div>
                ) : null}
            </div>
            <AdvancedColorPicker
                value={value}
                onChange={onChange}
                enableGradient={allowGradient}
                onGradientChange={allowGradient ? (gradient) => onChange(generateGradientCSS(gradient)) : undefined}
            >
                <AdvancedColorPickerTrigger
                    aria-label={`${label} color`}
                    className={cn(
                        compact ? "size-8" : "size-11",
                        "shrink-0 rounded-md border border-sidebar-border/70 bg-sidebar-accent/80 p-1 hover:bg-sidebar-accent"
                    )}
                />
                <AdvancedColorPickerContent showOpacity showGradientMode={allowGradient} />
            </AdvancedColorPicker>
        </div>
    )
}

type ThemeSliderFieldProps = {
    label: string
    description: string
    value: number
    min: number
    max: number
    onChange: (value: number) => void
    disabled?: boolean
}

function ThemeSliderField({ label, description, value, min, max, onChange, disabled = false }: ThemeSliderFieldProps) {
    const trackRef = React.useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = React.useState(false)
    const clampedValue = Math.max(min, Math.min(max, value))
    const percent = ((clampedValue - min) / (max - min)) * 100

    const updateFromClientX = React.useCallback((clientX: number) => {
        if (!trackRef.current || disabled) return
        const rect = trackRef.current.getBoundingClientRect()
        const ratio = (clientX - rect.left) / rect.width
        const next = Math.round(min + Math.max(0, Math.min(1, ratio)) * (max - min))
        onChange(next)
    }, [disabled, max, min, onChange])

    return (
        <div className="grid gap-3 rounded-md border border-sidebar-border/70 bg-sidebar-accent/75 px-4 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-sidebar-foreground">{label}</div>
                    <div className="mt-0.5 text-xs text-sidebar-foreground/55">{description}</div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-sidebar-foreground/60">{value}%</span>
            </div>
            <div
                ref={trackRef}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={clampedValue}
                aria-label={label}
                aria-disabled={disabled}
                className={cn(
                    "relative h-5 w-full touch-none select-none rounded-full outline-none",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                )}
                onPointerDown={(event) => {
                    if (disabled) return
                    event.preventDefault()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setIsDragging(true)
                    updateFromClientX(event.clientX)
                }}
                onPointerMove={(event) => {
                    if (!isDragging) return
                    updateFromClientX(event.clientX)
                }}
                onPointerUp={(event) => {
                    setIsDragging(false)
                    event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={() => setIsDragging(false)}
                onKeyDown={(event) => {
                    if (disabled) return
                    const step = event.shiftKey ? 10 : 1
                    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                        event.preventDefault()
                        onChange(Math.max(min, clampedValue - step))
                    }
                    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                        event.preventDefault()
                        onChange(Math.min(max, clampedValue + step))
                    }
                }}
            >
                <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sidebar-accent" />
                <div
                    className="accent-fill absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    style={{ width: `${percent}%` }}
                />
                <div
                    className="accent-border absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-white shadow-sm [--accent-border-surface:white]"
                    style={{ left: `${percent}%` }}
                />
            </div>
        </div>
    )
}

function getThemeSnapshot({
    activeMode,
    name,
    isDark,
    colors,
    contrast,
    uiTint,
}: {
    activeMode: ThemeCreateMode
    name: string
    isDark: boolean
    colors: ThemeColors
    contrast: number
    uiTint: number
}) {
    return JSON.stringify({
        activeMode,
        name: name.trim(),
        isDark,
        colors,
        contrast,
        uiTint,
    })
}

export function ThemeCreationSidebar({ mode, initialTheme = null, onClose }: ThemeCreationSidebarProps) {
    const [activeMode, setActiveMode] = React.useState<ThemeCreateMode>(mode)
    const [name, setName] = React.useState("")
    const [isDark, setIsDark] = React.useState(true)
    const [accentName, setAccentName] = React.useState("default")
    const [baseBg, setBaseBg] = React.useState(DARK_BG)
    const [colors, setColors] = React.useState<ThemeColors>(() => deriveFullColors(DARK_BG, DEFAULT_ACCENT, true))
    const [contrast, setContrast] = React.useState(30)
    const [uiTint, setUiTint] = React.useState(0)
    const [saveError, setSaveError] = React.useState("")
    const [discardDialogOpen, setDiscardDialogOpen] = React.useState(false)
    const [isClosing, setIsClosing] = React.useState(false)
    const previousThemeRef = React.useRef<string | null>(null)
    const initialSnapshotRef = React.useRef("")

    React.useEffect(() => {
        previousThemeRef.current = localStorage.getItem("millennium-theme")
    }, [])

    React.useEffect(() => {
        setActiveMode(mode)
    }, [mode])

    React.useEffect(() => {
        const startMode = initialTheme ? (initialTheme.isAdvanced ? "advanced" : "simple") : mode
        const startDark = initialTheme?.isDark ?? true
        const startBg = initialTheme?.colors.bgBase || (startDark ? DARK_BG : LIGHT_BG)
        const startColors = initialTheme?.colors || deriveFullColors(startBg, DEFAULT_ACCENT, startDark)
        const startName = initialTheme?.name || ""

        setActiveMode(startMode)
        setName(startName)
        setIsDark(startDark)
        setAccentName("default")
        setBaseBg(startBg)
        setColors(startColors)
        setContrast(30)
        setUiTint(0)
        setSaveError("")
        applyThemeColors(startColors, startDark)
        initialSnapshotRef.current = getThemeSnapshot({
            activeMode: startMode,
            name: startName,
            isDark: startDark,
            colors: startColors,
            contrast: 30,
            uiTint: 0,
        })
    }, [initialTheme, mode])

    const hasUnsavedChanges = React.useMemo(() => {
        if (!initialSnapshotRef.current) return false
        return initialSnapshotRef.current !== getThemeSnapshot({
            activeMode,
            name,
            isDark,
            colors,
            contrast,
            uiTint,
        })
    }, [activeMode, colors, contrast, isDark, name, uiTint])

    const updateSimpleTheme = React.useCallback((next: {
        dark?: boolean
        accent?: string
        background?: string
        contrast?: number
        uiTint?: number
    }) => {
        const nextDark = next.dark ?? isDark
        const nextAccentName = next.accent === undefined ? accentName : "custom"
        const nextBg = next.background ?? baseBg
        const accent = next.accent ?? colors.accent ?? DEFAULT_ACCENT
        const nextContrast = next.contrast ?? contrast
        const nextTint = next.uiTint ?? uiTint
        const nextColors = deriveFullColors(nextBg, accent, nextDark, nextContrast, nextTint)

        setIsDark(nextDark)
        setAccentName(nextAccentName)
        setBaseBg(nextBg)
        setContrast(nextContrast)
        setUiTint(nextTint)
        setColors(nextColors)
        setSaveError("")
        applyThemeColors(nextColors, nextDark)
    }, [accentName, baseBg, colors.accent, contrast, isDark, uiTint])

    const handleAdvancedColorChange = React.useCallback((key: keyof ThemeColors, value: string) => {
        const nextColors = { ...colors, [key]: value }
        setColors(nextColors)
        if (key === "bgBase") {
            setBaseBg(value)
        }
        setSaveError("")
        applyThemeColors(nextColors, isDark)
    }, [colors, isDark])

    const finishClose = React.useCallback(() => {
        setIsClosing(true)
        window.setTimeout(onClose, 220)
    }, [onClose])

    const restorePreviousTheme = React.useCallback(() => {
        if (previousThemeRef.current) {
            localStorage.setItem("millennium-theme", previousThemeRef.current)
        }
        loadAndApplySavedTheme()
    }, [])

    const handleClose = React.useCallback(() => {
        if (hasUnsavedChanges) {
            setDiscardDialogOpen(true)
            return
        }
        restorePreviousTheme()
        finishClose()
    }, [finishClose, hasUnsavedChanges, restorePreviousTheme])

    const handleDiscardChanges = React.useCallback(() => {
        setDiscardDialogOpen(false)
        restorePreviousTheme()
        finishClose()
    }, [finishClose, restorePreviousTheme])

    const handleSave = React.useCallback(() => {
        const themeName = name.trim()
        if (!themeName) {
            setSaveError("Name your theme before saving.")
            return
        }

        const isAdvanced = isAdvancedMode(activeMode)
        const themeToSave: SavedCustomTheme = {
            ...initialTheme,
            id: initialTheme?.id || `custom-${Date.now()}`,
            name: themeName,
            colors,
            isDark,
            isAdvanced,
            createdAt: initialTheme?.createdAt || Date.now(),
            updatedAt: initialTheme ? Date.now() : undefined,
        }

        const currentBasic = readSavedThemes("millennium-basic-themes")
        const currentAdvanced = readSavedThemes("millennium-advanced-themes")
        const withoutCurrentBasic = currentBasic.filter((theme) => theme.id !== themeToSave.id)
        const withoutCurrentAdvanced = currentAdvanced.filter((theme) => theme.id !== themeToSave.id)
        const nextBasic = isAdvanced ? withoutCurrentBasic : [...withoutCurrentBasic, themeToSave]
        const nextAdvanced = isAdvanced ? [...withoutCurrentAdvanced, themeToSave] : withoutCurrentAdvanced
        const customThemes = [...nextBasic, ...nextAdvanced]

        localStorage.setItem("millennium-basic-themes", JSON.stringify(nextBasic))
        localStorage.setItem("millennium-advanced-themes", JSON.stringify(nextAdvanced))
        localStorage.setItem("millennium-custom-themes", JSON.stringify(customThemes))
        localStorage.setItem("millennium-theme", JSON.stringify({
            themeId: themeToSave.id,
            customColors: colors,
            isDark,
            isAdvanced,
            selectedAccent: accentName,
            contrast,
            uiTint,
            activeTab: isAdvanced ? "custom" : "preset",
            baseBg: colors.bgBase,
        }))
        previousThemeRef.current = null

        fetch("/api/user/theme-builder", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                state: {
                    themeId: themeToSave.id,
                    customColors: colors,
                    isDark,
                    isAdvanced,
                    selectedAccent: accentName,
                    contrast,
                    uiTint,
                    activeTab: isAdvanced ? "custom" : "preset",
                    baseBg: colors.bgBase,
                },
                customThemes,
            }),
        }).catch((error) => {
            console.error("Failed to save theme builder to server:", error)
        })

        applyThemeColors(colors, isDark)
        finishClose()
    }, [accentName, activeMode, colors, contrast, finishClose, initialTheme, isDark, name, uiTint])

    const isSaveDisabled = !name.trim()

    return (
        <>
            <Sidebar
                side="right"
                variant="inset"
                collapsible="none"
                className={cn(
                    "h-full shrink-0 overflow-hidden border-l bg-sidebar",
                    "transition-[width,min-width,max-width,padding,opacity,border-color] duration-200 ease-out",
                    isClosing
                        ? "w-0 min-w-0 max-w-0 border-transparent p-0 opacity-0"
                        : "fixed inset-0 z-[120] w-full min-w-0 max-w-none border-sidebar-border p-2 opacity-100 md:static md:z-auto md:w-[30rem] md:min-w-[30rem] md:max-w-[30rem]"
                )}
            >
                <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl bg-sidebar">
                    <SidebarHeader className="w-full px-2 py-4">
                        <div className="flex w-full min-w-0 items-center gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-sidebar-border/80 bg-sidebar-accent text-sidebar-accent-foreground">
                                    <IconPalette className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="truncate text-sm font-medium text-sidebar-foreground">
                                        {initialTheme ? "Edit Theme" : "Create Theme"}
                                    </h3>
                                    <p className="mt-1 truncate text-xs text-sidebar-foreground/60">
                                        {/* The editor only sits beside Home once there is room to dock it; below that it
                                            covers the page, so promising a live preview would be describing a screen the
                                            reader cannot see. */}
                                        <span className="md:hidden">Changes apply as you edit</span>
                                        <span className="hidden md:inline">Live editing on Home</span>
                                    </p>
                                </div>
                            </div>
                            <Button
                                data-tour-id="theme-creation-sidebar-close"
                                className="ml-auto size-10 min-w-10 max-w-10 basis-10 shrink-0 p-0"
                                variant="ghost"
                                size="icon-lg"
                                onClick={handleClose}
                                aria-label="Close theme editor"
                            >
                                <IconX className="size-5" />
                            </Button>
                        </div>
                    </SidebarHeader>

                    <SidebarContent className="gap-4 px-2 pb-4 pt-1">
                        <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as ThemeCreateMode)}>
                            <TabsList className="mb-1 grid w-full grid-cols-2 gap-1 rounded-md border border-sidebar-border/70 bg-sidebar-accent/75 p-1">
                                <TabsTrigger
                                    value="simple"
                                    className="h-full rounded-[5px] border-0 text-sm font-medium text-sidebar-foreground/60 shadow-none data-active:bg-sidebar data-active:text-sidebar-foreground data-active:shadow-sm"
                                >
                                    <IconSparkles className="size-4" />
                                    Simple
                                </TabsTrigger>
                                <TabsTrigger
                                    value="advanced"
                                    className="h-full rounded-[5px] border-0 text-sm font-medium text-sidebar-foreground/60 shadow-none data-active:bg-sidebar data-active:text-sidebar-foreground data-active:shadow-sm"
                                >
                                    <IconAdjustments className="size-4" />
                                    Advanced
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="grid gap-2">
                            <Label htmlFor="theme-name" className="text-xs text-sidebar-foreground/70">Theme name</Label>
                            <Input
                                id="theme-name"
                                value={name}
                                onChange={(event) => {
                                    setName(event.target.value)
                                    setSaveError("")
                                }}
                                placeholder="Theme name"
                            />
                            {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
                        </div>

                        <div className="flex items-center justify-between rounded-md border border-sidebar-border/70 bg-sidebar-accent/75 p-3 shadow-sm">
                            <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
                                {isDark ? <IconMoon className="size-4" /> : <IconSun className="size-4" />}
                                <span>{isDark ? "Dark mode" : "Light mode"}</span>
                            </div>
                            <Switch
                                checked={isDark}
                                onCheckedChange={(checked) => {
                                    const nextDark = checked
                                    updateSimpleTheme({
                                        dark: nextDark,
                                        background: nextDark ? DARK_BG : LIGHT_BG,
                                    })
                                }}
                            />
                        </div>

                        <ThemeColorPickerField
                            label="Accent"
                            description="Buttons & highlights"
                            value={colors.accent || DEFAULT_ACCENT}
                            allowGradient
                            onChange={(value) => updateSimpleTheme({ accent: value })}
                        />

                        <ThemeColorPickerField
                            label="Background"
                            description="Base app colour"
                            value={baseBg}
                            onChange={(value) => updateSimpleTheme({ background: value })}
                        />

                        <ThemeSliderField
                            label="Contrast"
                            description="Borders & surfaces"
                            value={contrast}
                            min={15}
                            max={100}
                            onChange={(value) => updateSimpleTheme({ contrast: value })}
                        />

                        <ThemeSliderField
                            label="UI tint"
                            description="Accent colour bleed"
                            value={uiTint}
                            min={0}
                            max={100}
                            onChange={(value) => updateSimpleTheme({ uiTint: value })}
                        />

                        {activeMode === "advanced" ? (
                            <div className="grid gap-3">
                                <div>
                                    <h4 className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">Advanced colours</h4>
                                </div>
                                <div className="grid gap-3">
                                    {colorRows.map((row) => (
                                        <div
                                            key={row.key}
                                            className="rounded-md"
                                        >
                                            <ThemeColorPickerField
                                                label={row.label}
                                                value={colors[row.key]}
                                                compact
                                                allowGradient={row.key === "accent"}
                                                onChange={(value) => handleAdvancedColorChange(row.key, value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </SidebarContent>

                    <SidebarFooter className="border-t border-sidebar-border/70 px-2 py-3">
                        <Tooltip>
                            <TooltipTrigger render={<span className="block w-full" />}>
                                <Button className="w-full" onClick={handleSave} disabled={isSaveDisabled}>
                                    {initialTheme ? <IconCheck className="size-4" /> : <IconPlus className="size-4" />}
                                    {initialTheme ? "Save Changes" : `Create ${modeLabel(activeMode)}`}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" hidden={!isSaveDisabled}>
                                Name your theme before saving.
                            </TooltipContent>
                        </Tooltip>
                    </SidebarFooter>
                </div>
            </Sidebar>

            <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
                <AlertDialogContent className="border-[var(--border-default)] bg-[var(--bg-elevated)]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard theme changes?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your live theme edits have not been saved. Discarding will restore the theme you had before opening the editor.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDiscardChanges}>
                            Discard changes
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
