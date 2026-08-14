"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { isDashboardPreview } from "@/lib/dashboard-preview"

export type AnimationCategoryKey =
    | "pageTransitions" | "microInteractions" | "hoverEffects" | "loadingAnimations"
    | "listStagger" | "sidebarAnimations" | "modalAnimations" | "toastAnimations"

export type EasingName = "standard" | "decelerate" | "accelerate" | "easeInOut" | "gentle" | "snappy" | "sharp" | "linear" | "spring" | "custom"

export interface CurvePoint { id: string; x: number; y: number }
export interface SavedAnimation { id: string; name: string; points: CurvePoint[] }
export interface CategoryAnimationSettings {
    enabled: boolean
    speed: number | null
    overrideReducedMotion: boolean
    easing: EasingName
    presetId: string
    curve: CurvePoint[]
}

export interface AnimationSettings {
    enableAnimations: boolean
    pageTransitions: boolean
    microInteractions: boolean
    hoverEffects: boolean
    loadingAnimations: boolean
    listStagger: boolean
    sidebarAnimations: boolean
    modalAnimations: boolean
    toastAnimations: boolean
    animationSpeed: number
    reduceMotion: boolean
    categories: Record<AnimationCategoryKey, CategoryAnimationSettings>
    savedAnimations: SavedAnimation[]
}

export const CATEGORY_KEYS: AnimationCategoryKey[] = [
    "pageTransitions", "microInteractions", "hoverEffects", "loadingAnimations",
    "listStagger", "sidebarAnimations", "modalAnimations", "toastAnimations",
]

