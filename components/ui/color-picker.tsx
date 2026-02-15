"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "../../lib/utils"
import { IconPaint } from "@tabler/icons-react"
import { PopoverTrigger } from "./popover"

// ============================================
// COLOUR UTILITY FUNCTIONS
// ============================================

interface HSL {
    h: number // 0-360
    s: number // 0-100
    l: number // 0-100
}

interface RGB {
    r: number // 0-255
    g: number // 0-255
    b: number // 0-255
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

function rgbToHsl(r: number, g: number, b: number): HSL {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): RGB {
    h /= 360
    s /= 100
    l /= 100
    let r, g, b

    if (s === 0) {
        r = g = b = l
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1
            if (t > 1) t -= 1
            if (t < 1 / 6) return p + (q - p) * 6 * t
            if (t < 1 / 2) return q
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
            return p
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
    }

    return { r: r * 255, g: g * 255, b: b * 255 }
}

function hexToHsl(hex: string): HSL | null {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    return rgbToHsl(rgb.r, rgb.g, rgb.b)
}

function hslToHex(h: number, s: number, l: number): string {
    const rgb = hslToRgb(h, s, l)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function isValidHex(hex: string): boolean {
    return /^#?([a-f\d]{3}|[a-f\d]{6})$/i.test(hex)
}

// HSV (Hue-Saturation-Value) for proper color picker math
interface HSV {
    h: number // 0-360
    s: number // 0-100
    v: number // 0-100
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

// ============================================
// COLOUR PICKER CONTEXT
// ============================================

interface ColorPickerContextValue {
    value: string
    hsv: HSV
    onChange: (color: string) => void
    setHsv: (hsv: HSV) => void
    open: boolean
    setOpen: (open: boolean) => void
}

const ColorPickerContext = React.createContext<ColorPickerContextValue | null>(null)

function useColorPicker() {
    const context = React.useContext(ColorPickerContext)
    if (!context) {
        throw new Error("useColorPicker must be used within a ColorPicker")
    }
    return context
}

// ============================================
// COLOUR PICKER COMPONENTS
// ============================================

interface ColorPickerProps {
    value?: string
    defaultValue?: string
    onChange?: (color: string) => void
    children: React.ReactNode
}

function ColorPicker({
    value,
    defaultValue = "#3b82f6",
    onChange,
    children,
}: ColorPickerProps) {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const isInternalChange = React.useRef(false)

    const currentValue = value ?? internalValue
    const [hsv, setHsvState] = React.useState<HSV>(() => {
        const parsed = hexToHsv(currentValue)
        return parsed ?? { h: 220, s: 90, v: 60 }
    })

    // Sync HSV when value changes externally (not from internal picker changes)
    React.useEffect(() => {
        if (isInternalChange.current) {
            isInternalChange.current = false
            return
        }
        const parsed = hexToHsv(currentValue)
        if (parsed) {
            setHsvState(parsed)
        }
    }, [currentValue])

    const handleChange = React.useCallback((color: string) => {
        isInternalChange.current = true
        setInternalValue(color)
        onChange?.(color)
    }, [onChange])

    const setHsv = React.useCallback((newHsv: HSV) => {
        setHsvState(newHsv)
        const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v)
        handleChange(hex)
    }, [handleChange])

    return (
        <ColorPickerContext.Provider value={{
            value: currentValue,
            hsv,
            onChange: handleChange,
            setHsv,
            open,
            setOpen
        }}>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                {children}
            </PopoverPrimitive.Root>
        </ColorPickerContext.Provider>
    )
}

interface ColorPickerTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    showIcon?: boolean
    children?: React.ReactNode
}

function ColorPickerTrigger({
    className,
    showIcon = true,
    children,
    ...props
}: ColorPickerTriggerProps) {
    const { value } = useColorPicker()

    return (
        <PopoverTrigger asChild>
            <button
                data-slot="color-picker-trigger"
                className={cn(
                    "inline-flex items-center justify-center rounded-full",
                    "w-8 h-8 border-2 border-white/30 transition-all duration-150",
                    "hover:scale-110 hover:border-white/50 focus:outline-none focus:ring-0 focus:ring-offset-0",
                    className
                )}
                style={{ backgroundColor: value }}
                {...props}
            >
                {children ? children : (showIcon && <IconPaint size={16} className="text-white drop-shadow-sm" />)}
            </button>
        </PopoverTrigger>
    )
}

interface ColorPickerContentProps {
    presetColors?: string[]
    usedColors?: string[]
    showHexInput?: boolean
    showDoneButton?: boolean
    className?: string
}

function ColorPickerContent({
    presetColors = [
        "#ef4444", "#f97316", "#eab308", "#22c55e",
        "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"
    ],
    usedColors = [],
    showHexInput = true,
    showDoneButton = true,
    className,
}: ColorPickerContentProps) {
    const { value, hsv, setHsv, onChange, setOpen } = useColorPicker()
    const [hexInput, setHexInput] = React.useState(value)
    const satBrightRef = React.useRef<HTMLDivElement>(null)
    const hueRef = React.useRef<HTMLDivElement>(null)
    const [isDraggingSB, setIsDraggingSB] = React.useState(false)
    const [isDraggingHue, setIsDraggingHue] = React.useState(false)

    // Sync hex input when value changes
    React.useEffect(() => {
        setHexInput(value)
    }, [value])

    // Handle saturation/value picker - proper HSV math
    const handleSatBrightChange = React.useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!satBrightRef.current) return
        const rect = satBrightRef.current.getBoundingClientRect()
        // x = saturation (0 at left, 100 at right)
        // y = value (100 at top, 0 at bottom)
        const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
        const v = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100))

        setHsv({ h: hsv.h, s, v })
    }, [hsv.h, setHsv])

    // Handle hue slider
    const handleHueChange = React.useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!hueRef.current) return
        const rect = hueRef.current.getBoundingClientRect()
        const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360))
        setHsv({ ...hsv, h })
    }, [hsv, setHsv])

    // Mouse event handlers
    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingSB) handleSatBrightChange(e)
            if (isDraggingHue) handleHueChange(e)
        }
        const handleMouseUp = () => {
            setIsDraggingSB(false)
            setIsDraggingHue(false)
        }

        if (isDraggingSB || isDraggingHue) {
            window.addEventListener("mousemove", handleMouseMove)
            window.addEventListener("mouseup", handleMouseUp)
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
            window.removeEventListener("mouseup", handleMouseUp)
        }
    }, [isDraggingSB, isDraggingHue, handleSatBrightChange, handleHueChange])

    // Handle hex input
    const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value
        if (!val.startsWith("#")) val = "#" + val
        setHexInput(val)

        if (isValidHex(val)) {
            onChange(val.length === 4
                ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`
                : val
            )
        }
    }

    // Handle preset click
    const handlePresetClick = (color: string) => {
        onChange(color)
    }

    // Unique used colours (excluding presets)
    const uniqueUsedColors = usedColors
        .filter(c => !presetColors.includes(c))
        .filter((c, i, arr) => arr.indexOf(c) === i)
        .slice(0, 8)

    // Calculate picker position using HSV
    // x = saturation (0-100), y = value inverted (100-v for display)
    const pickerX = hsv.s
    const pickerY = 100 - hsv.v

    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner sideOffset={8}>
                <PopoverPrimitive.Popup
                    data-slot="color-picker-content"
                    style={{
                        zIndex: 9999,
                        backgroundColor: 'var(--content-bg)',
                        border: '1px solid var(--border-color)',
                        width: '235px',
                    }}
                    className={cn(
                        "rounded-lg shadow-xl",
                        "data-open:animate-in data-closed:animate-out",
                        "data-closed:fade-out-0 data-open:fade-in-0",
                        "data-closed:zoom-out-95 data-open:zoom-in-95",
                        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
                        className
                    )}
                >
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Saturation/Brightness picker */}
                    <div
                        ref={satBrightRef}
                        style={{
                            position: 'relative',
                            height: '120px',
                            borderRadius: '6px',
                            cursor: 'crosshair',
                            overflow: 'hidden',
                            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`
                        }}
                        onMouseDown={(e) => {
                            setIsDraggingSB(true)
                            handleSatBrightChange(e)
                        }}
                    >
                        {/* Picker indicator */}
                        <div
                            style={{
                                position: 'absolute',
                                width: '14px',
                                height: '14px',
                                left: `${pickerX}%`,
                                top: `${pickerY}%`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: value,
                                border: '1.5px solid rgba(255,255,255,0.8)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                borderRadius: '50%',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>

                    {/* Hue slider */}
                    <div
                        ref={hueRef}
                        style={{
                            position: 'relative',
                            height: '12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
                        }}
                        onMouseDown={(e) => {
                            setIsDraggingHue(true)
                            handleHueChange(e)
                        }}
                    >
                        {/* Hue indicator */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '50%',
                                width: '14px',
                                height: '14px',
                                left: `${(hsv.h / 360) * 100}%`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                                border: '1.5px solid rgba(255,255,255,0.8)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                borderRadius: '50%',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>

                    {/* Preview and Hex input */}
                    {showHexInput && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '6px',
                                    flexShrink: 0,
                                    backgroundColor: value,
                                    border: '1px solid var(--border-color)'
                                }}
                            />
                            <input
                                type="text"
                                value={hexInput}
                                onChange={handleHexInputChange}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    height: '32px',
                                    padding: '0 10px',
                                    borderRadius: '6px',
                                    backgroundColor: 'var(--sidebar-background)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    fontFamily: 'monospace',
                                    textTransform: 'uppercase',
                                    outline: 'none',
                                }}
                                placeholder="#000000"
                                maxLength={7}
                            />
                        </div>
                    )}

                    {/* Preset colours */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {presetColors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    backgroundColor: color,
                                    border: value === color ? '1.5px solid rgba(255,255,255,0.6)' : '1.5px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                onClick={() => handlePresetClick(color)}
                            />
                        ))}
                    </div>

                    {/* Used colours */}
                    {uniqueUsedColors.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Used Colours
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {uniqueUsedColors.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '50%',
                                            backgroundColor: color,
                                            border: value === color ? '1.5px solid rgba(255,255,255,0.6)' : '1.5px solid transparent',
                                            cursor: 'pointer',
                                            transition: 'transform 0.1s',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                        onClick={() => handlePresetClick(color)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {showDoneButton && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--hover-bg)',
                                    color: 'var(--text-primary)',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
                </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    )
}

export {
    ColorPicker,
    ColorPickerTrigger,
    ColorPickerContent,
    // Utility exports for external use
    hexToHsl,
    hslToHex,
    hexToRgb,
    rgbToHex,
    isValidHex,
}
