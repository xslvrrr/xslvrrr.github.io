"use client"

import * as React from "react"
import { cn } from "../../lib/utils"
import { IconPaint, IconPlus, IconMinus, IconArrowLeft, IconCheck } from "@tabler/icons-react"

// ============================================
// COLOR UTILITY FUNCTIONS
// ============================================

interface HSV {
    h: number
    s: number
    v: number
}

interface RGB {
    r: number
    g: number
    b: number
}

function hexToRgb(hex: string): RGB | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? "0" + hex : hex
    }).join("")
}

function rgbToHsv(r: number, g: number, b: number): HSV {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    let h = 0
    const s = max === 0 ? 0 : d / max
    const v = max

    if (max !== min) {
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }

    return { h: h * 360, s: s * 100, v: v * 100 }
}

function hsvToRgb(h: number, s: number, v: number): RGB {
    h /= 360
    s /= 100
    v /= 100

    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)

    let r, g, b
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break
        case 1: r = q; g = v; b = p; break
        case 2: r = p; g = v; b = t; break
        case 3: r = p; g = q; b = v; break
        case 4: r = t; g = p; b = v; break
        case 5: r = v; g = p; b = q; break
        default: r = 0; g = 0; b = 0
    }

    return { r: r * 255, g: g * 255, b: b * 255 }
}

