import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Zoom state for a scrolling document viewer.
 *
 * Two scales, not one, and that split is the whole point of this hook.
 *
 * `liveScale` is what the reader asked for. It changes on every wheel notch and every pinch frame,
 * and the page boxes resize with it in the same commit, so scrolling and anchoring always run
 * against geometry that is already correct.
 *
 * `rasterScale` is what pdf.js has actually drawn. It follows `liveScale` only once the gesture
 * settles. Re-rasterising a page costs tens of milliseconds; doing it per wheel notch queues a
 * dozen overlapping render tasks against the same canvas, and pdf.js aborts a canvas already
 * mid-render — which is what produced pages that appeared cropped or torn until a zoom button
 * forced a clean re-render. Between the two scales the existing bitmap is stretched by CSS, so the
 * page is momentarily soft and then snaps crisp, which is what every native PDF reader does.
 */

const MIN_SCALE = 0.35
const MAX_SCALE = 6
/** Long enough that a wheel burst counts as one gesture, short enough to feel immediate. */
const RASTER_SETTLE_MS = 140

export interface PdfZoomAnchor {
  /** Point in unscaled document coordinates that must stay under the pointer. */
  contentX: number
  contentY: number
  /** Where that pointer sits inside the viewport box. */
  offsetX: number
  offsetY: number
}

export interface PdfZoom {
  liveScale: number
  rasterScale: number
  /** True while the bitmap is being stretched rather than redrawn. */
  isRasterStale: boolean
  zoomAtPoint: (nextScale: number, clientX: number, clientY: number) => void
  zoomBy: (factor: number) => void
  setScale: (scale: number) => void
  fitToWidth: (contentWidth: number) => void
  minScale: number
  maxScale: number
}

export function clampScale(value: number): number {
  // Three decimal places. At two, a small trackpad delta rounds straight back onto the committed
  // scale, the change is discarded as a no-op, and the document sits still until a larger delta
  // arrives and moves it in one visible lurch.
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 1000) / 1000))
}

export function usePdfZoom(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  initialScale = 1.2
): PdfZoom {
  const [liveScale, setLiveScale] = useState(initialScale)
  const [rasterScale, setRasterScale] = useState(initialScale)

  /**
   * The scale the DOM currently reflects.
   *
   * Anchoring measures the laid-out page stack, so it has to divide by the scale that layout was
   * produced at. Reading the requested scale instead is subtly wrong the moment two wheel events
   * land inside one frame: the second event would measure a box drawn at the old scale and divide
   * it by the new one, and the page jumps sideways. Updated after paint, never at request time.
   */
  const paintedScaleRef = useRef(initialScale)
  const pendingAnchorRef = useRef<PdfZoomAnchor | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRaster = useCallback((target: number) => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null
      setRasterScale(target)
    }, RASTER_SETTLE_MS)
  }, [])

  const applyScale = useCallback((target: number, anchor: PdfZoomAnchor | null) => {
    if (target === paintedScaleRef.current && pendingAnchorRef.current === null) return
    if (anchor) pendingAnchorRef.current = anchor
    setLiveScale(target)
    scheduleRaster(target)
  }, [scheduleRaster])

  /**
   * Zooms about a point on screen so the content under it stays put.
   *
   * The anchor is captured in document coordinates rather than derived from `scrollLeft`, because
   * the viewport centres the page stack while it fits. The stack's offset inside the scroll box is
   * therefore not `-scrollLeft`, and a scroll-only correction threw the page sideways every time a
   * zoom crossed the width where centring stopped applying.
   */
  const zoomAtPoint = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const target = clampScale(nextScale)
    const painted = paintedScaleRef.current
    if (target === painted) return

    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) {
      applyScale(target, null)
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    applyScale(target, {
      contentX: (clientX - contentRect.left) / painted,
      contentY: (clientY - contentRect.top) / painted,
      offsetX: clientX - viewportRect.left,
      offsetY: clientY - viewportRect.top,
    })
  }, [applyScale, contentRef, viewportRef])

  /** Zoom from the centre of the viewport, for buttons and keyboard shortcuts. */
  const zoomBy = useCallback((factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const centreX = rect ? rect.left + rect.width / 2 : 0
    const centreY = rect ? rect.top + rect.height / 2 : 0
    zoomAtPoint(paintedScaleRef.current * factor, centreX, centreY)
  }, [viewportRef, zoomAtPoint])

  const setScale = useCallback((scale: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const centreX = rect ? rect.left + rect.width / 2 : 0
    const centreY = rect ? rect.top + rect.height / 2 : 0
    zoomAtPoint(scale, centreX, centreY)
  }, [viewportRef, zoomAtPoint])

  /** `contentWidth` is the widest page at scale 1, so the result fits the widest page exactly. */
  const fitToWidth = useCallback((contentWidth: number) => {
    const viewport = viewportRef.current
    if (!viewport || contentWidth <= 0) return
    const available = viewport.clientWidth - FIT_PADDING_PX
    if (available <= 0) return
    setScale(available / contentWidth)
  }, [setScale, viewportRef])

  // Runs after the new scale has laid out, so the stack's real position is measured rather than
  // predicted, and the anchored point is pulled back under the pointer by scrolling the difference.
  useLayoutEffect(() => {
    paintedScaleRef.current = liveScale

    const viewport = viewportRef.current
    const content = contentRef.current
    const anchor = pendingAnchorRef.current
    if (!viewport || !content || !anchor) return
    pendingAnchorRef.current = null

    const viewportRect = viewport.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    viewport.scrollLeft += contentRect.left - viewportRect.left + anchor.contentX * liveScale - anchor.offsetX
    viewport.scrollTop += contentRect.top - viewportRect.top + anchor.contentY * liveScale - anchor.offsetY
  }, [contentRef, liveScale, viewportRef])

  useLayoutEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  return {
    liveScale,
    rasterScale,
    isRasterStale: Math.abs(liveScale - rasterScale) > 0.001,
    zoomAtPoint,
    zoomBy,
    setScale,
    fitToWidth,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  }
}

/** Page stack padding, so a fitted page is not pressed against the pane edge. */
const FIT_PADDING_PX = 48
