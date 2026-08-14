import type { HomeCanvasElement } from "./homeLayout"

export interface CanvasPoint {
  x: number
  y: number
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Converts a pointer position into coordinates on the freeform layer. The layer covers the home
 * grid and scrolls with it, so the scroll offset is part of the conversion; there is no zoom or
 * pan, which is what keeps freeform elements pinned to the cards they annotate.
 */
export function clientPointToCanvas({
  clientX,
  clientY,
  rect,
  scrollLeft = 0,
  scrollTop = 0,
}: {
  clientX: number
  clientY: number
  rect: { left: number; top: number }
  scrollLeft?: number
  scrollTop?: number
}) {
  return {
    x: clientX - rect.left + scrollLeft,
    y: clientY - rect.top + scrollTop,
  }
}

/** A lasso shorter than this is treated as a stray click rather than a selection gesture. */
export const LASSO_MIN_POINTS = 3

/**
 * Standard even-odd ray cast. The lasso path is always treated as closed, so the caller does not
 * have to append the start point before testing.
 */
export function pointInPolygon(
  point: CanvasPoint,
  polygon: readonly CanvasPoint[]
): boolean {
  if (polygon.length < LASSO_MIN_POINTS) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i]
    const previous = polygon[j]
    const straddlesRay = current.y > point.y !== previous.y > point.y
    if (!straddlesRay) continue

    const intersectionX =
      ((previous.x - current.x) * (point.y - current.y)) /
        (previous.y - current.y) +
      current.x
    if (point.x < intersectionX) inside = !inside
  }

  return inside
}

/**
 * The points a lasso is tested against. Ink is tested at every recorded point so a stroke only
 * counts when the loop actually crosses it; boxes and lines are tested at their corners, midpoints
 * and centre so a loop drawn around them selects without demanding pixel-perfect enclosure.
 */
export function canvasElementSamplePoints(
  element: HomeCanvasElement
): CanvasPoint[] {
  if (element.kind === "draw") return element.points

  if (element.kind === "line") {
    const endX = element.x + element.w
    const endY = element.y + element.h
    return [
      { x: element.x, y: element.y },
      { x: (element.x + endX) / 2, y: (element.y + endY) / 2 },
      { x: endX, y: endY },
    ]
  }

  const right = element.x + element.w
  const bottom = element.y + element.h
  return [
    { x: element.x, y: element.y },
    { x: right, y: element.y },
    { x: element.x, y: bottom },
    { x: right, y: bottom },
    { x: (element.x + right) / 2, y: (element.y + bottom) / 2 },
  ]
}

/** Ids of every freeform element the lasso path encloses, in layer order. */
export function elementsInLasso(
  elements: readonly HomeCanvasElement[],
  polygon: readonly CanvasPoint[]
): string[] {
  if (polygon.length < LASSO_MIN_POINTS) return []

  return elements
    .filter((element) =>
      canvasElementSamplePoints(element).some((point) =>
        pointInPolygon(point, polygon)
      )
    )
    .map((element) => element.id)
}

/**
 * Translates any freeform element by a delta. Ink has no origin of its own, so it moves by shifting
 * every recorded point rather than by an `x`/`y` pair.
 */
export function offsetCanvasElement(
  element: HomeCanvasElement,
  deltaX: number,
  deltaY: number
): HomeCanvasElement {
  if (element.kind === "draw") {
    return {
      ...element,
      points: element.points.map((point) => ({
        x: point.x + deltaX,
        y: point.y + deltaY,
      })),
    }
  }

  return { ...element, x: element.x + deltaX, y: element.y + deltaY }
}