export const EASING_CURVES: Record<Exclude<EasingName, "custom">, [number, number, number, number]> = {
    standard: [0.4, 0, 0.2, 1],
    decelerate: [0, 0, 0.2, 1],
    accelerate: [0.4, 0, 1, 1],
    easeInOut: [0.42, 0, 0.58, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    snappy: [0.2, 0.9, 0.2, 1],
    sharp: [0.4, 0, 0.6, 1],
    linear: [0, 0, 1, 1],
    spring: [0.34, 1.56, 0.64, 1],
}

export const CATEGORY_DEFAULTS: Record<AnimationCategoryKey, { duration: number; easing: Exclude<EasingName, "custom"> }> = {
    pageTransitions: { duration: 200, easing: "standard" },
    microInteractions: { duration: 140, easing: "snappy" },
    hoverEffects: { duration: 180, easing: "decelerate" },
    loadingAnimations: { duration: 800, easing: "linear" },
    listStagger: { duration: 260, easing: "decelerate" },
    sidebarAnimations: { duration: 240, easing: "standard" },
    modalAnimations: { duration: 220, easing: "decelerate" },
    toastAnimations: { duration: 320, easing: "spring" },
}

function cubicCoordinate(t: number, first: number, second: number): number {
    const inverse = 1 - t
    return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t
}

export function sampleBezier(curve: [number, number, number, number], count = 9): CurvePoint[] {
    return Array.from({ length: count }, (_, index) => {
        const x = index / (count - 1)
        let low = 0
        let high = 1
        for (let iteration = 0; iteration < 14; iteration += 1) {
            const middle = (low + high) / 2
            if (cubicCoordinate(middle, curve[0], curve[2]) < x) low = middle
            else high = middle
        }
        const t = (low + high) / 2
        return { id: index === 0 ? "start" : index === count - 1 ? "end" : `stop-${index}`, x, y: cubicCoordinate(t, curve[1], curve[3]) }
    })
}

const defaultCategory = (key: AnimationCategoryKey): CategoryAnimationSettings => ({
    enabled: true,
    speed: null,
    overrideReducedMotion: false,
    easing: CATEGORY_DEFAULTS[key].easing,
    presetId: CATEGORY_DEFAULTS[key].easing,
    curve: sampleBezier(EASING_CURVES[CATEGORY_DEFAULTS[key].easing]),
})

export const defaultAnimationSettings: AnimationSettings = {
    enableAnimations: true,
    pageTransitions: true,
    microInteractions: true,
    hoverEffects: true,
    loadingAnimations: true,
    listStagger: true,
    sidebarAnimations: true,
    modalAnimations: true,
    toastAnimations: true,
    animationSpeed: 100,
    reduceMotion: true,
    categories: Object.fromEntries(CATEGORY_KEYS.map(key => [key, defaultCategory(key)])) as AnimationSettings["categories"],
    savedAnimations: [],
}

const STORAGE_KEY = "millennium-animations-v4"
const OLD_STORAGE_KEYS = ["millennium-animations-v3", "millennium-animations-v2", "millennium-animations-v1"]
const BASE_DURATION = 200

function normalizeSettings(raw: Partial<AnimationSettings> & { animationSpeed?: number | string }, migrateDefaults = false): AnimationSettings {
    const oldSpeed = raw.animationSpeed
    const speed = typeof oldSpeed === "number" ? oldSpeed : oldSpeed === "slow" ? 67 : oldSpeed === "fast" ? 167 : 100
    const categories = Object.fromEntries(CATEGORY_KEYS.map(key => {
        const existing = raw.categories?.[key]
        const legacyEnabled = typeof raw[key] === "boolean" ? raw[key] : true
        const base = defaultCategory(key)
        const wasOldSidebarDefault = migrateDefaults && key === "sidebarAnimations" && existing?.easing === "easeInOut" && existing?.presetId === "easeInOut"
        const wasOldDefault = migrateDefaults && ((existing?.easing === "standard" && existing?.presetId === "standard") || wasOldSidebarDefault)
        const requestedEasing = wasOldDefault ? base.easing : existing?.easing ?? base.easing
        const easing = key === "pageTransitions" && requestedEasing === "spring" ? base.easing : requestedEasing
        const oldCurve = existing?.curve
        const rawCurve = !oldCurve || oldCurve.length === 4
            ? sampleBezier(EASING_CURVES[easing === "custom" ? "standard" : easing])
            : oldCurve
        const curve = key === "pageTransitions" ? rawCurve.map(point => ({ ...point, y: Math.max(0, Math.min(1, point.y)) })) : rawCurve
        const presetId = key === "pageTransitions" && existing?.presetId === "spring" ? easing : wasOldDefault ? easing : existing?.presetId ?? easing
        return [key, { ...base, ...existing, easing, curve, presetId, enabled: existing?.enabled ?? legacyEnabled }]
    })) as AnimationSettings["categories"]
    return { ...defaultAnimationSettings, ...raw, animationSpeed: speed, categories, savedAnimations: raw.savedAnimations ?? [] }
}

function curveCss(category: CategoryAnimationSettings): string {
    return `linear(${category.curve.map(point => `${Number(point.y.toFixed(3))} ${Number((point.x * 100).toFixed(2))}%`).join(",")})`
}

function applyAnimationVariables(settings: AnimationSettings): void {
    if (typeof window === "undefined") return
    const root = document.documentElement
    const systemReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const reduced = settings.reduceMotion && systemReduced
    const globalDuration = Math.round(BASE_DURATION * (100 / settings.animationSpeed))

    root.setAttribute("data-animations", settings.enableAnimations ? "enabled" : "disabled")
    root.setAttribute("data-reduce-motion", reduced ? "true" : "false")
    root.setAttribute("data-respect-reduced-motion", settings.reduceMotion ? "true" : "false")
    root.style.setProperty("--anim-duration-fast", `${Math.round(globalDuration * .75)}ms`)
    root.style.setProperty("--anim-duration-normal", `${globalDuration}ms`)
    root.style.setProperty("--anim-duration-slow", `${Math.round(globalDuration * 1.5)}ms`)
    root.style.setProperty("--anim-duration-bounce", `${Math.round(globalDuration * 1.5)}ms`)
    root.style.setProperty("--transition-fast", `${Math.round(globalDuration * .75)}ms cubic-bezier(0.4,0,0.2,1)`)
    root.style.setProperty("--transition-normal", `${globalDuration}ms cubic-bezier(0.4,0,0.2,1)`)
    root.style.setProperty("--transition-slow", `${Math.round(globalDuration * 1.5)}ms cubic-bezier(0.4,0,0.2,1)`)
    root.style.setProperty("--transition-bounce", `${Math.round(globalDuration * 1.5)}ms cubic-bezier(0.34,1.56,0.64,1)`)

    CATEGORY_KEYS.forEach(key => {
        const category = settings.categories[key]
        const enabled = settings.enableAnimations && category.enabled && (!reduced || category.overrideReducedMotion)
        const speed = category.speed ?? settings.animationSpeed
        root.setAttribute(`data-anim-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, enabled ? "enabled" : "disabled")
        root.style.setProperty(`--anim-${key}-duration`, `${Math.round(CATEGORY_DEFAULTS[key].duration * (100 / speed))}ms`)
        root.style.setProperty(`--anim-${key}-easing`, curveCss(category))
    })
}

export function useAnimationSettings() {
    const [settings, setSettings] = useState(defaultAnimationSettings)
    const [isLoaded, setIsLoaded] = useState(false)
    const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(false)
    const [canSyncRemote, setCanSyncRemote] = useState(false)
    const remoteHydrated = useRef(false)

    useEffect(() => {
        if (typeof window === "undefined") return
        let next = defaultAnimationSettings
        // Marketing previews render with shipped defaults instead of the visitor's saved settings.
        if (isDashboardPreview()) {
            setSettings(next)
            setSystemPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            applyAnimationVariables(next)
            return
        }
        try {
            const current = localStorage.getItem(STORAGE_KEY)
            const old = OLD_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean)
            if (current) next = normalizeSettings(JSON.parse(current))
            else if (old) next = normalizeSettings(JSON.parse(old), true)
        } catch (error) { console.error("Failed to load animation settings:", error) }
        setSettings(next)
        setSystemPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        applyAnimationVariables(next)
        setIsLoaded(true)

        const hydrateRemote = async () => {
            try {
                const response = await fetch("/api/user/preferences", { cache: "no-store", credentials: "same-origin" })
                if (!response.ok) return
                const payload = await response.json()
                setCanSyncRemote(true)
                if (payload.animationSettings) {
                    const remote = normalizeSettings(payload.animationSettings)
                    setSettings(remote)
                    applyAnimationVariables(remote)
                } else {
                    await fetch("/api/user/preferences", {
                        method: "PUT",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ animationSettings: next }),
                    })
                }
            } catch {
                // Offline/local mode continues using local cache.
            } finally {
                remoteHydrated.current = true
            }
        }
        void hydrateRemote()
    }, [])

    useEffect(() => {
        if (!isLoaded) return
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const change = (event: MediaQueryListEvent) => { setSystemPrefersReducedMotion(event.matches); applyAnimationVariables(settings) }
        query.addEventListener("change", change)
        return () => query.removeEventListener("change", change)
    }, [isLoaded, settings])

    useEffect(() => {
        if (!isLoaded) return
        applyAnimationVariables(settings)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }
        catch (error) { console.error("Failed to save animation settings:", error) }
    }, [settings, isLoaded])

    useEffect(() => {
        if (!isLoaded || !canSyncRemote || !remoteHydrated.current) return
        const timeout = window.setTimeout(() => {
            void fetch("/api/user/preferences", {
                method: "PUT",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ animationSettings: settings }),
            }).catch(() => undefined)
        }, 400)
        return () => window.clearTimeout(timeout)
    }, [settings, isLoaded, canSyncRemote])

    const updateSetting = useCallback(<K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) => {
        setSettings(previous => {
            if (CATEGORY_KEYS.includes(key as AnimationCategoryKey) && typeof value === "boolean") {
                const categoryKey = key as AnimationCategoryKey
                return { ...previous, [key]: value, categories: { ...previous.categories, [categoryKey]: { ...previous.categories[categoryKey], enabled: value } } }
            }
            return { ...previous, [key]: value }
        })
    }, [])
    const updateSettings = useCallback((updates: Partial<AnimationSettings>) => setSettings(previous => normalizeSettings({ ...previous, ...updates })), [])
    const resetSettings = useCallback(() => setSettings(defaultAnimationSettings), [])
    const toggleAllAnimations = useCallback((enabled: boolean) => setSettings(previous => ({
        ...previous, enableAnimations: enabled,
        categories: Object.fromEntries(CATEGORY_KEYS.map(key => [key, { ...previous.categories[key], enabled }])) as AnimationSettings["categories"],
        ...Object.fromEntries(CATEGORY_KEYS.map(key => [key, enabled])),
    })), [])
    const animationsEnabled = useMemo(() => settings.enableAnimations && !(settings.reduceMotion && systemPrefersReducedMotion), [settings, systemPrefersReducedMotion])

    return { settings, isLoaded, animationsEnabled, systemPrefersReducedMotion, updateSetting, updateSettings, resetSettings, toggleAllAnimations }
}

export default useAnimationSettings