function hexToHsv(hex: string): HSV | null {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

function hsvToHex(h: number, s: number, v: number): string {
    const rgb = hsvToRgb(h, s, v)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function isValidHex(hex: string): boolean {
    return /^#?([a-f\d]{3}|[a-f\d]{6})$/i.test(hex)
}

function normalizeHex(hex: string): string {
    if (!hex.startsWith("#")) return hex
    if (hex.length === 4) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    return hex
}

function parseRgba(value: string): { hex: string; alpha: number } | null {
    const match = value.match(/rgba?\(([^)]+)\)/i)
    if (!match) return null
    const parts = match[1].split(",").map(p => p.trim())
    if (parts.length < 3) return null
    const r = parseFloat(parts[0])
    const g = parseFloat(parts[1])
    const b = parseFloat(parts[2])
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    const a = parts[3] !== undefined ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1
    return { hex: rgbToHex(r, g, b), alpha: Number.isNaN(a) ? 1 : a }
}

function parseColorValue(value: string | undefined, fallbackHex: string): { hex: string; alpha: number } {
    if (!value || isGradientValue(value)) {
        return { hex: normalizeHex(fallbackHex), alpha: 1 }
    }
    if (value.startsWith("#") && isValidHex(value)) {
        return { hex: normalizeHex(value), alpha: 1 }
    }
    const rgba = parseRgba(value)
    if (rgba) return rgba
    return { hex: normalizeHex(fallbackHex), alpha: 1 }
}

export function hexToRgba(hex: string, alpha: number): string {
    const rgb = hexToRgb(hex)
    if (!rgb) return `rgba(0, 0, 0, ${alpha})`
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function formatColorWithAlpha(hex: string, alpha: number): string {
    const clamped = Math.max(0, Math.min(1, alpha))
    return clamped >= 1 ? hex : hexToRgba(hex, clamped)
}

// ============================================
// GRADIENT TYPES & UTILITIES
// ============================================

export interface GradientStop {
    id: string
    color: string
    position: number
}

export interface GradientValue {
    type: 'linear' | 'radial' | 'conic'
    angle: number
    stops: GradientStop[]
}

export function generateGradientCSS(gradient: GradientValue, forceAngle?: number): string {
    const sortedStops = [...gradient.stops].sort((a, b) => a.position - b.position)
    const angle = forceAngle !== undefined ? forceAngle : gradient.angle
    
    const stopStrings = sortedStops.map((s, i) => {
        let pos = s.position
        if (i === 0) pos = 0
        if (i === sortedStops.length - 1) pos = 100
        return `${s.color} ${pos}%`
    }).join(', ')

    if (gradient.type === 'linear') {
        return `linear-gradient(${angle}deg, ${stopStrings})`
    } else if (gradient.type === 'radial') {
        return `radial-gradient(circle, ${stopStrings})`
    } else {
        return `conic-gradient(from ${angle}deg, ${stopStrings})`
    }
}

export function isGradientValue(value: string): boolean {
    return value?.includes('gradient') || false
}

const GRADIENT_PRESETS: GradientValue[] = [
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#667eea', position: 0 }, { id: '2', color: '#764ba2', position: 100 }] },
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#f093fb', position: 0 }, { id: '2', color: '#f5576c', position: 100 }] },
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#4facfe', position: 0 }, { id: '2', color: '#00f2fe', position: 100 }] },
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#43e97b', position: 0 }, { id: '2', color: '#38f9d7', position: 100 }] },
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#fa709a', position: 0 }, { id: '2', color: '#fee140', position: 100 }] },
    { type: 'linear', angle: 135, stops: [{ id: '1', color: '#a8edea', position: 0 }, { id: '2', color: '#fed6e3', position: 100 }] },
    { type: 'linear', angle: 180, stops: [{ id: '1', color: '#ef4444', position: 0 }, { id: '2', color: '#8b5cf6', position: 100 }] },
    { type: 'linear', angle: 90, stops: [{ id: '1', color: '#3b82f6', position: 0 }, { id: '2', color: '#8b5cf6', position: 50 }, { id: '3', color: '#ec4899', position: 100 }] },
]

// ============================================
// CONTEXT
// ============================================

interface AdvancedColorPickerContextValue {
    value: string
    hsv: HSV
    alpha: number
    onChange: (color: string) => void
    setHsv: (hsv: HSV) => void
    setAlpha: (alpha: number) => void
    isGradient: boolean
    setIsGradient: (isGradient: boolean) => void
    gradient: GradientValue
    setGradient: (gradient: GradientValue) => void
    activeStopId: string | null
    setActiveStopId: (id: string | null) => void
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    onSubmit: () => void
    onCancel: () => void
    enableGradient: boolean
}

const AdvancedColorPickerContext = React.createContext<AdvancedColorPickerContextValue | null>(null)

function useAdvancedColorPicker() {
    const context = React.useContext(AdvancedColorPickerContext)
    if (!context) {
        throw new Error("useAdvancedColorPicker must be used within an AdvancedColorPicker")
    }
    return context
}

// ============================================
// MAIN COMPONENT
// ============================================

export interface AdvancedColorPickerProps {
    value?: string
    defaultValue?: string
    onChange?: (color: string) => void
    enableGradient?: boolean
    gradientValue?: GradientValue
    onGradientChange?: (gradient: GradientValue) => void
    children: React.ReactNode
}

export function AdvancedColorPicker({
    value,
    defaultValue = "#3b82f6",
    onChange,
    enableGradient = false,
    gradientValue,
    onGradientChange,
    children,
}: AdvancedColorPickerProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const [isGradient, setIsGradientState] = React.useState(false)
    const [gradient, setGradientState] = React.useState<GradientValue>(
        gradientValue || {
            type: 'linear',
            angle: 90,
            stops: [
                { id: 'stop-1', color: '#3b82f6', position: 0 },
                { id: 'stop-2', color: '#8b5cf6', position: 100 },
            ]
        }
    )
    const [activeStopId, setActiveStopId] = React.useState<string | null>(null)
    const isInternalChange = React.useRef(false)

    const initialValueRef = React.useRef(value ?? defaultValue)
    const initialGradientRef = React.useRef(gradient)
    const initialIsGradientRef = React.useRef(isGradient)

    const currentValue = value ?? internalValue
    const initialParsed = parseColorValue(currentValue, defaultValue)
    const [hsv, setHsvState] = React.useState<HSV>(() => {
        const parsed = hexToHsv(initialParsed.hex)
        return parsed ?? { h: 220, s: 90, v: 60 }
    })
    const [alpha, setAlphaState] = React.useState(initialParsed.alpha)

    React.useEffect(() => {
        if (isInternalChange.current) {
            isInternalChange.current = false
            return
        }
        if (isGradient) return
        const parsed = parseColorValue(currentValue, defaultValue)
        const hsvParsed = hexToHsv(parsed.hex)
        if (hsvParsed) {
            setHsvState(hsvParsed)
        }
        setAlphaState(parsed.alpha)
    }, [currentValue, defaultValue, isGradient])

    React.useEffect(() => {
        if (gradientValue) {
            setGradientState(gradientValue)
        }
    }, [gradientValue])

    React.useEffect(() => {
        if (isOpen) {
            initialValueRef.current = currentValue
            initialGradientRef.current = gradient
            initialIsGradientRef.current = isGradient
            if (isGradient && !activeStopId && gradient.stops.length > 0) {
                setActiveStopId(gradient.stops[0].id)
            }
        }
    }, [isOpen])

    const handleChange = React.useCallback((color: string) => {
        isInternalChange.current = true
        setInternalValue(color)
        onChange?.(color)
    }, [onChange])

    const setHsv = React.useCallback((newHsv: HSV) => {
        setHsvState(newHsv)
        const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v)
        handleChange(formatColorWithAlpha(hex, alpha))
    }, [handleChange, alpha])

    const setAlpha = React.useCallback((newAlpha: number) => {
        setAlphaState(newAlpha)
        if (isGradient) return
        const hex = hsvToHex(hsv.h, hsv.s, hsv.v)
        handleChange(formatColorWithAlpha(hex, newAlpha))
    }, [hsv, isGradient, handleChange])

    const setGradient = React.useCallback((newGradient: GradientValue) => {
        const sortedGradient = {
            ...newGradient,
            stops: [...newGradient.stops].sort((a, b) => a.position - b.position)
        }
        setGradientState(sortedGradient)
        const gradientCSS = generateGradientCSS(sortedGradient)
        onGradientChange?.(sortedGradient)
        handleChange(gradientCSS)
    }, [onGradientChange, handleChange])

    const setIsGradient = React.useCallback((val: boolean) => {
        setIsGradientState(val)
        if (val) {
            if (gradient.stops.length > 0 && !activeStopId) {
                setActiveStopId(gradient.stops[0].id)
            }
            const gradientCSS = generateGradientCSS(gradient)
            handleChange(gradientCSS)
            onGradientChange?.(gradient)
        } else {
            const hex = hsvToHex(hsv.h, hsv.s, hsv.v)
            handleChange(formatColorWithAlpha(hex, alpha))
        }
    }, [gradient, activeStopId, hsv, handleChange, onGradientChange, alpha])

    const handleSubmit = React.useCallback(() => {
        setIsOpen(false)
    }, [])

    const handleCancel = React.useCallback(() => {
        handleChange(initialValueRef.current)
        setGradientState(initialGradientRef.current)
        setIsGradientState(initialIsGradientRef.current)
        setIsOpen(false)
    }, [handleChange])

    return (
        <AdvancedColorPickerContext.Provider value={{
            value: currentValue,
            hsv,
            alpha,
            onChange: handleChange,
            setHsv,
            setAlpha,
            isGradient,
            setIsGradient,
            gradient,
            setGradient,
            activeStopId,
            setActiveStopId,
            isOpen,
            setIsOpen,
            onSubmit: handleSubmit,
            onCancel: handleCancel,
            enableGradient,
        }}>
            {children}
        </AdvancedColorPickerContext.Provider>
    )
}

// ============================================
// TRIGGER
// ============================================

export interface AdvancedColorPickerTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    showIcon?: boolean
    showColorPreview?: boolean
    children?: React.ReactNode
}

