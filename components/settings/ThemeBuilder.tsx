"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { IconCheck, IconSun, IconMoon, IconAdjustments, IconSparkles, IconPlus, IconX, IconPalette, IconEdit, IconTrash, IconCopy, IconWorld, IconShare, IconCloudUpload, IconDownload, IconSearch } from "@tabler/icons-react"
import { AdvancedColorPicker, AdvancedColorPickerTrigger, AdvancedColorPickerContent, generateGradientCSS, isGradientValue } from "../ui/advanced-color-picker"
import { Switch } from "../ui/switch"
import { Slider } from "../ui/slider"
import { Input } from "../ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "../ui/select"
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
import { Button } from "../ui/button"
import { applyThemeColors, loadAndApplySavedTheme, LIGHT_BORDER_ALPHA } from "../../lib/theme"
import { CATALOG_EXPLORE_THEMES, type ExploreTheme } from "../../lib/theme-catalog"
import { decodeThemeShareCode, encodeThemeShareCode, ThemeShareError } from "../../lib/theme-share"
import { SYNTAX_THEME_PRESETS, matchSyntaxPreset, findSyntaxPreset } from "../../lib/syntax-themes"
import { buildSimpleThemeColors, getAccentColor, getBaseBackground, modeFromAdvanced, type ThemeCreateMode } from "./themeBuilderState"
import { useIsMobile } from "../ui/use-mobile"

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

const DEFAULT_ACCENT = '#4338CA'
const DARK_BG = '#09090B'
const LIGHT_BG = '#F5F5F7'

interface ThemeSliderProps {
    label: string
    min: number
    max: number
    value: number
    onChange: (value: number) => void
    disabled?: boolean
}

