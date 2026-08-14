"use client"

import * as React from "react"
import { toast } from "sonner"
import { Rabbit, Turtle } from "lucide-react"
import {
    IconArrowsMove, IconBell, IconClick, IconDeviceFloppy, IconEye,
    IconInfoCircle, IconLayoutSidebar, IconList, IconLoader, IconPencil, IconPlayerPause,
    IconPlayerPlay, IconPlus, IconRefresh, IconSparkles, IconTrash, IconWindowMaximize,
} from "@tabler/icons-react"
import { Button } from "../ui/button"
import { Switch } from "../ui/switch"
import { Slider } from "../ui/slider"
import { Skeleton } from "../ui/skeleton"
import { Input } from "../ui/input"
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator,
    SelectTrigger, SelectValue,
} from "../ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import {
    CATEGORY_DEFAULTS, CATEGORY_KEYS, EASING_CURVES, sampleBezier,
    type AnimationCategoryKey, type AnimationSettings, type CategoryAnimationSettings,
    type CurvePoint, type EasingName, type SavedAnimation,
} from "../../hooks/useAnimationSettings"

interface Props {
    settings: AnimationSettings
    onUpdateSetting: <K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) => void
    onResetSettings: () => void
    onToggleAll: (enabled: boolean) => void
}

const CATEGORY_META: Record<AnimationCategoryKey, { label: string; description: string; icon: React.ReactNode }> = {
    pageTransitions: { label: "Page transitions", description: "Navigation fades and movement", icon: <IconArrowsMove /> },
    microInteractions: { label: "Micro-interactions", description: "Buttons, switches, checks, and feedback", icon: <IconClick /> },
    hoverEffects: { label: "Hover effects", description: "Card lift, colour, and transform feedback", icon: <IconEye /> },
    loadingAnimations: { label: "Loading animations", description: "Spinners, skeletons, and progress", icon: <IconLoader /> },
    listStagger: { label: "Staggered lists", description: "Sequential list and card entrances", icon: <IconList /> },
    sidebarAnimations: { label: "Sidebar animations", description: "Collapse, expand, and menu movement", icon: <IconLayoutSidebar /> },
    modalAnimations: { label: "Modals and popups", description: "Dialogs, menus, sheets, tooltips, and popovers", icon: <IconWindowMaximize /> },
    toastAnimations: { label: "Toasts", description: "Sonner notifications entering and leaving", icon: <IconBell /> },
}

/** Settings-search anchors for each category; see lib/settings-focus.ts. */
const CATEGORY_ANCHORS: Record<AnimationCategoryKey, string> = {
    pageTransitions: "animations-page-transitions",
    microInteractions: "animations-micro-interactions",
    hoverEffects: "animations-hover-effects",
    loadingAnimations: "animations-loading",
    listStagger: "animations-stagger",
    sidebarAnimations: "animations-sidebar",
    modalAnimations: "animations-modals",
    toastAnimations: "animations-toasts",
}

const EASINGS: { value: Exclude<EasingName, "custom">; label: string }[] = [
    { value: "standard", label: "Standard" },
    { value: "decelerate", label: "Decelerate" },
    { value: "accelerate", label: "Accelerate" },
    { value: "easeInOut", label: "Ease in-out" },
    { value: "gentle", label: "Gentle" },
    { value: "snappy", label: "Snappy" },
    { value: "sharp", label: "Sharp" },
    { value: "linear", label: "Linear" },
    { value: "spring", label: "Boing" },
]

const firstValue = (value: number | readonly number[]) => typeof value === "number" ? value : value[0]
const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value))
const speedLabel = (value: number) => value === 67 ? "no." : `${value}%`
const overshootsUnitRange = (easing: Exclude<EasingName, "custom">) => sampleBezier(EASING_CURVES[easing]).some(point => point.y < 0 || point.y > 1)

function evaluateCurve(points: CurvePoint[], progress: number): number {
    const sorted = [...points].sort((a, b) => a.x - b.x)
    const rightIndex = sorted.findIndex(point => point.x >= progress)
    if (rightIndex <= 0) return sorted[0]?.y ?? progress
    const left = sorted[rightIndex - 1]
    const right = sorted[rightIndex]
    const amount = (progress - left.x) / Math.max(.0001, right.x - left.x)
    return left.y + (right.y - left.y) * amount
}

