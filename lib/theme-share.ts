import { z } from 'zod'

import { DARK_BG, DEFAULT_ACCENT, LIGHT_BG, deriveFullColors, type ThemeColors } from './theme'

/**
 * Theme share codes are self-contained: the whole palette travels inside the code, so importing
 * one never needs a server round trip and codes keep working offline. Colours are serialised as a
 * fixed-order array rather than an object to keep the encoded payload short.
 */
export const THEME_SHARE_PREFIX = 'MT1.'

export const THEME_COLOR_ORDER = [
    'bgBase',
    'bgElevated',
    'bgSurface',
    'bgSurfaceHover',
    'textPrimary',
    'textSecondary',
    'textTertiary',
    'textMuted',
    'accent',
    'accentHover',
    'accentLight',
    'borderSubtle',
    'borderDefault',
    'borderStrong',
    'hoverBg',
    'activeBg',
] as const satisfies readonly (keyof ThemeColors)[]

export const THEME_NAME_MAX_LENGTH = 60
export const COLOR_VALUE_MAX_LENGTH = 400
const SHARE_CODE_MAX_LENGTH = 8_000

// Colour values end up inside inline styles and CSS custom properties, so a shared or uploaded
// theme must not be able to smuggle in a fetching or escaping construct: `url()` and `image-set()`
// would make the viewer's browser call out to a third party just by rendering a theme card.
const UNSAFE_CSS_VALUE = /url\s*\(|image-set|element\s*\(|expression|javascript:|@import|[;{}<>\\]/i
const ALLOWED_CSS_VALUE_CHARS = /^[#a-z0-9(),.%\s/+-]+$/i

export function isSafeCssColorValue(value: string): boolean {
    return !UNSAFE_CSS_VALUE.test(value) && ALLOWED_CSS_VALUE_CHARS.test(value)
}

export const cssColorValueSchema = z
    .string()
    .trim()
    .min(1)
    .max(COLOR_VALUE_MAX_LENGTH)
    .refine(isSafeCssColorValue, { message: 'Unsupported colour value' })

export interface ShareableTheme {
    name: string
    isDark: boolean
    isAdvanced: boolean
    colors: ThemeColors
}

export class ThemeShareError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ThemeShareError'
    }
}

const sharePayloadSchema = z.object({
    v: z.literal(1),
    n: z.string().trim().min(1).max(THEME_NAME_MAX_LENGTH),
    d: z.union([z.literal(0), z.literal(1)]),
    a: z.union([z.literal(0), z.literal(1)]),
    c: z.array(cssColorValueSchema).length(THEME_COLOR_ORDER.length),
}).strict()

export const shareableThemeSchema = z.object({
    name: z.string().trim().min(1).max(THEME_NAME_MAX_LENGTH),
    isDark: z.boolean(),
    isAdvanced: z.boolean(),
    // Unknown keys are stripped rather than rejected so themes saved by older builds still share.
    colors: z.object(
        Object.fromEntries(
            THEME_COLOR_ORDER.map((key) => [key, cssColorValueSchema])
        ) as Record<(typeof THEME_COLOR_ORDER)[number], typeof cssColorValueSchema>
    ),
})

function toBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
    const normalised = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes
}

/**
 * Fills in any missing colour so a partially populated theme still produces a complete,
 * legible palette on the importing side.
 */
export function completeThemeColors(colors: Partial<ThemeColors>, isDark: boolean): ThemeColors {
    const derived = deriveFullColors(
        colors.bgBase || (isDark ? DARK_BG : LIGHT_BG),
        colors.accent || DEFAULT_ACCENT,
        isDark
    )

    return THEME_COLOR_ORDER.reduce((accumulator, key) => {
        accumulator[key] = colors[key] || derived[key]
        return accumulator
    }, {} as ThemeColors)
}

export function encodeThemeShareCode(theme: {
    name: string
    isDark: boolean
    isAdvanced: boolean
    colors: Partial<ThemeColors>
}): string {
    const parsed = shareableThemeSchema.parse({
        ...theme,
        name: theme.name.slice(0, THEME_NAME_MAX_LENGTH),
        colors: completeThemeColors(theme.colors, theme.isDark),
    })

    const payload = {
        v: 1 as const,
        n: parsed.name,
        d: parsed.isDark ? 1 : 0,
        a: parsed.isAdvanced ? 1 : 0,
        c: THEME_COLOR_ORDER.map((key) => parsed.colors[key]),
    }

    return THEME_SHARE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeThemeShareCode(code: string): ShareableTheme {
    const trimmed = code.trim()
    if (!trimmed) {
        throw new ThemeShareError('Enter a theme code.')
    }
    if (trimmed.length > SHARE_CODE_MAX_LENGTH) {
        throw new ThemeShareError('That theme code is too long.')
    }
    if (!trimmed.startsWith(THEME_SHARE_PREFIX)) {
        throw new ThemeShareError('That is not a Millennium theme code.')
    }

    const body = trimmed.slice(THEME_SHARE_PREFIX.length)
    if (!/^[A-Za-z0-9_-]+$/.test(body)) {
        throw new ThemeShareError('That theme code contains unexpected characters.')
    }

    let payload: unknown
    try {
        payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)))
    } catch {
        throw new ThemeShareError('That theme code could not be read.')
    }

    const result = sharePayloadSchema.safeParse(payload)
    if (!result.success) {
        throw new ThemeShareError('That theme code is not valid.')
    }

    const isDark = result.data.d === 1
    const colors = THEME_COLOR_ORDER.reduce((accumulator, key, index) => {
        accumulator[key] = result.data.c[index]
        return accumulator
    }, {} as ThemeColors)

    return {
        name: result.data.n,
        isDark,
        isAdvanced: result.data.a === 1,
        colors: completeThemeColors(colors, isDark),
    }
}
