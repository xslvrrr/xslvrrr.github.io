import test from "node:test"
import assert from "node:assert/strict"

import { computeHomePlacements, homeColumnAtPoint } from "./homePlacement.ts"

const ROW_GAP = 16

function placements(input) {
  return computeHomePlacements({ rowGap: ROW_GAP, columnCount: 2, ...input })
}

test("computeHomePlacements stacks each card under the previous card in its own column", () => {
  const result = placements({
    items: ["note", "calendar", "quick_access"],
    layout: { itemSpans: {}, itemColumns: { note: 0, calendar: 1, quick_access: 0 } },
    heights: { note: 100, calendar: 300, quick_access: 50 },
  })

  assert.deepEqual(result.get("note"), { column: 0, columnSpan: 1, rowStart: 1, rowSpan: 116 })
  assert.deepEqual(result.get("calendar"), { column: 1, columnSpan: 1, rowStart: 1, rowSpan: 316 })
  // Directly under `note`, not under the much taller card in the other column.
  assert.deepEqual(result.get("quick_access"), { column: 0, columnSpan: 1, rowStart: 117, rowSpan: 66 })
})

test("computeHomePlacements leaves the other column alone when a card changes height", () => {
  const layout = { itemSpans: {}, itemColumns: { note: 0, calendar: 1, quick_access: 0 } }
  const items = ["note", "calendar", "quick_access"]

  const before = placements({ items, layout, heights: { note: 100, calendar: 300, quick_access: 50 } })
  const after = placements({ items, layout, heights: { note: 100, calendar: 900, quick_access: 50 } })

  assert.deepEqual(before.get("note"), after.get("note"))
  assert.deepEqual(before.get("quick_access"), after.get("quick_access"))
})

test("computeHomePlacements keeps a card's column when a card above it in that column grows", () => {
  const layout = { itemSpans: {}, itemColumns: { note: 0, calendar: 1, quick_access: 0 } }
  const items = ["note", "calendar", "quick_access"]

  const after = placements({ items, layout, heights: { note: 400, calendar: 300, quick_access: 50 } })

  assert.equal(after.get("quick_access").column, 0)
  assert.equal(after.get("quick_access").rowStart, 417)
})

test("computeHomePlacements clears every column for a full-width card and resumes level under it", () => {
  const result = placements({
    items: ["note", "calendar", "notifications", "quick_access"],
    layout: {
      itemSpans: { notifications: 2 },
      itemColumns: { note: 0, calendar: 1, quick_access: 0 },
    },
    heights: { note: 100, calendar: 300, notifications: 80, quick_access: 50 },
  })

  // Starts below the taller of the two columns, and spans both.
  assert.deepEqual(result.get("notifications"), { column: 0, columnSpan: 2, rowStart: 317, rowSpan: 96 })
  assert.deepEqual(result.get("quick_access"), { column: 0, columnSpan: 1, rowStart: 413, rowSpan: 66 })
})

test("computeHomePlacements folds every card into one column when only one is on screen", () => {
  const result = placements({
    items: ["note", "calendar"],
    layout: { itemSpans: { calendar: 2 }, itemColumns: { note: 0, calendar: 1 } },
    heights: { note: 100, calendar: 200 },
    columnCount: 1,
  })

  assert.deepEqual(result.get("note"), { column: 0, columnSpan: 1, rowStart: 1, rowSpan: 116 })
  assert.deepEqual(result.get("calendar"), { column: 0, columnSpan: 1, rowStart: 117, rowSpan: 216 })
})

test("computeHomePlacements returns null until every card has been measured", () => {
  const input = {
    items: ["note", "calendar"],
    layout: { itemSpans: {}, itemColumns: {} },
  }

  assert.equal(placements({ ...input, heights: { note: 100 } }), null)
  assert.equal(placements({ ...input, heights: { note: 100, calendar: 0 } }), null)
  assert.notEqual(placements({ ...input, heights: { note: 100, calendar: 200 } }), null)
})

test("homeColumnAtPoint returns the column the point is inside", () => {
  const columns = [{ left: 0, width: 100 }, { left: 120, width: 100 }]

  assert.equal(homeColumnAtPoint(columns, 50), 0)
  assert.equal(homeColumnAtPoint(columns, 150), 1)
})

test("homeColumnAtPoint falls back to the nearest column in the gutter and beyond the edges", () => {
  const columns = [{ left: 0, width: 100 }, { left: 120, width: 100 }]

  assert.equal(homeColumnAtPoint(columns, 105), 0)
  assert.equal(homeColumnAtPoint(columns, 118), 1)
  assert.equal(homeColumnAtPoint(columns, -400), 0)
  assert.equal(homeColumnAtPoint(columns, 9000), 1)
  assert.equal(homeColumnAtPoint([], 50), 0)
})
