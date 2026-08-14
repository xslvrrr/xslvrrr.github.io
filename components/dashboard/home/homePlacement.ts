import { homeItemColumn, homeItemSpan } from "./homeLayout"
import type { HomeItemType, HomeLayout } from "./homeLayout"

/**
 * Where one card sits in the grid. Rows are 1px tall, so `rowStart` and `rowSpan` are pixel
 * measurements expressed as grid lines.
 */
export interface HomeCardPlacement {
  /** Zero-based column the card starts in. */
  column: number
  /** Columns the card occupies. */
  columnSpan: number
  /** 1-based grid row line the card starts on. */
  rowStart: number
  /** Grid rows the card occupies: its measured height plus one row gap. */
  rowSpan: number
}

export interface HomePlacementInput {
  items: readonly HomeItemType[]
  layout: Pick<HomeLayout, "itemSpans" | "itemColumns">
  /** Measured card heights in pixels, keyed by card. A card missing here is not laid out yet. */
  heights: Readonly<Partial<Record<HomeItemType, number>>>
  columnCount: number
  rowGap: number
}

/**
 * Places every card explicitly instead of letting CSS grid auto-placement decide.
 *
 * Auto-placement derives a card's column from the total height of everything before it, so a card
 * that merely grew — a notice arriving, a month with more events — pushed unrelated cards into the
 * other column. Here a card's column comes from the layout and only its row is computed, from the
 * cards above it *in its own column*. Nothing a card does can move a card in another column.
 *
 * A full-width card is the one exception, and unavoidably so: it has to clear every column, so it
 * starts below the tallest of them and every column resumes beneath it.
 *
 * Returns `null` until every card has been measured, because a partial pass would stack cards on
 * top of each other. Callers should fall back to plain flow for that first frame.
 */
export function computeHomePlacements({
  items,
  layout,
  heights,
  columnCount,
  rowGap,
}: HomePlacementInput): Map<HomeItemType, HomeCardPlacement> | null {
  const columns = Math.max(1, Math.trunc(columnCount))
  const placements = new Map<HomeItemType, HomeCardPlacement>()
  // Next free row line per column. Grid lines are 1-based, so an empty column starts at 1.
  const columnTops = new Array<number>(columns).fill(1)

  for (const item of items) {
    const height = heights[item]
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null

    const rowSpan = Math.max(1, Math.ceil(height + rowGap))
    const columnSpan = homeItemSpan(layout, item, columns)

    if (columnSpan >= columns) {
      const rowStart = Math.max(...columnTops)
      placements.set(item, { column: 0, columnSpan: columns, rowStart, rowSpan })
      columnTops.fill(rowStart + rowSpan)
      continue
    }

    const column = homeItemColumn(layout, item, columns)
    const rowStart = columnTops[column]
    placements.set(item, { column, columnSpan, rowStart, rowSpan })
    columnTops[column] = rowStart + rowSpan
  }

  return placements
}

/**
 * Which column a horizontal position falls in, given each column's own left edge and width read
 * back from the laid-out grid.
 *
 * Measuring the real columns rather than recomputing them from the preference is deliberate: a
 * media query can override the column count, and a drop that disagreed with what is on screen
 * would move the card somewhere the user did not point at.
 */
export function homeColumnAtPoint(
  columnRects: ReadonlyArray<{ left: number; width: number }>,
  x: number
): number {
  if (columnRects.length === 0) return 0

  let closest = 0
  let closestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < columnRects.length; index += 1) {
    const { left, width } = columnRects[index]
    if (x >= left && x <= left + width) return index

    const distance = x < left ? left - x : x - (left + width)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = index
    }
  }

  return closest
}

/**
 * Reads each column's left edge and width off the laid-out grid element.
 *
 * `grid-template-columns` resolves to used pixel values once the grid has been laid out, so this
 * reflects whatever the cascade actually produced, including responsive overrides.
 */
export function measureHomeColumnRects(grid: HTMLElement): Array<{ left: number; width: number }> {
  const style = window.getComputedStyle(grid)
  const widths = style.gridTemplateColumns
    .split(" ")
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value))

  if (widths.length === 0) return []

  const gap = Number.parseFloat(style.columnGap) || 0
  const gridLeft = grid.getBoundingClientRect().left + (Number.parseFloat(style.paddingLeft) || 0)

  let left = gridLeft
  return widths.map((width) => {
    const rect = { left, width }
    left += width + gap
    return rect
  })
}
