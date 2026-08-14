import assert from "node:assert/strict"
import test from "node:test"

import { getGlyphIndex, getLogoAlpha, getTextGridMetrics, TEXT_GRID_GLYPHS } from "./text-grid-logo.js"

test("text grid metrics cover the viewport", () => {
  const metrics = getTextGridMetrics(1440, 900)

  assert.ok(metrics.cols * metrics.cellWidth >= 1440)
  assert.ok(metrics.rows * metrics.cellHeight >= 900)
  assert.ok(metrics.radius > 300)
})

test("logo mask keeps circle body and cuts diagonal stripes", () => {
  const radius = 400

  assert.equal(getLogoAlpha(0, 0, radius), 0)
  assert.equal(getLogoAlpha(radius * 0.62, 0, radius), 1)
  assert.equal(getLogoAlpha(radius * 1.1, 0, radius), 0)
})

test("glyph index stays inside the glyph set while changing by frame", () => {
  const first = getGlyphIndex(4, 7, 1)
  const second = getGlyphIndex(4, 7, 2)

  assert.notEqual(first, second)
  assert.ok(first >= 0 && first < TEXT_GRID_GLYPHS.length)
  assert.ok(second >= 0 && second < TEXT_GRID_GLYPHS.length)
})
