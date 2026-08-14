// Theme utility - Loads and applies saved theme
// This can be imported and called on app initialization

export interface ThemeColors {
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

interface SavedTheme {
    themeId: string
    customColors: Partial<ThemeColors>
    isDark: boolean
}

export const DEFAULT_ACCENT = '#4338CA'
export const DARK_BG = '#09090B'
export const LIGHT_BG = '#F5F5F7'

/**
 * Black-on-white border alphas for light themes.
 *
 * A hairline needs materially more alpha on a white surface than white-on-black needs on a dark one
 * before the eye reads it as an edge, so the light ramp is not a mirror of the dark ramp. The
 * previous 0.06/0.10/0.15 set left card, input, and table edges effectively invisible in light mode.
 */
export const LIGHT_BORDER_ALPHA = {
    subtle: 0.12,
    default: 0.18,
    strong: 0.28,
} as const

const defaultDarkColors: ThemeColors = {
    bgBase: DARK_BG,
    bgElevated: '#0F1011',
    bgSurface: solidOverlay('#0F1011', '#FFFFFF', 0.03),
    bgSurfaceHover: solidOverlay('#0F1011', '#FFFFFF', 0.06),
    textPrimary: '#F7F8F8',
    textSecondary: '#A1A5A9',
    textTertiary: '#6A6A75',
    textMuted: '#4A4A52',
    accent: DEFAULT_ACCENT,
    accentHover: '#5247D9',
    accentLight: solidOverlay('#0F1011', DEFAULT_ACCENT, 0.15),
    borderSubtle: solidOverlay('#0F1011', '#FFFFFF', 0.08),
    borderDefault: solidOverlay('#0F1011', '#FFFFFF', 0.12),
    borderStrong: solidOverlay('#0F1011', '#FFFFFF', 0.20),
    hoverBg: solidOverlay('#0F1011', '#FFFFFF', 0.04),
    activeBg: solidOverlay('#0F1011', '#FFFFFF', 0.08),
}

// Prebuilt themes reference
const prebuiltThemes: Record<string, { colors: ThemeColors, isDark: boolean }> = {
    'dark-default': { isDark: true, colors: defaultDarkColors },
    'dark-blue': {
        isDark: true,
        colors: {
            bgBase: '#0A0D14',
            bgElevated: '#111827',
            bgSurface: solidOverlay('#111827', '#3B82F6', 0.05),
            bgSurfaceHover: solidOverlay('#111827', '#3B82F6', 0.08),
            textPrimary: '#F8FAFC',
            textSecondary: '#94A3B8',
            textTertiary: '#64748B',
            textMuted: '#475569',
            accent: '#3B82F6',
            accentHover: '#60A5FA',
            accentLight: solidOverlay('#111827', '#3B82F6', 0.15),
            borderSubtle: solidOverlay('#111827', '#3B82F6', 0.10),
            borderDefault: solidOverlay('#111827', '#3B82F6', 0.15),
            borderStrong: solidOverlay('#111827', '#3B82F6', 0.25),
            hoverBg: solidOverlay('#111827', '#3B82F6', 0.06),
            activeBg: solidOverlay('#111827', '#3B82F6', 0.12),
        }
    },
    'dark-purple': {
        isDark: true,
        colors: {
            bgBase: '#0D0A14',
            bgElevated: '#1A1625',
            bgSurface: solidOverlay('#1A1625', '#8B5CF6', 0.05),
            bgSurfaceHover: solidOverlay('#1A1625', '#8B5CF6', 0.08),
            textPrimary: '#FAF5FF',
            textSecondary: '#C4B5FD',
            textTertiary: '#A78BFA',
            textMuted: '#7C3AED',
            accent: '#8B5CF6',
            accentHover: '#A78BFA',
            accentLight: solidOverlay('#1A1625', '#8B5CF6', 0.15),
            borderSubtle: solidOverlay('#1A1625', '#8B5CF6', 0.10),
            borderDefault: solidOverlay('#1A1625', '#8B5CF6', 0.15),
            borderStrong: solidOverlay('#1A1625', '#8B5CF6', 0.25),
            hoverBg: solidOverlay('#1A1625', '#8B5CF6', 0.06),
            activeBg: solidOverlay('#1A1625', '#8B5CF6', 0.12),
        }
    },
    'dark-green': {
        isDark: true,
        colors: {
            bgBase: '#0A0F0D',
            bgElevated: '#0F1A14',
            bgSurface: solidOverlay('#0F1A14', '#22C55E', 0.05),
            bgSurfaceHover: solidOverlay('#0F1A14', '#22C55E', 0.08),
            textPrimary: '#F0FDF4',
            textSecondary: '#86EFAC',
            textTertiary: '#4ADE80',
            textMuted: '#22C55E',
            accent: '#22C55E',
            accentHover: '#4ADE80',
            accentLight: solidOverlay('#0F1A14', '#22C55E', 0.15),
            borderSubtle: solidOverlay('#0F1A14', '#22C55E', 0.10),
            borderDefault: solidOverlay('#0F1A14', '#22C55E', 0.15),
            borderStrong: solidOverlay('#0F1A14', '#22C55E', 0.25),
            hoverBg: solidOverlay('#0F1A14', '#22C55E', 0.06),
            activeBg: solidOverlay('#0F1A14', '#22C55E', 0.12),
        }
    },
    'light-default': {
        isDark: false,
        colors: {
            bgBase: '#F4F5F8',
            bgElevated: '#FFFFFF',
            bgSurface: solidOverlay('#FFFFFF', '#000000', 0.03),
            bgSurfaceHover: solidOverlay('#FFFFFF', '#000000', 0.06),
            textPrimary: '#08090A',
            textSecondary: '#3F4046',
            textTertiary: '#6A6A75',
            textMuted: '#9A9AA0',
            accent: DEFAULT_ACCENT,
            accentHover: '#4F46E5',
            accentLight: solidOverlay('#FFFFFF', DEFAULT_ACCENT, 0.12),
            borderSubtle: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.subtle),
            borderDefault: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.default),
            borderStrong: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.strong),
            hoverBg: solidOverlay('#FFFFFF', '#000000', 0.05),
            activeBg: solidOverlay('#FFFFFF', '#000000', 0.08),
        }
    },
    'light-warm': {
        isDark: false,
        colors: {
            bgBase: '#FFFBF5',
            bgElevated: '#FFFFFF',
            bgSurface: solidOverlay('#FFFFFF', '#FB923C', 0.04),
            bgSurfaceHover: solidOverlay('#FFFFFF', '#FB923C', 0.08),
            textPrimary: '#1C1917',
            textSecondary: '#44403C',
            textTertiary: '#78716C',
            textMuted: '#A8A29E',
            accent: '#F97316',
            accentHover: '#EA580C',
            accentLight: solidOverlay('#FFFFFF', '#FB923C', 0.12),
            borderSubtle: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.subtle),
            borderDefault: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.default),
            borderStrong: solidOverlay('#FFFFFF', '#000000', LIGHT_BORDER_ALPHA.strong),
            hoverBg: solidOverlay('#FFFFFF', '#000000', 0.05),
            activeBg: solidOverlay('#FFFFFF', '#000000', 0.08),
        }
    },
}