export function AdvancedColorPickerTrigger({
    className,
    showIcon = false,
    showColorPreview = true,
    children,
    ...props
}: AdvancedColorPickerTriggerProps) {
    const { value, isGradient, gradient, setIsOpen } = useAdvancedColorPicker()
    const background = isGradient ? generateGradientCSS(gradient, 90) : value

    return (
        <button
            data-slot="advanced-color-picker-trigger"
            onClick={() => setIsOpen(true)}
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded-md transition-all duration-150",
                "border border-[var(--border-subtle)] hover:border-[var(--border-default)]",
                "bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]",
                className
            )}
            {...props}
        >
            {showColorPreview && (
                <span
                    className="w-full h-full rounded-[inherit]"
                    style={{ 
                        background,
                        backgroundRepeat: 'no-repeat',
                    }}
                />
            )}
            {showIcon && <IconPaint size={14} />}
            {children}
        </button>
    )
}

// ============================================
// PANEL
// ============================================

export interface AdvancedColorPickerPanelProps {
    presetColors?: string[]
    showOpacity?: boolean
    showGradientMode?: boolean
    className?: string
}

export function AdvancedColorPickerPanel({
    presetColors = [
        "#ef4444", "#f97316", "#f59e0b", "#eab308",
        "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
        "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
        "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
    ],
    showOpacity = true,
    showGradientMode = false,
    className,
}: AdvancedColorPickerPanelProps) {
    const {
        value,
        hsv,
        alpha,
        setHsv,
        setAlpha,
        onChange,
        isGradient,
        setIsGradient,
        gradient,
        setGradient,
        activeStopId,
        setActiveStopId,
        isOpen,
        onSubmit,
        onCancel,
        enableGradient,
    } = useAdvancedColorPicker()

    const [hexInput, setHexInput] = React.useState(() => {
        const fallback = hsvToHex(hsv.h, hsv.s, hsv.v)
        return parseColorValue(value, fallback).hex
    })
    const [renderPanel, setRenderPanel] = React.useState(false)
    const [isAnimatingIn, setIsAnimatingIn] = React.useState(false)
    const [isAnimatingOut, setIsAnimatingOut] = React.useState(false)
    
    const satBrightRef = React.useRef<HTMLDivElement>(null)
    const hueRef = React.useRef<HTMLDivElement>(null)
    const alphaRef = React.useRef<HTMLDivElement>(null)
    const gradientBarRef = React.useRef<HTMLDivElement>(null)
    const angleRef = React.useRef<HTMLDivElement>(null)
    
    const [isDraggingSB, setIsDraggingSB] = React.useState(false)
    const [isDraggingHue, setIsDraggingHue] = React.useState(false)
    const [isDraggingAlpha, setIsDraggingAlpha] = React.useState(false)
    const [isDraggingStop, setIsDraggingStop] = React.useState<string | null>(null)
    const [isDraggingAngle, setIsDraggingAngle] = React.useState(false)

    const [localHsv, setHsvState] = React.useState(hsv)

    // Handle open/close with animations
    React.useEffect(() => {
        if (isOpen) {
            setRenderPanel(true)
            requestAnimationFrame(() => {
                setIsAnimatingIn(true)
            })
        } else if (renderPanel) {
            setIsAnimatingOut(true)
            setIsAnimatingIn(false)
            const timer = setTimeout(() => {
                setRenderPanel(false)
                setIsAnimatingOut(false)
            }, 200)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    const activeStop = React.useMemo(() => {
        if (!isGradient || !activeStopId) return null
        return gradient.stops.find(s => s.id === activeStopId) || null
    }, [isGradient, activeStopId, gradient.stops])

    // Sync color when switching modes or active stop changes
    React.useEffect(() => {
        if (activeStop) {
            const parsed = hexToHsv(activeStop.color)
            if (parsed) {
                setHsvState(parsed)
            }
            setHexInput(activeStop.color)
        }
    }, [activeStopId, activeStop?.color])

    React.useEffect(() => {
        setHsvState(hsv)
    }, [hsv])

    React.useEffect(() => {
        if (!isGradient) {
            const fallbackHex = hsvToHex(hsv.h, hsv.s, hsv.v)
            const parsed = parseColorValue(value, fallbackHex)
            setHexInput(parsed.hex)
            const parsedHsv = hexToHsv(parsed.hex)
            if (parsedHsv) setHsvState(parsedHsv)
        }
    }, [value, isGradient, hsv])

    // Mode switch handler
    const handleModeSwitch = (toGradient: boolean) => {
        setIsGradient(toGradient)
        if (toGradient && gradient.stops.length > 0) {
            const firstStop = gradient.stops[0]
            setActiveStopId(firstStop.id)
            const parsed = hexToHsv(firstStop.color)
            if (parsed) setHsvState(parsed)
            setHexInput(firstStop.color)
        } else if (!toGradient) {
            const hex = hsvToHex(localHsv.h, localHsv.s, localHsv.v)
            setHexInput(hex)
        }
    }

    // Slider calculations with proper padding
    const getSliderPosition = (trackRef: React.RefObject<HTMLDivElement | null>, clientX: number) => {
        if (!trackRef.current) return 0
        const rect = trackRef.current.getBoundingClientRect()
        const padding = 8
        const effectiveWidth = rect.width - padding * 2
        return Math.max(0, Math.min(1, (clientX - rect.left - padding) / effectiveWidth))
    }

    const getSliderHandleLeft = (percentage: number, trackWidth: number) => {
        const padding = 8
        const handleSize = 14
        const effectiveWidth = trackWidth - padding * 2 - handleSize
        return padding + percentage * effectiveWidth
    }

    const handleSatBrightChange = React.useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!satBrightRef.current) return
        const rect = satBrightRef.current.getBoundingClientRect()
        const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
        const v = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100))
        
        const newHex = hsvToHex(localHsv.h, s, v)
        setHsvState({ ...localHsv, s, v })
        
        if (isGradient && activeStopId) {
            setGradient({
                ...gradient,
                stops: gradient.stops.map(stop =>
                    stop.id === activeStopId ? { ...stop, color: newHex } : stop
                )
            })
            setHexInput(newHex)
        } else {
            setHsv({ h: localHsv.h, s, v })
        }
    }, [localHsv, setHsv, isGradient, activeStopId, gradient, setGradient])

    const handleHueChange = React.useCallback((e: React.MouseEvent | MouseEvent) => {
        const pos = getSliderPosition(hueRef, e.clientX)
        const h = pos * 360
        
        const newHex = hsvToHex(h, localHsv.s, localHsv.v)
        setHsvState({ ...localHsv, h })
        
        if (isGradient && activeStopId) {
            setGradient({
                ...gradient,
                stops: gradient.stops.map(stop =>
                    stop.id === activeStopId ? { ...stop, color: newHex } : stop
                )
            })
            setHexInput(newHex)
        } else {
            setHsv({ ...localHsv, h })
        }
    }, [localHsv, setHsv, isGradient, activeStopId, gradient, setGradient])

    const handleAlphaChange = React.useCallback((e: React.MouseEvent | MouseEvent) => {
        const pos = getSliderPosition(alphaRef, e.clientX)
        setAlpha(pos)
    }, [setAlpha])

    const handleStopDrag = React.useCallback((e: MouseEvent) => {
        if (!gradientBarRef.current || !isDraggingStop) return
        const rect = gradientBarRef.current.getBoundingClientRect()
        const position = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))

        setGradient({
            ...gradient,
            stops: gradient.stops.map(stop =>
                stop.id === isDraggingStop ? { ...stop, position: Math.round(position) } : stop
            )
        })
    }, [gradient, isDraggingStop, setGradient])

    const getAngleFromClientX = React.useCallback((clientX: number) => {
        if (!angleRef.current) return gradient.angle
        const rect = angleRef.current.getBoundingClientRect()
        const ratio = (clientX - rect.left) / rect.width
        const clamped = Math.max(0, Math.min(1, ratio))
        return Math.round(clamped * 360)
    }, [gradient.angle])

    const handleAngleDrag = React.useCallback((e: MouseEvent) => {
        const angle = getAngleFromClientX(e.clientX)
        setGradient({ ...gradient, angle })
    }, [gradient, setGradient, getAngleFromClientX])

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingSB) handleSatBrightChange(e)
            if (isDraggingHue) handleHueChange(e)
            if (isDraggingAlpha) handleAlphaChange(e)
            if (isDraggingStop) handleStopDrag(e)
            if (isDraggingAngle) handleAngleDrag(e)
        }
        const handleMouseUp = () => {
            setIsDraggingSB(false)
            setIsDraggingHue(false)
            setIsDraggingAlpha(false)
            setIsDraggingStop(null)
            setIsDraggingAngle(false)
        }

        if (isDraggingSB || isDraggingHue || isDraggingAlpha || isDraggingStop || isDraggingAngle) {
            window.addEventListener("mousemove", handleMouseMove)
            window.addEventListener("mouseup", handleMouseUp)
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
            window.removeEventListener("mouseup", handleMouseUp)
        }
    }, [isDraggingSB, isDraggingHue, isDraggingAlpha, isDraggingStop, isDraggingAngle, handleSatBrightChange, handleHueChange, handleAlphaChange, handleStopDrag, handleAngleDrag])

    const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value
        if (!val.startsWith("#")) val = "#" + val
        setHexInput(val)

        if (isValidHex(val)) {
            const normalizedHex = val.length === 4
                ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`
                : val
            
            if (isGradient && activeStopId) {
                setGradient({
                    ...gradient,
                    stops: gradient.stops.map(stop =>
                        stop.id === activeStopId ? { ...stop, color: normalizedHex } : stop
                    )
                })
                const parsed = hexToHsv(normalizedHex)
                if (parsed) setHsvState(parsed)
            } else {
                onChange(normalizedHex)
                const parsed = hexToHsv(normalizedHex)
                if (parsed) setHsvState(parsed)
            }
        }
    }

    const handlePresetClick = (color: string) => {
        if (isGradient && activeStopId) {
            setGradient({
                ...gradient,
                stops: gradient.stops.map(stop =>
                    stop.id === activeStopId ? { ...stop, color } : stop
                )
            })
            setHexInput(color)
            const parsed = hexToHsv(color)
            if (parsed) setHsvState(parsed)
        } else {
            onChange(color)
            const parsed = hexToHsv(color)
            if (parsed) {
                setHsvState(parsed)
                setHsv(parsed)
            }
            setHexInput(color)
        }
    }

    const handleGradientPresetClick = (preset: GradientValue) => {
        const newStops = preset.stops.map((s, i) => ({
            ...s,
            id: `stop-${Date.now()}-${i}`
        }))
        const newGradient = { ...preset, stops: newStops }
        setGradient(newGradient)
        if (newStops.length > 0) {
            setActiveStopId(newStops[0].id)
            const parsed = hexToHsv(newStops[0].color)
            if (parsed) setHsvState(parsed)
            setHexInput(newStops[0].color)
        }
    }

    const addGradientStop = () => {
        const newId = `stop-${Date.now()}`
        const positions = gradient.stops.map(s => s.position).sort((a, b) => a - b)
        let newPosition = 50
        
        if (positions.length >= 2) {
            let maxGap = 0
            let gapStart = 0
            for (let i = 0; i < positions.length - 1; i++) {
                const gap = positions[i + 1] - positions[i]
                if (gap > maxGap) {
                    maxGap = gap
                    gapStart = positions[i]
                }
            }
            newPosition = Math.round(gapStart + maxGap / 2)
        }
        
        const newStop: GradientStop = {
            id: newId,
            color: activeStop?.color || hsvToHex(localHsv.h, localHsv.s, localHsv.v),
            position: newPosition,
        }
        setGradient({
            ...gradient,
            stops: [...gradient.stops, newStop]
        })
        setActiveStopId(newId)
    }

    const removeGradientStop = (id: string) => {
        if (gradient.stops.length <= 2) return
        const newStops = gradient.stops.filter(s => s.id !== id)
        setGradient({
            ...gradient,
            stops: newStops
        })
        if (activeStopId === id) {
            setActiveStopId(newStops[0]?.id || null)
        }
    }

    const pickerX = localHsv.s
    const pickerY = 100 - localHsv.v
    const displayHex = isGradient && activeStop ? activeStop.color : hsvToHex(localHsv.h, localHsv.s, localHsv.v)

    if (!renderPanel) return null

    const isVisible = isAnimatingIn && !isAnimatingOut

    // CSS for hiding number input spinners
    const numberInputStyle: React.CSSProperties = {
        MozAppearance: 'textfield',
    }

    return (
        <div
            data-slot="advanced-color-picker-panel"
            className={cn("fixed inset-0 z-[200] flex items-stretch justify-end", className)}
        >
            {/* Global styles for number input */}
            <style>{`
                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>

            {/* Backdrop */}
            <div 
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 200ms ease-out',
                }}
                onClick={onCancel}
            />
            
            {/* Panel */}
            <div 
                style={{
                    position: 'relative',
                    width: '320px',
                    backgroundColor: 'var(--bg-elevated)',
                    borderLeft: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateX(0)' : 'translateX(16px)',
                    transition: 'opacity 200ms ease-out, transform 200ms ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 120ms ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <IconArrowLeft size={18} />
                    </button>
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}>
                        {isGradient ? 'Gradient Editor' : 'Color Picker'}
                    </span>
                </div>

                {/* Scrollable Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                }}>
                    {/* Mode Toggle - Using SettingRow style */}
                    {(showGradientMode || enableGradient) && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 0',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    Gradient Mode
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    Use gradient instead of solid color
                                </div>
                            </div>
                            <button
                                onClick={() => handleModeSwitch(!isGradient)}
                                style={{
                                    position: 'relative',
                                    width: '36px',
                                    height: '20px',
                                    padding: 0,
                                    background: isGradient ? 'var(--accent-gradient)' : 'rgba(120, 120, 130, 0.4)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    transition: 'background-color 150ms ease',
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: '2px',
                                    left: isGradient ? '18px' : '2px',
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: '#fff',
                                    borderRadius: '50%',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    transition: 'left 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                                }} />
                            </button>
                        </div>
                    )}

                    {/* Saturation/Brightness picker */}
                    <div
                        ref={satBrightRef}
                        style={{
                            position: 'relative',
                            height: '160px',
                            borderRadius: '8px',
                            cursor: 'crosshair',
                            overflow: 'hidden',
                            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${localHsv.h}, 100%, 50%))`,
                            backgroundRepeat: 'no-repeat',
                        }}
                        onMouseDown={(e) => {
                            setIsDraggingSB(true)
                            handleSatBrightChange(e)
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            left: `${pickerX}%`,
                            top: `${pickerY}%`,
                            transform: 'translate(-50%, -50%)',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: '2px solid white',
                            backgroundColor: displayHex,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.1)',
                            pointerEvents: 'none',
                        }} />
                    </div>

                    {/* Hue slider */}
                    <div
                        ref={hueRef}
                        style={{
                            position: 'relative',
                            height: '16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
                            backgroundRepeat: 'no-repeat',
                        }}
                        onMouseDown={(e) => {
                            setIsDraggingHue(true)
                            handleHueChange(e)
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: `${getSliderHandleLeft(localHsv.h / 360, hueRef.current?.offsetWidth || 280)}px`,
                            transform: 'translateY(-50%)',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: '2px solid white',
                            backgroundColor: `hsl(${localHsv.h}, 100%, 50%)`,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                            pointerEvents: 'none',
                        }} />
                    </div>

                    {/* Opacity slider (solid mode only) */}
                    {showOpacity && !isGradient && (
                        <div
                            ref={alphaRef}
                            style={{
                                position: 'relative',
                                height: '16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: `linear-gradient(to right, transparent, ${displayHex}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px`,
                                backgroundRepeat: 'no-repeat, repeat',
                            }}
                            onMouseDown={(e) => {
                                setIsDraggingAlpha(true)
                                handleAlphaChange(e)
                            }}
                        >
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: `${getSliderHandleLeft(alpha, alphaRef.current?.offsetWidth || 280)}px`,
                                transform: 'translateY(-50%)',
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                border: '2px solid white',
                                backgroundColor: hexToRgba(displayHex, alpha),
                                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                pointerEvents: 'none',
                            }} />
                        </div>
                    )}

                    {/* Gradient editor */}
                    {isGradient && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            padding: '16px',
                            background: 'var(--bg-surface)',
                            borderRadius: '8px',
                        }}>
                            {/* Gradient preview bar */}
                            <div
                                ref={gradientBarRef}
                                style={{
                                    position: 'relative',
                                    height: '24px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: generateGradientCSS(gradient, 90),
                                    backgroundRepeat: 'no-repeat',
                                }}
                                onClick={(e) => {
                                    if (e.target === gradientBarRef.current) {
                                        const rect = gradientBarRef.current.getBoundingClientRect()
                                        const position = Math.round(((e.clientX - rect.left) / rect.width) * 100)
                                        const newId = `stop-${Date.now()}`
                                        const newStop: GradientStop = {
                                            id: newId,
                                            color: activeStop?.color || displayHex,
                                            position,
                                        }
                                        setGradient({
                                            ...gradient,
                                            stops: [...gradient.stops, newStop]
                                        })
                                        setActiveStopId(newId)
                                    }
                                }}
                            >
                                {[...gradient.stops].sort((a, b) => a.position - b.position).map((stop) => (
                                    <div
                                        key={stop.id}
                                        style={{
                                            position: 'absolute',
                                            left: `${stop.position}%`,
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            zIndex: activeStopId === stop.id ? 20 : 10,
                                            cursor: 'grab',
                                        }}
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setActiveStopId(stop.id)
                                            setIsDraggingStop(stop.id)
                                            const parsed = hexToHsv(stop.color)
                                            if (parsed) setHsvState(parsed)
                                            setHexInput(stop.color)
                                        }}
                                    >
                                        <div style={{
                                            width: activeStopId === stop.id ? '16px' : '12px',
                                            height: activeStopId === stop.id ? '16px' : '12px',
                                            borderRadius: '50%',
                                            border: '2px solid white',
                                            backgroundColor: stop.color,
                                            boxShadow: activeStopId === stop.id 
                                                ? '0 0 0 2px var(--accent-color), 0 2px 6px rgba(0,0,0,0.3)'
                                                : '0 1px 4px rgba(0,0,0,0.3)',
                                            transition: 'width 150ms, height 150ms, box-shadow 150ms',
                                        }} />
                                    </div>
                                ))}
                            </div>

                            {/* Angle control */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        Angle
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input
                                            type="number"
                                            value={gradient.angle}
                                            onChange={(e) => {
                                                const val = Math.max(0, Math.min(360, parseInt(e.target.value) || 0))
                                                setGradient({ ...gradient, angle: val })
                                            }}
                                            style={{
                                                width: '48px',
                                                height: '24px',
                                                padding: '0 6px',
                                                fontSize: '12px',
                                                textAlign: 'right',
                                                background: 'var(--bg-elevated)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                outline: 'none',
                                                ...numberInputStyle,
                                            }}
                                            min={0}
                                            max={360}
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>°</span>
                                    </div>
                                </div>
                                <div
                                    ref={angleRef}
                                    style={{
                                        position: 'relative',
                                        height: '12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-subtle)',
                                    }}
                                    onMouseDown={(e) => {
                                        setIsDraggingAngle(true)
                                        handleAngleDrag(e as unknown as MouseEvent)
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute',
                                        inset: '1px',
                                        borderRadius: '4px',
                                        background: generateGradientCSS(gradient, 90),
                                        opacity: 0.35,
                                    }} />
                                    <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: `${(gradient.angle / 360) * 100}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '14px',
                                        height: '14px',
                                        borderRadius: '50%',
                                        background: 'white',
                                        border: '1px solid var(--border-subtle)',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                        pointerEvents: 'none',
                                    }} />
                                </div>
                            </div>

                            {/* Stop controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={addGradientStop}
                                    title="Add stop"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '28px',
                                        height: '28px',
                                        padding: 0,
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        transition: 'all 120ms ease',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--hover-bg)'
                                        e.currentTarget.style.color = 'var(--text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'var(--bg-elevated)'
                                        e.currentTarget.style.color = 'var(--text-secondary)'
                                    }}
                                >
                                    <IconPlus size={14} />
                                </button>
                                <button
                                    onClick={() => activeStopId && removeGradientStop(activeStopId)}
                                    disabled={gradient.stops.length <= 2}
                                    title="Remove stop"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '28px',
                                        height: '28px',
                                        padding: 0,
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        color: gradient.stops.length <= 2 ? 'var(--text-muted)' : 'var(--text-secondary)',
                                        cursor: gradient.stops.length <= 2 ? 'not-allowed' : 'pointer',
                                        opacity: gradient.stops.length <= 2 ? 0.5 : 1,
                                        transition: 'all 120ms ease',
                                    }}
                                >
                                    <IconMinus size={14} />
                                </button>
                                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                    {gradient.stops.length} stops
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Preview and Hex input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            flexShrink: 0,
                            background: isGradient ? generateGradientCSS(gradient, 90) : hexToRgba(displayHex, alpha),
                            backgroundRepeat: 'no-repeat',
                            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                        }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input
                                type="text"
                                value={hexInput}
                                onChange={handleHexInputChange}
                                placeholder="#000000"
                                maxLength={7}
                                style={{
                                    width: '100%',
                                    height: '32px',
                                    padding: '0 10px',
                                    borderRadius: '6px',
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    fontFamily: 'monospace',
                                    textTransform: 'uppercase',
                                    outline: 'none',
                                }}
                                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                            />
                            {showOpacity && !isGradient && (
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                    Opacity: {Math.round(alpha * 100)}%
                                </span>
                            )}
                            {isGradient && activeStop && (
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                    Position: {Math.round(activeStop.position)}%
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Presets */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 600, 
                            color: 'var(--text-tertiary)', 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.5px',
                        }}>
                            {isGradient ? 'Gradient Presets' : 'Color Presets'}
                        </span>
                        
                        {isGradient ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                {GRADIENT_PRESETS.map((preset, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleGradientPresetClick(preset)}
                                        style={{
                                            aspectRatio: '1',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: generateGradientCSS(preset, 90),
                                            backgroundRepeat: 'no-repeat',
                                            cursor: 'pointer',
                                            transition: 'transform 120ms ease',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                                {presetColors.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => handlePresetClick(color)}
                                        style={{
                                            aspectRatio: '1',
                                            borderRadius: '4px',
                                            backgroundColor: color,
                                            border: displayHex?.toLowerCase() === color.toLowerCase()
                                                ? '2px solid white'
                                                : 'none',
                                            boxShadow: displayHex?.toLowerCase() === color.toLowerCase()
                                                ? '0 0 0 2px var(--accent-color)'
                                                : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                                            cursor: 'pointer',
                                            transition: 'transform 120ms ease',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    flexShrink: 0,
                    padding: '16px 20px',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                }}>
                    <button
                        onClick={onSubmit}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--accent-gradient)',
                            backgroundRepeat: 'no-repeat',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'opacity 150ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                        <IconCheck size={16} />
                        Apply Color
                    </button>
                </div>
            </div>
        </div>
    )
}

export interface AdvancedColorPickerContentProps {
    presetColors?: string[]
    showOpacity?: boolean
    showGradientMode?: boolean
    className?: string
}

export function AdvancedColorPickerContent(props: AdvancedColorPickerContentProps) {
    return <AdvancedColorPickerPanel {...props} />
}