function ThemeSlider({ label, min, max, value, onChange, disabled = false }: ThemeSliderProps) {
    return (
        <Slider
            aria-label={label}
            value={[value]}
            min={min}
            max={max}
            step={1}
            disabled={disabled}
            onValueChange={(values) => onChange((Array.isArray(values) ? values[0] : values) ?? min)}
            className="w-full py-1 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:border [&_[data-slot=slider-track]]:border-[var(--border-subtle)] [&_[data-slot=slider-track]]:bg-[var(--bg-elevated)] [&_[data-slot=slider-range]]:[background:var(--accent-gradient)] [&_[data-slot=slider-thumb]]:border-[var(--accent-color)] [&_[data-slot=slider-thumb]]:bg-white"
        />
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
    return DEFAULT_ACCENT
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
    const accentLight = accentRgb
        ? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${isDark ? 0.15 : 0.12})`
        : adjustAlpha(0.15, isDark)

    // Border colours. Light mode uses its own ramp — see LIGHT_BORDER_ALPHA in lib/theme.ts.
    const borderSubtle = adjustAlpha((isDark ? 0.08 : LIGHT_BORDER_ALPHA.subtle) * contrastFactor, isDark)
    const borderDefault = adjustAlpha((isDark ? 0.12 : LIGHT_BORDER_ALPHA.default) * contrastFactor, isDark)
    const borderStrong = adjustAlpha((isDark ? 0.20 : LIGHT_BORDER_ALPHA.strong) * contrastFactor, isDark)

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

// UI accent palette - shadcn's darker surface/button colors. Chart tokens keep
// the brighter legacy scale separately in CSS.
const ACCENT_COLORS = {
    neutral: '#404040',
    stone: '#44403C',
    zinc: '#3F3F46',
    slate: '#334155',
    gray: '#374151',
    mauve: '#524959',
    olive: '#435147',
    mist: '#3D5155',
    taupe: '#554B3E',
    red: '#B91C1C',
    orange: '#C2410C',
    amber: '#B45309',
    yellow: '#A16207',
    lime: '#4D7C0F',
    green: '#15803D',
    emerald: '#047857',
    teal: '#0F766E',
    cyan: '#0E7490',
    sky: '#0369A1',
    blue: '#1D4ED8',
    indigo: DEFAULT_ACCENT,
    violet: '#6D28D9',
    purple: '#7E22CE',
    fuchsia: '#A21CAF',
    pink: '#BE185D',
    rose: '#BE123C',
}

function getPresetAccent(accentName?: string) {
    if (!accentName || accentName === 'default') return DEFAULT_ACCENT
    return ACCENT_COLORS[accentName as keyof typeof ACCENT_COLORS] || DEFAULT_ACCENT
}

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
        colors: deriveFullColors(DARK_BG, DEFAULT_ACCENT, true)
    },
    // Default light theme
    {
        id: 'light-default',
        name: 'Light',
        isDark: false,
        colors: deriveFullColors(LIGHT_BG, DEFAULT_ACCENT, false)
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
        colors: deriveFullColors(DARK_BG, DEFAULT_ACCENT, true)
    },
]

// ============================================
// COLOR CATEGORIES
// ============================================

const simplifiedCategories = [
    { key: 'bgBase', label: 'Background', description: 'Main background colour' },
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

interface ThemeBuilderProps {
    onCreateTheme?: (mode: ThemeCreateMode, theme?: SavedCustomTheme) => void
    isAdministrator?: boolean
}

const SHOW_LEGACY_THEME_PREVIEW_BLOCKS = false
const SHOW_LEGACY_THEME_BUILDER_BLOCKS = false
const THEME_EDITOR_WIDTH = 360
const SYNTAX_STORAGE_KEY = 'millennium-syntax-highlighting'

interface SyntaxHighlightSettings {
    fontFamily: string
    background: string
    foreground: string
    keyword: string
    string: string
    number: string
    comment: string
    type: string
}

const SYNTAX_FONT_OPTIONS = [
    { label: 'Geist Mono', value: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' },
    { label: 'SF Mono', value: '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace' },
    { label: 'JetBrains Mono', value: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'Fira Code', value: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'Cascadia Code', value: '"Cascadia Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'Source Code Pro', value: '"Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'IBM Plex Mono', value: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'Monaco', value: 'Monaco, "SF Mono", ui-monospace, Consolas, monospace' },
    { label: 'Consolas', value: 'Consolas, "Liberation Mono", ui-monospace, monospace' },
]

const DEFAULT_SYNTAX_SETTINGS: SyntaxHighlightSettings = {
    fontFamily: SYNTAX_FONT_OPTIONS[0].value,
    background: '#0b0d12',
    foreground: '#d7dae0',
    keyword: '#8da2fb',
    string: '#7dd3c7',
    number: '#facc6b',
    comment: '#737987',
    type: '#60a5fa',
}

function readSyntaxSettings(): SyntaxHighlightSettings {
    if (typeof window === 'undefined') return DEFAULT_SYNTAX_SETTINGS
    try {
        const parsed = JSON.parse(window.localStorage.getItem(SYNTAX_STORAGE_KEY) || '{}')
        return { ...DEFAULT_SYNTAX_SETTINGS, ...parsed }
    } catch {
        return DEFAULT_SYNTAX_SETTINGS
    }
}

function applySyntaxSettings(settings: SyntaxHighlightSettings) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--syntax-font-family', settings.fontFamily)
    root.style.setProperty('--syntax-bg', settings.background)
    root.style.setProperty('--syntax-fg', settings.foreground)
    root.style.setProperty('--syntax-keyword', settings.keyword)
    root.style.setProperty('--syntax-string', settings.string)
    root.style.setProperty('--syntax-number', settings.number)
    root.style.setProperty('--syntax-comment', settings.comment)
    root.style.setProperty('--syntax-type', settings.type)
}

type SyntaxTokenKey = Extract<keyof SyntaxHighlightSettings, 'keyword' | 'string' | 'number' | 'comment' | 'type'>

interface SyntaxSegment {
    text: string
    token?: SyntaxTokenKey
}

// Long enough to fill the preview panel and exercise every token colour.
const SYNTAX_PREVIEW_CODE: SyntaxSegment[][] = [
    [{ text: '// Millennium theme engine — live preview', token: 'comment' }],
    [{ text: 'import', token: 'keyword' }, { text: ' { applyThemeColors } ' }, { text: 'from', token: 'keyword' }, { text: ' ' }, { text: '"@/lib/theme"', token: 'string' }],
    [],
    [{ text: 'export interface', token: 'keyword' }, { text: ' ' }, { text: 'ThemeConfig', token: 'type' }, { text: ' {' }],
    [{ text: '  name: ' }, { text: 'string', token: 'type' }],
    [{ text: '  accent: ' }, { text: 'string', token: 'type' }],
    [{ text: '  contrast: ' }, { text: 'number', token: 'type' }],
    [{ text: '  isDark: ' }, { text: 'boolean', token: 'type' }],
    [{ text: '}' }],
    [],
    [{ text: 'const', token: 'keyword' }, { text: ' PRESETS: ' }, { text: 'Record', token: 'type' }, { text: '<' }, { text: 'string', token: 'type' }, { text: ', ' }, { text: 'ThemeConfig', token: 'type' }, { text: '> = {' }],
    [{ text: '  midnight: { name: ' }, { text: '"Midnight"', token: 'string' }, { text: ', accent: ' }, { text: '"#4338CA"', token: 'string' }, { text: ', contrast: ' }, { text: '68', token: 'number' }, { text: ', isDark: ' }, { text: 'true', token: 'keyword' }, { text: ' },' }],
    [{ text: '  daylight: { name: ' }, { text: '"Daylight"', token: 'string' }, { text: ', accent: ' }, { text: '"#0EA5E9"', token: 'string' }, { text: ', contrast: ' }, { text: '34', token: 'number' }, { text: ', isDark: ' }, { text: 'false', token: 'keyword' }, { text: ' },' }],
    [{ text: '}' }],
    [],
    [{ text: '/* Every surface is derived from one accent and one background. */', token: 'comment' }],
    [{ text: 'export function', token: 'keyword' }, { text: ' buildTheme(preset: ' }, { text: 'string', token: 'type' }, { text: '): ' }, { text: 'ThemeConfig', token: 'type' }, { text: ' {' }],
    [{ text: '  const', token: 'keyword' }, { text: ' config = PRESETS[preset] ?? PRESETS.midnight' }],
    [{ text: '  const', token: 'keyword' }, { text: ' steps = [' }, { text: '0.04', token: 'number' }, { text: ', ' }, { text: '0.08', token: 'number' }, { text: ', ' }, { text: '0.16', token: 'number' }, { text: ', ' }, { text: '0.32', token: 'number' }, { text: ']' }],
    [],
    [{ text: '  return', token: 'keyword' }, { text: ' {' }],
    [{ text: '    ...config,' }],
    [{ text: '    contrast: ' }, { text: 'Math', token: 'type' }, { text: '.min(' }, { text: '100', token: 'number' }, { text: ', config.contrast + steps.length),' }],
    [{ text: '  }' }],
    [{ text: '}' }],
    [],
    [{ text: 'const', token: 'keyword' }, { text: ' theme = buildTheme(' }, { text: '"midnight"', token: 'string' }, { text: ')' }],
    [{ text: 'applyThemeColors(theme, theme.isDark) ' }, { text: '// repaints instantly', token: 'comment' }],
]

// ============================================
// THEME GALLERY
// ============================================

const THEME_CARD_HEIGHT = 208
const THEME_CARD_FOOTER_HEIGHT = 58

// Gradients must be painted through background-image so the drift animation's
// background-size is not reset by the background shorthand.
function paintStyle(value?: string): React.CSSProperties {
    if (!value) return {}
    return isGradientValue(value) ? { backgroundImage: value } : { backgroundColor: value }
}

function driftClass(value?: string): string | undefined {
    return value && isGradientValue(value) ? 'mm-gradient-drift' : undefined
}

interface ThemeChipProps {
    label: string
    accented?: boolean
}

function ThemeChip({ label, accented = false }: ThemeChipProps) {
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '17px',
            padding: '0 6px',
            borderRadius: '5px',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.3px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            border: `1px solid ${accented ? 'var(--accent-color)' : 'var(--border-subtle)'}`,
            color: accented ? 'var(--accent-color)' : 'var(--text-tertiary)',
            background: accented ? 'var(--accent-color-light)' : 'var(--bg-surface)',
        }}>
            {label}
        </span>
    )
}

interface ThemeCardActionProps {
    label: string
    onClick: () => void
    destructive?: boolean
    children: React.ReactNode
}

function ThemeCardAction({ label, onClick, destructive = false, children }: ThemeCardActionProps) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={(event) => {
                event.stopPropagation()
                onClick()
            }}
            className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: destructive ? 'var(--destructive)' : 'var(--text-secondary)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            }}
        >
            {children}
        </button>
    )
}

interface ThemePreviewMockProps {
    colors: Partial<ThemeColors>
    height: number
}

/** Miniature dashboard rendered in a theme's own palette, shared by library and explore cards. */
const ThemePreviewMock = React.memo(function ThemePreviewMock({ colors, height }: ThemePreviewMockProps) {
    const accent = colors.accent || DEFAULT_ACCENT
    const hairline = colors.borderSubtle || colors.borderDefault || 'rgba(128,128,128,0.28)'
    const bar = colors.borderStrong || colors.borderDefault || 'rgba(128,128,128,0.45)'
    const cardSurface = colors.bgSurface || colors.bgElevated || colors.bgBase
    const railSurface = colors.bgElevated || colors.bgSurface || colors.bgBase

    return (
        <div style={{ display: 'flex', height: `${height}px`, ...paintStyle(colors.bgBase) }}>
            <div style={{
                width: '56px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px 10px',
                borderRight: `1px solid ${hairline}`,
                ...paintStyle(railSurface),
            }}>
                <div
                    className={driftClass(accent)}
                    style={{ width: '16px', height: '16px', borderRadius: '5px', ...paintStyle(accent) }}
                />
                {[100, 74, 88, 62].map((width, index) => (
                    <div
                        key={index}
                        style={{ height: '5px', width: `${width}%`, borderRadius: '3px', opacity: 0.75, ...paintStyle(bar) }}
                    />
                ))}
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    height: '28px',
                    padding: '0 12px',
                    borderBottom: `1px solid ${hairline}`,
                }}>
                    <div style={{ height: '6px', width: '58px', borderRadius: '3px', ...paintStyle(bar) }} />
                    <div
                        className={driftClass(accent)}
                        style={{ marginLeft: 'auto', width: '10px', height: '10px', borderRadius: '50%', ...paintStyle(accent) }}
                    />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '9px', padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '9px' }}>
                        {[0, 1].map((index) => (
                            <div
                                key={index}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    height: '44px',
                                    padding: '9px',
                                    borderRadius: '8px',
                                    border: `1px solid ${hairline}`,
                                    ...paintStyle(cardSurface),
                                }}
                            >
                                <div style={{ height: '5px', width: index === 0 ? '72%' : '54%', borderRadius: '3px', ...paintStyle(colors.textSecondary || bar) }} />
                                <div style={{ height: '5px', width: index === 0 ? '46%' : '66%', borderRadius: '3px', opacity: 0.7, ...paintStyle(bar) }} />
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div
                            className={driftClass(accent)}
                            style={{ height: '20px', width: '68px', borderRadius: '6px', flexShrink: 0, ...paintStyle(accent) }}
                        />
                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', opacity: 0.7, ...paintStyle(bar) }} />
                    </div>
                </div>
            </div>
        </div>
    )
})

interface ThemeCardFooterProps {
    name: string
    isDark: boolean
    isAdvanced: boolean
    accent: string
    trailing?: React.ReactNode
    subtitle?: string
}

function ThemeCardFooter({ name, isDark, isAdvanced, accent, trailing, subtitle }: ThemeCardFooterProps) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            height: `${THEME_CARD_FOOTER_HEIGHT}px`,
            padding: '0 14px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
        }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                    <ThemeChip label={isDark ? 'Dark' : 'Light'} />
                    {subtitle
                        ? <ThemeChip label={subtitle} />
                        : <ThemeChip label={isAdvanced ? 'Advanced' : 'Simple'} />}
                    {isGradientValue(accent) && <ThemeChip label="Gradient" accented />}
                </div>
            </div>
            {trailing}
        </div>
    )
}

interface ThemeGalleryCardProps {
    theme: SavedCustomTheme
    isSelected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onContextMenu: (event: React.MouseEvent) => void
}

function ThemeGalleryCard({ theme, isSelected, onSelect, onEdit, onDelete, onContextMenu }: ThemeGalleryCardProps) {
    const accent = theme.colors.accent || DEFAULT_ACCENT

    return (
        <div
            className="group transition-transform duration-150 ease-out hover:-translate-y-0.5"
            style={{ position: 'relative' }}
            onContextMenu={onContextMenu}
        >
            <button
                type="button"
                onClick={onSelect}
                onDoubleClick={onEdit}
                title={`${theme.name}\nDouble-click to edit`}
                style={{
                    display: 'block',
                    width: '100%',
                    height: `${THEME_CARD_HEIGHT}px`,
                    padding: 0,
                    textAlign: 'left',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid transparent' : '1px solid var(--border-subtle)',
                    background: isSelected
                        ? 'linear-gradient(var(--bg-elevated), var(--bg-elevated)) padding-box, var(--accent-gradient) border-box'
                        : 'var(--bg-elevated)',
                    boxShadow: isSelected
                        ? '0 0 0 3px var(--accent-color-light)'
                        : '0 1px 3px rgba(0,0,0,0.10)',
                    transition: 'box-shadow 160ms ease, border-color 160ms ease',
                }}
            >
                <ThemePreviewMock colors={theme.colors} height={THEME_CARD_HEIGHT - THEME_CARD_FOOTER_HEIGHT} />
                <ThemeCardFooter
                    name={theme.name}
                    isDark={theme.isDark}
                    isAdvanced={theme.isAdvanced}
                    accent={accent}
                    trailing={isSelected ? (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: 'var(--accent-gradient)',
                        }}>
                            <IconCheck size={13} color="#fff" />
                        </span>
                    ) : undefined}
                />
            </button>

            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                display: 'flex',
                gap: '6px',
            }}>
                <ThemeCardAction label="Edit theme" onClick={onEdit}>
                    <IconEdit size={13} />
                </ThemeCardAction>
                <ThemeCardAction label="Delete theme" onClick={onDelete} destructive>
                    <IconTrash size={13} />
                </ThemeCardAction>
            </div>
        </div>
    )
}

/**
 * Explore holds a couple of hundred cards, and every card is a miniature dashboard whose accent may
 * be an animated gradient. Mounting all of them at once stalls the gallery on open and leaves the
 * offscreen ones repainting forever, so a card stays an empty box of the right size until it comes
 * within a screen or so of the viewport, then keeps its preview for the rest of the session.
 */
const EXPLORE_CARD_ROOT_MARGIN = '700px 0px'

function useNearViewport<T extends HTMLElement>(): [React.MutableRefObject<T | null>, boolean] {
    const ref = React.useRef<T | null>(null)
    const [isNear, setIsNear] = React.useState(false)

    React.useEffect(() => {
        if (isNear) return
        const node = ref.current
        if (!node) return

        // Without the observer (older browsers, jsdom) every card renders eagerly, which is the
        // previous behaviour rather than a blank gallery.
        if (typeof IntersectionObserver === 'undefined') {
            setIsNear(true)
            return
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) setIsNear(true)
            },
            { rootMargin: EXPLORE_CARD_ROOT_MARGIN }
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [isNear])

    return [ref, isNear]
}

interface ExploreThemeCardProps {
    theme: ExploreTheme
    isInLibrary: boolean
    onUse: (theme: ExploreTheme) => void
    onContextMenu: (event: React.MouseEvent, theme: ExploreTheme) => void
}

const ExploreThemeCard = React.memo(function ExploreThemeCard({
    theme,
    isInLibrary,
    onUse,
    onContextMenu,
}: ExploreThemeCardProps) {
    const [cardRef, isNear] = useNearViewport<HTMLDivElement>()

    if (!isNear) {
        return (
            <div
                ref={cardRef}
                aria-hidden
                style={{
                    height: `${THEME_CARD_HEIGHT}px`,
                    borderRadius: '14px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                }}
            />
        )
    }

    return (
        <div
            ref={cardRef}
            className="group transition-transform duration-150 ease-out hover:-translate-y-0.5"
            style={{
                position: 'relative',
                // Lets the browser skip layout and paint for cards scrolled well out of view even
                // after they have mounted.
                contentVisibility: 'auto',
                containIntrinsicSize: `${THEME_CARD_HEIGHT}px`,
            }}
            onContextMenu={(event) => onContextMenu(event, theme)}
        >
            <button
                type="button"
                onClick={() => onUse(theme)}
                title={isInLibrary
                    ? `${theme.name}\nClick to apply the copy in your library`
                    : `${theme.name}\nClick to add to your library and apply`}
                style={{
                    display: 'block',
                    width: '100%',
                    height: `${THEME_CARD_HEIGHT}px`,
                    padding: 0,
                    textAlign: 'left',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                    transition: 'box-shadow 160ms ease, border-color 160ms ease',
                }}
            >
                <ThemePreviewMock colors={theme.colors} height={THEME_CARD_HEIGHT - THEME_CARD_FOOTER_HEIGHT} />
                <ThemeCardFooter
                    name={theme.name}
                    isDark={theme.isDark}
                    isAdvanced={theme.isAdvanced}
                    accent={theme.colors.accent}
                    subtitle={theme.isCommunity ? (theme.authorName || 'Community') : undefined}
                    trailing={isInLibrary ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            In library
                        </span>
                    ) : undefined}
                />
            </button>

            {/* Themes are only ever applied through the library, so the hover affordance states the
                single action instead of offering a preview that would not survive a reload. */}
            <div
                className="pointer-events-none absolute inset-x-0 flex justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                style={{ top: `${THEME_CARD_HEIGHT - THEME_CARD_FOOTER_HEIGHT - 46}px` }}
            >
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        height: '32px',
                        padding: '0 14px',
                        borderRadius: '999px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
                    }}
                >
                    {isInLibrary ? <IconCheck size={14} /> : <IconPlus size={14} />}
                    {isInLibrary ? 'Apply theme' : 'Add to library'}
                </span>
            </div>
        </div>
    )
})

interface ExploreFilterGroupProps<T extends string> {
    label: string
    options: readonly T[]
    value: T
    onChange: (value: T) => void
}

function ExploreFilterGroup<T extends string>({ label, options, value, onChange }: ExploreFilterGroupProps<T>) {
    return (
        <div
            role="group"
            aria-label={label}
            style={{
                display: 'flex',
                gap: '2px',
                padding: '2px',
                borderRadius: '9px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                flexShrink: 0,
            }}
        >
            {options.map((option) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    style={{
                        height: '28px',
                        padding: '0 12px',
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        background: value === option ? 'var(--accent-gradient)' : 'transparent',
                        color: value === option ? '#fff' : 'var(--text-secondary)',
                        transition: 'background-color 150ms ease, color 150ms ease',
                    }}
                >
                    {option}
                </button>
            ))}
        </div>
    )
}

type ThemeMenuEntry =
    | { kind: 'separator'; key: string }
    | {
        kind: 'item'
        key: string
        label: string
        icon: React.ReactNode
        onSelect: () => void
        destructive?: boolean
        disabled?: boolean
    }

function ThemeMenuItem({ entry, onDone }: { entry: Extract<ThemeMenuEntry, { kind: 'item' }>; onDone: () => void }) {
    const color = entry.disabled
        ? 'var(--text-tertiary)'
        : entry.destructive ? 'var(--destructive)' : 'var(--text-primary)'

    return (
        <button
            type="button"
            disabled={entry.disabled}
            onClick={() => {
                if (!entry.disabled) entry.onSelect()
                onDone()
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '28px',
                padding: '6px 8px',
                fontSize: '12px',
                color,
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: entry.disabled ? 'default' : 'pointer',
                textAlign: 'left',
            }}
            onMouseEnter={(event) => {
                if (entry.disabled) return
                event.currentTarget.style.background = entry.destructive ? 'rgba(255, 85, 85, 0.1)' : 'var(--bg-surface-hover)'
            }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
        >
            {entry.icon}
            {entry.label}
        </button>
    )
}

interface ThemeCreateTileProps {
    title: string
    description: string
    icon: React.ReactNode
    onClick: () => void
    dataTourId?: string
}

function ThemeCreateTile({ title, description, icon, onClick, dataTourId }: ThemeCreateTileProps) {
    return (
        <button
            type="button"
            data-tour-id={dataTourId}
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                height: `${THEME_CARD_HEIGHT}px`,
                padding: '16px',
                borderRadius: '14px',
                border: '1px dashed var(--border-default)',
                background: 'var(--bg-elevated)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background-color 150ms ease',
            }}
            onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--accent-color)' }}
            onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border-default)' }}
        >
            <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
            }}>
                {icon}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                <IconPlus size={14} />
                {title}
            </span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                {description}
            </span>
        </button>
    )
}

export function ThemeBuilder({ onCreateTheme, isAdministrator = false }: ThemeBuilderProps = {}) {
    const isMobile = useIsMobile()
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
    const [syntaxSettings, setSyntaxSettings] = useState<SyntaxHighlightSettings>(() => readSyntaxSettings())

    // Context menu state. `kind` decides whether the menu acts on a saved theme or an Explore entry.
    const [contextMenu, setContextMenu] = useState<{
        kind: 'library' | 'explore'
        themeId: string
        x: number
        y: number
    } | null>(null)

    // Explore section
    const [communityThemes, setCommunityThemes] = useState<ExploreTheme[]>([])
    const [exploreOpen, setExploreOpen] = useState(false)
    const [exploreFilter, setExploreFilter] = useState<'all' | 'solid' | 'gradient'>('all')
    const [exploreAppearance, setExploreAppearance] = useState<'all' | 'dark' | 'light'>('all')
    const [exploreQuery, setExploreQuery] = useState('')
    const [shareDialog, setShareDialog] = useState<{ name: string; code: string } | null>(null)
    const [shareCodeCopied, setShareCodeCopied] = useState(false)
    const [importOpen, setImportOpen] = useState(false)
    const [importCode, setImportCode] = useState('')
    const [importError, setImportError] = useState('')

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        themeId: string
        themeName: string
    } | null>(null)

    const allSavedThemes = React.useMemo(
        () => [...savedBasicThemes, ...savedAdvancedThemes],
        [savedBasicThemes, savedAdvancedThemes]
    )

    const updateSyntaxSetting = useCallback(<K extends keyof SyntaxHighlightSettings>(key: K, value: SyntaxHighlightSettings[K]) => {
        setSyntaxSettings((current) => ({ ...current, [key]: value }))
    }, [])

    // The picker reflects a preset only while every token still matches it.
    const activeSyntaxPreset = React.useMemo(() => matchSyntaxPreset(syntaxSettings), [syntaxSettings])

    const applySyntaxPreset = useCallback((presetId: string) => {
        const preset = findSyntaxPreset(presetId)
        if (!preset) return

        setSyntaxSettings((current) => ({
            ...current,
            background: preset.background,
            foreground: preset.foreground,
            keyword: preset.keyword,
            string: preset.string,
            number: preset.number,
            comment: preset.comment,
            type: preset.type,
        }))
    }, [])

    useEffect(() => {
        applySyntaxSettings(syntaxSettings)
        try {
            localStorage.setItem(SYNTAX_STORAGE_KEY, JSON.stringify(syntaxSettings))
        } catch {
            // Ignore storage failures; the live CSS variables are still applied for this session.
        }
    }, [syntaxSettings])

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
                const savedIsDark = parsed.isDark ?? true
                const savedAccent = parsed.selectedAccent || 'default'
                const savedContrast = parsed.contrast ?? 30
                const savedUiTint = parsed.uiTint ?? 0
                const isSavedTheme = loadedThemes.some(t => t.id === themeId)
                const shouldRebuildPreset = themeId !== 'custom' && !isSavedTheme
                const savedBaseBg = parsed.baseBg || parsed.customColors?.bgBase || (savedIsDark ? DARK_BG : LIGHT_BG)
                const nextColors = shouldRebuildPreset
                    ? deriveFullColors(savedBaseBg, getPresetAccent(savedAccent), savedIsDark, savedContrast, savedUiTint)
                    : (parsed.customColors || {})

                setSelectedTheme(themeId)
                setCustomColors(nextColors)
                setIsDark(savedIsDark)
                setIsAdvanced(parsed.isAdvanced ?? false)
                setSelectedAccent(savedAccent)
                setContrast(savedContrast)
                setUiTint(savedUiTint)
                setBaseBg(nextColors.bgBase || savedBaseBg)

                // Initialize tab state
                const isCustom = themeId === 'custom' || isSavedTheme
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
                    const savedIsDark = serverState.isDark ?? true
                    const savedAccent = serverState.selectedAccent || 'default'
                    const savedContrast = serverState.contrast ?? 30
                    const savedUiTint = serverState.uiTint ?? 0
                    const isSavedTheme = loadedThemes.some(t => t.id === themeId)
                    const shouldRebuildPreset = themeId !== 'custom' && !isSavedTheme
                    const savedBaseBg = serverState.baseBg || serverState.customColors?.bgBase || (savedIsDark ? DARK_BG : LIGHT_BG)
                    const nextColors = shouldRebuildPreset
                        ? deriveFullColors(savedBaseBg, getPresetAccent(savedAccent), savedIsDark, savedContrast, savedUiTint)
                        : (serverState.customColors || {})

                    setSelectedTheme(themeId)
                    setCustomColors(nextColors)
                    setIsDark(savedIsDark)
                    setIsAdvanced(serverState.isAdvanced ?? false)
                    setSelectedAccent(savedAccent)
                    setContrast(savedContrast)
                    setUiTint(savedUiTint)
                    setActiveTab(serverState.activeTab === 'custom' ? 'custom' : 'preset')
                    setLastPresetTheme(serverState.lastPresetTheme || 'dark-default')
                    setLastCustomTheme(serverState.lastCustomTheme || null)
                    setBaseBg(nextColors.bgBase || savedBaseBg)

                    localStorage.setItem('millennium-theme', JSON.stringify({
                        themeId,
                        customColors: nextColors,
                        isDark: savedIsDark,
                        isAdvanced: serverState.isAdvanced ?? false,
                        selectedAccent: savedAccent,
                        contrast: savedContrast,
                        uiTint: savedUiTint,
                        baseBg: nextColors.bgBase || savedBaseBg,
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
                const accent = DEFAULT_ACCENT
                const derivedColors = deriveFullColors(bgBase, accent, isDark, contrast, uiTint)
                setCustomColors(derivedColors)
                setBaseBg(bgBase)
                applyThemeColors(derivedColors, isDark)
                saveTheme('custom', derivedColors, isDark, isAdvanced)
            }
        }
    // saveTheme is declared later in this module; including it here currently causes a TDZ/type issue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    const accentHex = theme.colors.accent?.startsWith('#') ? theme.colors.accent : DEFAULT_ACCENT
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
                const accentHex = selectedAccent === 'default' ? DEFAULT_ACCENT : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS]
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
            baseBg,
        }))
    }, [baseBg, selectedAccent, contrast, uiTint])

    const applyCurrentTheme = useCallback((themeId: string, colors: Partial<ThemeColors>, dark: boolean) => {
        if (themeId === 'custom') {
            // For custom theme, derive colors from bgBase and accent
            const bgBase = colors.bgBase || (dark ? DARK_BG : LIGHT_BG)
            const accent = colors.accent || DEFAULT_ACCENT
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
        const bgBase = customColors.bgBase || (isDark ? DARK_BG : LIGHT_BG)
        const accent = customColors.accent || DEFAULT_ACCENT
        const newCustom = { bgBase, accent }
        setCustomColors(newCustom)
        setBaseBg(bgBase)
        setEditingThemeId(null)
        setThemeName('')
        applyCurrentTheme('custom', newCustom, isDark)
        saveTheme('custom', newCustom, isDark, isAdvanced)
        setSidebarOpen(true)
    }

    const handleCreateThemeRequest = (mode: ThemeCreateMode) => {
        if (onCreateTheme) {
            onCreateTheme(mode)
            return
        }

        handleCustomThemeStart()
    }

    const handleLiveEditTheme = (theme: SavedCustomTheme) => {
        if (onCreateTheme) {
            onCreateTheme(modeFromAdvanced(theme.isAdvanced), theme)
            return
        }

        handleEditTheme(theme.id, theme.colors, theme.isDark, theme.name)
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
            const bgBase = colorKey === 'bgBase' ? value : (newCustomColors.bgBase || (isDark ? DARK_BG : LIGHT_BG))
            const accent = colorKey === 'accent' ? value : (newCustomColors.accent || DEFAULT_ACCENT)
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
            const bgBase = dark ? DARK_BG : LIGHT_BG
            const accent = customColors.accent || DEFAULT_ACCENT
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
            if (colorKey === 'bgBase') return isDark ? DARK_BG : LIGHT_BG
            if (colorKey === 'accent') return DEFAULT_ACCENT
        }
        return '#000000'
    }

    // State for sidebar visibility
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [themeName, setThemeName] = useState('')
    const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
    const [previousTheme, setPreviousTheme] = useState<{ id: string; colors: Partial<ThemeColors>; isDark: boolean } | null>(null)
    
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
        const baseColors = theme?.colors || deriveFullColors(isDark ? DARK_BG : LIGHT_BG, DEFAULT_ACCENT, isDark)
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

    // Simple and advanced themes share one gallery, newest first.
    const sortedSavedThemes = React.useMemo(
        () => [...allSavedThemes].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        [allSavedThemes]
    )

    const handleSelectSavedTheme = useCallback((theme: SavedCustomTheme) => {
        setActiveTab(theme.isAdvanced ? 'custom' : 'preset')
        setSelectedTheme(theme.id)
        setCustomColors(theme.colors)
        setIsDark(theme.isDark)
        setBaseBg(theme.colors.bgBase || (theme.isDark ? DARK_BG : LIGHT_BG))
        setEditingThemeId(null)
        setThemeName('')
        applyThemeColors(theme.colors, theme.isDark)
        saveTheme(theme.id, theme.colors, theme.isDark, isAdvanced, selectedAccent, contrast, uiTint)
    }, [saveTheme, isAdvanced, selectedAccent, contrast, uiTint])

    const openThemeContextMenu = useCallback((
        event: React.MouseEvent,
        themeId: string,
        kind: 'library' | 'explore' = 'library'
    ) => {
        event.preventDefault()
        event.stopPropagation()

        const menuWidth = 200
        const menuHeight = 200
        let x = event.clientX + 2
        let y = event.clientY + 2
        if (x + menuWidth > window.innerWidth) {
            x = event.clientX - menuWidth - 2
        }
        if (y + menuHeight > window.innerHeight) {
            y = event.clientY - menuHeight - 2
        }

        setContextMenu({ kind, themeId, x: Math.max(4, x), y: Math.max(4, y) })
    }, [])

    // Explore cards are memoised, so their handlers have to keep the same identity across renders
    // or every card in the gallery re-renders whenever one is added to the library.
    const openExploreContextMenu = useCallback((event: React.MouseEvent, theme: ExploreTheme) => {
        openThemeContextMenu(event, theme.id, 'explore')
    }, [openThemeContextMenu])

    // ---- Explore + sharing -------------------------------------------------

    const refreshCommunityThemes = useCallback(async () => {
        try {
            const response = await fetch('/api/themes/explore')
            if (!response.ok) return
            const data = await response.json()
            if (Array.isArray(data?.themes)) {
                setCommunityThemes(data.themes as ExploreTheme[])
            }
        } catch (error) {
            console.error('Failed to load explore themes:', error)
        }
    }, [])

    useEffect(() => {
        refreshCommunityThemes()
    }, [refreshCommunityThemes])

    // Administrator uploads sit above the built-in catalog so new arrivals are visible first.
    const exploreThemes = React.useMemo(
        () => [...communityThemes, ...CATALOG_EXPLORE_THEMES],
        [communityThemes]
    )

    const visibleExploreThemes = React.useMemo(() => {
        const query = exploreQuery.trim().toLowerCase()

        return exploreThemes.filter((theme) => {
            if (exploreFilter !== 'all' && theme.category !== exploreFilter) return false
            if (exploreAppearance !== 'all' && theme.isDark !== (exploreAppearance === 'dark')) return false
            if (!query) return true
            return theme.name.toLowerCase().includes(query)
                || (theme.authorName ?? '').toLowerCase().includes(query)
        })
    }, [exploreThemes, exploreFilter, exploreAppearance, exploreQuery])

    const libraryThemeNames = React.useMemo(
        () => new Set(allSavedThemes.map((theme) => theme.name.trim().toLowerCase())),
        [allSavedThemes]
    )

    const persistLibraryTheme = useCallback((theme: SavedCustomTheme) => {
        if (theme.isAdvanced) {
            const updatedAdvanced = [...savedAdvancedThemes, theme]
            setSavedAdvancedThemes(updatedAdvanced)
            localStorage.setItem('millennium-advanced-themes', JSON.stringify(updatedAdvanced))
            localStorage.setItem('millennium-custom-themes', JSON.stringify([...savedBasicThemes, ...updatedAdvanced]))
        } else {
            const updatedBasic = [...savedBasicThemes, theme]
            setSavedBasicThemes(updatedBasic)
            localStorage.setItem('millennium-basic-themes', JSON.stringify(updatedBasic))
            localStorage.setItem('millennium-custom-themes', JSON.stringify([...updatedBasic, ...savedAdvancedThemes]))
        }
    }, [savedAdvancedThemes, savedBasicThemes])

    const uniqueLibraryName = useCallback((name: string) => {
        const taken = new Set(allSavedThemes.map((theme) => theme.name.trim().toLowerCase()))
        if (!taken.has(name.trim().toLowerCase())) return name

        for (let suffix = 2; suffix < 100; suffix += 1) {
            const candidate = `${name} ${suffix}`
            if (!taken.has(candidate.toLowerCase())) return candidate
        }
        return `${name} ${Date.now()}`
    }, [allSavedThemes])

    const addThemeToLibrary = useCallback((input: {
        name: string
        colors: ThemeColors
        isDark: boolean
        isAdvanced: boolean
    }): SavedCustomTheme => {
        const theme: SavedCustomTheme = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: uniqueLibraryName(input.name),
            colors: input.colors,
            isDark: input.isDark,
            isAdvanced: input.isAdvanced,
            createdAt: Date.now(),
        }
        persistLibraryTheme(theme)
        return theme
    }, [persistLibraryTheme, uniqueLibraryName])

    /**
     * Explore themes are never applied straight from the catalogue: an applied theme that is not in
     * the library cannot be selected, edited, or restored after a reload, which left the gallery and
     * the library disagreeing about what is active. Adding first keeps one source of truth.
     *
     * Adding is also not applying. Collecting a theme leaves the current theme running; the second
     * click on the same card — now labelled "Apply theme" — is what switches to it.
     */
    const handleUseExploreTheme = useCallback((theme: ExploreTheme) => {
        const name = theme.name.trim().toLowerCase()
        const existing = allSavedThemes.find((saved) => saved.name.trim().toLowerCase() === name)
        if (existing) {
            handleSelectSavedTheme(existing)
            return
        }

        addThemeToLibrary({
            name: theme.name,
            colors: theme.colors as ThemeColors,
            isDark: theme.isDark,
            isAdvanced: theme.isAdvanced,
        })
    }, [addThemeToLibrary, allSavedThemes, handleSelectSavedTheme])

    // The click handler changes identity every time the library does. Reading it through a ref keeps
    // one stable prop on the memoised cards, so adding a theme re-renders the card that changed
    // rather than every card the gallery has mounted.
    const useExploreThemeRef = React.useRef(handleUseExploreTheme)
    React.useEffect(() => {
        useExploreThemeRef.current = handleUseExploreTheme
    }, [handleUseExploreTheme])
    const handleExploreCardUse = useCallback((theme: ExploreTheme) => {
        useExploreThemeRef.current(theme)
    }, [])

    const handleShareTheme = useCallback((theme: SavedCustomTheme) => {
        try {
            const code = encodeThemeShareCode({
                name: theme.name,
                isDark: theme.isDark,
                isAdvanced: theme.isAdvanced,
                colors: theme.colors,
            })
            setShareCodeCopied(false)
            setShareDialog({ name: theme.name, code })
        } catch (error) {
            console.error('Failed to build theme share code:', error)
        }
    }, [])

    const handleImportThemeCode = useCallback(() => {
        try {
            const shared = decodeThemeShareCode(importCode)
            // An imported code lands in the library like any other addition, without taking over the
            // theme the user is currently running.
            addThemeToLibrary({
                name: shared.name,
                colors: shared.colors,
                isDark: shared.isDark,
                isAdvanced: shared.isAdvanced,
            })
            setImportOpen(false)
            setImportCode('')
            setImportError('')
        } catch (error) {
            setImportError(error instanceof ThemeShareError ? error.message : 'That theme code could not be imported.')
        }
    }, [addThemeToLibrary, importCode])

    const handlePublishToExplore = useCallback(async (theme: SavedCustomTheme) => {
        try {
            const response = await fetch('/api/themes/explore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: theme.name,
                    isDark: theme.isDark,
                    isAdvanced: theme.isAdvanced,
                    colors: theme.colors,
                }),
            })
            if (!response.ok) {
                console.error('Failed to publish theme:', response.status)
                return
            }
            await refreshCommunityThemes()
        } catch (error) {
            console.error('Failed to publish theme:', error)
        }
    }, [refreshCommunityThemes])

    const handleRemoveFromExplore = useCallback(async (exploreId: string) => {
        const id = exploreId.replace(/^community-/, '')
        try {
            const response = await fetch(`/api/themes/explore?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
            if (!response.ok) {
                console.error('Failed to remove explore theme:', response.status)
                return
            }
            await refreshCommunityThemes()
        } catch (error) {
            console.error('Failed to remove explore theme:', error)
        }
    }, [refreshCommunityThemes])

    // Cheap to rebuild and only consulted while a menu is open, so it is computed inline rather
    // than memoised against a dozen handler identities.
    const contextMenuEntries = ((): ThemeMenuEntry[] => {
        if (!contextMenu) return []

        if (contextMenu.kind === 'explore') {
            const theme = exploreThemes.find((entry) => entry.id === contextMenu.themeId)
            if (!theme) return []

            const inLibrary = libraryThemeNames.has(theme.name.trim().toLowerCase())
            const entries: ThemeMenuEntry[] = [
                {
                    kind: 'item',
                    key: 'use',
                    label: inLibrary ? 'Apply theme' : 'Add to library',
                    icon: inLibrary ? <IconCheck size={14} /> : <IconPlus size={14} />,
                    onSelect: () => handleUseExploreTheme(theme),
                },
            ]

            if (isAdministrator && theme.isCommunity) {
                entries.push({ kind: 'separator', key: 'explore-separator' })
                entries.push({
                    kind: 'item',
                    key: 'remove',
                    label: 'Remove from Explore',
                    icon: <IconTrash size={14} />,
                    destructive: true,
                    onSelect: () => { void handleRemoveFromExplore(theme.id) },
                })
            }

            return entries
        }

        const theme = allSavedThemes.find((entry) => entry.id === contextMenu.themeId)
        if (!theme) return []

        const entries: ThemeMenuEntry[] = [
            {
                kind: 'item',
                key: 'edit',
                label: 'Edit theme',
                icon: <IconEdit size={14} />,
                onSelect: () => handleLiveEditTheme(theme),
            },
            {
                kind: 'item',
                key: 'duplicate',
                label: 'Duplicate',
                icon: <IconCopy size={14} />,
                onSelect: () => handleDuplicateCustomTheme(theme.id),
            },
            {
                kind: 'item',
                key: 'share',
                label: 'Share code',
                icon: <IconShare size={14} />,
                onSelect: () => handleShareTheme(theme),
            },
        ]

        if (isAdministrator) {
            entries.push({
                kind: 'item',
                key: 'publish',
                label: 'Upload to Explore',
                icon: <IconCloudUpload size={14} />,
                onSelect: () => { void handlePublishToExplore(theme) },
            })
        }

        entries.push({ kind: 'separator', key: 'library-separator' })
        entries.push({
            kind: 'item',
            key: 'delete',
            label: 'Delete',
            icon: <IconTrash size={14} />,
            destructive: true,
            onSelect: () => setDeleteConfirm({ themeId: theme.id, themeName: theme.name }),
        })

        return entries
    })()

    const syntaxColorRows: Array<{ key: Exclude<keyof SyntaxHighlightSettings, 'fontFamily'>; label: string; description: string }> = [
        { key: 'background', label: 'Background', description: 'Code block surface' },
        { key: 'foreground', label: 'Text', description: 'Default code text' },
        { key: 'keyword', label: 'Keyword', description: 'const, return, import' },
        { key: 'string', label: 'String', description: 'Quoted values' },
        { key: 'number', label: 'Number', description: 'Numeric literals' },
        { key: 'comment', label: 'Comment', description: 'Inline comments' },
        { key: 'type', label: 'Type', description: 'Types and classes' },
    ]

    return (
        <div data-tour-id="settings-theme-builder" style={{
            display: 'flex',
            gap: '24px',
            position: 'relative',
        }}>
            {/* Main Content Area */}
            <div style={{
                flex: 1,
                minWidth: 0,
                transition: 'margin-right 260ms cubic-bezier(0.4, 0, 0.2, 1)',
                marginRight: sidebarOpen && !isMobile ? `${THEME_EDITOR_WIDTH}px` : '0',
            }}>

                <div className="grid w-full gap-8">
                    <section aria-labelledby="theme-builder-advanced-themes" data-settings-anchor="theme-your-themes" data-tour-id="theme-advanced-builder">
                        <div style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: '12px',
                            marginBottom: '12px',
                        }}>
                            <h3
                                id="theme-builder-advanced-themes"
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                <IconAdjustments size={12} />
                                Your themes {allSavedThemes.length > 0 && `(${allSavedThemes.length})`}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className="hidden lg:inline" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    Click to apply · double-click to edit live · right-click for more
                                </span>
                                <button
                                    type="button"
                                    data-settings-anchor="theme-import-code"
                                    onClick={() => {
                                        setImportError('')
                                        setImportCode('')
                                        setImportOpen(true)
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        height: '30px',
                                        padding: '0 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-default)',
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <IconDownload size={14} />
                                    Import code
                                </button>
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
                            gap: '16px',
                        }}>
                            {sortedSavedThemes.map((theme) => (
                                <ThemeGalleryCard
                                    key={theme.id}
                                    theme={theme}
                                    isSelected={selectedTheme === theme.id}
                                    onSelect={() => handleSelectSavedTheme(theme)}
                                    onEdit={() => handleLiveEditTheme(theme)}
                                    onDelete={() => setDeleteConfirm({ themeId: theme.id, themeName: theme.name })}
                                    onContextMenu={(event) => openThemeContextMenu(event, theme.id)}
                                />
                            ))}

                            <ThemeCreateTile
                                dataTourId="theme-simple-builder"
                                title="Simple theme"
                                description="Accent, background, contrast"
                                icon={<IconSparkles size={18} />}
                                onClick={() => {
                                    setActiveTab('preset')
                                    handleCreateThemeRequest('simple')
                                }}
                            />

                            <ThemeCreateTile
                                dataTourId="theme-build-advanced"
                                title="Advanced theme"
                                description="Full palette, surfaces, gradients"
                                icon={<IconAdjustments size={18} />}
                                onClick={() => {
                                    setActiveTab('custom')
                                    handleCreateThemeRequest('advanced')
                                }}
                            />
                        </div>
                    </section>

                    <section aria-labelledby="theme-builder-explore" data-settings-anchor="theme-explore">
                        <h3
                            id="theme-builder-explore"
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <IconWorld size={12} />
                            Explore
                        </h3>

                        <div data-settings-anchor="theme-gallery" data-tour-id="theme-gallery" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '16px',
                            padding: '18px',
                            borderRadius: '14px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-elevated)',
                        }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 650 }}>
                                    Theme gallery
                                </div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: '12.5px', marginTop: '3px' }}>
                                    {exploreThemes.length} curated colourways. Picking one adds it to your themes and applies it.
                                </div>
                            </div>

                            <Button type="button" onClick={() => setExploreOpen(true)}>
                                <IconWorld size={16} />
                                Browse themes
                            </Button>
                        </div>
                    </section>
                </div>

                <section aria-labelledby="syntax-highlighting-settings" data-settings-anchor="theme-syntax" style={{ marginTop: '30px' }}>
                    <h3
                        id="syntax-highlighting-settings"
                        style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.6px',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <IconPalette size={12} />
                        Syntax Highlighting
                    </h3>

                    <div style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        background: 'var(--bg-elevated)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '0',
                        }}>
                            <div style={{
                                display: 'flex',
                                padding: '18px',
                                borderRight: '1px solid var(--border-subtle)',
                                minWidth: 0,
                            }}>
                                <div style={{
                                    display: 'flex',
                                    flex: 1,
                                    minWidth: 0,
                                    border: '1px solid var(--syntax-border)',
                                    borderRadius: '10px',
                                    background: syntaxSettings.background,
                                    color: syntaxSettings.foreground,
                                    overflow: 'hidden',
                                }}>
                                    <pre style={{
                                        flex: 1,
                                        minWidth: 0,
                                        margin: 0,
                                        padding: '16px 18px',
                                        fontFamily: syntaxSettings.fontFamily,
                                        fontSize: '12.5px',
                                        lineHeight: 1.65,
                                        overflow: 'auto',
                                    }}>
                                        <code>
                                            {SYNTAX_PREVIEW_CODE.map((line, lineIndex) => (
                                                <React.Fragment key={lineIndex}>
                                                    {line.map((segment, segmentIndex) => (
                                                        <span
                                                            key={segmentIndex}
                                                            style={segment.token ? { color: syntaxSettings[segment.token] } : undefined}
                                                        >
                                                            {segment.text}
                                                        </span>
                                                    ))}
                                                    {'\n'}
                                                </React.Fragment>
                                            ))}
                                        </code>
                                    </pre>
                                </div>
                            </div>

                            <div style={{ display: 'grid' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '14px',
                                    padding: '15px 18px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                }}>
                                    <div>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 650 }}>Preset</div>
                                        <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '2px' }}>
                                            {activeSyntaxPreset ? 'Standard palette applied' : 'Custom palette'}
                                        </div>
                                    </div>
                                    <Select
                                        value={activeSyntaxPreset?.id ?? ''}
                                        onValueChange={(value) => {
                                            if (value) applySyntaxPreset(value)
                                        }}
                                    >
                                        <SelectTrigger style={{ width: '178px' }}>
                                            <SelectValue placeholder="Custom" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SYNTAX_THEME_PRESETS.map((preset) => (
                                                <SelectItem key={preset.id} value={preset.id}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            width: '12px',
                                                            height: '12px',
                                                            borderRadius: '3px',
                                                            border: '1px solid var(--border-subtle)',
                                                            backgroundColor: preset.background,
                                                        }} />
                                                        <span>{preset.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '14px',
                                    padding: '15px 18px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                }}>
                                    <div>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 650 }}>Code font</div>
                                        <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '2px' }}>Default is Geist Mono</div>
                                    </div>
                                    <Select
                                        value={syntaxSettings.fontFamily}
                                        onValueChange={(value) => {
                                            if (value) updateSyntaxSetting('fontFamily', value)
                                        }}
                                    >
                                        <SelectTrigger style={{ width: '178px' }}>
                                            <SelectValue placeholder="Code font" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SYNTAX_FONT_OPTIONS.map((font) => (
                                                <SelectItem key={font.label} value={font.value}>
                                                    {font.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {syntaxColorRows.map((row) => (
                                    <div
                                        key={row.key}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '14px',
                                            padding: '14px 18px',
                                            borderBottom: row.key === 'type' ? '0' : '1px solid var(--border-subtle)',
                                        }}
                                    >
                                        <div>
                                            <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 650 }}>{row.label}</div>
                                            <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '2px' }}>{row.description}</div>
                                        </div>
                                        <AdvancedColorPicker
                                            value={syntaxSettings[row.key]}
                                            onChange={(value) => updateSyntaxSetting(row.key, value)}
                                        >
                                            <AdvancedColorPickerTrigger className="size-10 rounded-lg border-[var(--border-default)] p-0" />
                                            <AdvancedColorPickerContent showOpacity />
                                        </AdvancedColorPicker>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {SHOW_LEGACY_THEME_PREVIEW_BLOCKS && (
                    <>
                <div style={{ marginTop: '32px' }}>
                    <h3 style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        marginBottom: '16px',
                    }}>
                        Theme Preview
                    </h3>

                    <div style={{
                        overflow: 'hidden',
                        borderRadius: '8px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-base)',
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '160px minmax(0, 1fr)',
                            minHeight: '280px',
                        }}>
                            <div style={{
                                padding: '16px',
                                background: 'var(--bg-base)',
                                borderRight: '1px solid var(--border-default)',
                            }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'var(--accent-gradient)',
                                    marginBottom: '18px',
                                }} />
                                {['Home', 'Classes', 'Calendar'].map((item, index) => (
                                    <div
                                        key={item}
                                        style={{
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '0 10px',
                                            marginBottom: '4px',
                                            borderRadius: '6px',
                                            background: index === 0 ? 'var(--active-bg)' : 'transparent',
                                            color: index === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            fontSize: '13px',
                                            fontWeight: index === 0 ? 600 : 500,
                                        }}
                                    >
                                        {item}
                                    </div>
                                ))}
                            </div>

                            <div style={{ background: 'var(--bg-elevated)', minWidth: 0 }}>
                                <div style={{
                                    minHeight: '52px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--border-default)',
                                }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>Today</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>4 classes due</div>
                                    </div>
                                    <button style={{
                                        height: '32px',
                                        padding: '0 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'var(--accent-gradient)',
                                        backgroundRepeat: 'no-repeat',
                                        color: '#FFFFFF',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}>
                                        New task
                                    </button>
                                </div>

                                <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
                                    <input
                                        value="Search assignments"
                                        readOnly
                                        style={{
                                            height: '36px',
                                            width: '100%',
                                            padding: '0 12px',
                                            background: 'var(--bg-surface)',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '6px',
                                            color: 'var(--text-secondary)',
                                            fontSize: '13px',
                                            outline: 'none',
                                        }}
                                    />

                                    {[
                                        ['Physics lab', 'Due 10:30 AM'],
                                        ['History notes', 'Reviewed yesterday'],
                                        ['Design draft', 'Needs polish'],
                                    ].map(([title, meta], index) => (
                                        <div
                                            key={title}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                                padding: '12px',
                                                background: index === 0 ? 'var(--active-bg)' : 'var(--bg-surface)',
                                                border: `1px solid ${index === 0 ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                                                borderRadius: '8px',
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{meta}</div>
                                            </div>
                                            <div style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '999px',
                                                background: index === 0 ? 'var(--accent-gradient)' : 'var(--border-strong)',
                                                flexShrink: 0,
                                            }} />
                                        </div>
                                    ))}

                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        gap: '8px',
                                        paddingTop: '4px',
                                    }}>
                                        <button style={{
                                            height: '32px',
                                            padding: '0 12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-elevated)',
                                            color: 'var(--text-secondary)',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                        }}>
                                            Archive
                                        </button>
                                        <button style={{
                                            height: '32px',
                                            padding: '0 12px',
                                            borderRadius: '6px',
                                            border: '1px solid transparent',
                                            background: 'var(--accent-gradient-soft)',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}>
                                            <span className="accent-text">Open</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                    </>
                )}
            </div>

            {SHOW_LEGACY_THEME_BUILDER_BLOCKS && (
                <>
            {/* Sliding Right Sidebar - Color Editor */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: isMobile ? '100vw' : `${THEME_EDITOR_WIDTH}px`,
                background: 'var(--bg-elevated)',
                borderLeft: 'none',
                transform: sidebarOpen ? 'translateX(0) scale(1)' : 'translateX(24px) scale(0.985)',
                opacity: sidebarOpen ? 1 : 0,
                pointerEvents: sidebarOpen ? 'auto' : 'none',
                transition: 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: sidebarOpen ? '-10px 0 32px rgba(0, 0, 0, 0.18)' : 'none',
                overflow: 'hidden',
            }}>
                {/* Sidebar Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 22px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <IconPalette size={19} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                        <span style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Customise Theme
                        </span>
                    </div>
                    <button
                        onClick={handleSidebarClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '34px',
                            height: '34px',
                            borderRadius: '7px',
                            border: 'none',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
	                            transition: 'background-color 150ms ease, color 150ms ease',
                        }}
                    >
                        <IconX size={16} />
                    </button>
                </div>

                {/* Sidebar Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                }}>
                    <div style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '13px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                    }}>
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '30px',
                            height: '30px',
                            flexShrink: 0,
                            borderRadius: '7px',
                            background: 'var(--accent-gradient-soft)',
                            color: 'var(--accent-color)',
                        }}>
                            <IconPalette size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-primary)' }}>Live editing</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Previewing changes on Home
                            </div>
                        </div>
                    </div>

                    {/* Simple/Advanced Mode Toggle */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
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
                            checked={!isAdvanced}
                            onCheckedChange={(checked) => {
                                const nextAdvanced = !checked
                                setIsAdvanced(nextAdvanced)
                                saveTheme(selectedTheme, customColors, isDark, nextAdvanced)
                            }}
                        />
                    </div>

                    {/* Dark/Light Toggle */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
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
                            checked={isDark}
                            onCheckedChange={(checked) => handleDarkModeToggle(checked)}
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
                                    padding: '16px',
                                    background: 'var(--bg-surface)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-subtle)',
                                    minHeight: '74px',
                                }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text-primary)' }}>Background</div>
                                    <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>Base app colour</div>
                                </div>
                                <AdvancedColorPicker value={getCurrentColor('bgBase')} onChange={(val) => handleColorChange('bgBase', val)}>
                                    <AdvancedColorPickerTrigger
                                        className="size-11 rounded-lg border-[var(--border-default)] p-0"
                                    />
                                    <AdvancedColorPickerContent showOpacity />
                                </AdvancedColorPicker>
                            </div>

                            {/* Accent Color */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '16px',
                                    background: 'var(--bg-surface)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-subtle)',
                                    minHeight: '74px',
                                }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text-primary)' }}>Accent</div>
                                    <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>Buttons & highlights</div>
                                </div>
                                <AdvancedColorPicker
                                    value={getCurrentColor('accent')}
                                    onChange={(val) => handleColorChange('accent', val)}
                                    enableGradient
                                    onGradientChange={(g) => handleColorChange('accent', generateGradientCSS(g))}
                                >
                                    <AdvancedColorPickerTrigger
                                        className="size-11 rounded-lg border-[var(--border-default)] p-0"
                                    />
                                    <AdvancedColorPickerContent showOpacity showGradientMode />
                                </AdvancedColorPicker>
                            </div>

                            {/* Contrast Slider */}
                            <div style={{
                                padding: '16px',
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
                                        <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text-primary)' }}>Contrast</div>
                                        <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>Borders & surfaces</div>
                                    </div>
                                    <Input
                                        type="text"
                                        inputMode="numeric"
                                        aria-label="Contrast percentage"
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
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? DEFAULT_ACCENT : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, clamped, uiTint)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, clamped, uiTint)
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                        className="h-7 focus-visible:border-[var(--focus-ring)] focus-visible:ring-[var(--focus-ring)]/30"
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
                                    label="Contrast"
                                    min={15}
                                    max={100}
                                    value={contrast}
                                    onChange={(newContrast) => {
                                        setContrast(newContrast)
                                        const currentAccent = customColors.accent || (selectedAccent === 'default' ? DEFAULT_ACCENT : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                        const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                        const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, newContrast, uiTint)
                                        setCustomColors(derivedColors)
                                        applyThemeColors(derivedColors, isDark)
                                        saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, newContrast, uiTint)
                                    }}
                                />
                            </div>

                            {/* UI Tint Slider */}
                            <div style={{
                                padding: '16px',
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
                                        <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text-primary)' }}>UI Tint</div>
                                        <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                            Accent colour bleed
                                        </div>
                                    </div>
                                    <Input
                                        type="text"
                                        inputMode="numeric"
                                        aria-label="UI tint percentage"
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
                                            const currentAccent = customColors.accent || (selectedAccent === 'default' ? DEFAULT_ACCENT : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                            const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                            const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, clamped)
                                            setCustomColors(derivedColors)
                                            applyThemeColors(derivedColors, isDark)
                                            saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, clamped)
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                        className="h-7 focus-visible:border-[var(--focus-ring)] focus-visible:ring-[var(--focus-ring)]/30"
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
                                    label="UI Tint"
                                    min={0}
                                    max={100}
                                    value={uiTint}
                                    onChange={(newTint) => {
                                        setUiTint(newTint)
                                        const currentAccent = customColors.accent || (selectedAccent === 'default' ? DEFAULT_ACCENT : ACCENT_COLORS[selectedAccent as keyof typeof ACCENT_COLORS])
                                        const bgBase = baseBg || (isDark ? DARK_BG : LIGHT_BG)
                                        const derivedColors = deriveFullColors(bgBase, currentAccent, isDark, contrast, newTint)
                                        setCustomColors(derivedColors)
                                        applyThemeColors(derivedColors, isDark)
                                        saveTheme(selectedTheme, derivedColors, isDark, isAdvanced, selectedAccent, contrast, newTint)
                                    }}
                                />
                            </div>

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
                                <div key={category.name} style={{ marginBottom: '10px' }}>
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {category.colors.map((color) => {
                                            const allowGradient = category.name === 'Accent'
                                            return (
                                            <div
                                                key={color.key}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '12px 14px',
                                                    background: 'var(--bg-surface)',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border-subtle)',
                                                }}
                                            >
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{color.label}</span>
                                                <AdvancedColorPicker
                                                    value={getCurrentColor(color.key)}
                                                    onChange={(val) => handleColorChange(color.key, val)}
                                                    enableGradient={allowGradient}
                                                    onGradientChange={allowGradient ? (g) => handleColorChange(color.key, generateGradientCSS(g)) : undefined}
                                                >
                                                    <AdvancedColorPickerTrigger
                                                        className="size-9 rounded-md border-[var(--border-default)] p-0"
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
                    padding: '18px 22px',
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
                            minHeight: '46px',
                            padding: '11px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'var(--accent-gradient)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
	                            transition: 'opacity 150ms ease, background-color 150ms ease',
                        }}
                    >
                        <IconCheck size={16} />
                        Save Theme
                    </button>
                </div>
            </div>
                </>
            )}

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
                        {contextMenuEntries.map((entry) => (
                            entry.kind === 'separator'
                                ? <div key={entry.key} style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
                                : <ThemeMenuItem key={entry.key} entry={entry} onDone={() => setContextMenu(null)} />
                        ))}
                    </div>
                </>,
                document.body
            )}

            {/* Explore gallery */}
            <Dialog
                open={exploreOpen}
                onOpenChange={(open, details) => {
                    // The theme context menu is portalled outside the popup, so clicking or focusing
                    // it reads as a dismissal. Keep the gallery open and let the menu's own overlay
                    // handle the click.
                    if (!open && contextMenu && (details.reason === 'outside-press' || details.reason === 'focus-out')) {
                        details.cancel()
                        return
                    }
                    if (!open) {
                        setContextMenu(null)
                    }
                    setExploreOpen(open)
                }}
            >
                <DialogContent className="grid max-h-[min(880px,calc(100dvh-3rem))] w-[min(1180px,calc(100vw-2rem))] max-w-none grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-5 sm:max-w-none">
                    <DialogHeader className="pr-10">
                        <DialogTitle>Explore themes</DialogTitle>
                        <DialogDescription>
                            {exploreThemes.length} curated colourways. Clicking a theme adds it to your themes and applies it, so you can edit or delete it afterwards.
                        </DialogDescription>
                    </DialogHeader>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                    }}>
                        <InputGroup className="h-9 w-full sm:w-[260px]">
                            <InputGroupAddon>
                                <IconSearch />
                            </InputGroupAddon>
                            <InputGroupInput
                                value={exploreQuery}
                                onChange={(event) => setExploreQuery(event.target.value)}
                                placeholder="Search themes"
                                aria-label="Search themes"
                            />
                        </InputGroup>

                        <ExploreFilterGroup
                            label="Filter by accent style"
                            options={['all', 'solid', 'gradient'] as const}
                            value={exploreFilter}
                            onChange={setExploreFilter}
                        />

                        <ExploreFilterGroup
                            label="Filter by appearance"
                            options={['all', 'dark', 'light'] as const}
                            value={exploreAppearance}
                            onChange={setExploreAppearance}
                        />

                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            whiteSpace: 'nowrap',
                        }}>
                            {visibleExploreThemes.length} shown
                        </span>
                    </div>

                    <div style={{ overflow: 'auto', paddingRight: '2px' }}>
                        {visibleExploreThemes.length === 0 ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: '220px',
                                borderRadius: '14px',
                                border: '1px dashed var(--border-default)',
                                color: 'var(--text-tertiary)',
                                fontSize: '13px',
                            }}>
                                No themes match those filters.
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
                                gap: '16px',
                            }}>
                                {visibleExploreThemes.map((theme) => (
                                    <ExploreThemeCard
                                        key={theme.id}
                                        theme={theme}
                                        isInLibrary={libraryThemeNames.has(theme.name.trim().toLowerCase())}
                                        onUse={handleExploreCardUse}
                                        onContextMenu={openExploreContextMenu}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Share code */}
            <Dialog
                open={!!shareDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShareDialog(null)
                        setShareCodeCopied(false)
                    }
                }}
            >
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Share “{shareDialog?.name}”</DialogTitle>
                        <DialogDescription>
                            Anyone can paste this code into Import code to add the theme to their library.
                        </DialogDescription>
                    </DialogHeader>

                    <Input
                        readOnly
                        value={shareDialog?.code ?? ''}
                        onFocus={(event) => event.currentTarget.select()}
                        className="font-mono text-xs"
                    />

                    <DialogFooter>
                        <Button
                            onClick={async () => {
                                if (!shareDialog) return
                                try {
                                    await navigator.clipboard.writeText(shareDialog.code)
                                    setShareCodeCopied(true)
                                } catch (error) {
                                    console.error('Failed to copy theme code:', error)
                                }
                            }}
                        >
                            {shareCodeCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            {shareCodeCopied ? 'Copied' : 'Copy code'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import code */}
            <Dialog
                open={importOpen}
                onOpenChange={(open) => {
                    setImportOpen(open)
                    if (!open) {
                        setImportCode('')
                        setImportError('')
                    }
                }}
            >
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Import a theme</DialogTitle>
                        <DialogDescription>
                            Paste a Millennium theme code to add it to your library.
                        </DialogDescription>
                    </DialogHeader>

                    <Input
                        autoFocus
                        value={importCode}
                        placeholder="MT1...."
                        onChange={(event) => {
                            setImportCode(event.target.value)
                            setImportError('')
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') handleImportThemeCode()
                        }}
                        className="font-mono text-xs"
                    />
                    {importError ? <p className="text-xs text-destructive">{importError}</p> : null}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
                        <Button disabled={!importCode.trim()} onClick={handleImportThemeCode}>
                            <IconDownload size={16} />
                            Add to library
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Theme Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent style={{
                    maxWidth: '450px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    outline: 'none',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
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
