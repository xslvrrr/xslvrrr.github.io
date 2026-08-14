import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

import {
  isUnderlay,
  type AnnotationTool,
  type DocumentAnnotation,
} from '@/lib/pdf/annotations'
import styles from './pdfViewer.module.css'

export interface PdfPageSize {
  width: number
  height: number
}

interface PdfPageProps {
  document: PDFDocumentProxy
  pageNumber: number
  /** Unscaled page dimensions, measured once when the document loads. */
  baseSize: PdfPageSize
  /** The scale the reader asked for. Drives layout immediately. */
  liveScale: number
  /** The scale pdf.js draws at. Trails `liveScale` until a zoom gesture settles. */
  rasterScale: number
  tool: AnnotationTool
  annotations: DocumentAnnotation[]
  draft: DocumentAnnotation | null
  selectedId: string | null
  /** Off while a timed attempt is running, so text cannot be copied out of a paper mid-exam. */
  textSelectable: boolean
  onPointerDown: (event: ReactPointerEvent, page: number, surface: HTMLElement) => void
  onPointerMove: (event: ReactPointerEvent, surface: HTMLElement) => void
  onPointerUp: () => void
  onSelectAnnotation: (id: string) => void
}

/** Pages this far outside the viewport are rendered so scrolling stays ahead of the reader. */
const RENDER_MARGIN_PX = 900

/**
 * One page: a raster canvas, a selectable text layer, and an annotation overlay.
 *
 * Rendering is deferred until the page is near the viewport, so a 40-page paper does not rasterise
 * every page up front.
 */
