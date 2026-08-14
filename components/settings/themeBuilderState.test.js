import test from "node:test"
import assert from "node:assert/strict"

import {
  buildSimpleThemeColors,
  getBaseBackground,
  modeFromAdvanced,
  splitThemesByMode,
} from "./themeBuilderState.ts"
import { applyThemeColors, DARK_BG, DEFAULT_ACCENT, LIGHT_BG } from "../../lib/theme.ts"

test("splitThemesByMode separates simple and advanced themes", () => {
  const themes = [
    { id: "simple-1", isAdvanced: false },
    { id: "advanced-1", isAdvanced: true },
    { id: "simple-legacy" },
  ]

  const split = splitThemesByMode(themes)

  assert.deepEqual(split.simpleThemes.map((theme) => theme.id), ["simple-1", "simple-legacy"])
  assert.deepEqual(split.advancedThemes.map((theme) => theme.id), ["advanced-1"])
})

test("modeFromAdvanced maps saved theme flags to live editor modes", () => {
  assert.equal(modeFromAdvanced(false), "simple")
  assert.equal(modeFromAdvanced(undefined), "simple")
  assert.equal(modeFromAdvanced(true), "advanced")
})

test("getBaseBackground uses the current theme builder backgrounds", () => {
  assert.equal(getBaseBackground(true), DARK_BG)
  assert.equal(getBaseBackground(false), LIGHT_BG)
})

test("buildSimpleThemeColors rebuilds dark mode without falling back to legacy colors", () => {
  const colors = buildSimpleThemeColors({
    isDark: true,
    accentName: "default",
    contrast: 30,
    uiTint: 0,
  })

  assert.equal(colors.bgBase, DARK_BG)
  assert.equal(colors.accent, DEFAULT_ACCENT)
  assert.equal(colors.bgElevated, "#131315")
})

test("buildSimpleThemeColors keeps gradient accents while applying contrast and tint", () => {
  const gradientAccent = "linear-gradient(90deg, #4338CA 0%, #0EA5E9 100%)"
  const colors = buildSimpleThemeColors({
    isDark: true,
    accent: gradientAccent,
    contrast: 60,
    uiTint: 40,
  })

  assert.equal(colors.accent, gradientAccent)
  assert.equal(colors.accentHover, gradientAccent)
  assert.match(colors.accentLight, /^rgba\(67, 56, 202, 0\.15\)$/)
  assert.match(colors.bgBase, /^#[0-9a-f]{6}$/i)
  assert.notEqual(colors.bgBase, DARK_BG)
  assert.notEqual(colors.borderDefault, "rgba(255, 255, 255, 0.12)")
})

test("applyThemeColors exposes gradient tokens as background images", () => {
  const props = new Map()
  const previousDocument = globalThis.document
  globalThis.document = {
    documentElement: {
      classList: { add() {}, remove() {} },
      removeAttribute() {},
      setAttribute() {},
      style: { setProperty: (key, value) => props.set(key, value) },
    },
  }

  try {
    applyThemeColors(buildSimpleThemeColors({ isDark: true, accent: DEFAULT_ACCENT }), true)
    assert.equal(props.get("--accent-gradient"), `linear-gradient(${DEFAULT_ACCENT}, ${DEFAULT_ACCENT})`)

    const gradientAccent = "linear-gradient(90deg, #4338CA 0%, #0EA5E9 100%)"
    applyThemeColors(buildSimpleThemeColors({ isDark: true, accent: gradientAccent }), true)
    assert.equal(props.get("--accent-gradient"), gradientAccent)
    assert.equal(props.get("--accent-color-light"), "rgba(67, 56, 202, 0.15)")
  } finally {
    globalThis.document = previousDocument
  }
})
