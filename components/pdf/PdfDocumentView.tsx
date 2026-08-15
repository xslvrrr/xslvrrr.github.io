import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  IconArrowBackUp, IconArrowForwardUp, IconArrowUpRight, IconEraser, IconHandMove, IconHighlight,
  IconLayoutBottombarCollapse, IconLayoutBottombarExpand, IconLine, IconLoader2,
  IconPencil, IconPointer, IconTextCaption, IconZoomIn, IconZoomOut, IconZoomReset,
} from '@tabler/icons-react'

import { Input } from '@/components/ui/input'
import { Toolbar } from '@/components/kokonutui/toolbar'
import {
  DRAG_TOOLS, DEFAULT_ANNOTATION_COLOR, distanceToAnnotation, ERASER_RADIUS,
  extendDraft, isDegenerateDraft, makeAnnotationId, toolKind,
  type AnnotationTool, type AnnotationPoint, type DocumentAnnotation,
} from '@/lib/pdf/annotations'
import { PdfPage, type PdfPageSize } from './PdfPage'
import { useAnnotationHistory } from './useAnnotationHistory'
import { usePdfZoom } from './usePdfZoom'
import styles from './pdfViewer.module.css'

export interface PdfDocumentViewProps {
  /** Identifies the document for annotation ownership. */
  documentId: string
  /** Same-origin URL the PDF is streamed from. */
  url: string
  annotations: DocumentAnnotation[]
  onAnnotationsChange: (next: DocumentAnnotation[]) => void
  /** Hides the annotation tools when a pane is too small to draw in comfortably. */
  compact?: boolean
  /** Rendered above the annotation toolbar. The past papers timer goes here. */
  slotAboveToolbar?: ReactNode
  /** Suppresses text selection, so a paper cannot be copied out mid-attempt. */
  textSelectable?: boolean
  /** Hides the annotation toolbar without unmounting existing annotations. */
  annotationsEnabled?: boolean
  /** Starts with the floating toolbars collapsed, for readers who want the page uninterrupted. */
  defaultToolbarsHidden?: boolean
  /**
   * Hands the show/hide control to the host.
   *
   * Past papers puts it next to its own timer toggle, so the two live together instead of being
   * split between a header and a button buried in the zoom group. Pass both to take it over; pass
   * neither and the viewer keeps its own toggle and corner reveal.
   */
  toolbarsHidden?: boolean
  onToolbarsHiddenChange?: (hidden: boolean) => void
  emptyMessage?: string
  /** What the document opens at. Past papers takes this from the student's own settings. */
  initialScale?: number
  onDocumentLoaded?: (document: PDFDocumentProxy) => void
}

const SCALE_STEP = 1.15
/** Matches the zoom the past papers settings default to, so the two cannot drift apart. */
const DEFAULT_SCALE = 1.2
const STROKE_WIDTH = 3
const TOOLBAR_SPRING = { type: 'spring', bounce: 0, duration: 0.35 } as const