export function PdfPage({
  document: pdfDocument,
  pageNumber,
  baseSize,
  liveScale,
  rasterScale,
  tool,
  annotations,
  draft,
  selectedId,
  textSelectable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelectAnnotation,
}: PdfPageProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  /**
   * The in-flight render. pdf.js refuses to draw onto a canvas that is already being drawn onto,
   * and a zoom that fires a second render before the first resolves leaves the canvas holding half
   * of each — the torn, apparently-cropped page this viewer used to show. Cancelling first is the
   * fix; the abort it raises is expected and swallowed below.
   */
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textLayerTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [shouldRender, setShouldRender] = useState(false)

  // Derived during render, not in an effect: the page box must resize in the same commit as the
  // scale change, otherwise the viewer's scroll correction runs against a stale scroll height.
  const liveSize = { width: baseSize.width * liveScale, height: baseSize.height * liveScale }
  const rasterSize = { width: baseSize.width * rasterScale, height: baseSize.height * rasterScale }
  /** Stretches the already-drawn bitmap and text layer up to the requested scale. */
  const previewScale = rasterScale > 0 ? liveScale / rasterScale : 1

  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) setShouldRender(true) }),
      { rootMargin: `${RENDER_MARGIN_PX}px 0px` }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldRender) return
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    renderTaskRef.current?.cancel()
    textLayerTaskRef.current?.cancel()

    void (async () => {
      const page = await pdfDocument.getPage(pageNumber)
      if (cancelled) return

      const viewport = page.getViewport({ scale: rasterScale })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return

      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })
      renderTaskRef.current = task
      await task.promise
      if (cancelled) return
      renderTaskRef.current = null

      const container = textLayerRef.current
      if (!container) return
      container.replaceChildren()
      const { TextLayer } = await import('pdfjs-dist')
      if (cancelled) return
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      })
      textLayerTaskRef.current = textLayer
      await textLayer.render()
    })().catch(() => {
      // A cancelled render is the normal path through this code during a zoom, and a genuinely
      // failed one leaves the previous bitmap in place rather than blanking the page.
    })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      textLayerTaskRef.current?.cancel()
      textLayerTaskRef.current = null
    }
  }, [pdfDocument, pageNumber, rasterScale, shouldRender])

  const pageAnnotations = [
    ...annotations.filter((item) => item.page === pageNumber),
    ...(draft?.page === pageNumber ? [draft] : []),
  ]
  const strokes = pageAnnotations.filter((item) => item.kind !== 'text')

  return (
    <div className={styles.pageWrapper}>
      <div
        ref={surfaceRef}
        className={styles.surface}
        data-tool={tool}
        style={{ width: liveSize.width, height: liveSize.height }}
        onPointerDown={(event) => { if (surfaceRef.current) onPointerDown(event, pageNumber, surfaceRef.current) }}
        onPointerMove={(event) => { if (surfaceRef.current) onPointerMove(event, surfaceRef.current) }}
        onPointerUp={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: liveSize.width, height: liveSize.height }}
        />

        <svg className={styles.underlay} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
          {strokes.filter((item) => isUnderlay(item.kind)).map((item) => renderStroke(item))}
        </svg>

        {/*
          Sized at the raster scale and stretched to the live scale, because pdf.js positions every
          span in pixels derived from the viewport it was built with. Re-laying the text out on
          every wheel notch would cost as much as the raster it is trying to avoid.
        */}
        <div
          ref={textLayerRef}
          className={styles.textLayer}
          data-selectable={textSelectable && (tool === 'select' || tool === 'text')}
          style={{
            width: rasterSize.width,
            height: rasterSize.height,
            transform: previewScale === 1 ? undefined : `scale(${previewScale})`,
            /*
             * pdf.js positions every span with `calc(var(--total-scale-factor) * Npx)`. It renamed
             * the variable from `--scale-factor` in v4; setting only the old name left every span
             * with an invalid `left`/`top`, so the whole text layer collapsed into the page's top
             * corner and the document could not be selected. Both names are set so the layer works
             * whichever the installed build reads.
             */
            ['--total-scale-factor' as string]: rasterScale,
            ['--scale-factor' as string]: rasterScale,
            // pdf.js rounds span geometry against these; without them `round()` receives an
            // undefined step and the whole declaration is dropped.
            ['--scale-round-x' as string]: '1px',
            ['--scale-round-y' as string]: '1px',
          }}
        />

        <svg className={styles.overlay} data-eraser={tool === 'eraser'} viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {/* One marker per colour actually in use on this page, so arrowheads inherit the stroke
              colour without a marker definition per annotation. */}
          <defs>
            {[...new Set(strokes.filter((item) => item.kind === 'arrow').map((item) => item.color))].map((color) => (
              <marker
                key={color}
                id={arrowMarkerId(color)}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {strokes.filter((item) => !isUnderlay(item.kind)).map((item) => renderStroke(item))}
        </svg>

        {pageAnnotations.filter((item) => item.kind === 'text').map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.annotationText}
            data-selected={selectedId === item.id}
            style={{
              left: `${item.points[0].x * 100}%`,
              top: `${item.points[0].y * 100}%`,
              borderColor: item.color,
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelectAnnotation(item.id)
            }}
          >{item.text || 'Note'}</button>
        ))}
      </div>
      <span className={styles.pageLabel}>{pageNumber}</span>
    </div>
  )
}

/**
 * Strokes are drawn in a fixed 1000x1000 viewBox with `preserveAspectRatio="none"`, which maps the
 * normalised points straight onto the page box at any zoom without any per-render arithmetic.
 */
function renderStroke(item: DocumentAnnotation) {
  const points = item.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ')
  const highlight = item.kind === 'highlight'

  return (
    <polyline
      key={item.id}
      data-annotation-id={item.id}
      points={points}
      fill="none"
      stroke={item.color}
      strokeWidth={item.strokeWidth * (highlight ? 8 : 2)}
      strokeOpacity={highlight ? 0.35 : 1}
      strokeLinecap={highlight ? 'butt' : 'round'}
      strokeLinejoin="round"
      markerEnd={item.kind === 'arrow' ? `url(#${arrowMarkerId(item.color)})` : undefined}
    />
  )
}

/** `#` and any other punctuation would make the colour an invalid id fragment. */
function arrowMarkerId(color: string): string {
  return `pdf-arrow-${color.replace(/[^a-z0-9]/gi, '')}`
}