// Helper to convert hex/rgba to HSL string
function hexToHsl(color: string): string | null {
    let r: number | null = null
    let g: number | null = null
    let b: number | null = null

    if (color.startsWith('#')) {
        r = parseInt(color.slice(1, 3), 16) / 255
        g = parseInt(color.slice(3, 5), 16) / 255
        b = parseInt(color.slice(5, 7), 16) / 255
    } else {
        const rgbaMatch = color.match(/rgba?\(([^)]+)\)/i)
        if (rgbaMatch) {
            const parts = rgbaMatch[1].split(',').map(p => p.trim())
            if (parts.length >= 3) {
                const rNum = parseFloat(parts[0])
                const gNum = parseFloat(parts[1])
                const bNum = parseFloat(parts[2])
                if (!Number.isNaN(rNum) && !Number.isNaN(gNum) && !Number.isNaN(bNum)) {
                    r = rNum / 255
                    g = gNum / 255
                    b = bNum / 255
                }
            }
        }
    }

    if (r === null || g === null || b === null) return null

    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function isGradientValue(value: string | undefined): boolean {
    return typeof value === 'string' && value.includes('gradient')
}

function getAccentLight(accent: string, isDark: boolean, backdrop?: string): string {
    return solidOverlay(backdrop ?? (isDark ? DARK_BG : '#FFFFFF'), accent, isDark ? 0.15 : 0.12)
}

function extractFirstColorFromGradient(value: string, fallback: string): string {
    if (!isGradientValue(value)) return value
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
                return `#${[r, g, b].map((n) => {
                    const hex = Math.round(n).toString(16)
                    return hex.length === 1 ? `0${hex}` : hex
                }).join('')}`
            }
        }
    }
    return fallback
}

