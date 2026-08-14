import {
    ACCENT_COLORS,
    DARK_BG,
    DEFAULT_ACCENT,
    LIGHT_BG,
    deriveFullColors,
    type ThemeColors,
} from "../../lib/theme.ts"

export type ThemeCreateMode = "simple" | "advanced"

export type ThemeBuilderTheme = {
    id: string
    name: string
    colors: ThemeColors
    isDark: boolean
    isAdvanced?: boolean
}

export function modeFromAdvanced(isAdvanced: boolean | undefined): ThemeCreateMode {
    return isAdvanced ? "advanced" : "simple"
}

export function isAdvancedMode(mode: ThemeCreateMode): boolean {
    return mode === "advanced"
}

export function splitThemesByMode<T extends { isAdvanced?: boolean }>(themes: T[]) {
    return {
        simpleThemes: themes.filter((theme) => !theme.isAdvanced),
        advancedThemes: themes.filter((theme) => theme.isAdvanced),
    }
}

export function getAccentColor(accentName?: string) {
    if (!accentName || accentName === "default") return DEFAULT_ACCENT
    return ACCENT_COLORS[accentName] || DEFAULT_ACCENT
}

export function getBaseBackground(isDark: boolean) {
    return isDark ? DARK_BG : LIGHT_BG
}

export function buildSimpleThemeColors({
    isDark,
    accentName = "default",
    accent,
    background,
    contrast = 30,
    uiTint = 0,
}: {
    isDark: boolean
    accentName?: string
    accent?: string
    background?: string
    contrast?: number
    uiTint?: number
}) {
    return deriveFullColors(
        background || getBaseBackground(isDark),
        accent || getAccentColor(accentName),
        isDark,
        contrast,
        uiTint
    )
}
