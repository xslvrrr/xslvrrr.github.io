import test from "node:test"
import assert from "node:assert/strict"

import {
  clampNumber,
  clientPointToCanvas,
} from "./homeCanvasMath.ts"

test("clampNumber constrains values to bounds", () => {
  assert.equal(clampNumber(5, 0, 10), 5)
  assert.equal(clampNumber(-1, 0, 10), 0)
  assert.equal(clampNumber(11, 0, 10), 10)
})

test("clientPointToCanvas offsets by the layer position", () => {
  assert.deepEqual(
    clientPointToCanvas({
      clientX: 130,
      clientY: 90,
      rect: { left: 10, top: 20 },
    }),
    { x: 120, y: 70 }
  )
})

test("clientPointToCanvas includes the scroll offset", () => {
  assert.deepEqual(
    clientPointToCanvas({
      clientX: 130,
      clientY: 90,
      rect: { left: 10, top: 20 },
      scrollLeft: 5,
      scrollTop: 40,
    }),
    { x: 125, y: 110 }
  )
})