function softenAccentGradient(value: string, fallback: string, backdrop: string, alpha: number): string {
    const soften = (color: string) => hexToRgb(backdrop)
        ? solidOverlay(backdrop, color, alpha)
        : `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`

    if (!isGradientValue(value)) {
        const solid = soften(value)
        return `linear-gradient(${solid}, ${solid})`
    }

    let replaced = false
    const softened = value
        .replace(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/g, (color) => {
            replaced = true
            return soften(color)
        })
        .replace(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi, (_match, r, g, b) => {
            replaced = true
            return soften(rgbToHex(Number(r), Number(g), Number(b)))
        })

    if (replaced) return softened
    const solid = soften(fallback)
    return `linear-gradient(${solid}, ${solid})`
}

export function applyThemeColors(colors: ThemeColors, isDark: boolean) {
    const root = document.documentElement
    const themeColors = solidifyThemeColors(colors, isDark)
    const isAccentGradient = isGradientValue(themeColors.accent)
    const accentSolid = isAccentGradient ? extractFirstColorFromGradient(themeColors.accent, DEFAULT_ACCENT) : themeColors.accent
    const accentHoverSolid = isGradientValue(themeColors.accentHover)
        ? extractFirstColorFromGradient(themeColors.accentHover, accentSolid)
        : themeColors.accentHover
    const accentLight = isGradientValue(themeColors.accentLight)
        ? getAccentLight(accentSolid, isDark, themeColors.bgElevated)
        : themeColors.accentLight
    const accentGradient = isAccentGradient ? themeColors.accent : `linear-gradient(${accentSolid}, ${accentSolid})`
    const accentGradientHover = isGradientValue(themeColors.accentHover)
        ? themeColors.accentHover
        : `linear-gradient(${accentHoverSolid}, ${accentHoverSolid})`
    const accentGradientSoft = softenAccentGradient(themeColors.accent, accentSolid, themeColors.bgElevated, isDark ? 0.18 : 0.12)

    // Set dark/light mode attribute
    if (isDark) {
        root.classList.remove('light')
        root.removeAttribute('data-theme')
    } else {
        root.classList.add('light')
        root.setAttribute('data-theme', 'light')
    }

    // Apply app-specific tokens without colliding with shadcn's Tailwind tokens.
    root.style.setProperty('--app-bg-base', themeColors.bgBase)
    root.style.setProperty('--app-bg-elevated', themeColors.bgElevated)
    root.style.setProperty('--app-bg-surface', themeColors.bgSurface)
    root.style.setProperty('--app-bg-surface-hover', themeColors.bgSurfaceHover)
    root.style.setProperty('--app-text-primary', themeColors.textPrimary)
    root.style.setProperty('--app-text-secondary', themeColors.textSecondary)
    root.style.setProperty('--app-text-tertiary', themeColors.textTertiary)
    root.style.setProperty('--app-text-muted', themeColors.textMuted)
    root.style.setProperty('--app-accent', accentSolid)
    root.style.setProperty('--app-accent-hover', accentHoverSolid)
    root.style.setProperty('--app-accent-light', accentLight)
    root.style.setProperty('--app-accent-gradient', accentGradient)
    root.style.setProperty('--app-accent-gradient-hover', accentGradientHover)
    root.style.setProperty('--app-accent-gradient-soft', accentGradientSoft)
    root.style.setProperty('--app-border-subtle', themeColors.borderSubtle)
    root.style.setProperty('--app-border-default', themeColors.borderDefault)
    root.style.setProperty('--app-border-strong', themeColors.borderStrong)
    root.style.setProperty('--app-hover-bg', themeColors.hoverBg)
    root.style.setProperty('--app-active-bg', themeColors.activeBg)

    // Legacy variable mappings
    root.style.setProperty('--bg-base', themeColors.bgBase)
    root.style.setProperty('--bg-elevated', themeColors.bgElevated)
    root.style.setProperty('--bg-surface', themeColors.bgSurface)
    root.style.setProperty('--bg-surface-hover', themeColors.bgSurfaceHover)
    root.style.setProperty('--main-bg', themeColors.bgBase)
    root.style.setProperty('--sidebar-bg', themeColors.bgBase)
    root.style.setProperty('--content-bg', themeColors.bgElevated)
    root.style.setProperty('--card-bg', themeColors.bgSurface)
    root.style.setProperty('--text-primary', themeColors.textPrimary)
    root.style.setProperty('--text-secondary', themeColors.textSecondary)
    root.style.setProperty('--text-tertiary', themeColors.textTertiary)
    root.style.setProperty('--text-muted', themeColors.textMuted)
    root.style.setProperty('--accent-color', accentSolid)
    root.style.setProperty('--accent-color-hover', accentHoverSolid)
    root.style.setProperty('--accent-color-light', accentLight)
    root.style.setProperty('--primary-color', accentSolid)
    root.style.setProperty('--primary-color-light', accentLight)
    root.style.setProperty('--border-subtle', themeColors.borderSubtle)
    root.style.setProperty('--border-default', themeColors.borderDefault)
    root.style.setProperty('--border-strong', themeColors.borderStrong)
    root.style.setProperty('--border-color', themeColors.borderDefault)
    root.style.setProperty('--hover-bg', themeColors.hoverBg)
    root.style.setProperty('--active-bg', themeColors.activeBg)
    root.style.setProperty('--hover-card-bg', themeColors.bgSurfaceHover)
    root.style.setProperty('--input-bg', themeColors.bgSurface)
    root.style.setProperty('--accent-gradient', accentGradient)
    root.style.setProperty('--accent-gradient-hover', accentGradientHover)
    root.style.setProperty('--accent-gradient-soft', accentGradientSoft)

    // Icon color - white for dark mode, dark for light mode
    root.style.setProperty('--icon-color', isDark ? '#FFFFFF' : '#3F4046')
    root.style.setProperty('--icon-color-secondary', themeColors.textSecondary)
    root.style.setProperty('--icon-color-muted', themeColors.textMuted)

    // Complete CSS colors for shadcn's OKLCH/HSL-compatible variables.
    const accentHsl = hexToHsl(accentSolid)
    const hslColor = (value: string | null, fallback: string) => value ? `hsl(${value})` : fallback

    // Sidebar variables
    root.style.setProperty('--sidebar', themeColors.bgBase)
    root.style.setProperty('--sidebar-background', themeColors.bgBase)
    root.style.setProperty('--sidebar-foreground', themeColors.textPrimary)
    root.style.setProperty('--sidebar-primary', hslColor(accentHsl, 'oklch(0.511 0.262 276.966)'))
    root.style.setProperty('--sidebar-primary-foreground', 'oklch(1 0 0)')
    root.style.setProperty('--sidebar-accent', themeColors.hoverBg)
    root.style.setProperty('--sidebar-accent-solid', themeColors.hoverBg)
    root.style.setProperty('--sidebar-active-solid', themeColors.activeBg)
    root.style.setProperty('--sidebar-accent-foreground', themeColors.textPrimary)
    root.style.setProperty('--sidebar-border', themeColors.borderDefault)
    root.style.setProperty('--sidebar-ring', hslColor(accentHsl, 'hsl(220 90% 60%)'))

    // Core shadcn variables
    root.style.setProperty('--background', themeColors.bgElevated)
    root.style.setProperty('--foreground', themeColors.textPrimary)

    // Card
    root.style.setProperty('--card', themeColors.bgSurface)
    root.style.setProperty('--card-foreground', themeColors.textPrimary)

    // Popover
    root.style.setProperty('--popover', themeColors.bgElevated)
    root.style.setProperty('--popover-foreground', themeColors.textPrimary)
    root.style.setProperty('--tooltip-bg', themeColors.bgElevated)
    root.style.setProperty('--tooltip-foreground', themeColors.textPrimary)

    // Primary
    root.style.setProperty('--primary', hslColor(accentHsl, 'oklch(0.398 0.195 277.366)'))
    root.style.setProperty('--primary-foreground', 'oklch(1 0 0)')

    // Secondary
    root.style.setProperty('--secondary', themeColors.bgSurface)
    root.style.setProperty('--secondary-foreground', themeColors.textPrimary)

    // Muted
    root.style.setProperty('--muted', themeColors.bgSurface)
    root.style.setProperty('--muted-foreground', themeColors.textMuted)

    // Accent (hover backgrounds)
    root.style.setProperty('--accent', themeColors.hoverBg)
    root.style.setProperty('--accent-foreground', themeColors.textPrimary)

    // Destructive
    root.style.setProperty('--destructive', 'hsl(0 72% 51%)')
    root.style.setProperty('--destructive-foreground', 'oklch(1 0 0)')

    // Border and input - stronger borders for light mode visibility
    root.style.setProperty('--border', themeColors.borderDefault)
    root.style.setProperty('--input', themeColors.borderDefault)
    root.style.setProperty('--ring', hslColor(accentHsl, 'hsl(220 90% 60%)'))
}