export function PdfDocumentView({
  documentId,
  url,
  annotations,
  onAnnotationsChange,
  compact = false,
  slotAboveToolbar,
  textSelectable = true,
  annotationsEnabled = true,
  defaultToolbarsHidden = false,
  toolbarsHidden: controlledToolbarsHidden,
  onToolbarsHiddenChange,
  emptyMessage = 'This document has no stored PDF.',
  initialScale = DEFAULT_SCALE,
  onDocumentLoaded,
}: PdfDocumentViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageStackRef = useRef<HTMLDivElement>(null)
  const pinchStateRef = useRef<{ distance: number; scale: number } | null>(null)
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const panStateRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null)

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [baseSizes, setBaseSizes] = useState<PdfPageSize[]>([])
  const [tool, setTool] = useState<AnnotationTool>('select')
  const [draft, setDraft] = useState<DocumentAnnotation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ownToolbarsHidden, setOwnToolbarsHidden] = useState(defaultToolbarsHidden)

  useEffect(() => setOwnToolbarsHidden(defaultToolbarsHidden), [defaultToolbarsHidden])

  const hostControlsToolbars = controlledToolbarsHidden !== undefined && onToolbarsHiddenChange !== undefined
  const toolbarsHidden = hostControlsToolbars ? controlledToolbarsHidden : ownToolbarsHidden
  const setToolbarsHidden = hostControlsToolbars ? onToolbarsHiddenChange : setOwnToolbarsHidden
  const prefersReducedMotion = useReducedMotion()

  const zoom = usePdfZoom(viewportRef, pageStackRef, initialScale)
  const { liveScale, rasterScale, zoomAtPoint, zoomBy, fitToWidth, minScale, maxScale } = zoom

  // The live scale has to be readable from the native wheel and pointer listeners, which fire
  // faster than React re-renders; a closure over state would compound stale values.
  const liveScaleRef = useRef(liveScale)
  liveScaleRef.current = liveScale

  useEffect(() => {
    if (!url) {
      setError(emptyMessage)
      return
    }

    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    setLoading(true)
    setError(null)

    void import('pdfjs-dist').then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker
      loadingTask = pdfjs.getDocument({ url })
      const nextDocument = await loadingTask.promise
      if (cancelled) return

      // Measured at scale 1 up front so every later zoom is pure arithmetic on these numbers
      // rather than an async round trip per page.
      const sizes = await Promise.all(
        Array.from({ length: nextDocument.numPages }, (_, index) => (
          nextDocument.getPage(index + 1).then((page) => {
            const viewport = page.getViewport({ scale: 1 })
            return { width: viewport.width, height: viewport.height }
          })
        ))
      )
      if (cancelled) return
      setBaseSizes(sizes)
      setPdfDocument(nextDocument)
      onDocumentLoaded?.(nextDocument)
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load document')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      void loadingTask?.destroy()
      setPdfDocument(null)
      setBaseSizes([])
    }
    // `onDocumentLoaded` is intentionally excluded: an inline callback would reload the document on
    // every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, emptyMessage])

  const widestPage = useMemo(
    () => baseSizes.reduce((widest, size) => Math.max(widest, size.width), 0),
    [baseSizes]
  )

  /**
   * `initialScale` is a reading preference sized for a desktop pane. On a phone it opens the
   * document already wider than the screen, so the reader lands mid-page and has to pinch out
   * before they can read anything. When the page cannot fit at the requested scale the viewer
   * opens fitted to the width instead; when it does fit, the preference is honoured untouched.
   *
   * Runs once per document: a later resize, or the reader's own zoom, must not be overruled.
   */
  const autoFittedDocumentRef = useRef<string | null>(null)
  useEffect(() => {
    if (widestPage <= 0) return
    if (autoFittedDocumentRef.current === documentId) return
    const viewport = viewportRef.current
    if (!viewport) return

    autoFittedDocumentRef.current = documentId
    if (widestPage * initialScale > viewport.clientWidth) fitToWidth(widestPage)
  }, [documentId, fitToWidth, initialScale, widestPage])

  const history = useAnnotationHistory(documentId, annotations, onAnnotationsChange)
  const { commit, undo, redo, canUndo, canRedo } = history

  const update = useCallback((updater: (current: DocumentAnnotation[]) => DocumentAnnotation[]) => {
    commit(updater(annotations))
  }, [annotations, commit])

  /**
   * The annotation whose text is mid-edit.
   *
   * Typing into a note is one edit, not one per keystroke: without this, undo would walk back
   * through a note letter by letter before it reached the stroke the reader actually wanted gone.
   */
  const editingTextRef = useRef<string | null>(null)
  useEffect(() => { editingTextRef.current = null }, [selectedId])

  // Undo lives on the window rather than the viewport because the viewer is rarely the focused
  // element — a reader who has just drawn a stroke has focus on the page surface at best. Typing
  // targets keep their own native undo.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return

      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return

      event.preventDefault()
      const redoing = event.key.toLowerCase() === 'y' || event.shiftKey
      if (redoing) redo()
      else undo()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [redo, undo])

  // Drag-to-pan. Registered natively so a drag that leaves the page surface, crosses the gap
  // between pages, or runs past the viewport edge still pans instead of stopping mid-gesture.
  // Touch is left to the browser's own panning, which is smoother than anything reproduced here.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || tool !== 'hand') return

    const handleDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return
      event.preventDefault()
      panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
      viewport.setPointerCapture(event.pointerId)
    }

    const handleMove = (event: PointerEvent) => {
      const pan = panStateRef.current
      if (!pan || pan.pointerId !== event.pointerId) return
      event.preventDefault()
      viewport.scrollLeft -= event.clientX - pan.clientX
      viewport.scrollTop -= event.clientY - pan.clientY
      panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    }

    const handleUp = (event: PointerEvent) => {
      if (panStateRef.current?.pointerId !== event.pointerId) return
      panStateRef.current = null
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    }

    viewport.addEventListener('pointerdown', handleDown)
    viewport.addEventListener('pointermove', handleMove, { passive: false })
    viewport.addEventListener('pointerup', handleUp)
    viewport.addEventListener('pointercancel', handleUp)
    return () => {
      viewport.removeEventListener('pointerdown', handleDown)
      viewport.removeEventListener('pointermove', handleMove)
      viewport.removeEventListener('pointerup', handleUp)
      viewport.removeEventListener('pointercancel', handleUp)
      panStateRef.current = null
    }
  }, [tool])

  // Wheel zoom is registered natively because React's synthetic wheel listener is passive and
  // therefore cannot preventDefault the browser's own ctrl-wheel page zoom.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      // Multiplicative so each notch changes the zoom by a constant proportion, which keeps the
      // step even across the whole range instead of crawling near the maximum.
      const magnitude = Math.min(Math.abs(event.deltaY), 60) / 60 * 0.2
      const factor = event.deltaY > 0 ? 1 - magnitude : 1 + magnitude
      zoomAtPoint(liveScaleRef.current * factor, event.clientX, event.clientY)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [zoomAtPoint])

  // Two-finger pinch on touch screens. Trackpad pinch arrives as a ctrl-wheel event instead.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const pointers = activePointersRef.current
    const spread = (): number => {
      const [first, second] = [...pointers.values()]
      return Math.hypot(first.x - second.x, first.y - second.y)
    }
    const centre = (): { x: number; y: number } => {
      const [first, second] = [...pointers.values()]
      return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
    }

    const handleDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) pinchStateRef.current = { distance: spread(), scale: liveScaleRef.current }
    }

    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const pinch = pinchStateRef.current
      if (pointers.size !== 2 || !pinch || pinch.distance === 0) return
      event.preventDefault()
      const point = centre()
      zoomAtPoint(pinch.scale * (spread() / pinch.distance), point.x, point.y)
    }

    const handleUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinchStateRef.current = null
    }

    viewport.addEventListener('pointerdown', handleDown)
    viewport.addEventListener('pointermove', handleMove, { passive: false })
    viewport.addEventListener('pointerup', handleUp)
    viewport.addEventListener('pointercancel', handleUp)
    // A finger that leaves the element without a pointerup would otherwise stay in the map and make
    // the next single-finger drag look like the second half of a pinch.
    viewport.addEventListener('pointerleave', handleUp)
    return () => {
      viewport.removeEventListener('pointerdown', handleDown)
      viewport.removeEventListener('pointermove', handleMove)
      viewport.removeEventListener('pointerup', handleUp)
      viewport.removeEventListener('pointercancel', handleUp)
      viewport.removeEventListener('pointerleave', handleUp)
      pointers.clear()
      pinchStateRef.current = null
    }
  }, [zoomAtPoint])

  // Browser-standard zoom shortcuts, scoped to the viewer so they do not fight the page's own.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(SCALE_STEP) }
      else if (event.key === '-') { event.preventDefault(); zoomBy(1 / SCALE_STEP) }
      else if (event.key === '0') { event.preventDefault(); fitToWidth(widestPage) }
    }

    viewport.addEventListener('keydown', handleKeyDown)
    return () => viewport.removeEventListener('keydown', handleKeyDown)
  }, [fitToWidth, widestPage, zoomBy])

  const pointFromEvent = (event: ReactPointerEvent, surface: HTMLElement): AnnotationPoint => {
    const rect = surface.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }

  const handlePointerDown = (event: ReactPointerEvent, page: number, surface: HTMLElement) => {
    if (!annotationsEnabled) return
    const point = pointFromEvent(event, surface)

    if (tool === 'eraser') {
      // Radius hit testing rather than the SVG's own, because a stroke rendered a pixel wide is
      // close to impossible to click accurately.
      const hit = annotations
        .filter((item) => item.page === page)
        .map((item) => ({ item, distance: distanceToAnnotation(item, point) }))
        .filter((entry) => entry.distance <= ERASER_RADIUS)
        .sort((a, b) => a.distance - b.distance)[0]
      if (hit) update((current) => current.filter((item) => item.id !== hit.item.id))
      return
    }

    const kind = toolKind(tool)
    if (!kind) return

    if (kind === 'text') {
      const annotation: DocumentAnnotation = {
        id: makeAnnotationId(), documentId, page, kind: 'text', points: [point],
        text: 'Note', color: DEFAULT_ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH,
      }
      update((current) => [...current, annotation])
      setSelectedId(annotation.id)
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({
      id: makeAnnotationId(), documentId, page, kind,
      points: [point, point], color: DEFAULT_ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH,
    })
  }

  const handlePointerMove = (event: ReactPointerEvent, surface: HTMLElement) => {
    if (!draft) return
    setDraft((current) => (current ? extendDraft(current, pointFromEvent(event, surface)) : null))
  }

  const handlePointerUp = () => {
    if (!draft) return
    // A click that never became a drag is a stray tap, not a mark the reader meant to leave.
    if (!isDegenerateDraft(draft)) update((current) => [...current, draft])
    setDraft(null)
  }

  const pageNumbers = useMemo(() => baseSizes.map((_, index) => index + 1), [baseSizes])
  const selected = annotations.find((item) => item.id === selectedId)
  const showTools = annotationsEnabled && !compact

  return (
    <div className={styles.root}>
      <AnimatePresence initial={false}>
        {toolbarsHidden && !hostControlsToolbars ? (
          <motion.button
            key="reveal"
            type="button"
            className={styles.toolbarReveal}
            aria-label="Show toolbar"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={TOOLBAR_SPRING}
            onClick={() => setToolbarsHidden(false)}
          >
            <IconLayoutBottombarExpand />
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Unmounted rather than merely invisible, so it can animate out. Nothing the reader chose
          lives here — the timer's state belongs to the host and the tool selection to this
          component — so hiding the bar never costs them a setting. */}
      <AnimatePresence initial={false}>
        {toolbarsHidden ? null : (
          <motion.div
            key="toolbars"
            className={styles.toolbars}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={TOOLBAR_SPRING}
          >
            {slotAboveToolbar}

            <div className={styles.toolRow}>
              {showTools ? (
                <Toolbar
                  ariaLabel="History"
                  selected={null}
                  onSelect={(action) => (action === 'undo' ? undo() : redo())}
                  items={[
                    { id: 'undo', title: 'Undo', icon: <IconArrowBackUp />, disabled: !canUndo },
                    { id: 'redo', title: 'Redo', icon: <IconArrowForwardUp />, disabled: !canRedo },
                  ]}
                />
              ) : null}

              {showTools ? (
                <Toolbar<AnnotationTool>
                  ariaLabel="Annotation tools"
                  selected={tool}
                  onSelect={setTool}
                  items={[
                    { id: 'select', title: 'Select', icon: <IconPointer /> },
                    { id: 'hand', title: 'Pan', icon: <IconHandMove /> },
                    { id: 'draw', title: 'Free draw', icon: <IconPencil /> },
                    { id: 'highlight', title: 'Highlight', icon: <IconHighlight /> },
                    { id: 'line', title: 'Line', icon: <IconLine /> },
                    { id: 'arrow', title: 'Arrow', icon: <IconArrowUpRight /> },
                    { id: 'text', title: 'Text', icon: <IconTextCaption /> },
                    { id: 'eraser', title: 'Erase', icon: <IconEraser /> },
                  ]}
                />
              ) : null}

              <Toolbar
                ariaLabel="Zoom controls"
                selected={null}
                onSelect={(action) => {
                  if (action === 'fit') fitToWidth(widestPage)
                  else if (action === 'hide') setToolbarsHidden(true)
                  else zoomBy(action === 'zoom-in' ? SCALE_STEP : 1 / SCALE_STEP)
                }}
                items={[
                  { id: 'zoom-out', title: 'Zoom out', icon: <IconZoomOut />, disabled: liveScale <= minScale },
                  { id: 'zoom-in', title: 'Zoom in', icon: <IconZoomIn />, disabled: liveScale >= maxScale },
                  { id: 'fit', title: 'Fit width', icon: <IconZoomReset />, disabled: widestPage === 0 },
                  ...(hostControlsToolbars
                    ? []
                    : [{ id: 'hide' as const, title: 'Hide toolbar', icon: <IconLayoutBottombarCollapse /> }]),
                ]}
              />
              <span className={styles.zoomLabel}>{Math.round(liveScale * 100)}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selected?.kind === 'text' ? (
        <Input
          value={selected.text || ''}
          aria-label="Annotation text"
          onChange={(event) => {
            const next = annotations.map((item) => (
              item.id === selected.id ? { ...item, text: event.target.value } : item
            ))
            // One history entry for the whole edit, not one per character.
            if (editingTextRef.current === selected.id) onAnnotationsChange(next)
            else {
              editingTextRef.current = selected.id
              commit(next)
            }
          }}
        />
      ) : null}

      <div ref={viewportRef} className={styles.viewport} data-tool={tool} tabIndex={-1}>
        {loading ? (
          <div className={styles.status}><IconLoader2 className={styles.spinner} /> Loading document</div>
        ) : null}
        {error ? <div className={styles.status}>{error}</div> : null}
        {pdfDocument ? (
          <div ref={pageStackRef} className={styles.pageStack}>
            {pageNumbers.map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                document={pdfDocument}
                pageNumber={pageNumber}
                baseSize={baseSizes[pageNumber - 1]}
                liveScale={liveScale}
                rasterScale={rasterScale}
                tool={tool}
                annotations={annotations}
                draft={draft}
                selectedId={selectedId}
                textSelectable={textSelectable}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onSelectAnnotation={setSelectedId}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { DRAG_TOOLS }