function curvePath(points: CurvePoint[], mapX: (value: number) => number, mapY: (value: number) => number): string {
    const sorted = [...points].sort((a, b) => a.x - b.x)
    if (sorted.length < 2) return ""
    let path = `M ${mapX(sorted[0].x)} ${mapY(sorted[0].y)}`
    for (let index = 0; index < sorted.length - 1; index += 1) {
        const previous = sorted[Math.max(0, index - 1)]
        const current = sorted[index]
        const next = sorted[index + 1]
        const after = sorted[Math.min(sorted.length - 1, index + 2)]
        const control1X = clamp(current.x + (next.x - previous.x) / 6, current.x, next.x)
        const control2X = clamp(next.x - (after.x - current.x) / 6, current.x, next.x)
        path += ` C ${mapX(control1X)} ${mapY(current.y + (next.y - previous.y) / 6)} ${mapX(control2X)} ${mapY(next.y - (after.y - current.y) / 6)} ${mapX(next.x)} ${mapY(next.y)}`
    }
    return path
}

interface CurveEditorProps {
    value: CurvePoint[]
    duration: number
    onChange: (points: CurvePoint[]) => void
    onSave: () => void
    onProgress: (progress: number, playing: boolean) => void
    resetSignal: number
    allowOvershoot?: boolean
}

