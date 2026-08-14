export type HomeItemType =
  | "note"
  | "quick_access"
  | "notifications"
  | "calendar"
  | "classroom_assignments"
  | "classroom_activity"
  | "today_classes"
  | "attendance_snapshot"

/** Number of grid columns a home card occupies. */
export type HomeItemSpan = 1 | 2

export interface QuickAccessSlot {
  id: string
  actionId: string | null
  /** Overrides the action's own label when the user renames the shortcut. */
  label?: string
  /** Tints the shortcut icon and border. Undefined keeps the theme default. */
  accentColor?: string
}

export interface HomeCanvasTextElement {
  id: string
  kind: "text"
  x: number
  y: number
  w: number
  h: number
  text: string
  fontFamily: string
  fontSize: number
  color: string
  highlightColor: string
}

export interface HomeCanvasLineElement {
  id: string
  kind: "line"
  x: number
  y: number
  w: number
  h: number
  color: string
  strokeWidth: number
}

export interface HomeCanvasDrawElement {
  id: string
  kind: "draw"
  points: Array<{ x: number; y: number }>
  color: string
  strokeWidth: number
}

export interface HomeCanvasImageElement {
  id: string
  kind: "image"
  x: number
  y: number
  w: number
  h: number
  /** A `data:` URL. Home layouts are stored as one document, so the picture travels with it. */
  src: string
  alt: string
  /** Corner rounding in pixels, so a picture can sit as flush or as soft as the cards around it. */
  radius: number
}

export type HomeCanvasElement =
  | HomeCanvasTextElement
  | HomeCanvasLineElement
  | HomeCanvasDrawElement
  | HomeCanvasImageElement

/**
 * Largest picture a home layout will accept, measured on the encoded `data:` URL.
 *
 * The layout is saved as a single preferences document, so an oversized picture does not just cost
 * storage — it delays every later save of unrelated home state. Images are downscaled to fit before
 * this limit is ever reached; the limit only rejects what downscaling could not bring under.
 */
export const HOME_IMAGE_MAX_DATA_URL_LENGTH = 1_400_000

/** Longest edge a pasted or chosen picture is downscaled to before it is stored. */
export const HOME_IMAGE_MAX_EDGE_PX = 1_400

export function isStorableHomeImageSource(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("data:image/")
    && value.length <= HOME_IMAGE_MAX_DATA_URL_LENGTH
}

/** Most columns Home will ever offer, and therefore the largest storable column index plus one. */
export const HOME_MAX_COLUMNS = 2

/**
 * Home is one ordered list of cards laid out in columns. Cards are never positioned in pixels: a
 * card owns a column and a span, and its vertical position comes from the cards above it in that
 * same column, so the same layout stays intact at any page width, with the sidebar open or closed.
 *
 * The column is stored rather than derived from the order. Deriving it meant a card's column
 * depended on the height of every card before it, so a notification arriving or a month changing
 * silently threw unrelated cards into the other column.
 */
export interface HomeLayout {
  bentoVersion: 5
  items: HomeItemType[]
  /** Column span per card. Absent means one column. */
  itemSpans: Partial<Record<HomeItemType, HomeItemSpan>>
  /** Zero-based column per card. Absent means the first column. Ignored by two-column cards. */
  itemColumns: Partial<Record<HomeItemType, number>>
  /** Freeform ink, text and lines drawn over the card grid. */
  canvasElements: HomeCanvasElement[]
  quickAccessSlots: QuickAccessSlot[]
  note: string
}

export const HOME_LAYOUT_KEY = "millennium_home_layout"
export const DEFAULT_NOTE = "# Welcome to Millennium\nYou can edit this text!"

export const REMOVED_HOME_ITEMS = [
  "grades_summary",
  "attendance_detail",
  "school_day",
  "focus_links",
  "resource_launcher",
] as const

/**
 * Cards for features that are built but not released. Unlike `REMOVED_HOME_ITEMS` these still have
 * a card implementation and a `HomeItemType`, so the entry only keeps them out of the layout and
 * the Add Item menu until the feature ships.
 */
export const PRE_RELEASE_HOME_ITEMS = [
  "classroom_assignments",
  "classroom_activity",
] as const

export const HIDDEN_HOME_ITEMS: readonly string[] = [...REMOVED_HOME_ITEMS, ...PRE_RELEASE_HOME_ITEMS]

export const defaultHomeLayout: HomeLayout = {
  bentoVersion: 5,
  items: [
    "note",
    "calendar",
    "quick_access",
    "notifications",
    "attendance_snapshot",
    "today_classes",
  ],
  itemSpans: {},
  itemColumns: {
    note: 0,
    calendar: 1,
    quick_access: 0,
    notifications: 0,
    attendance_snapshot: 0,
    today_classes: 1,
  },
  canvasElements: [],
  quickAccessSlots: [
    { id: "qa-1", actionId: "nav-timetable" },
    { id: "qa-2", actionId: "nav-notifications" },
    { id: "qa-3", actionId: "nav-calendar" },
    { id: "qa-4", actionId: "nav-reports" },
    { id: "qa-5", actionId: "open-search" },
  ],
  note: DEFAULT_NOTE,
}

