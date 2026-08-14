// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"

import { RollingDigits } from "./RollingDigits"

afterEach(cleanup)

function digitColumns(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll("[data-rolling-digit]"))
}

describe("RollingDigits", () => {
  /**
   * The columns have to survive a tick.
   *
   * A remounted column is already positioned at its new digit on first paint, so the transition
   * never runs and the clock snaps instead of rolling — the failure this guards against, which a
   * rendered-output assertion cannot see because the markup of a remount and of an animation start
   * are identical.
   */
  test("keeps the same column elements when a digit changes", () => {
    const { container, rerender } = render(<RollingDigits value="10:00" />)
    const before = digitColumns(container)

    rerender(<RollingDigits value="09:59" />)
    const after = digitColumns(container)

    expect(after).toHaveLength(before.length)
    after.forEach((column, index) => expect(column).toBe(before[index]))
  })

  /** The one tick where the clock changes length: 1:00:00 becomes 59:59. */
  test("keeps the minute and second columns when the hours field drops away", () => {
    const { container, rerender } = render(<RollingDigits value="1:00:00" />)
    const before = digitColumns(container).slice(-4)

    rerender(<RollingDigits value="59:59" />)
    const after = digitColumns(container).slice(-4)

    after.forEach((column, index) => expect(column).toBe(before[index]))
  })

  test("draws one column per digit and leaves separators alone", () => {
    const { container } = render(<RollingDigits value="1:02:03" />)
    expect(digitColumns(container)).toHaveLength(5)
    expect(container.textContent).toContain(":")
  })

  test("announces the label rather than the digit columns", () => {
    const { getByRole } = render(<RollingDigits value="05:00" label="5 minutes remaining" />)
    expect(getByRole("timer").textContent).toContain("5 minutes remaining")
  })
})