function CurveEditor({ value, duration, onChange, onSave, onProgress, resetSignal, allowOvershoot = true }: CurveEditorProps) {
    const editorRef = React.useRef<HTMLDivElement>(null)
    const svgRef = React.useRef<SVGSVGElement>(null)
    const frame = React.useRef<number>()
    const patternId = React.useId().replace(/:/g, "")
    const previousValue = React.useRef(value)
    const [displayPoints, setDisplayPoints] = React.useState(value)
    const [selectedId, setSelectedId] = React.useState<string | null>(null)
    const [playing, setPlaying] = React.useState(false)
    const [progress, setProgress] = React.useState(0)
    const undoStack = React.useRef<CurvePoint[][]>([])
    const redoStack = React.useRef<CurvePoint[][]>([])
    const dragOrigin = React.useRef<CurvePoint[] | null>(null)
    const width = 420
    const height = 250
    const left = 34
    const right = 12
    const top = 18
    const bottom = 28
    const graphWidth = width - left - right
    const graphHeight = height - top - bottom
    const mapX = (x: number) => left + x * graphWidth
    const minimumY = allowOvershoot ? -.25 : 0
    const maximumY = allowOvershoot ? 1.25 : 1
    const mapY = (y: number) => top + (1 - (clamp(y, minimumY, maximumY) - minimumY) / (maximumY - minimumY)) * graphHeight
    const path = curvePath(displayPoints, mapX, mapY)
    const curveProgress = evaluateCurve(displayPoints, progress)

    React.useEffect(() => {
        const before = previousValue.current
        previousValue.current = value
        if (before === value) return
        const start = performance.now()
        const target = value
        const source = target.map((point, index) => before[index] ?? before[before.length - 1] ?? point)
        const tween = (now: number) => {
            const amount = clamp((now - start) / 180)
            const eased = 1 - Math.pow(1 - amount, 3)
            setDisplayPoints(target.map((point, index) => ({ ...point, x: source[index].x + (point.x - source[index].x) * eased, y: source[index].y + (point.y - source[index].y) * eased })))
            if (amount < 1) frame.current = requestAnimationFrame(tween)
        }
        frame.current = requestAnimationFrame(tween)
        return () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current) }
    }, [value])

    React.useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current) }, [])
    React.useEffect(() => {
        if (resetSignal === 0) return
        if (frame.current !== undefined) cancelAnimationFrame(frame.current)
        setPlaying(false)
        setProgress(0)
        onProgress(0, false)
    }, [resetSignal])

    const setTimeline = (next: number, isPlaying = false) => {
        const safe = clamp(next)
        setProgress(safe)
        onProgress(safe, isPlaying)
    }
    const play = () => {
        if (playing) { if (frame.current !== undefined) cancelAnimationFrame(frame.current); setPlaying(false); onProgress(progress, false); return }
        const startProgress = progress >= .999 ? 0 : progress
        const started = performance.now() - startProgress * duration
        setPlaying(true)
        const tick = (now: number) => {
            const next = clamp((now - started) / duration)
            setTimeline(next, next < 1)
            if (next < 1) frame.current = requestAnimationFrame(tick)
            else setPlaying(false)
        }
        frame.current = requestAnimationFrame(tick)
    }
    const updatePoint = (id: string, pointer: PointerEvent) => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return
        let x = (pointer.clientX - rect.left) / rect.width
        x = (x * width - left) / graphWidth
        let y = (pointer.clientY - rect.top) / rect.height
        y = minimumY + ((top + graphHeight - y * height) / graphHeight) * (maximumY - minimumY)
        if (pointer.shiftKey || pointer.metaKey || pointer.ctrlKey) { x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10 }
        const points = value.map(point => point.id === id ? { ...point, x: clamp(x), y: clamp(y, minimumY, maximumY) } : point).sort((a, b) => a.x - b.x)
        setDisplayPoints(points)
        onChange(points)
    }
    const beginDrag = (id: string, event: React.PointerEvent<SVGCircleElement>) => {
        if (id === "start" || id === "end") return
        setSelectedId(id)
        dragOrigin.current = value.map(point => ({ ...point }))
        const move = (pointer: PointerEvent) => updatePoint(id, pointer)
        const end = () => {
            if (dragOrigin.current) undoStack.current.push(dragOrigin.current)
            dragOrigin.current = null
            redoStack.current = []
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", end)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", end)
        event.preventDefault()
    }
    const addStop = () => {
        const x = progress > .03 && progress < .97 ? progress : .5
        const points = [...value, { id: crypto.randomUUID(), x, y: evaluateCurve(value, x) }].sort((a, b) => a.x - b.x)
        undoStack.current.push(value.map(point => ({ ...point })))
        redoStack.current = []
        onChange(points)
        setSelectedId(points.find(point => point.x === x && point.id !== "start" && point.id !== "end")?.id ?? null)
    }
    const removeStop = () => {
        if (!selectedId || selectedId === "start" || selectedId === "end" || value.length <= 3) return
        undoStack.current.push(value.map(point => ({ ...point })))
        redoStack.current = []
        onChange(value.filter(point => point.id !== selectedId))
        setSelectedId(null)
    }

    const beginScrub = (event: React.PointerEvent<SVGElement>) => {
        setSelectedId(null)
        if (frame.current !== undefined) cancelAnimationFrame(frame.current)
        setPlaying(false)
        const update = (pointer: { clientX: number }) => {
            const rect = svgRef.current?.getBoundingClientRect()
            if (!rect) return
            const svgX = ((pointer.clientX - rect.left) / rect.width) * width
            setTimeline((svgX - left) / graphWidth)
        }
        update(event)
        const move = (pointer: PointerEvent) => update(pointer)
        const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end) }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", end)
        event.preventDefault()
    }

    const undo = () => {
        const previous = undoStack.current.pop()
        if (!previous) return
        redoStack.current.push(value.map(point => ({ ...point })))
        setSelectedId(null)
        onChange(previous)
    }
    const redo = () => {
        const next = redoStack.current.pop()
        if (!next) return
        undoStack.current.push(value.map(point => ({ ...point })))
        setSelectedId(null)
        onChange(next)
    }
    const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
    }

    return <div ref={editorRef} tabIndex={0} onKeyDown={handleEditorKeyDown} onPointerDownCapture={() => editorRef.current?.focus({ preventScroll: true })} className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-secondary)] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <div className="flex h-10 items-center border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2">
            <span className="mr-auto text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">VELOCITY</span>
            <Button size="icon-sm" variant="ghost" onClick={play} aria-label={playing ? "Pause" : "Play"}>{playing ? <IconPlayerPause /> : <IconPlayerPlay />}</Button>
            <Button size="icon-sm" variant="ghost" onClick={addStop} aria-label="Add keyframe"><IconPlus /></Button>
            <Button size="icon-sm" variant="ghost" onClick={removeStop} disabled={!selectedId || selectedId === "start" || selectedId === "end"} aria-label="Delete selected keyframe"><IconTrash /></Button>
            <Button size="icon-sm" variant="ghost" onClick={onSave} aria-label="Save curve"><IconDeviceFloppy /></Button>
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="block aspect-[1.68] w-full touch-none bg-[var(--bg-base)]" aria-label="Velocity graph editor" onDoubleClick={addStop}>
            <defs><pattern id={patternId} width={graphWidth / 10} height={graphHeight / 6} patternUnits="userSpaceOnUse"><path d={`M ${graphWidth / 10} 0 L 0 0 0 ${graphHeight / 6}`} fill="none" stroke="var(--border-subtle)" strokeWidth="1" /></pattern></defs>
            <rect x={left} y={top} width={graphWidth} height={graphHeight} fill={`url(#${patternId})`} />
            <rect x={left} y={top} width={graphWidth} height={graphHeight} fill="transparent" className="cursor-ew-resize" onPointerDown={beginScrub} />
            <line x1={left} x2={width - right} y1={mapY(0)} y2={mapY(0)} stroke="var(--border-default)" strokeWidth="1" />
            <line x1={left} x2={width - right} y1={mapY(1)} y2={mapY(1)} stroke="var(--border-default)" strokeWidth="1" />
            <text x="6" y={mapY(1) + 4} fill="var(--text-tertiary)" fontSize="10">100</text><text x="18" y={mapY(0) + 4} fill="var(--text-tertiary)" fontSize="10">0</text>
            <path d={path} fill="none" stroke="var(--accent-color)" strokeWidth="2" />
            {displayPoints.map(point => <g key={point.id}><line x1={mapX(point.x)} x2={mapX(point.x)} y1={mapY(point.y) - 8} y2={mapY(point.y) + 8} stroke="var(--accent-color)" opacity={selectedId === point.id ? 1 : .55} /><circle cx={mapX(point.x)} cy={mapY(point.y)} r={selectedId === point.id ? 5.5 : 3.5} fill="var(--accent-color)" stroke={selectedId === point.id ? "var(--text-primary)" : "var(--bg-base)"} strokeWidth={selectedId === point.id ? 2.5 : 1.5} className="cursor-crosshair transition-[cx,cy] duration-150" onPointerDown={event => beginDrag(point.id, event)} onClick={() => setSelectedId(point.id)} /></g>)}
            <line x1={mapX(progress)} x2={mapX(progress)} y1={top} y2={height - bottom} stroke="var(--text-secondary)" strokeWidth="1.5" className="pointer-events-none" />
            <path d={`M ${mapX(progress) - 5} ${top} L ${mapX(progress) + 5} ${top} L ${mapX(progress)} ${top + 7} Z`} fill="var(--text-secondary)" className="pointer-events-none" />
            <circle cx={mapX(progress)} cy={mapY(curveProgress)} r="4.5" fill="var(--text-primary)" stroke="var(--accent-color)" strokeWidth="2" className="pointer-events-none" />
            <text x={left} y={height - 8} fill="var(--text-tertiary)" fontSize="10">00:00</text><text x={width - right - 36} y={height - 8} fill="var(--text-tertiary)" fontSize="10">{duration}ms</text>
        </svg>
    </div>
}