const homeItemValues = new Set<HomeItemType>([
  "note",
  "quick_access",
  "notifications",
  "calendar",
  "classroom_assignments",
  "classroom_activity",
  "today_classes",
  "attendance_snapshot",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isHomeItem(value: unknown): value is HomeItemType {
  return typeof value === "string" && homeItemValues.has(value as HomeItemType)
}

function uniqueItems(items: HomeItemType[]) {
  return items.filter((item, index) => items.indexOf(item) === index)
}

function normalizeHomeItems(
  value: unknown,
  fallback: HomeItemType[],
  hiddenItems: readonly string[]
) {
  const source = Array.isArray(value) ? value : fallback
  return uniqueItems(source.filter(isHomeItem).filter((item) => !hiddenItems.includes(item)))
}

function toFiniteNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  const withMin = min === undefined ? numberValue : Math.max(min, numberValue)
  return max === undefined ? withMin : Math.min(max, withMin)
}

/**
 * Interleaves the two saved columns back into one reading order. Row-flowing that order through a
 * two-column grid reproduces the arrangement the user had, so upgrading is invisible to them.
 */
export function mergeLegacyHomeColumns(left: HomeItemType[], right: HomeItemType[]) {
  const merged: HomeItemType[] = []
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index]) merged.push(left[index])
    if (right[index]) merged.push(right[index])
  }
  return uniqueItems(merged)
}

/** Column span of a card, capped by how many columns the page is actually showing. */
export function homeItemSpan(
  layout: Pick<HomeLayout, "itemSpans">,
  item: HomeItemType,
  columnCount: number
): HomeItemSpan {
  const span = layout.itemSpans[item] === 2 ? 2 : 1
  return span > columnCount ? 1 : span
}

/** Column a card sits in, capped by how many columns the page is actually showing. */
export function homeItemColumn(
  layout: Pick<HomeLayout, "itemColumns">,
  item: HomeItemType,
  columnCount: number
): number {
  const column = layout.itemColumns[item]
  if (typeof column !== "number" || !Number.isInteger(column) || column < 0) return 0
  return Math.min(column, Math.max(0, columnCount - 1))
}

/**
 * Fills in a column for every card that does not have one yet, leaving existing choices alone.
 *
 * Cards without a column are dealt out in turn, which reproduces the left/right alternation the old
 * row-flowed grid produced for equal-height cards. It is only ever a starting point: from the first
 * drag onwards the stored column is the user's.
 */
export function assignHomeItemColumns(
  items: readonly HomeItemType[],
  itemColumns: HomeLayout["itemColumns"],
  columnCount: number = HOME_MAX_COLUMNS
): HomeLayout["itemColumns"] {
  const columns = Math.max(1, columnCount)
  const filled: HomeLayout["itemColumns"] = {}
  let next = 0

  for (const item of items) {
    const existing = itemColumns[item]
    if (typeof existing === "number" && Number.isInteger(existing) && existing >= 0) {
      filled[item] = Math.min(existing, columns - 1)
      continue
    }
    filled[item] = next % columns
    next += 1
  }

  return filled
}

function normalizeItemSpans(
  value: unknown,
  items: readonly HomeItemType[]
): HomeLayout["itemSpans"] {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, span]) => isHomeItem(key) && items.includes(key) && Number(span) === 2)
      .map(([key]) => [key, 2 as HomeItemSpan])
  )
}

function normalizeItemColumns(
  value: unknown,
  items: readonly HomeItemType[]
): HomeLayout["itemColumns"] {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => isHomeItem(key) && items.includes(key))
      .map(([key, column]) => [key, toFiniteNumber(Math.trunc(Number(column)), 0, 0, HOME_MAX_COLUMNS - 1)])
  )
}

