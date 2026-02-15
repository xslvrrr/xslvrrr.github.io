"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { IconCheck, IconSun, IconMoon, IconAdjustments, IconSparkles, IconPlus, IconX, IconDeviceFloppy, IconPalette, IconEdit, IconTrash, IconCopy } from "@tabler/icons-react"
import { AdvancedColorPicker, AdvancedColorPickerTrigger, AdvancedColorPickerContent, generateGradientCSS, isGradientValue } from "../ui/advanced-color-picker"
import { Switch } from "../ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "../ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
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
import { applyThemeColors, loadAndApplySavedTheme } from "../../lib/theme"

// ============================================
// TYPES
// ============================================

interface ThemeColors {
    bgBase: string
    bgElevated: string
    bgSurface: string
    bgSurfaceHover: string
    textPrimary: string
    textSecondary: string
    textTertiary: string
    textMuted: string
    accent: string
    accentHover: string
    accentLight: string
    borderSubtle: string
    borderDefault: string
    borderStrong: string
    hoverBg: string
    activeBg: string
}

interface PrebuiltTheme {
    id: string
    name: string
    colors: ThemeColors
    isDark: boolean
}

interface ThemeSliderProps {
    min: number
    max: number
    value: number
    onChange: (value: number) => void
    disabled?: boolean
}

function ThemeSlider({ min, max, value, onChange, disabled = false }: ThemeSliderProps) {
    const trackRef = React.useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = React.useState(false)

    const clamp = (val: number) => Math.max(min, Math.min(max, val))
    const valueToPercent = (val: number) => ((clamp(val) - min) / (max - min)) * 100

    const updateValueFromClientX = (clientX: number) => {
        if (!trackRef.current) return
        const rect = trackRef.current.getBoundingClientRect()
        const ratio = (clientX - rect.left) / rect.width
        const clamped = Math.max(0, Math.min(1, ratio))
        const next = clamp(Math.round(min + clamped * (max - min)))
        onChange(next)
    }

    return (
        <div
            ref={trackRef}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            onPointerDown={(e) => {
                if (disabled) return
                e.preventDefault()
                trackRef.current?.setPointerCapture(e.pointerId)
                setIsDragging(true)
                updateValueFromClientX(e.clientX)
            }}
            onPointerMove={(e) => {
                if (!isDragging || disabled) return
                updateValueFromClientX(e.clientX)
            }}
            onPointerUp={(e) => {
                if (disabled) return
                setIsDragging(false)
                trackRef.current?.releasePointerCapture(e.pointerId)
            }}
            onPointerCancel={() => setIsDragging(false)}
            style={{
                position: 'relative',
                height: '16px',
                borderRadius: '8px',
                overflow: 'visible',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
            }}
        >
            <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                height: '8px',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
            }} />
            <div style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                height: '8px',
                width: `${valueToPercent(value)}%`,
                background: 'var(--accent-gradient)',
                borderRadius: '3px',
                transition: isDragging ? 'none' : 'width 80ms linear',
            }} />
            <div style={{
                position: 'absolute',
                top: '50%',
                left: `${valueToPercent(value)}%`,
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: 'var(--accent-gradient)',
                border: '1px solid var(--accent-color)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
            }} />
        </div>
    )
}


function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const rgbaMatch = hex.match(/rgba?\(([^)]+)\)/i)
    if (rgbaMatch) {
        const parts = rgbaMatch[1].split(',').map(p => p.trim())
        if (parts.length >= 3) {
            const r = parseFloat(parts[0])
            const g = parseFloat(parts[1])
            const b = parseFloat(parts[2])
            if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                return { r, g, b }
            }
        }
    }
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(x => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16)
        return hex.length === 1 ? "0" + hex : hex
    }).join("")
}

function adjustBrightness(hex: string, amount: number): string {
    const rgb = hexToRgb(hex)
    if (!rgb) return hex
    return rgbToHex(
        rgb.r + amount,
        rgb.g + amount,
        rgb.b + amount
    )
}

function adjustAlpha(baseFactor: number, isDark: boolean): string {
    // Returns rgba string for overlay colors
    const base = isDark ? 255 : 0
    return `rgba(${base}, ${base}, ${base}, ${baseFactor})`
}

// Extract first color from gradient for derived calculations
function extractFirstColorFromGradient(value: string): string {
    if (!value?.includes('gradient')) return value
    // Match hex colors in gradient
    const hexMatch = value.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/g)
    if (hexMatch?.[0]) return hexMatch[0]
    const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i)
    if (rgbaMatch) {
        const parts = rgbaMatch[1].split(',').map(p => p.trim())
        if (parts.length >= 3) {
            const r = parseFloat(parts[0])
            const g = parseFloat(parts[1])
            const b = parseFloat(parts[2])
            if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                return rgbToHex(r, g, b)
            }
        }
    }
    return '#6468F0'
}

// Check if accent is a gradient
function isAccentGradient(accent: string): boolean {
    return accent?.includes('gradient') || false
}