function PreviewStage({ categoryKey, curve, duration, progress, editorControlled, resetSignal, onReset }: { categoryKey: AnimationCategoryKey; curve: CurvePoint[]; duration: number; progress: number; editorControlled: boolean; resetSignal: number; onReset: () => void }) {
    const [active, setActive] = React.useState(false)
    const [version, setVersion] = React.useState(0)
    const [manualOverride, setManualOverride] = React.useState(false)
    const [previewToasts, setPreviewToasts] = React.useState<number[]>([])
    const toastTimers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>())
    const eased = clamp(evaluateCurve(curve, progress), -.2, 1.2)
    const timing = `linear(${curve.map(point => `${point.y.toFixed(3)} ${(point.x * 100).toFixed(1)}%`).join(",")})`
    React.useEffect(() => { if (editorControlled) setManualOverride(false) }, [progress, editorControlled])
    React.useEffect(() => { setActive(false); setManualOverride(false); setPreviewToasts([]); setVersion(value => value + 1) }, [resetSignal])
    React.useEffect(() => () => { toastTimers.current.forEach(clearTimeout) }, [])
    const toggle = () => { setManualOverride(true); setActive(value => !value) }
    const showToast = () => {
        setManualOverride(true)
        const id = Date.now() + Math.random()
        setPreviewToasts(current => [...current.slice(-3), id])
        const timeout = setTimeout(() => {
            setPreviewToasts(current => current.filter(item => item !== id))
            toastTimers.current.delete(id)
        }, Math.max(1800, duration * 5))
        toastTimers.current.set(id, timeout)
    }
    const controlled = editorControlled && !manualOverride
    const transition = controlled ? "none" : `${duration}ms ${timing}`
    const transformProgress = controlled ? eased : active ? 1 : 0

    let preview: React.ReactNode
    if (categoryKey === "pageTransitions") preview = <button type="button" className="relative h-40 w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] text-left" onClick={toggle}><div className="absolute inset-x-3 top-3 bottom-0 rounded-t-lg rounded-b-none border border-b-0 border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-sm" style={{ opacity: 1 - transformProgress, transform: `translateY(${-20 * transformProgress}px) scale(${1 - .015 * transformProgress})`, transformOrigin: "bottom", transition }}><div className="mb-4 h-2.5 w-2/5 rounded-full bg-[var(--border-default)]" /><div className="grid grid-cols-2 gap-3"><div className="h-20 rounded-md bg-[var(--hover-bg)]" /><div className="h-20 rounded-md bg-[var(--hover-bg)]" /></div></div><div className="absolute inset-x-3 top-3 bottom-0 rounded-t-lg rounded-b-none border border-b-0 border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-sm" style={{ opacity: transformProgress, transform: `translateY(${34 * (1 - transformProgress)}px) scale(${.985 + .015 * transformProgress})`, transformOrigin: "bottom", transition }}><div className="mb-4 h-2.5 w-1/3 rounded-full bg-[var(--accent-color)] opacity-60" /><div className="h-20 rounded-md border border-[var(--border-subtle)] bg-[var(--hover-bg)]" /></div></button>
    else if (categoryKey === "microInteractions") preview = <Switch checked={controlled ? transformProgress >= .5 : active} onCheckedChange={value => { setManualOverride(true); setActive(value) }} aria-label="Micro-interaction preview switch" />
    else if (categoryKey === "hoverEffects") { const hoverControlled = controlled && progress > 0; const hoverProgress = hoverControlled ? eased : active ? 1 : 0; preview = <div onClick={hoverControlled ? undefined : toggle} className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-10 py-7 shadow-sm ${hoverControlled ? "cursor-default" : "cursor-pointer hover:border-[var(--accent-color)] hover:shadow-lg"}`} style={{ transform: `translateY(${-6 * hoverProgress}px) scale(${1 + .015 * hoverProgress})`, transition: hoverControlled ? "none" : `transform ${duration}ms ${timing}, box-shadow ${duration}ms ${timing}, border-color ${duration}ms ${timing}` }}>Hover this card</div> }
    else if (categoryKey === "loadingAnimations") preview = <button type="button" onClick={toggle} className="relative w-full max-w-sm space-y-3 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><div className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent" style={{ opacity: transformProgress, transform: `translateX(${(-120 + transformProgress * 420)}%)`, transition }} /></button>
    else if (categoryKey === "listStagger") preview = <button type="button" onClick={toggle} className="grid w-full max-w-sm gap-2 text-left">{[{ title: "Assessment marked", detail: "Mathematics · 2m ago" }, { title: "New portal notice", detail: "School updates · 8m ago" }, { title: "Class starts soon", detail: "Science · 15m ago" }].map((item, index) => { const itemProgress = controlled ? clamp(eased * 3 - index) : transformProgress; return <div key={`${version}-${item.title}`} className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5" style={{ opacity: itemProgress, transform: `translateX(${(1 - itemProgress) * 20}px)`, transition: controlled ? "none" : `${duration}ms ${timing} ${index * 55}ms` }}><span className="size-8 shrink-0 rounded-full bg-[var(--hover-bg)]" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs text-[var(--text-tertiary)]">{item.detail}</span></span><span className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" /></div> })}</button>
    else if (categoryKey === "sidebarAnimations") preview = <button type="button" onClick={toggle} className="flex h-32 w-full max-w-md overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-left"><div className="h-full border-r border-[var(--border-default)] bg-[var(--bg-surface)] p-3" style={{ width: `${48 + 104 * transformProgress}px`, transition: controlled ? "none" : `width ${duration}ms ${timing}` }}><IconLayoutSidebar className="size-4" /><span className="mt-4 block overflow-hidden whitespace-nowrap text-xs" style={{ opacity: transformProgress, transition: controlled ? "none" : `opacity ${duration}ms ${timing}` }}>Dashboard menu</span></div><div className="flex-1 p-4 text-xs text-[var(--text-tertiary)]">Content</div></button>
    else if (categoryKey === "modalAnimations") preview = <div className="relative flex h-40 w-full max-w-sm items-start justify-center pt-7"><div className="relative w-full max-w-xs"><Select defaultValue="dashboard"><SelectTrigger aria-label="Modal animation preview combobox"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dashboard">Dashboard</SelectItem><SelectItem value="calendar">Calendar</SelectItem><SelectItem value="notifications">Notifications</SelectItem></SelectContent></Select>{controlled && <div data-preview-combobox-popup className="pointer-events-none absolute inset-x-0 top-11 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg" style={{ opacity: transformProgress, transform: `translateY(${8 * (1 - transformProgress)}px) scale(${.96 + .04 * transformProgress})`, transformOrigin: "top", transition: "none" }}><div className="rounded-sm bg-[var(--hover-bg)] px-2 py-1.5 text-sm">Dashboard</div><div className="px-2 py-1.5 text-sm">Calendar</div><div className="px-2 py-1.5 text-sm">Notifications</div></div>}</div></div>
    else { const toastItems = controlled ? [0] : previewToasts; preview = <div className="relative flex h-44 w-full max-w-md items-start justify-center overflow-hidden rounded-lg bg-[var(--bg-base)] pt-5"><Button onClick={showToast}>Show toast</Button><div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col-reverse gap-2">{toastItems.map((id, index) => <div key={id} className="ml-auto w-[min(100%,260px)] rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs shadow-xl" style={{ opacity: controlled ? transformProgress : 1, transform: `translateY(${controlled ? 12 * (1 - transformProgress) : 0}px) scale(${1 - index * .025})`, transition }}><IconBell className="mr-2 inline size-4" />Settings saved</div>)}</div></div> }

    return <div className="border-t border-[var(--border-subtle)] pt-4"><div className="mb-3 flex items-center justify-between"><div className="space-y-1"><p className="text-sm font-medium">Live preview</p><p className="text-xs leading-snug text-[var(--text-tertiary)]">Interact normally or use graph playback and scrubber</p></div><Button size="sm" variant="outline" onClick={onReset}><IconRefresh />Reset</Button></div><div key={version} className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--hover-bg)] p-4">{preview}</div></div>
}

interface CategoryPanelProps {
    categoryKey: AnimationCategoryKey
    settings: AnimationSettings
    update: (value: CategoryAnimationSettings) => void
    save: () => void
    rename: (animation: SavedAnimation) => void
    remove: (animation: SavedAnimation) => void
}

function CategoryPanel({ categoryKey, settings, update, save, rename, remove }: CategoryPanelProps) {
    const category = settings.categories[categoryKey]
    const meta = CATEGORY_META[categoryKey]
    const duration = Math.round(CATEGORY_DEFAULTS[categoryKey].duration * (100 / (category.speed ?? settings.animationSpeed)))
    const [previewProgress, setPreviewProgress] = React.useState(0)
    const [previewControlled, setPreviewControlled] = React.useState(false)
    const [resetSignal, setResetSignal] = React.useState(0)
    const [showDisabledCurveTooltip, setShowDisabledCurveTooltip] = React.useState(false)
    const choosePreset = (value: string | null) => {
        if (!value) return
        const saved = settings.savedAnimations.find(animation => `user:${animation.id}` === value)
        if (saved) {
            if (categoryKey === "pageTransitions" && saved.points.some(point => point.y < 0 || point.y > 1)) {
                toast.info("This user curve exceeds the 0–100% range required by page transitions")
                return
            }
            update({ ...category, easing: "custom", presetId: value, curve: saved.points.map(point => ({ ...point })) })
        }
        else { const easing = value as Exclude<EasingName, "custom">; if (categoryKey === "pageTransitions" && overshootsUnitRange(easing)) { toast.info("This curve exceeds the 0–100% range required by page transitions"); return } update({ ...category, easing, presetId: easing, curve: sampleBezier(EASING_CURVES[easing]) }) }
    }
    const userAnimationItems = settings.savedAnimations.map(animation => {
        const incompatible = categoryKey === "pageTransitions" && animation.points.some(point => point.y < 0 || point.y > 1)
        return <SelectItem key={animation.id} value={`user:${animation.id}`} aria-disabled={incompatible} className={incompatible ? "cursor-not-allowed opacity-40" : undefined} onMouseEnter={() => incompatible && setShowDisabledCurveTooltip(true)} onMouseLeave={() => setShowDisabledCurveTooltip(false)} onPointerDown={event => { if (incompatible) event.preventDefault() }} onClick={event => { if (incompatible) event.preventDefault() }}>
            <span className="flex w-full items-center">
                <ContextMenu><ContextMenuTrigger render={<span className="flex min-w-0 flex-1 items-center truncate">{animation.name}</span>} /><ContextMenuContent><ContextMenuItem onClick={() => rename(animation)}><IconPencil />Rename</ContextMenuItem><ContextMenuItem variant="destructive" onClick={() => remove(animation)}><IconTrash />Delete</ContextMenuItem></ContextMenuContent></ContextMenu>
                {incompatible && <span data-disabled-curve-info className="absolute right-2 inline-flex text-[var(--text-secondary)]"><IconInfoCircle className="size-3.5" /></span>}
            </span>
        </SelectItem>
    })
    const anchor = CATEGORY_ANCHORS[categoryKey]
    return <AccordionItem value={categoryKey} data-settings-anchor={anchor} className="border-[var(--border-subtle)]">
        <AccordionTrigger data-settings-open={anchor} data-tour-id={categoryKey === "pageTransitions" ? "animation-curve-trigger" : undefined} className="px-3 hover:no-underline"><span className="flex items-center gap-3">{React.cloneElement(meta.icon as React.ReactElement<{ className?: string }>, { className: "size-4 text-[var(--text-tertiary)]" })}<span className="flex flex-col gap-1"><span>{meta.label}</span><span className="text-xs font-normal leading-snug text-[var(--text-tertiary)]">{meta.description}</span></span></span></AccordionTrigger>
        <AccordionContent className="px-3">
            <div className="border-t border-[var(--border-subtle)] pt-4">
                <div className="mb-5 flex items-center justify-between rounded-lg bg-[var(--hover-bg)] px-3 py-2.5"><div className="space-y-0.5"><p className="mb-0! font-medium">Enable {meta.label.toLowerCase()}</p><p className="mb-0! text-xs leading-snug text-[var(--text-tertiary)]">Controls matching dashboard motion</p></div><Switch checked={category.enabled} onCheckedChange={enabled => update({ ...category, enabled })} /></div>
                <div className="grid gap-4 lg:grid-cols-[minmax(250px,.8fr)_minmax(360px,1.2fr)]">
                    <div className="space-y-5">
                        <div className="space-y-3"><div className="flex justify-between"><span className="font-medium">Speed</span><span className="text-xs text-[var(--text-tertiary)]">{category.speed === null ? `Main · ${speedLabel(settings.animationSpeed)} · ${duration}ms` : `${speedLabel(category.speed)} · ${duration}ms`}</span></div><div className={`transition-opacity ${category.speed === null ? "opacity-40" : "opacity-100"}`}><Slider aria-label={`${meta.label} speed`} min={50} max={200} step={1} value={[category.speed ?? settings.animationSpeed]} disabled={category.speed === null} onValueChange={values => update({ ...category, speed: firstValue(values) })} /></div><div className="flex items-center justify-between"><span className="text-xs text-[var(--text-secondary)]">Match main setting</span><Switch checked={category.speed === null} onCheckedChange={checked => update({ ...category, speed: checked ? null : settings.animationSpeed })} /></div></div>
                        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4"><div className="space-y-0.5"><p className="mb-0! font-medium">Override reduced motion</p><p className="mb-0! max-w-[230px] text-xs leading-snug text-[var(--text-tertiary)]">Keep category active when OS requests reduced motion</p></div><Switch checked={category.overrideReducedMotion} onCheckedChange={overrideReducedMotion => update({ ...category, overrideReducedMotion })} /></div>
                        <div className="relative border-t border-[var(--border-subtle)] pt-4"><p className="mb-3 font-medium">Animation curve</p><Select value={category.presetId} onValueChange={choosePreset}><SelectTrigger><SelectValue>{settings.savedAnimations.find(animation => `user:${animation.id}` === category.presetId)?.name ?? EASINGS.find(easing => easing.value === category.presetId)?.label ?? "Custom"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Built-in animations</SelectLabel>{EASINGS.map(easing => { const incompatible = categoryKey === "pageTransitions" && overshootsUnitRange(easing.value); const label = `${easing.label}${CATEGORY_DEFAULTS[categoryKey].easing === easing.value ? " (default)" : ""}`; return <SelectItem key={easing.value} value={easing.value} aria-disabled={incompatible} className={incompatible ? "cursor-not-allowed opacity-40" : undefined} onMouseEnter={() => incompatible && setShowDisabledCurveTooltip(true)} onMouseLeave={() => setShowDisabledCurveTooltip(false)} onPointerDown={event => { if (incompatible) event.preventDefault() }} onClick={event => { if (incompatible) event.preventDefault() }} onContextMenu={event => { event.preventDefault(); toast.info("Built-in animations can’t be renamed or deleted") }}>{incompatible ? <span className="flex w-full items-center gap-2"><span>{label}</span><span data-disabled-curve-info className="absolute right-2 inline-flex text-[var(--text-secondary)]"><IconInfoCircle className="size-3.5" /></span></span> : label}</SelectItem> })}</SelectGroup>{settings.savedAnimations.length > 0 && <><SelectSeparator /><SelectGroup><SelectLabel>User animations</SelectLabel>{userAnimationItems}</SelectGroup></>}</SelectContent></Select><Tooltip open={showDisabledCurveTooltip}><TooltipTrigger render={<span className="pointer-events-none absolute top-12 right-3 size-px" />} /><TooltipContent side="left">This curve exceeds page transition’s 0–100% range.</TooltipContent></Tooltip></div>
                    </div>
                    <div data-tour-id={categoryKey === "pageTransitions" ? "animation-curve-editor" : undefined}><CurveEditor value={category.curve} duration={duration} resetSignal={resetSignal} allowOvershoot={categoryKey !== "pageTransitions"} onChange={curve => update({ ...category, easing: "custom", presetId: "custom", curve })} onSave={save} onProgress={(progress) => { setPreviewProgress(progress); setPreviewControlled(true) }} /></div>
                </div>
                <PreviewStage categoryKey={categoryKey} curve={category.curve} duration={duration} progress={previewProgress} editorControlled={previewControlled} resetSignal={resetSignal} onReset={() => { setPreviewProgress(0); setPreviewControlled(true); setResetSignal(value => value + 1) }} />
            </div>
        </AccordionContent>
    </AccordionItem>
}

type EditDialog = { mode: "save"; category: AnimationCategoryKey } | { mode: "rename"; animationId: string } | null

export function AnimationsSettings({ settings, onUpdateSetting, onResetSettings, onToggleAll }: Props) {
    const [dialog, setDialog] = React.useState<EditDialog>(null)
    const [name, setName] = React.useState("")
    const [speedDragging, setSpeedDragging] = React.useState(false)
    React.useEffect(() => {
        if (!speedDragging) return
        const stop = () => setSpeedDragging(false)
        window.addEventListener("pointerup", stop)
        window.addEventListener("pointercancel", stop)
        return () => { window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop) }
    }, [speedDragging])
    const updateCategory = (key: AnimationCategoryKey, value: CategoryAnimationSettings) => {
        onUpdateSetting("categories", { ...settings.categories, [key]: value })
        onUpdateSetting(key, value.enabled)
    }
    const openSave = (category: AnimationCategoryKey) => { setDialog({ mode: "save", category }); setName("") }
    const openRename = (animation: SavedAnimation) => { setDialog({ mode: "rename", animationId: animation.id }); setName(animation.name) }
    const submitDialog = () => {
        const cleanName = name.trim()
        if (!dialog || !cleanName) return
        if (dialog.mode === "rename") onUpdateSetting("savedAnimations", settings.savedAnimations.map(animation => animation.id === dialog.animationId ? { ...animation, name: cleanName } : animation))
        else {
            const saved = { id: crypto.randomUUID(), name: cleanName, points: settings.categories[dialog.category].curve.map(point => ({ ...point })) }
            onUpdateSetting("savedAnimations", [...settings.savedAnimations, saved])
            updateCategory(dialog.category, { ...settings.categories[dialog.category], presetId: `user:${saved.id}` })
        }
        setDialog(null); setName("")
    }
    const removeAnimation = (animation: SavedAnimation) => {
        onUpdateSetting("savedAnimations", settings.savedAnimations.filter(item => item.id !== animation.id))
        const categories = { ...settings.categories }
        CATEGORY_KEYS.forEach(key => { if (categories[key].presetId === `user:${animation.id}`) categories[key] = { ...categories[key], presetId: "custom" } })
        onUpdateSetting("categories", categories)
    }

    return <div className="w-full" data-tour-id="settings-animations">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[var(--hover-bg)]"><IconSparkles className="size-5" /></div><div className="space-y-1"><h2 className="font-semibold">Animations</h2><p className="text-[13px] leading-snug text-[var(--text-tertiary)]">Motion controls used across dashboard</p></div></div><Button variant="destructive" onClick={onResetSettings}><IconRefresh />Reset all</Button></div>
        <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div data-settings-anchor="animations-enable" className="flex items-center justify-between border-b border-[var(--border-subtle)] p-3"><div className="space-y-1"><p className="font-medium">Enable animations</p><p className="text-xs leading-snug text-[var(--text-tertiary)]">Master control for all dashboard motion</p></div><Switch checked={settings.enableAnimations} onCheckedChange={onToggleAll} /></div>
            <div data-settings-anchor="animations-respect-system" className="flex items-center justify-between border-b border-[var(--border-subtle)] p-3"><div className="space-y-1"><p className="font-medium">Respect system preference</p><p className="text-xs leading-snug text-[var(--text-tertiary)]">Reduce motion only when OS preference requests it</p></div><Switch checked={settings.reduceMotion} onCheckedChange={value => onUpdateSetting("reduceMotion", value)} /></div>
            <div data-settings-anchor="animations-main-speed" className="p-3"><div className="mb-3 flex items-center justify-between"><span className="font-medium">Main speed</span><span className="text-xs text-[var(--text-tertiary)]">{speedLabel(settings.animationSpeed)}</span></div><div className="flex items-center gap-3"><Turtle strokeWidth={1.5} className="size-5 shrink-0 text-[var(--text-tertiary)]" /><div className="group relative flex-1" onPointerDownCapture={() => setSpeedDragging(true)}><Slider aria-label="Main animation speed" min={50} max={200} step={1} value={[settings.animationSpeed]} onValueChange={values => onUpdateSetting("animationSpeed", firstValue(values))} /><span className={`pointer-events-none absolute -top-9 -translate-x-1/2 rounded bg-[var(--bg-overlay)] px-2 py-1 text-xs shadow transition-opacity ${speedDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} style={{ left: `${((settings.animationSpeed - 50) / 150) * 100}%` }}>{speedLabel(settings.animationSpeed)}</span></div><Rabbit strokeWidth={1.5} className="size-5 shrink-0 text-[var(--text-tertiary)]" /></div></div>
        </section>
        <h3 data-settings-anchor="animations-categories" className="mb-2.5 text-[15px] font-semibold">Animation categories</h3>
        <Accordion multiple className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">{CATEGORY_KEYS.map(key => <CategoryPanel key={key} categoryKey={key} settings={settings} update={value => updateCategory(key, value)} save={() => openSave(key)} rename={openRename} remove={removeAnimation} />)}</Accordion>
        <Dialog open={dialog !== null} onOpenChange={open => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{dialog?.mode === "rename" ? "Rename animation" : "Save animation"}</DialogTitle><DialogDescription>{dialog?.mode === "rename" ? "Update preset name everywhere it appears." : "Saved curve becomes selectable in every animation category."}</DialogDescription></DialogHeader><Input value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === "Enter" && submitDialog()} autoFocus placeholder="Animation name" /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={submitDialog} disabled={!name.trim()}><IconDeviceFloppy />Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
}
