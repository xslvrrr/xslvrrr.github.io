"use client"

import * as React from "react"

import styles from "@/styles/Dashboard.module.css"

interface NotificationsResizerProps {
    label: string
    /** Current width of the panel to the left of this border, in pixels. */
    width: number
    min: number
    max: number
    onChange: (width: number) => void
    /** Borders are only draggable while the notifications page is being customised. */
    enabled: boolean
}

/** Keyboard nudge per arrow press, so the border is adjustable without a pointer. */
const KEYBOARD_STEP = 8

export function NotificationsResizer({ label, width, min, max, onChange, enabled }: NotificationsResizerProps) {
    const [isDragging, setIsDragging] = React.useState(false)

    const clamp = React.useCallback(
        (value: number) => Math.min(max, Math.max(min, Math.round(value))),
        [max, min]
    )

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!enabled) return
        event.preventDefault()
        const startX = event.clientX
        const startWidth = width
        setIsDragging(true)

        const move = (moveEvent: PointerEvent) => {
            onChange(clamp(startWidth + (moveEvent.clientX - startX)))
        }

        const stop = () => {
            setIsDragging(false)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', stop)
        }

        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!enabled) return
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onChange(clamp(width - KEYBOARD_STEP))
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault()
            onChange(clamp(width + KEYBOARD_STEP))
        }
    }

    return (
        <div
            className={styles.notificationsResizer}
            data-enabled={enabled ? 'true' : undefined}
            data-dragging={isDragging ? 'true' : undefined}
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={enabled ? 0 : -1}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
        />
    )
}