// Color derivation helpers (matching ThemeBuilder.tsx)
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
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

function solidOverlay(backdrop: string, overlay: string, alpha: number): string {
    const backdropRgb = hexToRgb(backdrop)
    const overlayRgb = hexToRgb(overlay)
    if (!backdropRgb || !overlayRgb) return overlay

    const amount = Math.max(0, Math.min(1, alpha))
    return rgbToHex(
        backdropRgb.r * (1 - amount) + overlayRgb.r * amount,
        backdropRgb.g * (1 - amount) + overlayRgb.g * amount,
        backdropRgb.b * (1 - amount) + overlayRgb.b * amount
    )
}

function solidifyColor(value: string | undefined, fallback: string, backdrop: string): string {
    if (!value) return fallback
    if (isGradientValue(value)) return value
    if (value === 'transparent') return backdrop
    if (value.startsWith('#')) return value

    const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i)
    if (!rgbaMatch) return value

    const parts = rgbaMatch[1].split(',').map(p => p.trim())
    const r = parseFloat(parts[0])
    const g = parseFloat(parts[1])
    const b = parseFloat(parts[2])
    const alpha = parts[3] === undefined ? 1 : parseFloat(parts[3])
    if ([r, g, b, alpha].some(Number.isNaN)) return fallback

    const foreground = rgbToHex(r, g, b)
    return alpha >= 1 ? foreground : solidOverlay(backdrop, foreground, alpha)
}

