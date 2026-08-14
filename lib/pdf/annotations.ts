/**
 * Annotation shape shared by every document surface in the app.
 *
 * Reports and past papers annotate the same way and persist to different tables, so the geometry
 * and the tools live here and each surface supplies its own storage. Points are stored normalised
 * to the page box (0-1 on both axes) rather than in pixels: a mark made at 120% zoom has to land
 * in the same place at 240%, on a phone, and on a page whose PDF dimensions differ from its
 * neighbours'. Pixels would have to be rescaled on every read and would drift.
 */

export type AnnotationTool = 'select' | 'hand' | 'draw' | 'line' | 'arrow' | 'highlight' | 'text' | 'eraser'

/** Tools that create geometry by dragging, as opposed to clicking or doing nothing. */
export const DRAG_TOOLS: readonly AnnotationTool[] = ['draw', 'line', 'arrow', 'highlight']

export type AnnotationKind = 'draw' | 'line' | 'arrow' | 'highlight' | 'text'

export interface AnnotationPoint {
  x: number
  y: number
}

export interface DocumentAnnotation {
  id: string
  /** Owning document. A report id or a saved paper id, depending on the surface. */
  documentId: string
  page: number
  kind: AnnotationKind
  points: AnnotationPoint[]
  text?: string
  color: string
  strokeWidth: number
}

export const ANNOTATION_COLORS = [
  { id: 'red', value: '#ef4444', label: 'Red' },
  { id: 'amber', value: '#f59e0b', label: 'Amber' },
  { id: 'green', value: '#22c55e', label: 'Green' },
  { id: 'blue', value: '#3b82f6', label: 'Blue' },
  { id: 'violet', value: '#8b5cf6', label: 'Violet' },
  { id: 'ink', value: '#0f172a', label: 'Ink' },
] as const

export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].value
export const MIN_STROKE_WIDTH = 1
export const MAX_STROKE_WIDTH = 12

export function toolKind(tool: AnnotationTool): AnnotationKind | null {
  switch (tool) {
    case 'draw': return 'draw'
    case 'line': return 'line'
    case 'arrow': return 'arrow'
    case 'highlight': return 'highlight'
    case 'text': return 'text'
    default: return null
  }
}

export function makeAnnotationId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Extends a drag in progress.
 *
 * Free drawing accumulates points; every other drag tool is defined by its two ends, so the second
 * point is replaced rather than appended — otherwise a slow drag leaves a line made of hundreds of
 * collinear points that all have to be persisted and re-rendered.
 */
export function extendDraft(draft: DocumentAnnotation, point: AnnotationPoint): DocumentAnnotation {
  if (draft.kind !== 'draw') return { ...draft, points: [draft.points[0], point] }
  const last = draft.points[draft.points.length - 1]
  // Sub-pixel jitter from a trackpad would otherwise triple the point count for no visible gain.
  if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.0015) return draft
  return { ...draft, points: [...draft.points, point] }
}

/** A drag that never moved is a stray click, not an annotation the user meant to leave behind. */
export function isDegenerateDraft(draft: DocumentAnnotation): boolean {
  if (draft.kind === 'text') return false
  if (draft.points.length < 2) return true
  const [first] = draft.points
  return draft.points.every((point) => Math.hypot(point.x - first.x, point.y - first.y) < 0.004)
}

/**
 * Distance from a point to an annotation's path, in normalised units, used by the eraser.
 *
 * Hit testing lives here rather than on the SVG because a stroke rendered one pixel wide is
 * essentially impossible to click. The eraser tests against a radius instead.
 */
export function distanceToAnnotation(annotation: DocumentAnnotation, point: AnnotationPoint): number {
  const { points } = annotation
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y)

  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, points[index], points[index + 1]))
  }
  return nearest
}

function distanceToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

export const ERASER_RADIUS = 0.012

/** Highlights sit under the page text so the words stay readable through them. */
export function isUnderlay(kind: AnnotationKind): boolean {
  return kind === 'highlight'
}