function normalizeCanvasElement(value: unknown, index: number): HomeCanvasElement | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null

  if (value.kind === "text") {
    return {
      id: typeof value.id === "string" ? value.id : `text-${index + 1}`,
      kind: "text",
      x: toFiniteNumber(value.x, 120, -4000, 8000),
      y: toFiniteNumber(value.y, 120, -4000, 8000),
      w: toFiniteNumber(value.w, 260, 80, 1000),
      h: toFiniteNumber(value.h, 90, 40, 700),
      text: typeof value.text === "string" ? value.text : "Text",
      fontFamily: typeof value.fontFamily === "string" ? value.fontFamily : "Inter",
      fontSize: toFiniteNumber(value.fontSize, 20, 10, 96),
      color: typeof value.color === "string" ? value.color : "#111827",
      highlightColor: typeof value.highlightColor === "string" ? value.highlightColor : "transparent",
    }
  }

  if (value.kind === "line") {
    return {
      id: typeof value.id === "string" ? value.id : `line-${index + 1}`,
      kind: "line",
      x: toFiniteNumber(value.x, 120, -4000, 8000),
      y: toFiniteNumber(value.y, 120, -4000, 8000),
      w: toFiniteNumber(value.w, 240, -1000, 1000),
      h: toFiniteNumber(value.h, 0, -1000, 1000),
      color: typeof value.color === "string" ? value.color : "#111827",
      strokeWidth: toFiniteNumber(value.strokeWidth, 3, 1, 24),
    }
  }

  if (value.kind === "image") {
    // A picture whose source did not survive round-tripping is dropped rather than rendered as a
    // broken box: an empty frame on Home reads as a bug, not as a missing file.
    if (!isStorableHomeImageSource(value.src)) return null

    return {
      id: typeof value.id === "string" ? value.id : `image-${index + 1}`,
      kind: "image",
      x: toFiniteNumber(value.x, 120, -4000, 8000),
      y: toFiniteNumber(value.y, 120, -4000, 8000),
      w: toFiniteNumber(value.w, 320, 40, 2000),
      h: toFiniteNumber(value.h, 220, 40, 2000),
      src: value.src,
      alt: typeof value.alt === "string" ? value.alt.slice(0, 200) : "",
      radius: toFiniteNumber(value.radius, 12, 0, 200),
    }
  }

  if (value.kind === "draw") {
    const points = Array.isArray(value.points)
      ? value.points
          .filter(isRecord)
          .map((point) => ({
            x: toFiniteNumber(point.x, 0, -4000, 8000),
            y: toFiniteNumber(point.y, 0, -4000, 8000),
          }))
      : []

    return {
      id: typeof value.id === "string" ? value.id : `draw-${index + 1}`,
      kind: "draw",
      points,
      color: typeof value.color === "string" ? value.color : "#111827",
      strokeWidth: toFiniteNumber(value.strokeWidth, 4, 1, 24),
    }
  }

  return null
}

function normalizeQuickAccessSlot(value: unknown, index: number): QuickAccessSlot {
  if (typeof value === "string") {
    return { id: `qa-slot-${index}`, actionId: value }
  }

  if (!isRecord(value)) {
    return { id: `qa-slot-${index}`, actionId: null }
  }

  const label = typeof value.label === "string" ? value.label.trim().slice(0, 40) : ""
  const accentColor = typeof value.accentColor === "string" ? value.accentColor.trim().slice(0, 32) : ""

  return {
    id: typeof value.id === "string" ? value.id : `qa-slot-${index}`,
    actionId: typeof value.actionId === "string" ? value.actionId : null,
    ...(label ? { label } : {}),
    ...(accentColor ? { accentColor } : {}),
  }
}

export function normalizeHomeLayout(
  raw: unknown,
  hiddenItems: readonly string[] = HIDDEN_HOME_ITEMS
): HomeLayout {
  if (!isRecord(raw)) {
    return defaultHomeLayout
  }

  // Saved layouts predate the single ordered list: they carry two columns, and older ones also
  // carry the removed freeform board's item order. Both are read here so no saved Home is lost.
  const legacyColumns = isRecord(raw.columns) ? raw.columns : {}
  const legacyLeft = normalizeHomeItems(legacyColumns.left, [], hiddenItems)
  const legacyRight = normalizeHomeItems(legacyColumns.right, [], hiddenItems)
  const legacyOrder = mergeLegacyHomeColumns(legacyLeft, legacyRight)
  const legacyBoardOrder = normalizeHomeItems(raw.pegboard, [], hiddenItems)
  const fallbackOrder = legacyOrder.length > 0
    ? legacyOrder
    : legacyBoardOrder.length > 0
      ? legacyBoardOrder
      : normalizeHomeItems(defaultHomeLayout.items, defaultHomeLayout.items, hiddenItems)
  // An explicit empty list is a Home the user emptied on purpose; only a missing list migrates.
  const rawItems = Array.isArray(raw.items)
    ? normalizeHomeItems(raw.items, [], hiddenItems)
    : fallbackOrder
  const itemSpans = normalizeItemSpans(raw.itemSpans, rawItems)
  // The saved order is the user's order. Nothing is re-sorted on the way in: a card only sits
  // somewhere it was not put if the user put it there.
  const items = rawItems

  // A layout saved before columns were stored still describes them: the oldest ones carry the two
  // column lists Home used to keep, which is the user's own left/right choice rather than a guess.
  const legacyItemColumns: HomeLayout["itemColumns"] = {}
  for (const item of legacyLeft) legacyItemColumns[item] = 0
  for (const item of legacyRight) legacyItemColumns[item] = 1

  const itemColumns = assignHomeItemColumns(
    items,
    isRecord(raw.itemColumns) ? normalizeItemColumns(raw.itemColumns, items) : legacyItemColumns,
    HOME_MAX_COLUMNS
  )

  const canvasElements = Array.isArray(raw.canvasElements)
    ? raw.canvasElements
        .map(normalizeCanvasElement)
        .filter((element): element is HomeCanvasElement => Boolean(element))
    : []
  const rawSlots = Array.isArray(raw.quickAccessSlots)
    ? raw.quickAccessSlots
    : defaultHomeLayout.quickAccessSlots
  const quickAccessSlots = rawSlots.map(normalizeQuickAccessSlot)

  return {
    bentoVersion: 5,
    items,
    itemSpans,
    itemColumns,
    canvasElements,
    quickAccessSlots,
    note: typeof raw.note === "string" ? raw.note : defaultHomeLayout.note,
  }
}