function solidifyThemeColors(colors: ThemeColors, isDark: boolean): ThemeColors {
    const bgBase = solidifyColor(colors.bgBase, isDark ? DARK_BG : LIGHT_BG, isDark ? DARK_BG : '#FFFFFF')
    const bgElevated = solidifyColor(colors.bgElevated, isDark ? '#0F1011' : '#FFFFFF', bgBase)
    const accent = solidifyColor(colors.accent, DEFAULT_ACCENT, bgElevated)
    const accentHover = isGradientValue(colors.accentHover)
        ? colors.accentHover
        : solidifyColor(colors.accentHover, accent, bgElevated)

    return {
        bgBase,
        bgElevated,
        bgSurface: solidifyColor(colors.bgSurface, adjustAlpha(isDark ? 0.03 : 0.02, isDark, bgElevated), bgElevated),
        bgSurfaceHover: solidifyColor(colors.bgSurfaceHover, adjustAlpha(isDark ? 0.06 : 0.04, isDark, bgElevated), bgElevated),
        textPrimary: solidifyColor(colors.textPrimary, isDark ? '#F7F8F8' : '#08090A', bgElevated),
        textSecondary: solidifyColor(colors.textSecondary, isDark ? '#A1A5A9' : '#3F4046', bgElevated),
        textTertiary: solidifyColor(colors.textTertiary, '#6A6A75', bgElevated),
        textMuted: solidifyColor(colors.textMuted, isDark ? '#4A4A52' : '#9A9AA0', bgElevated),
        accent,
        accentHover,
        accentLight: solidifyColor(colors.accentLight, getAccentLight(accent, isDark, bgElevated), bgElevated),
        borderSubtle: solidifyColor(colors.borderSubtle, adjustAlpha(isDark ? 0.08 : LIGHT_BORDER_ALPHA.subtle, isDark, bgElevated), bgElevated),
        borderDefault: solidifyColor(colors.borderDefault, adjustAlpha(isDark ? 0.12 : LIGHT_BORDER_ALPHA.default, isDark, bgElevated), bgElevated),
        borderStrong: solidifyColor(colors.borderStrong, adjustAlpha(isDark ? 0.20 : LIGHT_BORDER_ALPHA.strong, isDark, bgElevated), bgElevated),
        hoverBg: solidifyColor(colors.hoverBg, adjustAlpha(isDark ? 0.04 : 0.03, isDark, bgElevated), bgElevated),
        activeBg: solidifyColor(colors.activeBg, adjustAlpha(isDark ? 0.08 : 0.06, isDark, bgElevated), bgElevated),
    }
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

function adjustAlpha(baseFactor: number, isDark: boolean, backdrop?: string): string {
    return solidOverlay(backdrop ?? (isDark ? DARK_BG : '#FFFFFF'), isDark ? '#FFFFFF' : '#000000', baseFactor)
}

// Generate derived colors from simple inputs (matching ThemeBuilder.tsx)
export function deriveFullColors(
    bgBase: string,
    accent: string,
    isDark: boolean,
    contrastLevel: number = 30,
    tintLevel: number = 0
): ThemeColors {
    const accentForCalc = isGradientValue(accent) ? extractFirstColorFromGradient(accent, DEFAULT_ACCENT) : accent

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

    const applyTint = (baseColor: string, tint: number): string => {
        if (tint === 0) return baseColor
        return mixColors(baseColor, accentForCalc, tint / 400)
    }

    const contrastFactor = contrastLevel / 30

    const bgElevated = applyTint(adjustBrightness(bgBase, (isDark ? 10 : -8) * contrastFactor), tintLevel)

    let textPrimary: string, textSecondary: string, textTertiary: string, textMuted: string
    if (isDark) {
        const baseLight = 247
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

    const accentHover = isGradientValue(accent) ? accent : adjustBrightness(accentForCalc, isDark ? 15 : -15)
    const accentLight = getAccentLight(accentForCalc, isDark, bgElevated)

    const borderSubtle = adjustAlpha((isDark ? 0.08 : LIGHT_BORDER_ALPHA.subtle) * contrastFactor, isDark, bgElevated)
    const borderDefault = adjustAlpha((isDark ? 0.12 : LIGHT_BORDER_ALPHA.default) * contrastFactor, isDark, bgElevated)
    const borderStrong = adjustAlpha((isDark ? 0.20 : LIGHT_BORDER_ALPHA.strong) * contrastFactor, isDark, bgElevated)
    const hoverBg = adjustAlpha(isDark ? 0.04 * contrastFactor : 0.03 * contrastFactor, isDark, bgElevated)
    const activeBg = adjustAlpha(isDark ? 0.08 * contrastFactor : 0.06 * contrastFactor, isDark, bgElevated)

    return {
        bgBase: applyTint(bgBase, tintLevel),
        bgElevated,
        bgSurface: adjustAlpha((isDark ? 0.03 : 0.02) * contrastFactor, isDark, bgElevated),
        bgSurfaceHover: adjustAlpha((isDark ? 0.06 : 0.04) * contrastFactor, isDark, bgElevated),
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

// Accent colors palette (matching ThemeBuilder.tsx)
export const ACCENT_COLORS: Record<string, string> = {
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
    return ACCENT_COLORS[accentName] || DEFAULT_ACCENT
}

export function loadAndApplySavedTheme(): boolean {
    if (typeof window === 'undefined') return false

    try {
        const saved = localStorage.getItem('millennium-theme')
        if (!saved) return false

        const parsed = JSON.parse(saved)

        // Handle ThemeBuilder's extended format with contrast/tint
        if (parsed.selectedAccent !== undefined || parsed.contrast !== undefined) {
            const isDark = parsed.isDark ?? true
            const contrast = parsed.contrast ?? 30
            const uiTint = parsed.uiTint ?? 0
            const selectedAccent = parsed.selectedAccent || 'default'
            const accentHex = getPresetAccent(selectedAccent)
            const bgBase = parsed.baseBg || parsed.customColors?.bgBase || (isDark ? DARK_BG : LIGHT_BG)

            const derivedColors = deriveFullColors(bgBase, accentHex, isDark, contrast, uiTint)
            const themeId = parsed.themeId || ''
            const isPresetTheme = themeId !== 'custom' && !themeId.startsWith('custom-')
            const finalColors = isPresetTheme ? derivedColors : { ...derivedColors, ...parsed.customColors }
            applyThemeColors(finalColors, isDark)
            return true
        }

        // Handle legacy format with prebuilt theme ID
        const baseTheme = prebuiltThemes[parsed.themeId]
        if (baseTheme) {
            const mergedColors = { ...baseTheme.colors, ...parsed.customColors }
            applyThemeColors(mergedColors, parsed.isDark ?? baseTheme.isDark)
            return true
        }

        // Handle custom themes with full color objects
        if (parsed.customColors && Object.keys(parsed.customColors).length > 0) {
            const isDark = parsed.isDark ?? true
            const defaultColors = isDark ? defaultDarkColors : prebuiltThemes['light-default'].colors
            const mergedColors = { ...defaultColors, ...parsed.customColors }
            applyThemeColors(mergedColors, isDark)
            return true
        }
    } catch (e) {
        console.error('Failed to load saved theme:', e)
    }

    return false
}