// Generate derived colors from simple inputs
function deriveFullColors(
    bgBase: string,
    accent: string,
    isDark: boolean,
    contrastLevel: number = 30,  // 15-100, 30 is default
    tintLevel: number = 0        // 0-100, 0 is no tint
): ThemeColors {
    // For gradient accents, extract first color for calculations
    const accentForCalc = extractFirstColorFromGradient(accent)
    const bgBaseRgb = hexToRgb(bgBase)
    const baseBgForCalc = bgBaseRgb ? rgbToHex(bgBaseRgb.r, bgBaseRgb.g, bgBaseRgb.b) : bgBase
    const isBgRgba = /^rgba?\(/i.test(bgBase)
    
    // Helper to mix two colors
    const mixColors = (color1: string, color2: string, amount: number): string => {
        const rgb1 = hexToRgb(color1)
        const rgb2 = hexToRgb(color2)
        if (!rgb1 || !rgb2) return color1
        return rgbToHex(
            Math.round(rgb1.r * (1 - amount) + rgb2.r * amount),
            Math.round(rgb1.g * (1 - amount) + rgb2.g * amount),
            Math.round(rgb1.b * (1 - amount) + rgb2.b * amount)
        )
    }

    // Apply tint to a color (use extracted color for gradients)
    const applyTint = (baseColor: string, tint: number): string => {
        if (tint === 0) return baseColor
        return mixColors(baseColor, accentForCalc, tint / 400) // Subtle tint
    }

    // Apply contrast to text colors
    // Higher contrast = more difference between text levels
    const contrastFactor = contrastLevel / 30 // 0 = 0x, 1 = normal, 3.33 = max

    // Calculate base colors with tint
    const bgElevated = applyTint(adjustBrightness(baseBgForCalc, (isDark ? 10 : -8) * contrastFactor), tintLevel)
    const bgSurface = adjustAlpha((isDark ? 0.03 : 0.02) * contrastFactor, isDark)
    const bgSurfaceHover = adjustAlpha((isDark ? 0.06 : 0.04) * contrastFactor, isDark)

    // Text colors with contrast adjustment
    let textPrimary: string, textSecondary: string, textTertiary: string, textMuted: string

    if (isDark) {
        const baseLight = 247 // F7 in decimal
        textPrimary = rgbToHex(baseLight, baseLight + 1, baseLight + 1)
        textSecondary = rgbToHex(
            Math.round(161 + (247 - 161) * (contrastFactor - 1) * 0.3),
            Math.round(165 + (248 - 165) * (contrastFactor - 1) * 0.3),
            Math.round(169 + (248 - 169) * (contrastFactor - 1) * 0.3)
        )
        textTertiary = rgbToHex(106, 106, 117)
        textMuted = rgbToHex(74, 74, 82)
    } else {
        textPrimary = '#08090A'
        textSecondary = rgbToHex(
            Math.round(63 - (63 - 8) * (contrastFactor - 1) * 0.3),
            Math.round(64 - (64 - 9) * (contrastFactor - 1) * 0.3),
            Math.round(70 - (70 - 10) * (contrastFactor - 1) * 0.3)
        )
        textTertiary = '#6A6A75'
        textMuted = '#9A9AA0'
    }

    // Accent colors (use extracted color for hover/light calculations if gradient)
    const accentHover = isAccentGradient(accent) ? accent : adjustBrightness(accentForCalc, isDark ? 15 : -15)
    const accentRgb = hexToRgb(accentForCalc)
    const accentLight = isAccentGradient(accent)
        ? accent
        : accentRgb
            ? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${isDark ? 0.15 : 0.12})`
            : adjustAlpha(0.15, isDark)

    // Border colors
    const borderSubtle = adjustAlpha(isDark ? 0.08 * contrastFactor : 0.06 * contrastFactor, isDark)
    const borderDefault = adjustAlpha(isDark ? 0.12 * contrastFactor : 0.1 * contrastFactor, isDark)
    const borderStrong = adjustAlpha(isDark ? 0.20 * contrastFactor : 0.15 * contrastFactor, isDark)

    // Hover/active
    const hoverBg = adjustAlpha(isDark ? 0.04 * contrastFactor : 0.03 * contrastFactor, isDark)
    const activeBg = adjustAlpha(isDark ? 0.08 * contrastFactor : 0.06 * contrastFactor, isDark)

    return {
        bgBase: isBgRgba ? bgBase : applyTint(baseBgForCalc, tintLevel),
        bgElevated,
        bgSurface: adjustAlpha((isDark ? 0.03 : 0.02) * contrastFactor, isDark),
        bgSurfaceHover: adjustAlpha((isDark ? 0.06 : 0.04) * contrastFactor, isDark),
        textPrimary,
        textSecondary,
        textTertiary,
        textMuted,
        accent,
        accentHover,
        accentLight,
        borderSubtle,
        borderDefault,
        borderStrong,
        hoverBg,
        activeBg,
    }
}

// ============================================
// PREBUILT THEMES
// ============================================

// Color palette - accent colors for the spectrum
const ACCENT_COLORS = {
    red: '#ef4444',
    orange: '#f97316',
    amber: '#f59e0b',
    yellow: '#eab308',
    lime: '#84cc16',
    green: '#22c55e',
    emerald: '#10b981',
    teal: '#14b8a6',
    cyan: '#06b6d4',
    sky: '#0ea5e9',
    blue: '#3b82f6',
    indigo: '#6366f1',
    violet: '#8b5cf6',
    purple: '#a855f7',
    fuchsia: '#d946ef',
    pink: '#ec4899',
    rose: '#f43f5e',
}

// Dark mode background (deep neutral)
const DARK_BG = '#08090A'

// Light mode backgrounds (slightly dimmed whites for reduced eye strain)
const LIGHT_BG = '#F5F5F7' // Slightly warm gray-white

// Generate dark themes
const darkThemes: PrebuiltTheme[] = Object.entries(ACCENT_COLORS).map(([name, accent]) => ({
    id: `dark-${name}`,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    isDark: true,
    colors: deriveFullColors(DARK_BG, accent, true)
}))

// Generate light themes
const lightThemes: PrebuiltTheme[] = Object.entries(ACCENT_COLORS).map(([name, accent]) => ({
    id: `light-${name}`,
    name: `${name.charAt(0).toUpperCase() + name.slice(1)} Light`,
    isDark: false,
    colors: deriveFullColors(LIGHT_BG, accent, false)
}))

// Combine all prebuilt themes
const prebuiltThemes: PrebuiltTheme[] = [
    // Default dark theme first
    {
        id: 'dark-default',
        name: 'Dark (Default)',
        isDark: true,
        colors: deriveFullColors(DARK_BG, '#6468F0', true)
    },
    // Default light theme
    {
        id: 'light-default',
        name: 'Light',
        isDark: false,
        colors: deriveFullColors(LIGHT_BG, '#6468F0', false)
    },
    // All dark variants
    ...darkThemes,
    // All light variants
    ...lightThemes,
    // Custom theme placeholder
    {
        id: 'custom',
        name: 'Custom Theme',
        isDark: true,
        colors: deriveFullColors(DARK_BG, '#6468F0', true)
    },
]

// ============================================
// COLOR CATEGORIES
// ============================================

const simplifiedCategories = [
    { key: 'bgBase', label: 'Background', description: 'Main background color' },
    { key: 'accent', label: 'Accent', description: 'Primary accent & buttons' },
]

const advancedCategories = [
    {
        name: 'Background',
        colors: [
            { key: 'bgBase', label: 'Base' },
            { key: 'bgElevated', label: 'Elevated' },
            { key: 'bgSurface', label: 'Surface' },
            { key: 'bgSurfaceHover', label: 'Surface Hover' },
        ]
    },
    {
        name: 'Text',
        colors: [
            { key: 'textPrimary', label: 'Primary' },
            { key: 'textSecondary', label: 'Secondary' },
            { key: 'textTertiary', label: 'Tertiary' },
            { key: 'textMuted', label: 'Muted' },
        ]
    },
    {
        name: 'Accent',
        colors: [
            { key: 'accent', label: 'Main' },
            { key: 'accentHover', label: 'Hover' },
            { key: 'accentLight', label: 'Light/Bg' },
        ]
    },
    {
        name: 'Borders',
        colors: [
            { key: 'borderSubtle', label: 'Subtle' },
            { key: 'borderDefault', label: 'Default' },
            { key: 'borderStrong', label: 'Strong' },
        ]
    },
    {
        name: 'Interactive',
        colors: [
            { key: 'hoverBg', label: 'Hover' },
            { key: 'activeBg', label: 'Active' },
        ]
    }
]

// ============================================
// THEME BUILDER COMPONENT
// ============================================

interface SavedCustomTheme {
    id: string
    name: string
    colors: ThemeColors
    isDark: boolean
    isAdvanced: boolean
    createdAt: number
    updatedAt?: number
}

export function ThemeBuilder() {
    // Tab state
    const [activeTab, setActiveTab] = useState<'preset' | 'custom'>('preset')
    const [lastPresetTheme, setLastPresetTheme] = useState<string>('dark-default')
    const [lastCustomTheme, setLastCustomTheme] = useState<string | null>(null)

    const [selectedTheme, setSelectedTheme] = useState<string>('dark-default')
    const [customColors, setCustomColors] = useState<Partial<ThemeColors>>({})
    const [isDark, setIsDark] = useState(true)
    const [isAdvanced, setIsAdvanced] = useState(false)
    const [savedBasicThemes, setSavedBasicThemes] = useState<SavedCustomTheme[]>([])
    const [savedAdvancedThemes, setSavedAdvancedThemes] = useState<SavedCustomTheme[]>([])
    const [baseBg, setBaseBg] = useState<string>(DARK_BG)

    // New state for simplified controls
    const [selectedAccent, setSelectedAccent] = useState<string>('default')
    const [contrast, setContrast] = useState(30)  // 15-100
    const [uiTint, setUiTint] = useState(0)        // 0-100

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        themeId: string
        x: number
        y: number
    } | null>(null)

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        themeId: string
        themeName: string
    } | null>(null)

    const allSavedThemes = React.useMemo(
        () => [...savedBasicThemes, ...savedAdvancedThemes],
        [savedBasicThemes, savedAdvancedThemes]
    )

    // Load saved theme on mount
    useEffect(() => {
        let isMounted = true
        let loadedThemes: SavedCustomTheme[] = []

        const normalizeThemes = (themes: SavedCustomTheme[]) => themes.map((theme) => ({
            ...theme,
            isAdvanced: theme.isAdvanced ?? isAccentGradient(theme.colors.accent),
        }))

        const persistSeparatedThemes = (themes: SavedCustomTheme[]) => {
            const basic = themes.filter((theme) => !theme.isAdvanced)
            const advanced = themes.filter((theme) => theme.isAdvanced)
            setSavedBasicThemes(basic)
            setSavedAdvancedThemes(advanced)
            localStorage.setItem('millennium-basic-themes', JSON.stringify(basic))
            localStorage.setItem('millennium-advanced-themes', JSON.stringify(advanced))
            localStorage.setItem('millennium-custom-themes', JSON.stringify(themes))
        }

        // Load separated themes first, then migrate legacy single list if needed
        try {
            const basicSaved = JSON.parse(localStorage.getItem('millennium-basic-themes') || '[]') as SavedCustomTheme[]
            const advancedSaved = JSON.parse(localStorage.getItem('millennium-advanced-themes') || '[]') as SavedCustomTheme[]
            if (basicSaved.length > 0 || advancedSaved.length > 0) {
                loadedThemes = normalizeThemes([...basicSaved, ...advancedSaved])
                persistSeparatedThemes(loadedThemes)
            } else {
                const legacySaved = localStorage.getItem('millennium-custom-themes')
                if (legacySaved) {
                    loadedThemes = normalizeThemes(JSON.parse(legacySaved))
                    persistSeparatedThemes(loadedThemes)
                }
            }
        } catch (e) {
            console.error('Failed to load custom themes:', e)
        }

        const saved = localStorage.getItem('millennium-theme')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                const themeId = parsed.themeId || 'dark-default'

                setSelectedTheme(themeId)
                setCustomColors(parsed.customColors || {})
                setIsDark(parsed.isDark ?? true)
                setIsAdvanced(parsed.isAdvanced ?? false)
                setSelectedAccent(parsed.selectedAccent || 'default')
                setContrast(parsed.contrast ?? 30)
                setUiTint(parsed.uiTint ?? 0)
                const base = parsed.customColors?.bgBase
                if (base) {
                    setBaseBg(base)
                } else {
                    const presetTheme = prebuiltThemes.find(t => t.id === themeId)
                    setBaseBg(presetTheme?.colors.bgBase || ((parsed.isDark ?? true) ? DARK_BG : LIGHT_BG))
                }

                // Initialize tab state
                const isCustom = themeId === 'custom' || loadedThemes.some(t => t.id === themeId)
                if (isCustom) {
                    setActiveTab('custom')
                    setLastCustomTheme(themeId)
                } else {
                    setActiveTab('preset')
                    setLastPresetTheme(themeId)
                }
            } catch (e) {
                console.error('Failed to load theme:', e)
            }
        }

        const loadFromServer = async () => {
            try {
                const response = await fetch('/api/user/theme-builder')
                if (!response.ok) return
                const data = await response.json()
                if (!isMounted) return

                const serverState = data?.state
                const serverCustomThemes = Array.isArray(data?.customThemes) ? data.customThemes : []

                if (serverCustomThemes.length > 0) {
                    const normalized = normalizeThemes(serverCustomThemes as SavedCustomTheme[])
                    persistSeparatedThemes(normalized)
                    loadedThemes = normalized
                }

                if (serverState) {
                    const themeId = serverState.themeId || 'dark-default'
                    setSelectedTheme(themeId)
                    setCustomColors(serverState.customColors || {})
                    setIsDark(serverState.isDark ?? true)
                    setIsAdvanced(serverState.isAdvanced ?? false)
                    setSelectedAccent(serverState.selectedAccent || 'default')
                    setContrast(serverState.contrast ?? 30)
                    setUiTint(serverState.uiTint ?? 0)
                    setActiveTab(serverState.activeTab === 'custom' ? 'custom' : 'preset')
                    setLastPresetTheme(serverState.lastPresetTheme || 'dark-default')
                    setLastCustomTheme(serverState.lastCustomTheme || null)
                    setBaseBg(serverState.baseBg || (serverState.isDark ? DARK_BG : LIGHT_BG))

                    localStorage.setItem('millennium-theme', JSON.stringify({
                        themeId,
                        customColors: serverState.customColors || {},
                        isDark: serverState.isDark ?? true,
                        isAdvanced: serverState.isAdvanced ?? false,
                        selectedAccent: serverState.selectedAccent || 'default',
                        contrast: serverState.contrast ?? 30,
                        uiTint: serverState.uiTint ?? 0,
                    }))
                } else if (serverCustomThemes.length > 0 && !saved) {
                    const fallback = loadedThemes[0]
                    if (fallback) {
                        setSelectedTheme(fallback.id)
                        setCustomColors(fallback.colors)
                        setIsDark(fallback.isDark)
                        setIsAdvanced(fallback.isAdvanced)
                        setActiveTab(fallback.isAdvanced ? 'custom' : 'preset')
                        if (fallback.isAdvanced) {
                            setLastCustomTheme(fallback.id)
                        } else {
                            setLastPresetTheme(fallback.id)
                        }
                        setBaseBg(fallback.colors.bgBase || (fallback.isDark ? DARK_BG : LIGHT_BG))
                    }
                }
            } catch (e) {
                console.error('Failed to load theme builder from server:', e)
            } finally {
                hasLoadedRef.current = true
            }
        }

        loadFromServer()

        return () => {
            isMounted = false
        }
    }, [])

    // Delete custom theme
    const handleDeleteCustomTheme = useCallback((themeId: string) => {
        const updatedBasic = savedBasicThemes.filter((t) => t.id !== themeId)
        const updatedAdvanced = savedAdvancedThemes.filter((t) => t.id !== themeId)
        setSavedBasicThemes(updatedBasic)
        setSavedAdvancedThemes(updatedAdvanced)
        localStorage.setItem('millennium-basic-themes', JSON.stringify(updatedBasic))
        localStorage.setItem('millennium-advanced-themes', JSON.stringify(updatedAdvanced))
        localStorage.setItem('millennium-custom-themes', JSON.stringify([...updatedBasic, ...updatedAdvanced]))

        // If deleted theme was selected, select another custom theme (don't switch tabs)
        if (selectedTheme === themeId) {
            const updatedAll = [...updatedBasic, ...updatedAdvanced]
            const preferredPool = activeTab === 'custom' ? updatedAdvanced : updatedBasic
            if (preferredPool.length > 0 || updatedAll.length > 0) {
                // Select the first remaining custom theme
                const nextTheme = preferredPool[0] || updatedAll[0]
                setSelectedTheme(nextTheme.id)
                setCustomColors(nextTheme.colors)
                setIsDark(nextTheme.isDark)
                setBaseBg(nextTheme.colors.bgBase || (nextTheme.isDark ? DARK_BG : LIGHT_BG))
                applyThemeColors(nextTheme.colors, nextTheme.isDark)
                saveTheme(nextTheme.id, nextTheme.colors, nextTheme.isDark, isAdvanced, selectedAccent, contrast, uiTint)
                setLastCustomTheme(nextTheme.id)
            } else {
                // No custom themes left, but stay on custom tab
                // Set to 'custom' (unsaved) state with current colors
                setSelectedTheme('custom')
                const bgBase = isDark ? DARK_BG : LIGHT_BG
                const accent = '#6468F0'
                const derivedColors = deriveFullColors(bgBase, accent, isDark, contrast, uiTint)
                setCustomColors(derivedColors)
                setBaseBg(bgBase)
                applyThemeColors(derivedColors, isDark)
                saveTheme('custom', derivedColors, isDark, isAdvanced)
            }
        }
    }, [savedBasicThemes, savedAdvancedThemes, selectedTheme, activeTab, isDark, isAdvanced, selectedAccent, contrast, uiTint])

    // Duplicate custom theme
    const handleDuplicateCustomTheme = useCallback((themeId: string) => {
        const theme = allSavedThemes.find((t) => t.id === themeId)
        if (!theme) return

        const newId = `${theme.id}-copy-${Date.now()}`
        const newTheme: SavedCustomTheme = {
            ...theme,
            id: newId,
            name: `${theme.name} (Copy)`,
            createdAt: Date.now(),
            updatedAt: undefined,
        }

        if (theme.isAdvanced) {
            const updatedAdvanced = [...savedAdvancedThemes, newTheme]
            setSavedAdvancedThemes(updatedAdvanced)
            localStorage.setItem('millennium-advanced-themes', JSON.stringify(updatedAdvanced))
            localStorage.setItem('millennium-custom-themes', JSON.stringify([...savedBasicThemes, ...updatedAdvanced]))
        } else {
            const updatedBasic = [...savedBasicThemes, newTheme]
            setSavedBasicThemes(updatedBasic)
            localStorage.setItem('millennium-basic-themes', JSON.stringify(updatedBasic))
            localStorage.setItem('millennium-custom-themes', JSON.stringify([...updatedBasic, ...savedAdvancedThemes]))
        }
    }, [allSavedThemes, savedAdvancedThemes, savedBasicThemes])

    // Track last used themes for tabs (but don't auto-switch tabs)
    useEffect(() => {
        // Only update the last used theme tracking, don't auto-switch tabs
        const isCustom = selectedTheme === 'custom' || allSavedThemes.some((t) => t.id === selectedTheme)
        if (isCustom) {
            setLastCustomTheme(selectedTheme)
        } else {
            setLastPresetTheme(selectedTheme)
        }
    }, [selectedTheme, allSavedThemes])

    useEffect(() => {
        if (!hasLoadedRef.current) return

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
        }

        saveTimerRef.current = setTimeout(() => {
            const payload = {
                state: {
                    themeId: selectedTheme,
                    customColors,
                    isDark,
                    isAdvanced,
                    selectedAccent,
                    contrast,
                    uiTint,
                    activeTab,
                    lastPresetTheme,
                    lastCustomTheme,
                    baseBg,
                },
                customThemes: allSavedThemes,
            }

            fetch('/api/user/theme-builder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }).catch((e) => {
                console.error('Failed to save theme builder to server:', e)
            })
        }, 800)

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
            }
        }
    }, [selectedTheme, customColors, isDark, isAdvanced, selectedAccent, contrast, uiTint, allSavedThemes, activeTab, lastPresetTheme, lastCustomTheme, baseBg])

    const handleTabChange = (val: string) => {
        const newTab = val as 'preset' | 'custom'

        if (newTab === activeTab) return

        // Close sidebar when switching tabs to avoid conflicts
        setSidebarOpen(false)
        setPreviousTheme(null)

        setActiveTab(newTab)

        if (newTab === 'preset') {
            // Restore last preset with current contrast and uiTint settings preserved
            if (lastPresetTheme && lastPresetTheme !== selectedTheme) {
                const theme = prebuiltThemes.find(t => t.id === lastPresetTheme)
                if (theme) {
                    setSelectedTheme(lastPresetTheme)
                    // Apply with current contrast and uiTint settings
                    const accentHex = theme.colors.accent?.startsWith('#') ? theme.colors.accent : '#6468F0'
                    const bgBase = theme.isDark ? DARK_BG : LIGHT_BG
                    const derivedColors = deriveFullColors(bgBase, accentHex, theme.isDark, contrast, uiTint)
                    setCustomColors(derivedColors)
                    setIsDark(theme.isDark)
                    setBaseBg(bgBase)
                    applyThemeColors(derivedColors, theme.isDark)
                    saveTheme(lastPresetTheme, derivedColors, theme.isDark, isAdvanced, selectedAccent, contrast, uiTint)
                }
            } else {
                // Just re-apply current theme with contrast/tint
                const accentHex = selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
                const bgBase = isDark ? DARK_BG : LIGHT_BG
                const derivedColors = deriveFullColors(bgBase, accentHex, isDark, contrast, uiTint)
                setCustomColors(derivedColors)
                setBaseBg(bgBase)
                applyThemeColors(derivedColors, isDark)
                saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, uiTint)
            }
        } else {
            // Restore last custom (but don't open sidebar automatically)
            const targetId = lastCustomTheme || (savedAdvancedThemes.length > 0 ? savedAdvancedThemes[0].id : null)

            if (targetId && targetId !== selectedTheme) {
                const saved = savedAdvancedThemes.find((t) => t.id === targetId)
                if (saved) {
                    // Just select, don't open sidebar
                    setSelectedTheme(saved.id)
                    setCustomColors(saved.colors)
                    setIsDark(saved.isDark)
                    setBaseBg(saved.colors.bgBase || (saved.isDark ? DARK_BG : LIGHT_BG))
                    applyThemeColors(saved.colors, saved.isDark)
                    saveTheme(saved.id, saved.colors, saved.isDark, isAdvanced, selectedAccent, contrast, uiTint)
                }
            }
        }
    }

    // Save theme when it changes
    const saveTheme = useCallback((themeId: string, colors: Partial<ThemeColors>, dark: boolean, advanced: boolean, accentName?: string, contrastVal?: number, tintVal?: number) => {
        localStorage.setItem('millennium-theme', JSON.stringify({
            themeId,
            customColors: colors,
            isDark: dark,
            isAdvanced: advanced,
            selectedAccent: accentName ?? selectedAccent,
            contrast: contrastVal ?? contrast,
            uiTint: tintVal ?? uiTint,
        }))
    }, [selectedAccent, contrast, uiTint])

    const applyCurrentTheme = useCallback((themeId: string, colors: Partial<ThemeColors>, dark: boolean) => {
        if (themeId === 'custom') {
            // For custom theme, derive colors from bgBase and accent
            const bgBase = colors.bgBase || (dark ? '#08090A' : '#F4F5F8')
            const accent = colors.accent || '#6468F0'
            const derivedColors = deriveFullColors(bgBase, accent, dark)
            const mergedColors = { ...derivedColors, ...colors }
            applyThemeColors(mergedColors, dark)
        } else {
            const theme = prebuiltThemes.find(t => t.id === themeId)
            if (theme) {
                const mergedColors = { ...theme.colors, ...colors }
                applyThemeColors(mergedColors, dark)
            }
        }
    }, [])

    const handleThemeSelect = (themeId: string) => {
        const theme = prebuiltThemes.find(t => t.id === themeId)
        if (theme) {
            setSelectedTheme(themeId)
            setCustomColors({})
            setIsDark(theme.isDark)
            setBaseBg(theme.colors.bgBase)
            setEditingThemeId(null)
            setThemeName('')
            applyCurrentTheme(themeId, {}, theme.isDark)
            saveTheme(themeId, {}, theme.isDark, isAdvanced)
        }
    }

    const handleCustomThemeStart = () => {
        // Store current theme state for restoration if user cancels
        setPreviousTheme({ id: selectedTheme, colors: customColors, isDark })

        // Start custom theme from current
        setSelectedTheme('custom')
        const bgBase = customColors.bgBase || (isDark ? '#08090A' : '#F4F5F8')
        const accent = customColors.accent || '#6468F0'
        const newCustom = { bgBase, accent }
        setCustomColors(newCustom)
        setBaseBg(bgBase)
        setEditingThemeId(null)
        setThemeName('')
        applyCurrentTheme('custom', newCustom, isDark)
        saveTheme('custom', newCustom, isDark, isAdvanced)
        setSidebarOpen(true)
    }

    // Also store previous theme when opening sidebar for existing custom themes
    const handleEditTheme = (themeId: string, themeColors: Partial<ThemeColors>, themeDark: boolean, themeLabel?: string) => {
        // Store current theme for restoration
        setPreviousTheme({ id: selectedTheme, colors: customColors, isDark })

        setSelectedTheme(themeId)
        setCustomColors(themeColors)
        setIsDark(themeDark)
        setBaseBg(themeColors.bgBase || (themeDark ? DARK_BG : LIGHT_BG))
        setEditingThemeId(themeId)
        setThemeName(themeLabel || '')

        // Apply the full theme colors
        const fullColors = themeColors as ThemeColors
        if (fullColors.bgBase && fullColors.accent) {
            applyThemeColors(fullColors, themeDark)
        } else {
            applyCurrentTheme(themeId, themeColors, themeDark)
        }

        // Save the selection
        saveTheme(themeId, themeColors, themeDark, isAdvanced)
        setSidebarOpen(true)
    }

    // Handle sidebar close - restore previous theme if closing without save
    // Note: This should NOT change the active tab
    const handleSidebarClose = () => {
        if (previousTheme) {
            setSelectedTheme(previousTheme.id)
            setCustomColors(previousTheme.colors)
            setIsDark(previousTheme.isDark)
            applyCurrentTheme(previousTheme.id, previousTheme.colors, previousTheme.isDark)
            saveTheme(previousTheme.id, previousTheme.colors, previousTheme.isDark, isAdvanced)
            setPreviousTheme(null)
        }
        setSidebarOpen(false)
        setEditingThemeId(null)
        setThemeName('')
        // Do NOT change activeTab here - keep user on current tab
    }

    const handleColorChange = (colorKey: string, value: string) => {
        const newCustomColors = { ...customColors, [colorKey]: value }
        setCustomColors(newCustomColors)
        if (colorKey === 'bgBase') {
            setBaseBg(value)
        }

        // If in simplified mode and changing primary colors, derive others
        if (!isAdvanced && (colorKey === 'bgBase' || colorKey === 'accent')) {
            const bgBase = colorKey === 'bgBase' ? value : (newCustomColors.bgBase || (isDark ? '#08090A' : '#F4F5F8'))
            const accent = colorKey === 'accent' ? value : (newCustomColors.accent || '#6468F0')
            const derivedColors = deriveFullColors(bgBase, accent, isDark)
            applyThemeColors(derivedColors, isDark)
            saveTheme(selectedTheme, { bgBase, accent }, isDark, isAdvanced)
        } else {
            applyCurrentTheme(selectedTheme, newCustomColors, isDark)
            saveTheme(selectedTheme, newCustomColors, isDark, isAdvanced)
        }
    }

    const handleDarkModeToggle = (dark: boolean) => {
        setIsDark(dark)

        // Check if this is a custom theme (either 'custom' or saved custom themes)
        const isCustomTheme = selectedTheme === 'custom' || selectedTheme.startsWith('custom-')

        if (isCustomTheme) {
            // Re-derive colors for the new dark/light mode
            const bgBase = dark ? '#08090A' : '#F4F5F8'
            const accent = customColors.accent || '#6468F0'
            const derivedColors = deriveFullColors(bgBase, accent, dark)

            // Update custom colors with new derived values
            setCustomColors(derivedColors)
            setBaseBg(bgBase)
            applyThemeColors(derivedColors, dark)
            saveTheme(selectedTheme, derivedColors, dark, isAdvanced)
        } else {
            applyCurrentTheme(selectedTheme, customColors, dark)
            saveTheme(selectedTheme, customColors, dark, isAdvanced)
        }
    }

    const getCurrentColor = (colorKey: string): string => {
        if (customColors[colorKey as keyof ThemeColors]) {
            return customColors[colorKey as keyof ThemeColors]!
        }
        const theme = prebuiltThemes.find(t => t.id === selectedTheme)
        if (theme) {
            const color = theme.colors[colorKey as keyof ThemeColors]
            // Return hex if available, otherwise return a default
            if (color && color.startsWith('#')) return color
            if (colorKey === 'bgBase') return isDark ? '#08090A' : '#F4F5F8'
            if (colorKey === 'accent') return '#6468F0'
        }
        return '#000000'
    }

    // State for sidebar visibility
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [themeName, setThemeName] = useState('')
    const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
    const [previousTheme, setPreviousTheme] = useState<{ id: string; colors: Partial<ThemeColors>; isDark: boolean } | null>(null)
    
    // Preview section state
    const [previewToggle1, setPreviewToggle1] = useState(false)
    const [previewToggle2, setPreviewToggle2] = useState(true)
    const [previewSelect, setPreviewSelect] = useState('option-1')
    const hasLoadedRef = React.useRef(false)
    const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    // Note: We no longer auto-open the sidebar when selecting themes
    // Users must double-click to edit or explicitly click "Create New"

    // Handle save theme
    const handleSaveTheme = () => {
        if (!themeName.trim()) return

        const themeAdvanced = activeTab === 'custom'

        // Get current colors (custom or from selected theme)
        const theme = prebuiltThemes.find(t => t.id === selectedTheme)
        const baseColors = theme?.colors || deriveFullColors(isDark ? DARK_BG : LIGHT_BG, '#6468F0', isDark)
        const finalColors = { ...baseColors, ...customColors }

        // Save to separated buckets (basic/advanced)
        const savedThemes = [...savedBasicThemes, ...savedAdvancedThemes]
        let activeThemeId = editingThemeId
        if (editingThemeId) {
            const idx = savedThemes.findIndex((t: SavedCustomTheme) => t.id === editingThemeId)
            if (idx >= 0) {
                const existing = savedThemes[idx]
                const updatedTheme = {
                    ...existing,
                    name: themeName.trim(),
                    colors: finalColors,
                    isDark,
                    isAdvanced: themeAdvanced,
                    updatedAt: Date.now(),
                }
                savedThemes[idx] = updatedTheme
            } else {
                activeThemeId = null
            }
        }

        if (!activeThemeId) {
            const newTheme = {
                id: `custom-${Date.now()}`,
                name: themeName.trim(),
                colors: finalColors,
                isDark,
                isAdvanced: themeAdvanced,
                createdAt: Date.now(),
            }
            savedThemes.push(newTheme)
            activeThemeId = newTheme.id
        }
        const nextBasic = savedThemes.filter((t: SavedCustomTheme) => !t.isAdvanced)
        const nextAdvanced = savedThemes.filter((t: SavedCustomTheme) => t.isAdvanced)
        localStorage.setItem('millennium-basic-themes', JSON.stringify(nextBasic))
        localStorage.setItem('millennium-advanced-themes', JSON.stringify(nextAdvanced))
        localStorage.setItem('millennium-custom-themes', JSON.stringify(savedThemes))

        // Reset
        setThemeName('')
        setSaveDialogOpen(false)
        setSidebarOpen(false)
        setEditingThemeId(null)

        // Reload custom themes into state and select the new theme
        setSavedBasicThemes(nextBasic)
        setSavedAdvancedThemes(nextAdvanced)
        setSelectedTheme(activeThemeId)
        setCustomColors(finalColors)
        setBaseBg(finalColors.bgBase || (isDark ? DARK_BG : LIGHT_BG))
        applyThemeColors(finalColors, isDark)
        saveTheme(activeThemeId, finalColors, isDark, isAdvanced)
    }

    return (
        <div style={{
            display: 'flex',
            gap: '24px',
            position: 'relative',
        }}>
            {/* Main Content Area */}
            <div style={{
                flex: 1,
                minWidth: 0,
                transition: 'margin-right 300ms ease',
                marginRight: sidebarOpen ? '320px' : '0',
            }}>


                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 h-9 items-center">
                        <TabsTrigger className="rounded-lg text-[12px] font-semibold tracking-wide h-7 py-0.5 leading-none self-center" value="preset">Basic Themes</TabsTrigger>
                        <TabsTrigger className="rounded-lg text-[12px] font-semibold tracking-wide h-7 py-0.5 leading-none self-center" value="custom">Advanced Themes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preset">
                        {/* Theme Controls - Compact UI */}
                        <div style={{ marginBottom: '24px' }}>
                            {/* Row 1: Color Selector + Dark/Light Toggle */}
                            <div style={{
                                display: 'flex',
                                gap: '12px',
                                marginBottom: '16px',
                                alignItems: 'stretch',
                            }}>
                                {/* Color Combobox */}
                                <div style={{ flex: 1 }}>
                                    <label style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '6px',
                                        display: 'block',
                                    }}>
                                        Accent Color
                                    </label>
                                    <Select
                                        value={selectedAccent}
                                        onValueChange={(newAccent) => {
                                            setSelectedAccent(newAccent)
                                            const accentHex = newAccent === 'default' ? '#6468F0' : ACCENT_COLORS[newAccent as keyof typeof ACCENT_COLORS]
                                            const bgBase = isDark ? DARK_BG : LIGHT_BG
                                            const derivedColors = deriveFullColors(bgBase, accentHex, isDark, contrast, uiTint)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            setSelectedTheme(isDark ? `dark-${newAccent}` : `light-${newAccent}`)
                                            saveTheme(isDark ? `dark-${newAccent}` : `light-${newAccent}`, derivedColors, isDark, isAdvanced, newAccent, contrast, uiTint)
                                        }}
                                    >
                                        <SelectTrigger style={{ width: '240px' }}>
                                            <SelectValue placeholder="Select accent" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {/* Selected Item at Top */}
                                            {(() => {
                                                // Logic to determine current selection name and color
                                                const currentVal = selectedAccent === 'default' ? 'indigo' : selectedAccent
                                                const currentColor = selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
                                                const label = currentVal.charAt(0).toUpperCase() + currentVal.slice(1) + (currentVal === 'indigo' ? ' (Default)' : '')

                                                return (
                                                    <SelectItem value={selectedAccent}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: currentColor }} />
                                                            <span>{label}</span>
                                                        </div>
                                                    </SelectItem>
                                                )
                                            })()}

                                            <SelectSeparator />

                                            {/* Other Items */}
                                            {Object.entries(ACCENT_COLORS).map(([name, color]) => {
                                                // Skip the currently selected item to avoid duplicates
                                                // Also treat 'default' selection as 'indigo' for skipping purposes
                                                if (name === selectedAccent || (selectedAccent === 'default' && name === 'indigo')) return null;

                                                const label = name.charAt(0).toUpperCase() + name.slice(1) + (name === 'indigo' ? ' (Default)' : '')

                                                return (
                                                    <SelectItem key={name} value={name}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: color }} />
                                                            <span>{label}</span>
                                                        </div>
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Dark/Light Toggle */}
                                <div>
                                    <label style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '6px',
                                        display: 'block',
                                    }}>
                                        Mode
                                    </label>
                                    <div style={{
                                        display: 'flex',
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                    }}>
                                        <button
                                            onClick={() => {
                                                if (isDark) return
                                                setIsDark(true)
                                                const accentHex = selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
                                                const derivedColors = deriveFullColors(DARK_BG, accentHex, true, contrast, uiTint)
                                                setCustomColors(derivedColors)
                                                applyThemeColors(derivedColors, true)
                                                setSelectedTheme(`dark-${selectedAccent}`)
                                                saveTheme(`dark-${selectedAccent}`, derivedColors, true, isAdvanced, selectedAccent, contrast, uiTint)
                                            }}
                                            style={{
                                                padding: '10px 16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: isDark ? 'var(--accent-gradient)' : 'transparent',
                                                color: isDark ? '#fff' : 'var(--text-secondary)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                transition: 'all 150ms',
                                            }}
                                        >
                                            <IconMoon size={14} />
                                            Dark
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (!isDark) return
                                                setIsDark(false)
                                                const accentHex = selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
                                                const derivedColors = deriveFullColors(LIGHT_BG, accentHex, false, contrast, uiTint)
                                                setCustomColors(derivedColors)
                                                applyThemeColors(derivedColors, false)
                                                setSelectedTheme(`light-${selectedAccent}`)
                                                saveTheme(`light-${selectedAccent}`, derivedColors, false, isAdvanced, selectedAccent, contrast, uiTint)
                                            }}
                                            style={{
                                                padding: '10px 16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: !isDark ? 'var(--accent-gradient)' : 'transparent',
                                                color: !isDark ? '#fff' : 'var(--text-secondary)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                transition: 'all 150ms',
                                            }}
                                        >
                                            <IconSun size={14} />
                                            Light
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Sliders */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px',
                            }}>
                                {/* Contrast Slider */}
                                <div>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '8px',
                                    }}>
                                        <label style={{
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            color: 'var(--text-secondary)',
                                        }}>
                                            Contrast
                                        </label>
                                        <input
                                            type="text"
                                            value={`${contrast}%`}
                                            onChange={(e) => {
                                                const raw = e.target.value.replace(/%/g, '')
                                                if (/^\d*$/.test(raw) && raw.length <= 3) {
                                                    const val = raw === '' ? 15 : parseInt(raw)
                                                    setContrast(Math.min(100, Math.max(15, val || 15)))
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const raw = e.target.value.replace(/%/g, '')
                                                const val = parseInt(raw) || 30
                                                const clamped = Math.min(100, Math.max(15, val))
                                                setContrast(clamped)
                                                const accentHex = selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
                                                const bgBase = isDark ? DARK_BG : LIGHT_BG
                                                const derivedColors = deriveFullColors(bgBase, accentHex, isDark, clamped, uiTint)
                                                setCustomColors(derivedColors)
                                                applyThemeColors(derivedColors, isDark)
                                                saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, clamped, uiTint)
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    (e.target as HTMLInputElement).blur()
                                                }
                                            }}
                                            style={{
                                                width: '44px',
                                                fontSize: '12px',
                                                color: 'var(--text-tertiary)',
                                                background: 'transparent',
                                                border: '1px solid transparent',
                                                borderRadius: '4px',
                                                textAlign: 'right',
                                                padding: '2px 4px',
                                                transition: 'border-color 150ms',
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--border-default)'}
                                        />
                                    </div>
                                    <ThemeSlider
                                        min={15}
                                        max={100}
                                        value={contrast}
                                        onChange={(newContrast) => {
                                            setContrast(newContrast)
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = isDark ? DARK_BG : LIGHT_BG
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, newContrast, uiTint)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, newContrast, uiTint)
                                        }}
                                    />
                                </div>

                                {/* UI Tint Slider */}
                                <div>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '8px',
                                    }}>
                                        <label style={{
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            color: 'var(--text-secondary)',
                                        }}>
                                            UI Tint
                                        </label>
                                        <input
                                            type="text"
                                            value={`${uiTint}%`}
                                            onChange={(e) => {
                                                const raw = e.target.value.replace(/%/g, '')
                                                if (/^\d*$/.test(raw) && raw.length <= 3) {
                                                    const val = raw === '' ? 0 : parseInt(raw)
                                                    setUiTint(Math.min(100, Math.max(0, val || 0)))
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const raw = e.target.value.replace(/%/g, '')
                                                const val = parseInt(raw) || 0
                                                const clamped = Math.min(100, Math.max(0, val))
                                                setUiTint(clamped)
                                                const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                                const bgBase = isDark ? DARK_BG : LIGHT_BG
                                                const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, clamped)
                                                setCustomColors(derivedColors)
                                                applyThemeColors(derivedColors, isDark)
                                                saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, clamped)
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    (e.target as HTMLInputElement).blur()
                                                }
                                            }}
                                            style={{
                                                width: '44px',
                                                fontSize: '12px',
                                                color: 'var(--text-tertiary)',
                                                background: 'transparent',
                                                border: '1px solid transparent',
                                                borderRadius: '4px',
                                                textAlign: 'right',
                                                padding: '2px 4px',
                                                transition: 'border-color 150ms',
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--border-default)'}
                                        />
                                    </div>
                                    <ThemeSlider
                                        min={0}
                                        max={100}
                                        value={uiTint}
                                        onChange={(newTint) => {
                                            setUiTint(newTint)
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = isDark ? DARK_BG : LIGHT_BG
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, newTint)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, newTint)
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Saved Basic Themes */}
                        {savedBasicThemes.length > 0 && (
                            <div style={{ marginTop: '24px' }}>
                                <h3 style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.6px',
                                    marginBottom: '12px',
                                }}>
                                    Saved Themes
                                </h3>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                    gap: '12px',
                                }}>
                                    {savedBasicThemes.map((theme) => (
                                        <button
                                            key={theme.id}
                                            onClick={() => {
                                                setSelectedTheme(theme.id)
                                                setCustomColors(theme.colors)
                                                setIsDark(theme.isDark)
                                                setBaseBg(theme.colors.bgBase || (theme.isDark ? DARK_BG : LIGHT_BG))
                                                setEditingThemeId(null)
                                                setThemeName('')
                                                applyThemeColors(theme.colors, theme.isDark)
                                                saveTheme(theme.id, theme.colors, theme.isDark, isAdvanced, selectedAccent, contrast, uiTint)
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()

                                                const menuWidth = 170
                                                const menuHeight = 140
                                                let x = e.clientX + 2
                                                let y = e.clientY + 2
                                                if (x + menuWidth > window.innerWidth) {
                                                    x = e.clientX - menuWidth - 2
                                                }
                                                if (y + menuHeight > window.innerHeight) {
                                                    y = e.clientY - menuHeight - 2
                                                }
                                                setContextMenu({
                                                    themeId: theme.id,
                                                    x: Math.max(4, x),
                                                    y: Math.max(4, y)
                                                })
                                            }}
                                            style={{
                                                height: '70px',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                border: selectedTheme === theme.id
                                                    ? '2px solid var(--accent-color)'
                                                    : '1px solid var(--border-subtle)',
                                                cursor: 'pointer',
                                                transition: 'all 150ms ease',
                                                display: 'flex',
                                                flexDirection: 'row',
                                                boxShadow: selectedTheme === theme.id ? '0 0 0 2px var(--accent-color-light)' : 'none',
                                            }}
                                        >
                                            <div style={{
                                                width: '40px',
                                                background: theme.colors.accent,
                                                flexShrink: 0,
                                            }} />
                                            <div style={{
                                                flex: 1,
                                                background: theme.colors.bgBase,
                                                display: 'flex',
                                                alignItems: 'flex-end',
                                                padding: '8px 10px',
                                                minWidth: 0,
                                            }}>
                                                <span 
                                                    title={theme.name}
                                                    style={{
                                                        fontSize: '11px',
                                                        fontWeight: 500,
                                                        color: theme.isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        wordBreak: 'break-word',
                                                        lineHeight: 1.3,
                                                    }}>
                                                    {theme.name}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Save Button for Basic Themes */}
                        <div style={{ marginTop: '20px' }}>
                            <button
                                onClick={() => {
                                    // Get current derived colors
                                    const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                    const bgBase = isDark ? DARK_BG : LIGHT_BG
                                    const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, uiTint)
                                    
                                    // Store these colors for the save dialog
                                    setCustomColors(derivedColors)
                                    setEditingThemeId(null)
                                    setThemeName('')
                                    setSaveDialogOpen(true)
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 150ms',
                                }}
                            >
                                <IconDeviceFloppy size={16} />
                                Save as Custom Theme
                            </button>
                        </div>

                    </TabsContent>

                    <TabsContent value="custom">
                        {/* Custom Themes Section - Shows advanced custom themes */}
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}>
                                <IconAdjustments size={12} />
                                Advanced Themes {savedAdvancedThemes.length > 0 && `(${savedAdvancedThemes.length})`}
                            </h3>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: '16px',
                            }}>
                                {/* Saved Custom Themes - Filter to show advanced themes in Advanced tab */}
                                {savedAdvancedThemes.map((theme) => {
                                    const hasAccentGradient = theme.colors.accent?.includes('gradient')
                                    return (
                                    <div
                                        key={theme.id}
                                        style={{
                                            position: 'relative',
                                        }}
                                        onMouseEnter={(e) => {
                                            const deleteBtn = e.currentTarget.querySelector('[data-delete-btn]') as HTMLElement
                                            if (deleteBtn) deleteBtn.style.opacity = '1'
                                        }}
                                        onMouseLeave={(e) => {
                                            const deleteBtn = e.currentTarget.querySelector('[data-delete-btn]') as HTMLElement
                                            if (deleteBtn) deleteBtn.style.opacity = '0'
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            
                                            // Position menu directly at cursor with boundary clamping
                                            const menuWidth = 170
                                            const menuHeight = 140
                                            let x = e.clientX + 2
                                            let y = e.clientY + 2
                                            
                                            // Clamp to viewport bounds
                                            if (x + menuWidth > window.innerWidth) {
                                                x = e.clientX - menuWidth - 2
                                            }
                                            if (y + menuHeight > window.innerHeight) {
                                                y = e.clientY - menuHeight - 2
                                            }
                                            
                                            setContextMenu({
                                                themeId: theme.id,
                                                x: Math.max(4, x),
                                                y: Math.max(4, y)
                                            })
                                        }}
                                    >
                                        <button
                                            onClick={() => {
                                                // Single-click: select theme (don't open sidebar)
                                                setSelectedTheme(theme.id)
                                                setCustomColors(theme.colors)
                                                setIsDark(theme.isDark)
                                                setBaseBg(theme.colors.bgBase || (theme.isDark ? DARK_BG : LIGHT_BG))
                                                setEditingThemeId(null)
                                                setThemeName('')
                                                applyThemeColors(theme.colors, theme.isDark)
                                                saveTheme(theme.id, theme.colors, theme.isDark, isAdvanced, selectedAccent, contrast, uiTint)
                                            }}
                                            onDoubleClick={() => handleEditTheme(theme.id, theme.colors, theme.isDark, theme.name)}
                                            title={`${theme.name}\nDouble-click to edit`}
                                            style={{
                                                width: '100%',
                                                height: '90px',
                                                borderRadius: '10px',
                                                overflow: 'hidden',
                                                border: selectedTheme === theme.id
                                                    ? '2px solid var(--accent-color)'
                                                    : `1px solid ${theme.colors.borderDefault || 'var(--border-subtle)'}`,
                                                cursor: 'pointer',
                                                transition: 'all 150ms ease, transform 100ms ease',
                                                display: 'flex',
                                                flexDirection: 'row',
                                                position: 'relative',
                                                boxShadow: selectedTheme === theme.id
                                                    ? '0 0 0 3px var(--accent-color-light)'
                                                    : '0 2px 8px rgba(0,0,0,0.1)',
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                            {/* Left: Accent color bar (supports gradient) */}
                                            <div style={{
                                                width: '50px',
                                                background: theme.colors.accent,
                                                flexShrink: 0,
                                            }} />
                                            {/* Right: Background + Name - Fixed long name handling */}
                                            <div style={{
                                                flex: 1,
                                                background: theme.colors.bgBase,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'flex-end',
                                                padding: '10px 12px',
                                                minWidth: 0, // Allow flex child to shrink
                                            }}>
                                                <span 
                                                    title={theme.name}
                                                    style={{
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        color: theme.isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                                                        lineHeight: 1.3,
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        wordBreak: 'break-word',
                                                    }}>
                                                    {theme.name}
                                                </span>
                                                <span style={{
                                                    fontSize: '10px',
                                                    color: theme.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                                    marginTop: '3px',
                                                    flexShrink: 0,
                                                }}>
                                                    {theme.isDark ? 'Dark' : 'Light'}{hasAccentGradient ? ' • Gradient' : ''}
                                                </span>
                                            </div>
                                            {/* Selected indicator */}
                                            {selectedTheme === theme.id && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '8px',
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '50%',
                                                    background: 'var(--accent-gradient)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}>
                                                    <IconCheck size={12} color="#fff" />
                                                </div>
                                            )}
                                        </button>
                                        {/* Delete button - visible on hover */}
                                        <button
                                            data-delete-btn
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeleteConfirm({ themeId: theme.id, themeName: theme.name })
                                            }}
                                            title="Delete theme"
                                            style={{
                                                position: 'absolute',
                                                top: '-6px',
                                                right: '-6px',
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '50%',
                                                background: '#ef4444',
                                                border: '2px solid var(--bg-elevated)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                opacity: 0,
                                                transition: 'opacity 150ms, transform 100ms',
                                                zIndex: 5,
                                            }}
                                        >
                                            <IconX size={10} color="#fff" />
                                        </button>
                                    </div>
                                )})}
                                {/* Create Theme Button - Matching new card size */}
                                <button
                                    onClick={handleCustomThemeStart}
                                    title="Create custom theme"
                                    style={{
                                        width: '100%',
                                        height: '90px',
                                        borderRadius: '10px',
                                        background: selectedTheme === 'custom'
                                            ? 'var(--accent-gradient)'
                                            : 'var(--bg-elevated)',
                                        border: selectedTheme === 'custom'
                                            ? '2px solid var(--accent-color)'
                                            : '1px dashed var(--border-default)',
                                        cursor: 'pointer',
                                        transition: 'all 150ms ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexDirection: 'row',
                                        gap: '8px',
                                        color: selectedTheme === 'custom' ? '#fff' : 'var(--text-tertiary)',
                                    }}
                                >
                                    <IconPlus size={20} />
                                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Create New</span>
                                </button>
                            </div>
                        </div>


                    </TabsContent>
                </Tabs>

                {/* Element Preview / Playground - Enhanced Interactive Preview */}
                <div style={{ marginTop: '32px' }}>
                    <h3 style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        marginBottom: '16px',
                    }}>
                        Interactive Preview
                    </h3>

                    <div style={{
                        display: 'grid',
                        gap: '16px',
                    }}>
                        {/* Switches & Checkboxes Row */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    Toggle Controls
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    Interactive switch states
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <Switch checked={previewToggle1} onCheckedChange={setPreviewToggle1} />
                                <Switch checked={previewToggle2} onCheckedChange={setPreviewToggle2} />
                            </div>
                        </div>

                        {/* Buttons Row - Enhanced */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    Buttons
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    All button variants
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button style={{
                                    padding: '8px 16px',
                                    background: 'var(--accent-gradient)',
                                    backgroundRepeat: 'no-repeat',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'opacity 150ms',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                >
                                    Primary
                                </button>
                                <button style={{
                                    padding: '8px 16px',
                                    background: 'var(--bg-elevated)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 150ms',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                >
                                    Secondary
                                </button>
                                <button style={{
                                    padding: '8px 16px',
                                    background: 'transparent',
                                    color: 'var(--accent-color)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 150ms',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-color-light)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    Ghost
                                </button>
                            </div>
                        </div>

                        {/* Input Fields Row */}
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Form Inputs
                            </div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <input 
                                    type="text" 
                                    placeholder="Text input..."
                                    style={{
                                        flex: '1 1 150px',
                                        padding: '10px 12px',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)',
                                        fontSize: '13px',
                                        outline: 'none',
                                        transition: 'border-color 150ms',
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                                />
                                <Select value={previewSelect} onValueChange={setPreviewSelect}>
                                    <SelectTrigger style={{
                                        flex: '1 1 120px',
                                        padding: '10px 12px',
                                        height: '38px',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)',
                                        fontSize: '13px',
                                    }}>
                                        <SelectValue placeholder="Select option" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="option-1">Option 1</SelectItem>
                                        <SelectItem value="option-2">Option 2</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Badges & Tags Row */}
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Badges & Status
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{
                                    padding: '4px 10px',
                                    background: 'var(--accent-gradient)',
                                    backgroundRepeat: 'no-repeat',
                                    color: '#fff',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                }}>Primary</span>
                                <span style={{
                                    padding: '4px 10px',
                                    background: 'var(--accent-color-light)',
                                    color: 'var(--accent-color)',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                }}>Secondary</span>
                                <span style={{
                                    padding: '4px 10px',
                                    background: '#22c55e20',
                                    color: '#22c55e',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                }}>Success</span>
                                <span style={{
                                    padding: '4px 10px',
                                    background: '#f5970820',
                                    color: '#f59e0b',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                }}>Warning</span>
                                <span style={{
                                    padding: '4px 10px',
                                    background: '#ef444420',
                                    color: '#ef4444',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                }}>Error</span>
                            </div>
                        </div>

                        {/* Progress & Loading Row */}
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Progress Indicators
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{
                                    height: '8px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{
                                        width: '70%',
                                        height: '100%',
                                        background: isGradientValue(customColors.accent || '') 
                                            ? generateGradientCSS({ 
                                                type: 'linear', 
                                                angle: 90, 
                                                stops: (() => {
                                                    // Parse gradient stops from CSS
                                                    const accent = customColors.accent || ''
                                                    const match = accent.match(/linear-gradient\((\d+)deg,\s*(.+)\)/)
                                                    if (match) {
                                                        const stopStr = match[2]
                                                        const stops = stopStr.split(/,(?![^(]*\))/).map((s, i) => {
                                                            const parts = s.trim().split(/\s+/)
                                                            return {
                                                                id: `s${i}`,
                                                                color: parts[0],
                                                                position: parseInt(parts[1]) || (i === 0 ? 0 : 100)
                                                            }
                                                        })
                                                        return stops
                                                    }
                                                    return [{ id: 's1', color: '#3b82f6', position: 0 }, { id: 's2', color: '#8b5cf6', position: 100 }]
                                                })()
                                            })
                                            : 'var(--accent-color)',
                                        backgroundRepeat: 'no-repeat',
                                        borderRadius: '4px',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                    <span>70% Complete</span>
                                    <span>7 of 10 tasks</span>
                                </div>
                            </div>
                        </div>

                        {/* Text Colors Row */}
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Typography Hierarchy
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Primary Text - Headlines</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Secondary Text - Body content and descriptions</span>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Tertiary Text - Captions and labels</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Muted Text - Disabled or hint text</span>
                            </div>
                        </div>

                        {/* Card Preview - Enhanced */}
                        <div style={{
                            padding: '20px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-default)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Card Component
                                </div>
                                <span style={{
                                    padding: '2px 8px',
                                    background: 'var(--accent-color-light)',
                                    color: 'var(--accent-color)',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                }}>NEW</span>
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
                                This is how cards and elevated surfaces appear with your current theme settings. Hover states and interactions are also shown.
                            </p>
                            <div style={{
                                padding: '14px',
                                background: 'var(--bg-surface)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        background: 'var(--accent-gradient)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                    }}>M</div>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Nested Element</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Surface with avatar</div>
                                    </div>
                                </div>
                                <button style={{
                                    padding: '6px 12px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}>View</button>
                            </div>
                        </div>

                        {/* Border Samples */}
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--bg-surface)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Border Hierarchy
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Subtle</span>
                                </div>
                                <div style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Default</span>
                                </div>
                                <div style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-strong)',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Strong</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sliding Right Sidebar - Color Editor */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '320px',
                background: 'var(--bg-elevated)',
                borderLeft: '1px solid var(--border-default)',
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: sidebarOpen ? '-4px 0 24px rgba(0, 0, 0, 0.15)' : 'none',
                overflow: 'hidden',
            }}>
                {/* Sidebar Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <IconPalette size={18} style={{ color: 'var(--accent-color)' }} />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Customize Theme
                        </span>
                    </div>
                    <button
                        onClick={handleSidebarClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                        }}
                    >
                        <IconX size={16} />
                    </button>
                </div>

                {/* Sidebar Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}>
                    {/* Simple/Advanced Mode Toggle */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isAdvanced ? <IconAdjustments size={16} /> : <IconSparkles size={16} />}
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                {isAdvanced ? 'Advanced Mode' : 'Simple Mode'}
                            </span>
                        </div>
                        <Switch
                            checked={isAdvanced}
                            onCheckedChange={(checked) => {
                                setIsAdvanced(checked)
                                saveTheme(selectedTheme, customColors, isDark, checked)
                            }}
                        />
                    </div>

                    {/* Dark/Light Toggle */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isDark ? <IconMoon size={16} /> : <IconSun size={16} />}
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                {isDark ? 'Dark Mode' : 'Light Mode'}
                            </span>
                        </div>
                        <Switch
                            checked={!isDark}
                            onCheckedChange={(checked) => handleDarkModeToggle(!checked)}
                        />
                    </div>

                    {/* Color Controls - Simplified or Advanced */}
                    {!isAdvanced ? (
                        /* Simple Mode - Only 2 color pickers */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                marginBottom: '4px',
                            }}>
                                Colors
                            </span>

                            {/* Background Color */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                background: 'var(--bg-surface)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Background</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Base app color</div>
                                </div>
                                <AdvancedColorPicker value={getCurrentColor('bgBase')} onChange={(val) => handleColorChange('bgBase', val)}>
                                    <AdvancedColorPickerTrigger
                                        className="h-8 w-8 p-0 border-[var(--border-default)]"
                                    />
                                    <AdvancedColorPickerContent showOpacity />
                                </AdvancedColorPicker>
                            </div>

                            {/* Accent Color */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                background: 'var(--bg-surface)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Accent</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Buttons & highlights</div>
                                </div>
                                <AdvancedColorPicker
                                    value={getCurrentColor('accent')}
                                    onChange={(val) => handleColorChange('accent', val)}
                                    enableGradient
                                    onGradientChange={(g) => handleColorChange('accent', generateGradientCSS(g))}
                                >
                                    <AdvancedColorPickerTrigger
                                        className="h-8 w-8 p-0 border-[var(--border-default)]"
                                    />
                                    <AdvancedColorPickerContent showOpacity showGradientMode />
                                </AdvancedColorPicker>
                            </div>

                            {/* Contrast Slider */}
                            <div style={{
                                padding: '12px 14px',
                                background: 'var(--bg-surface)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '8px',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Contrast</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Borders & surfaces</div>
                                    </div>
                                    <input
                                        type="text"
                                        value={`${contrast}%`}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/%/g, '')
                                            if (/^\d*$/.test(raw) && raw.length <= 3) {
                                                const val = raw === '' ? 15 : parseInt(raw)
                                                setContrast(Math.min(100, Math.max(15, val || 15)))
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const raw = e.target.value.replace(/%/g, '')
                                            const val = parseInt(raw) || 30
                                            const clamped = Math.min(100, Math.max(15, val))
                                            setContrast(clamped)
                                            // Preserve current accent (might be gradient)
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, clamped, uiTint)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, clamped, uiTint)
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                        style={{
                                            width: '44px',
                                            fontSize: '12px',
                                            color: 'var(--text-tertiary)',
                                            background: 'transparent',
                                            border: '1px solid transparent',
                                            borderRadius: '4px',
                                            textAlign: 'right',
                                            padding: '2px 4px',
                                        }}
                                    />
                                </div>
                                <ThemeSlider
                                    min={15}
                                    max={100}
                                    value={contrast}
                                    onChange={(newContrast) => {
                                        setContrast(newContrast)
                                        const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                        const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                        const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, newContrast, uiTint)
                                        setCustomColors(derivedColors)
                                        applyThemeColors(derivedColors, isDark)
                                        saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, newContrast, uiTint)
                                    }}
                                />
                            </div>

                            {/* UI Tint Slider - Disabled when using gradient accent */}
                            {(() => {
                                const hasGradientAccent = isAccentGradient(customColors.accent || '')
                                return (
                            <div style={{
                                padding: '12px 14px',
                                background: 'var(--bg-surface)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                opacity: hasGradientAccent ? 0.5 : 1,
                                pointerEvents: hasGradientAccent ? 'none' : 'auto',
                            }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '8px',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>UI Tint</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                            {hasGradientAccent ? 'Disabled for gradients' : 'Accent color bleed'}
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={`${uiTint}%`}
                                        disabled={hasGradientAccent}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/%/g, '')
                                            if (/^\d*$/.test(raw) && raw.length <= 3) {
                                                const val = raw === '' ? 0 : parseInt(raw)
                                                setUiTint(Math.min(100, Math.max(0, val || 0)))
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const raw = e.target.value.replace(/%/g, '')
                                            const val = parseInt(raw) || 0
                                            const clamped = Math.min(100, Math.max(0, val))
                                            setUiTint(clamped)
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, clamped)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, clamped)
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                        style={{
                                            width: '44px',
                                            fontSize: '12px',
                                            color: 'var(--text-tertiary)',
                                            background: 'transparent',
                                            border: '1px solid transparent',
                                            borderRadius: '4px',
                                            textAlign: 'right',
                                            padding: '2px 4px',
                                        }}
                                    />
                                </div>
                                <ThemeSlider
                                    min={0}
                                    max={100}
                                    value={uiTint}
                                    disabled={hasGradientAccent}
                                    onChange={(newTint) => {
                                        setUiTint(newTint)
                                        const currentAccent = customColors.accent || (selectedAccent === 'default' ? '#6468F0' : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                        const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                        const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, newTint)
                                        setCustomColors(derivedColors)
                                        applyThemeColors(derivedColors, isDark)
                                        saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, newTint)
                                    }}
                                />
                            </div>
                                )
                            })()}

                            <p style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '8px',
                                fontStyle: 'italic',
                            }}>
                                Other colors are automatically derived.
                            </p>
                        </div>
                    ) : (
                        /* Advanced Mode - All color categories */
                        <>
                            {advancedCategories.map((category) => (
                                <div key={category.name} style={{ marginBottom: '8px' }}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        display: 'block',
                                        marginBottom: '8px',
                                    }}>
                                        {category.name}
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {category.colors.map((color) => {
                                            const allowGradient = category.name === 'Accent'
                                            return (
                                            <div
                                                key={color.key}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    background: 'var(--bg-surface)',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-subtle)',
                                                }}
                                            >
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{color.label}</span>
                                                <AdvancedColorPicker
                                                    value={getCurrentColor(color.key)}
                                                    onChange={(val) => handleColorChange(color.key, val)}
                                                    enableGradient={allowGradient}
                                                    onGradientChange={allowGradient ? (g) => handleColorChange(color.key, generateGradientCSS(g)) : undefined}
                                                >
                                                    <AdvancedColorPickerTrigger
                                                        className="h-6 w-6 p-0 border-[var(--border-default)]"
                                                    />
                                                    <AdvancedColorPickerContent showOpacity showGradientMode={allowGradient} />
                                                </AdvancedColorPicker>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Sidebar Footer - Save Button (fixed at bottom) */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    gap: '8px',
                    flexShrink: 0,
                    background: 'var(--bg-elevated)',
                }}>
                    <button
                        onClick={() => {
                            // Clear previous theme since user is explicitly saving
                            setPreviousTheme(null)
                            setSaveDialogOpen(true)
                        }}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'var(--accent-gradient)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 150ms',
                        }}
                    >
                        <IconDeviceFloppy size={16} />
                        Save Theme
                    </button>
                </div>
            </div>

            {/* Save Theme Dialog Overlay */}
            {
                saveDialogOpen && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 200,
                    }} onClick={() => setSaveDialogOpen(false)}>
                        <div
                            style={{
                                background: 'var(--bg-elevated)',
                                borderRadius: '12px',
                                border: '1px solid var(--border-default)',
                                padding: '24px',
                                width: '320px',
                                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                                {editingThemeId ? 'Save Changes' : 'Save Custom Theme'}
                            </div>
                            <input
                                type="text"
                                placeholder="Theme name"
                                value={themeName}
                                onChange={(e) => setThemeName(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none',
                                    marginBottom: '16px',
                                }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setSaveDialogOpen(false)}
                                    style={{
                                        flex: 1,
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-default)',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveTheme}
                                    disabled={!themeName.trim()}
                                    style={{
                                        flex: 1,
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: themeName.trim() ? 'var(--accent-gradient)' : 'var(--bg-surface)',
                                        color: themeName.trim() ? '#fff' : 'var(--text-tertiary)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: themeName.trim() ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {editingThemeId ? 'Save Changes' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Context Menu - Rendered via portal for correct positioning */}
            {contextMenu && typeof document !== 'undefined' && createPortal(
                <>
                    {/* Overlay to close menu on click */}
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu(null)
                        }}
                    />

                    {/* Menu - positioned directly at cursor */}
                    <div style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 10000,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '10px',
                        padding: '4px',
                        minWidth: '168px',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                    }}>
                        <button
                            onClick={() => {
                                const theme = allSavedThemes.find((t) => t.id === contextMenu.themeId)
                                if (theme) {
                                    handleEditTheme(theme.id, theme.colors, theme.isDark, theme.name)
                                }
                                setContextMenu(null)
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minHeight: '28px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <IconEdit size={14} />
                            Edit Theme
                        </button>

                        <button
                            onClick={() => {
                                handleDuplicateCustomTheme(contextMenu.themeId)
                                setContextMenu(null)
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minHeight: '28px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <IconCopy size={14} />
                            Duplicate
                        </button>

                        <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />

                        <button
                            onClick={() => {
                                const theme = allSavedThemes.find((t) => t.id === contextMenu.themeId)
                                if (theme) {
                                    setDeleteConfirm({ themeId: theme.id, themeName: theme.name })
                                }
                                setContextMenu(null)
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minHeight: '28px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: 'hsl(var(--destructive))',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 85, 85, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <IconTrash size={14} />
                            Delete
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* Delete Theme Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent style={{
                    maxWidth: '450px',
                    padding: '24px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    outline: 'none',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}>
                    <AlertDialogHeader style={{ marginBottom: '16px' }}>
                        <AlertDialogTitle style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '8px',
                        }}>
                            Delete Theme?
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                        }}>
                            Are you sure you want to delete "{deleteConfirm?.themeName}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter style={{
                        display: 'flex',
                        gap: '8px',
                        justifyContent: 'flex-end',
                    }}>
                        <AlertDialogCancel style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            outline: 'none',
                        }}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleteConfirm) {
                                    handleDeleteCustomTheme(deleteConfirm.themeId)
                                    setDeleteConfirm(null)
                                }
                            }}
                            style={{
                                padding: '10px 16px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'white',
                                backgroundColor: '#ef4444',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >
                            Delete Theme
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    )
}
