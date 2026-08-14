"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import styles from "./Tour.module.css"

interface TourSpotlightProps {
  targetRect: DOMRect | null
  padding?: number
}

export function TourSpotlight({ targetRect, padding = 8 }: TourSpotlightProps): React.ReactPortal | null {
  if (typeof document === "undefined") return null

  const style = targetRect
    ? (() => {
        const left = Math.max(4, targetRect.left - padding)
        const top = Math.max(4, targetRect.top - padding)
        const right = Math.min(window.innerWidth - 4, targetRect.right + padding)
        const bottom = Math.min(window.innerHeight - 4, targetRect.bottom + padding)
        return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
      })()
    : { left: "50%", top: "50%", width: 0, height: 0 }

  return createPortal(
    <div className={styles.layer} aria-hidden="true">
      <div className={styles.spotlight} style={style} />
    </div>,
    document.body
  )
}
