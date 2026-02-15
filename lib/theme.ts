// Theme utility - Loads and applies saved theme
// This can be imported and called on app initialization

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

interface SavedTheme {
    themeId: string
    customColors: Partial<ThemeColors>
    isDark: boolean
}

const defaultDarkColors: ThemeColors = {
    bgBase: '#08090A',
    bgElevated: '#0F1011',
    bgSurface: 'rgba(255, 255, 255, 0.03)',
    bgSurfaceHover: 'rgba(255, 255, 255, 0.06)',
    textPrimary: '#F7F8F8',
    textSecondary: '#A1A5A9',
    textTertiary: '#6A6A75',
    textMuted: '#4A4A52',
    accent: '#6468F0',
    accentHover: '#7377F2',
    accentLight: 'rgba(100, 104, 240, 0.15)',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    borderDefault: 'rgba(255, 255, 255, 0.12)',
    borderStrong: 'rgba(255, 255, 255, 0.20)',
    hoverBg: 'rgba(255, 255, 255, 0.04)',
    activeBg: 'rgba(255, 255, 255, 0.08)',
}

// Prebuilt themes reference
const prebuiltThemes: Record<string, { colors: ThemeColors, isDark: boolean }> = {
    'dark-default': { isDark: true, colors: defaultDarkColors },
    'dark-blue': {
        isDark: true,
        colors: {
            bgBase: '#0A0D14',
            bgElevated: '#111827',
            bgSurface: 'rgba(59, 130, 246, 0.05)',
            bgSurfaceHover: 'rgba(59, 130, 246, 0.08)',
            textPrimary: '#F8FAFC',
            textSecondary: '#94A3B8',
            textTertiary: '#64748B',
            textMuted: '#475569',
            accent: '#3B82F6',
            accentHover: '#60A5FA',
            accentLight: 'rgba(59, 130, 246, 0.15)',
            borderSubtle: 'rgba(59, 130, 246, 0.1)',
            borderDefault: 'rgba(59, 130, 246, 0.15)',
            borderStrong: 'rgba(59, 130, 246, 0.25)',
            hoverBg: 'rgba(59, 130, 246, 0.06)',
            activeBg: 'rgba(59, 130, 246, 0.12)',
        }
    },
    'dark-purple': {
        isDark: true,
        colors: {
            bgBase: '#0D0A14',
            bgElevated: '#1A1625',
            bgSurface: 'rgba(139, 92, 246, 0.05)',
            bgSurfaceHover: 'rgba(139, 92, 246, 0.08)',
            textPrimary: '#FAF5FF',
            textSecondary: '#C4B5FD',
            textTertiary: '#A78BFA',
            textMuted: '#7C3AED',
            accent: '#8B5CF6',
            accentHover: '#A78BFA',
            accentLight: 'rgba(139, 92, 246, 0.15)',
            borderSubtle: 'rgba(139, 92, 246, 0.1)',
            borderDefault: 'rgba(139, 92, 246, 0.15)',
            borderStrong: 'rgba(139, 92, 246, 0.25)',
            hoverBg: 'rgba(139, 92, 246, 0.06)',
            activeBg: 'rgba(139, 92, 246, 0.12)',
        }
    },
    'dark-green': {
        isDark: true,
        colors: {
            bgBase: '#0A0F0D',
            bgElevated: '#0F1A14',
            bgSurface: 'rgba(34, 197, 94, 0.05)',
            bgSurfaceHover: 'rgba(34, 197, 94, 0.08)',
            textPrimary: '#F0FDF4',
            textSecondary: '#86EFAC',
            textTertiary: '#4ADE80',
            textMuted: '#22C55E',
            accent: '#22C55E',
            accentHover: '#4ADE80',
            accentLight: 'rgba(34, 197, 94, 0.15)',
            borderSubtle: 'rgba(34, 197, 94, 0.1)',
            borderDefault: 'rgba(34, 197, 94, 0.15)',
            borderStrong: 'rgba(34, 197, 94, 0.25)',
            hoverBg: 'rgba(34, 197, 94, 0.06)',
            activeBg: 'rgba(34, 197, 94, 0.12)',
        }
    },
    'light-default': {
        isDark: false,
        colors: {
            bgBase: '#F4F5F8',
            bgElevated: '#FFFFFF',
            bgSurface: 'rgba(0, 0, 0, 0.03)',
            bgSurfaceHover: 'rgba(0, 0, 0, 0.06)',
            textPrimary: '#08090A',
            textSecondary: '#3F4046',
            textTertiary: '#6A6A75',
            textMuted: '#9A9AA0',
            accent: '#6468F0',
            accentHover: '#5458E0',
            accentLight: 'rgba(100, 104, 240, 0.12)',
            borderSubtle: 'rgba(0, 0, 0, 0.15)',
            borderDefault: 'rgba(0, 0, 0, 0.18)',
            borderStrong: 'rgba(0, 0, 0, 0.25)',
            hoverBg: 'rgba(0, 0, 0, 0.05)',
            activeBg: 'rgba(0, 0, 0, 0.08)',
        }
    },
    'light-warm': {
        isDark: false,
        colors: {
            bgBase: '#FFFBF5',
            bgElevated: '#FFFFFF',
            bgSurface: 'rgba(251, 146, 60, 0.04)',
            bgSurfaceHover: 'rgba(251, 146, 60, 0.08)',
            textPrimary: '#1C1917',
            textSecondary: '#44403C',
            textTertiary: '#78716C',
            textMuted: '#A8A29E',
            accent: '#F97316',
            accentHover: '#EA580C',
            accentLight: 'rgba(251, 146, 60, 0.12)',
            borderSubtle: 'rgba(0, 0, 0, 0.08)',
            borderDefault: 'rgba(0, 0, 0, 0.12)',
            borderStrong: 'rgba(0, 0, 0, 0.2)',
            hoverBg: 'rgba(0, 0, 0, 0.05)',
            activeBg: 'rgba(0, 0, 0, 0.08)',
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

export function applyThemeColors(colors: ThemeColors, isDark: boolean) {
    const root = document.documentElement
    const isAccentGradient = isGradientValue(colors.accent)
    const accentSolid = isAccentGradient ? extractFirstColorFromGradient(colors.accent, '#6468F0') : colors.accent
    const accentHoverSolid = isGradientValue(colors.accentHover)
        ? extractFirstColorFromGradient(colors.accentHover, accentSolid)
        : colors.accentHover

    // Set dark/light mode attribute
    if (isDark) {
        root.classList.remove('light')
        root.removeAttribute('data-theme')
    } else {
        root.classList.add('light')
        root.setAttribute('data-theme', 'light')
    }

    // Apply all colors
    root.style.setProperty('--color-bg-base', colors.bgBase)
    root.style.setProperty('--color-bg-elevated', colors.bgElevated)
    root.style.setProperty('--color-bg-surface', colors.bgSurface)
    root.style.setProperty('--color-bg-surface-hover', colors.bgSurfaceHover)
    root.style.setProperty('--color-text-primary', colors.textPrimary)
    root.style.setProperty('--color-text-secondary', colors.textSecondary)
    root.style.setProperty('--color-text-tertiary', colors.textTertiary)
    root.style.setProperty('--color-text-muted', colors.textMuted)
    root.style.setProperty('--color-accent', accentSolid)
    root.style.setProperty('--color-accent-hover', accentHoverSolid)
    root.style.setProperty('--color-accent-light', colors.accentLight)
    root.style.setProperty('--color-border-subtle', colors.borderSubtle)
    root.style.setProperty('--color-border-default', colors.borderDefault)
    root.style.setProperty('--color-border-strong', colors.borderStrong)
    root.style.setProperty('--color-hover-bg', colors.hoverBg)
    root.style.setProperty('--color-active-bg', colors.activeBg)

    // Legacy variable mappings
    root.style.setProperty('--bg-base', colors.bgBase)
    root.style.setProperty('--bg-elevated', colors.bgElevated)
    root.style.setProperty('--bg-surface', colors.bgSurface)
    root.style.setProperty('--bg-surface-hover', colors.bgSurfaceHover)
    root.style.setProperty('--main-bg', colors.bgBase)
    root.style.setProperty('--sidebar-bg', colors.bgBase)
    root.style.setProperty('--content-bg', colors.bgElevated)
    root.style.setProperty('--card-bg', colors.bgSurface)
    root.style.setProperty('--text-primary', colors.textPrimary)
    root.style.setProperty('--text-secondary', colors.textSecondary)
    root.style.setProperty('--text-tertiary', colors.textTertiary)
    root.style.setProperty('--text-muted', colors.textMuted)
    root.style.setProperty('--accent-color', accentSolid)
    root.style.setProperty('--accent-color-hover', accentHoverSolid)
    root.style.setProperty('--accent-color-light', colors.accentLight)
    root.style.setProperty('--primary-color', accentSolid)
    root.style.setProperty('--primary-color-light', colors.accentLight)
    root.style.setProperty('--border-subtle', colors.borderSubtle)
    root.style.setProperty('--border-default', colors.borderDefault)
    root.style.setProperty('--border-strong', colors.borderStrong)
    root.style.setProperty('--border-color', colors.borderDefault)
    root.style.setProperty('--hover-bg', colors.hoverBg)
    root.style.setProperty('--active-bg', colors.activeBg)
    root.style.setProperty('--hover-card-bg', colors.bgSurfaceHover)
    root.style.setProperty('--input-bg', colors.bgSurface)
    root.style.setProperty('--accent-gradient', isAccentGradient ? colors.accent : accentSolid)
    root.style.setProperty('--accent-gradient-hover', isAccentGradient ? colors.accentHover : accentHoverSolid)

    // Icon color - white for dark mode, dark for light mode
    root.style.setProperty('--icon-color', isDark ? '#FFFFFF' : '#3F4046')
    root.style.setProperty('--icon-color-secondary', isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)')
    root.style.setProperty('--icon-color-muted', isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.5)')

    // Sidebar HSL variables for shadcn
    const bgBaseHsl = hexToHsl(colors.bgBase)
    const bgElevatedHsl = hexToHsl(colors.bgElevated)
    const textPrimaryHsl = hexToHsl(colors.textPrimary)
    const textSecondaryHsl = hexToHsl(colors.textSecondary)
    const textMutedHsl = hexToHsl(colors.textMuted)
    const accentHsl = hexToHsl(accentSolid)

    // Helper to parse rgba and create HSL - since some theme colors use rgba
    const parseHoverBgHsl = () => {
        // For light mode, we need darker hover. For dark mode, lighter hover.
        if (isDark) {
            // Light overlay for dark mode
            return hexToHsl(colors.bgElevated) || '0 0% 15%'
        } else {
            // Darker overlay for light mode - use darker gray
            return '0 0% 88%'
        }
    }

    const hoverBgHsl = parseHoverBgHsl()

    // Sidebar variables
    if (bgBaseHsl) root.style.setProperty('--sidebar-background', bgBaseHsl)
    if (textPrimaryHsl) root.style.setProperty('--sidebar-foreground', textPrimaryHsl)
    if (accentHsl) root.style.setProperty('--sidebar-primary', accentHsl)
    if (textPrimaryHsl) root.style.setProperty('--sidebar-primary-foreground', '0 0% 100%')
    root.style.setProperty('--sidebar-accent', hoverBgHsl)
    // Add transparent version for proper UI tint behavior in light mode
    root.style.setProperty('--sidebar-accent-transparent', colors.hoverBg)
    root.style.setProperty('--sidebar-active-transparent', colors.activeBg)
    if (textPrimaryHsl) root.style.setProperty('--sidebar-accent-foreground', textPrimaryHsl)
    if (textMutedHsl) root.style.setProperty('--sidebar-border', isDark ? '0 0% 20%' : '0 0% 85%')
    root.style.setProperty('--sidebar-ring', accentHsl || '220 90% 60%')

    // Core shadcn HSL variables
    if (bgBaseHsl) root.style.setProperty('--background', bgBaseHsl)
    if (textPrimaryHsl) root.style.setProperty('--foreground', textPrimaryHsl)

    // Card
    if (bgElevatedHsl) root.style.setProperty('--card', bgElevatedHsl)
    if (textPrimaryHsl) root.style.setProperty('--card-foreground', textPrimaryHsl)

    // Popover
    if (bgElevatedHsl) root.style.setProperty('--popover', bgElevatedHsl)
    if (textPrimaryHsl) root.style.setProperty('--popover-foreground', textPrimaryHsl)

    // Primary
    if (accentHsl) root.style.setProperty('--primary', accentHsl)
    root.style.setProperty('--primary-foreground', '0 0% 100%')

    // Secondary
    root.style.setProperty('--secondary', isDark ? '0 0% 15%' : '0 0% 93%')
    if (textPrimaryHsl) root.style.setProperty('--secondary-foreground', textPrimaryHsl)

    // Muted
    root.style.setProperty('--muted', isDark ? '0 0% 12%' : '0 0% 95%')
    if (textMutedHsl) root.style.setProperty('--muted-foreground', textMutedHsl)

    // Accent (hover backgrounds)
    root.style.setProperty('--accent', hoverBgHsl)
    if (textPrimaryHsl) root.style.setProperty('--accent-foreground', textPrimaryHsl)

    // Destructive
    root.style.setProperty('--destructive', '0 72% 51%')
    root.style.setProperty('--destructive-foreground', '0 0% 100%')

    // Border and input - stronger borders for light mode visibility
    root.style.setProperty('--border', isDark ? '0 0% 18%' : '0 0% 80%')
    root.style.setProperty('--input', isDark ? '0 0% 18%' : '0 0% 80%')
    root.style.setProperty('--ring', accentHsl || '220 90% 60%')
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
    const base = isDark ? 255 : 0
    return `rgba(${base}, ${base}, ${base}, ${baseFactor})`
}

// Generate derived colors from simple inputs (matching ThemeBuilder.tsx)
function deriveFullColors(
    bgBase: string,
    accent: string,
    isDark: boolean,
    contrastLevel: number = 30,
    tintLevel: number = 0
): ThemeColors {
    const accentForCalc = isGradientValue(accent) ? extractFirstColorFromGradient(accent, '#6468F0') : accent

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
    const accentRgb = hexToRgb(accentForCalc)
    const accentLight = isGradientValue(accent)
        ? accent
        : accentRgb
            ? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${isDark ? 0.15 : 0.12})`
            : adjustAlpha(0.15, isDark)

    const borderSubtle = adjustAlpha(isDark ? 0.08 * contrastFactor : 0.06 * contrastFactor, isDark)
    const borderDefault = adjustAlpha(isDark ? 0.12 * contrastFactor : 0.1 * contrastFactor, isDark)
    const borderStrong = adjustAlpha(isDark ? 0.20 * contrastFactor : 0.15 * contrastFactor, isDark)
    const hoverBg = adjustAlpha(isDark ? 0.04 * contrastFactor : 0.03 * contrastFactor, isDark)
    const activeBg = adjustAlpha(isDark ? 0.08 * contrastFactor : 0.06 * contrastFactor, isDark)

    return {
        bgBase: applyTint(bgBase, tintLevel),
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

// Accent colors palette (matching ThemeBuilder.tsx)
const ACCENT_COLORS: Record<string, string> = {
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

const DARK_BG = '#08090A'
const LIGHT_BG = '#F5F5F7'

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
            const accentHex = selectedAccent === 'default' ? '#6468F0' : (ACCENT_COLORS[selectedAccent] || '#6468F0')
            const bgBase = isDark ? DARK_BG : LIGHT_BG

            const derivedColors = deriveFullColors(bgBase, accentHex, isDark, contrast, uiTint)
            // Merge any custom overrides
            const finalColors = { ...derivedColors, ...parsed.customColors }
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
