import test from "node:test"
import assert from "node:assert/strict"

import {
  HIDDEN_HOME_ITEMS,
  assignHomeItemColumns,
  defaultHomeLayout,
  homeItemColumn,
  homeItemSpan,
  mergeLegacyHomeColumns,
  normalizeHomeLayout,
} from "./homeLayout.ts"

test("normalizeHomeLayout falls back to the default layout for invalid data", () => {
  assert.deepEqual(normalizeHomeLayout(null), defaultHomeLayout)
  assert.deepEqual(normalizeHomeLayout("bad-data"), defaultHomeLayout)
})

test("normalizeHomeLayout removes hidden and duplicate home items", () => {
  const layout = normalizeHomeLayout({
    items: ["note", "todo", "note", "quick_access", "grades_summary", "calendar"],
    quickAccessSlots: defaultHomeLayout.quickAccessSlots,
    note: "Saved note",
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.items, ["note", "quick_access", "calendar"])
  assert.equal(layout.note, "Saved note")
})

test("normalizeHomeLayout migrates saved columns into one interleaved order", () => {
  const layout = normalizeHomeLayout({
    columns: {
      left: ["note", "quick_access", "grades_summary"],
      right: ["calendar", "today_classes", "attendance_snapshot"],
    },
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.items, [
    "note",
    "calendar",
    "quick_access",
    "today_classes",
    "attendance_snapshot",
  ])
})

test("normalizeHomeLayout falls back to the removed freeform board order", () => {
  const layout = normalizeHomeLayout({
    pegboard: ["calendar", "note", "focus_links"],
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.items, ["calendar", "note"])
})

test("normalizeHomeLayout keeps only two-column spans for visible items", () => {
  const layout = normalizeHomeLayout({
    items: ["note", "calendar"],
    itemSpans: { note: 2, calendar: 1, today_classes: 2, bogus: 2 },
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.itemSpans, { note: 2 })
})

test("mergeLegacyHomeColumns interleaves columns and drops duplicates", () => {
  assert.deepEqual(
    mergeLegacyHomeColumns(["note", "quick_access"], ["calendar", "note"]),
    ["note", "calendar", "quick_access"]
  )
})

test("homeItemSpan caps a two-column card in a single column layout", () => {
  const layout = { itemSpans: { note: 2 } }
  assert.equal(homeItemSpan(layout, "note", 2), 2)
  assert.equal(homeItemSpan(layout, "note", 1), 1)
  assert.equal(homeItemSpan(layout, "calendar", 2), 1)
})

test("normalizeHomeLayout migrates quick access strings and preserves classroom actions", () => {
  const layout = normalizeHomeLayout({
    quickAccessSlots: [
      "nav-calendar",
      { id: "custom", actionId: "nav-classroom" },
      { id: 123, actionId: "classroom-assignments" },
      null,
    ],
  })

  assert.deepEqual(layout.quickAccessSlots, [
    { id: "qa-slot-0", actionId: "nav-calendar" },
    { id: "custom", actionId: "nav-classroom" },
    { id: "qa-slot-2", actionId: "classroom-assignments" },
    { id: "qa-slot-3", actionId: null },
  ])
})

test("normalizeHomeLayout restores the default note when a saved note is invalid", () => {
  assert.equal(normalizeHomeLayout({ note: 123 }).note, defaultHomeLayout.note)
})

test("homeItemColumn caps a stored column to the columns actually on screen", () => {
  const layout = { itemColumns: { note: 1, calendar: 0 } }
  assert.equal(homeItemColumn(layout, "note", 2), 1)
  assert.equal(homeItemColumn(layout, "note", 1), 0)
  assert.equal(homeItemColumn(layout, "calendar", 2), 0)
  assert.equal(homeItemColumn(layout, "today_classes", 2), 0)
})

test("homeItemColumn rejects a stored column that is not a whole non-negative number", () => {
  assert.equal(homeItemColumn({ itemColumns: { note: -1 } }, "note", 2), 0)
  assert.equal(homeItemColumn({ itemColumns: { note: 1.5 } }, "note", 2), 0)
  assert.equal(homeItemColumn({ itemColumns: { note: "1" } }, "note", 2), 0)
})

test("assignHomeItemColumns deals out only the cards that have no column yet", () => {
  const columns = assignHomeItemColumns(
    ["note", "calendar", "quick_access", "notifications"],
    { calendar: 0 },
    2
  )

  assert.deepEqual(columns, {
    note: 0,
    calendar: 0,
    quick_access: 1,
    notifications: 0,
  })
})

test("assignHomeItemColumns drops columns for cards that are no longer in the layout", () => {
  const columns = assignHomeItemColumns(["note"], { note: 1, calendar: 1 }, 2)
  assert.deepEqual(columns, { note: 1 })
})

test("normalizeHomeLayout keeps the columns a saved layout already chose", () => {
  const layout = normalizeHomeLayout({
    items: ["note", "calendar", "quick_access"],
    itemColumns: { note: 1, calendar: 1, quick_access: 0 },
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.itemColumns, { note: 1, calendar: 1, quick_access: 0 })
})

test("normalizeHomeLayout takes columns from the legacy two-column lists when it can", () => {
  const layout = normalizeHomeLayout({
    columns: {
      left: ["note", "quick_access"],
      right: ["calendar", "today_classes"],
    },
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.itemColumns, {
    note: 0,
    calendar: 1,
    quick_access: 0,
    today_classes: 1,
  })
})

test("normalizeHomeLayout deals out columns for a saved layout that never stored them", () => {
  const layout = normalizeHomeLayout({
    items: ["note", "calendar", "quick_access"],
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.itemColumns, { note: 0, calendar: 1, quick_access: 0 })
})

test("normalizeHomeLayout keeps a two-column card where the saved order put it", () => {
  const layout = normalizeHomeLayout({
    items: ["note", "calendar", "quick_access"],
    itemSpans: { quick_access: 2 },
  }, HIDDEN_HOME_ITEMS)

  assert.deepEqual(layout.items, ["note", "calendar", "quick_access"])
  assert.deepEqual(layout.itemSpans, { quick_access: 2 })
})
